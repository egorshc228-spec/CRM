import { json, notFound, bad, forbidden, str, reqStr, int, oneOf, day, money, pct, pick } from '../http.js';
import { all, first, insert, update, run, nowIso, today, logActivity } from '../db.js';
import { STAGES, OPEN_STAGES, SERVICES, SOURCES, CURRENCIES, DIRECTIONS, directionOf, STAGE_NAMES, SERVICE_NAMES } from '../const.js';
import { notifyTeam, escHtml, crmLink } from '../telegram.js';

const DEAL_FIELDS = {
  title: (v) => reqStr(v, 'Название', 200),
  stage: (v) => oneOf(v, STAGES, 'new'),
  client_id: int,
  owner_id: int,
  service: (v) => oneOf(v, SERVICES),
  direction: (v) => oneOf(v, DIRECTIONS, 'ads'),
  source: (v) => oneOf(v, SOURCES),
  contact_name: (v) => str(v, 120),
  phone: (v) => str(v, 40),
  telegram: (v) => str(v, 80),
  email: (v) => str(v, 120),
  website: (v) => str(v, 200),
  niche: (v) => str(v, 120),
  setup: money,
  monthly: money,
  currency: (v) => oneOf(v, CURRENCIES, 'USD'),
  next_step: (v) => str(v, 300),
  next_step_at: day,
  lost_reason: (v) => str(v, 300),
  partner_id: int,
};

// setup/monthly приходят в деньгах, в базе — в центах
function toRow(f) {
  const row = { ...f };
  if ('setup' in row) { row.setup_minor = row.setup; delete row.setup; }
  if ('monthly' in row) { row.monthly_minor = row.monthly; delete row.monthly; }
  return row;
}

export async function listDeals({ env, url }) {
  const stage = url.searchParams.get('stage') || 'open';
  const q = str(url.searchParams.get('q'), 80);
  const where = [];
  const binds = [];
  if (stage === 'open') where.push(`d.stage IN (${OPEN_STAGES.map(() => '?').join(',')})`), binds.push(...OPEN_STAGES);
  else if (stage !== 'all') where.push('d.stage = ?'), binds.push(oneOf(stage, STAGES));
  if (q) {
    where.push('(d.title LIKE ? OR d.contact_name LIKE ? OR d.phone LIKE ? OR d.telegram LIKE ? OR d.niche LIKE ?)');
    binds.push(...Array(5).fill(`%${q}%`));
  }
  const rows = await all(
    env,
    `SELECT d.*, u.name AS owner_name, c.name AS client_name,
            (SELECT COUNT(*) FROM tasks t WHERE t.deal_id = d.id AND t.status != 'done') AS open_tasks
       FROM deals d
       LEFT JOIN users u ON u.id = d.owner_id
       LEFT JOIN clients c ON c.id = d.client_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE WHEN d.next_step_at IS NULL THEN 1 ELSE 0 END, d.next_step_at, d.created_at DESC
      LIMIT 500`,
    ...binds,
  );
  return json({ deals: rows });
}

export async function getDeal({ env, params }) {
  const deal = await first(
    env,
    `SELECT d.*, u.name AS owner_name, c.name AS client_name, p.name AS partner_name
       FROM deals d LEFT JOIN users u ON u.id = d.owner_id LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN partners p ON p.id = d.partner_id WHERE d.id = ?`,
    params.id,
  );
  if (!deal) throw notFound();
  const [activities, tasks] = await Promise.all([
    all(env, `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
               WHERE a.deal_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 200`, params.id),
    all(env, `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
               WHERE t.deal_id = ? ORDER BY t.status = 'done', t.due IS NULL, t.due`, params.id),
  ]);
  return json({ deal, activities, tasks });
}

export async function createDeal({ env, body, user }) {
  const f = pick(body, DEAL_FIELDS);
  if (!f.title) f.title = reqStr(body.title, 'Название', 200);
  if (f.service && !('direction' in f)) f.direction = directionOf(f.service);
  if (f.stage === 'won') throw bad('use_win', 'Новую сделку нельзя сразу сделать оплаченной: создайте её и нажмите «Оплатили»');
  if (f.stage === 'lost' && !f.lost_reason) throw bad('lost_reason', 'Укажите причину отказа');
  const row = toRow({ owner_id: user.id, ...f });
  if (row.stage === 'lost') row.closed_at = nowIso();
  const id = await insert(env, 'deals', row);
  await logActivity(env, { deal_id: id, client_id: row.client_id || null, user_id: user.id, kind: 'system', text: `Сделка создана (${user.name})` });
  return json({ id }, 201);
}

export async function updateDeal({ env, params, body, user }) {
  const deal = await first(env, 'SELECT * FROM deals WHERE id = ?', params.id);
  if (!deal) throw notFound();
  const f = pick(body, { ...DEAL_FIELDS, title: (v) => reqStr(v, 'Название', 200), stage: (v) => oneOf(v, STAGES) });
  if (f.service && !('direction' in f)) f.direction = directionOf(f.service);
  const row = toRow(f);
  if (row.stage && row.stage !== deal.stage) {
    // «Оплата» ставится только через POST /deals/:id/win — там создаются клиент, услуга и счёт за запуск
    if (row.stage === 'won') throw bad('use_win', 'Отметьте оплату кнопкой «Оплатили» — так создадутся клиент, услуга и счёт');
    if (row.stage === 'lost' && !(row.lost_reason || deal.lost_reason)) throw bad('lost_reason', 'Укажите причину отказа');
    row.closed_at = row.stage === 'won' || row.stage === 'lost' ? nowIso() : null;
    await logActivity(env, {
      deal_id: deal.id, client_id: deal.client_id, user_id: user.id, kind: 'stage',
      text: `${STAGE_NAMES[deal.stage]} → ${STAGE_NAMES[row.stage]}${row.stage === 'lost' ? ': ' + (row.lost_reason || deal.lost_reason) : ''}`,
    });
  }
  await update(env, 'deals', deal.id, row);
  return json({ ok: true });
}

// Выиграли сделку: создаём (или берём) клиента, услугу и счёт за запуск.
export async function winDeal({ env, params, body, user }) {
  const deal = await first(env, 'SELECT * FROM deals WHERE id = ?', params.id);
  if (!deal) throw notFound();
  if (deal.stage === 'won' && deal.client_id) return json({ ok: true, client_id: deal.client_id });

  // Все проверки — до первой записи в базу, чтобы ошибка не оставила «осиротевшего» клиента
  const partnerSetupPct = deal.partner_id ? pct(body.partner_setup_pct ?? 20) : 0;
  const partnerMonthlyPct = deal.partner_id ? pct(body.partner_monthly_pct ?? 10) : 0;
  const service = oneOf(body.service ?? deal.service, SERVICES) || 'other';
  const currency = oneOf(body.currency ?? deal.currency, CURRENCIES, 'USD');
  const setup = 'setup' in body ? money(body.setup) : deal.setup_minor;
  const monthly = 'monthly' in body ? money(body.monthly) : deal.monthly_minor;
  const start = day(body.start_date) || today();

  let clientId = int(body.client_id) || deal.client_id;
  if (clientId) {
    if (!(await first(env, 'SELECT id FROM clients WHERE id = ?', clientId))) throw notFound('client_not_found');
  } else {
    clientId = await insert(env, 'clients', {
      name: str(body.client_name, 200) || deal.title,
      niche: deal.niche, source: deal.source, owner_id: deal.owner_id || user.id,
      contact_name: deal.contact_name, phone: deal.phone, telegram: deal.telegram, email: deal.email, website: deal.website,
    });
  }

  let serviceId = null;
  const direction = directionOf(service) === 'ai' ? 'ai' : deal.direction;
  if (setup || monthly) {
    serviceId = await insert(env, 'services', {
      client_id: clientId, service, direction,
      currency, setup_minor: setup, monthly_minor: monthly, start_date: start,
      billing_day: Math.min(28, Math.max(1, Number(start.slice(8, 10)))),
      partner_id: deal.partner_id || null,
      partner_setup_pct: partnerSetupPct,
      partner_monthly_pct: partnerMonthlyPct,
    });
    if (setup) {
      await insert(env, 'invoices', {
        client_id: clientId, service_id: serviceId, kind: 'setup', direction, amount_minor: setup, currency,
        status: 'issued', issued_at: today(), due_at: today(), note: SERVICE_NAMES[service],
      });
    }
  }

  await update(env, 'deals', deal.id, { stage: 'won', client_id: clientId, closed_at: nowIso() });
  await run(env, 'UPDATE activities SET client_id = ? WHERE deal_id = ? AND client_id IS NULL', clientId, deal.id);
  await run(env, 'UPDATE tasks SET client_id = ? WHERE deal_id = ? AND client_id IS NULL', clientId, deal.id);
  await logActivity(env, { deal_id: deal.id, client_id: clientId, user_id: user.id, kind: 'stage', text: `Сделка выиграна: ${SERVICE_NAMES[service]}` });
  await notifyTeam(env, `✅ <b>Сделка выиграна</b>: ${crmLink(env, `/clients/${clientId}`, deal.title)}\n${escHtml(SERVICE_NAMES[service])} — ${escHtml(user.name)}`);
  return json({ ok: true, client_id: clientId, service_id: serviceId });
}

export async function deleteDeal({ env, params, user }) {
  if (user.role !== 'owner') throw forbidden();
  await run(env, 'DELETE FROM deals WHERE id = ?', params.id);
  return json({ ok: true });
}

export async function addDealNote({ env, params, body, user }) {
  const deal = await first(env, 'SELECT id, client_id FROM deals WHERE id = ?', params.id);
  if (!deal) throw notFound();
  const kind = oneOf(body.kind, ['note', 'call'], 'note');
  await logActivity(env, { deal_id: deal.id, client_id: deal.client_id, user_id: user.id, kind, text: reqStr(body.text, 'Текст', 4000) });
  return json({ ok: true }, 201);
}
