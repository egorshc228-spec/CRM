import { json, notFound, forbidden, HttpError, str, reqStr, int, oneOf, day, money, pct, pick } from '../http.js';
import { all, first, insert, update, run, logActivity } from '../db.js';
import { SERVICES, SOURCES, CURRENCIES, DIRECTIONS, directionOf, SERVICE_NAMES } from '../const.js';

const CLIENT_FIELDS = {
  name: (v) => reqStr(v, 'Название', 200),
  niche: (v) => str(v, 120),
  city: (v) => str(v, 80),
  status: (v) => oneOf(v, ['active', 'paused', 'churned'], 'active'),
  owner_id: int,
  source: (v) => oneOf(v, SOURCES),
  contact_name: (v) => str(v, 120),
  phone: (v) => str(v, 40),
  telegram: (v) => str(v, 80),
  email: (v) => str(v, 120),
  website: (v) => str(v, 200),
  notes: (v) => str(v, 4000),
};

const SERVICE_FIELDS = {
  service: (v) => oneOf(v, SERVICES, 'other'),
  direction: (v) => oneOf(v, DIRECTIONS),
  status: (v) => oneOf(v, ['active', 'paused', 'ended'], 'active'),
  currency: (v) => oneOf(v, CURRENCIES, 'USD'),
  setup: money,
  monthly: money,
  ad_budget: (v) => (v === '' || v === null || v === undefined ? null : money(v)),
  ad_budget_currency: (v) => oneOf(v, CURRENCIES),
  ad_account: (v) => str(v, 120),
  start_date: day,
  end_date: day,
  billing_day: (v) => { const n = int(v); return n ? Math.min(28, Math.max(1, n)) : 1; },
  partner_id: int,
  partner_setup_pct: pct,
  partner_monthly_pct: pct,
  partner_months: (v) => { const n = int(v); return n && n > 0 ? Math.min(n, 120) : 12; },
  notes: (v) => str(v, 2000),
};

function serviceRow(f) {
  const row = { ...f };
  for (const [from, to] of [['setup', 'setup_minor'], ['monthly', 'monthly_minor'], ['ad_budget', 'ad_budget_minor']]) {
    if (from in row) { row[to] = row[from]; delete row[from]; }
  }
  return row;
}

export async function listClients({ env, url }) {
  const status = url.searchParams.get('status') || 'active';
  const q = str(url.searchParams.get('q'), 80);
  const where = [];
  const binds = [];
  if (status !== 'all') where.push('c.status = ?'), binds.push(oneOf(status, ['active', 'paused', 'churned']));
  if (q) where.push('(c.name LIKE ? OR c.niche LIKE ? OR c.contact_name LIKE ?)'), binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  const clients = await all(
    env,
    `SELECT c.*, u.name AS owner_name,
       (SELECT COUNT(*) FROM tasks t WHERE t.client_id = c.id AND t.status != 'done') AS open_tasks,
       (SELECT MAX(created_at) FROM activities a WHERE a.client_id = c.id) AS last_activity
     FROM clients c LEFT JOIN users u ON u.id = c.owner_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY c.name COLLATE NOCASE LIMIT 500`,
    ...binds,
  );
  // услуги и долги одним запросом
  const services = await all(env, "SELECT client_id, service, direction, currency, monthly_minor FROM services WHERE status = 'active'");
  const debts = await all(env, "SELECT client_id, currency, SUM(amount_minor) AS sum FROM invoices WHERE status = 'issued' GROUP BY client_id, currency");
  for (const c of clients) {
    c.services = services.filter((s) => s.client_id === c.id);
    c.debts = debts.filter((d) => d.client_id === c.id).map(({ currency, sum }) => ({ currency, sum }));
  }
  return json({ clients });
}

export async function getClient({ env, params }) {
  const client = await first(env, 'SELECT c.*, u.name AS owner_name FROM clients c LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = ?', params.id);
  if (!client) throw notFound();
  const [services, invoices, tasks, activities, deals] = await Promise.all([
    all(env, 'SELECT s.*, p.name AS partner_name FROM services s LEFT JOIN partners p ON p.id = s.partner_id WHERE s.client_id = ? ORDER BY s.status, s.created_at', params.id),
    all(env, 'SELECT * FROM invoices WHERE client_id = ? ORDER BY COALESCE(issued_at, created_at) DESC LIMIT 100', params.id),
    all(env, `SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
               WHERE t.client_id = ? ORDER BY t.status = 'done', t.due IS NULL, t.due LIMIT 200`, params.id),
    all(env, `SELECT a.*, u.name AS user_name, u.role AS user_role FROM activities a LEFT JOIN users u ON u.id = a.user_id
               WHERE a.client_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 200`, params.id),
    all(env, 'SELECT id, title, stage, service, created_at FROM deals WHERE client_id = ? ORDER BY created_at DESC', params.id),
  ]);
  return json({ client, services, invoices, tasks, activities, deals });
}

export async function createClient({ env, body, user }) {
  const f = pick(body, CLIENT_FIELDS);
  if (!f.name) f.name = reqStr(body.name, 'Название', 200);
  const id = await insert(env, 'clients', { owner_id: user.id, ...f });
  await logActivity(env, { client_id: id, user_id: user.id, text: `Клиент добавлен (${user.name})` });
  return json({ id }, 201);
}

export async function updateClient({ env, params, body, user }) {
  const c = await first(env, 'SELECT id, status FROM clients WHERE id = ?', params.id);
  if (!c) throw notFound();
  const f = pick(body, CLIENT_FIELDS);
  await update(env, 'clients', c.id, f);
  if (f.status && f.status !== c.status) {
    const names = { active: 'активен', paused: 'на паузе', churned: 'ушёл' };
    await logActivity(env, { client_id: c.id, user_id: user.id, kind: 'stage', text: `Статус: ${names[f.status]}` });
  }
  return json({ ok: true });
}

export async function deleteClient({ env, params, user }) {
  if (user.role !== 'owner') throw forbidden();
  // Счета — это история денег: вместе с клиентом они удалились бы и исказили «Получено» и комиссии.
  const inv = await first(env, "SELECT COUNT(*) AS n FROM invoices WHERE client_id = ? AND status IN ('issued','paid')", params.id);
  if (inv && inv.n) {
    throw new HttpError(409, 'has_invoices', `У клиента ${inv.n} выставленных или оплаченных счетов. Переведите его в статус «Ушёл» — история денег сохранится`);
  }
  await run(env, 'DELETE FROM clients WHERE id = ?', params.id);
  return json({ ok: true });
}

export async function addClientNote({ env, params, body, user }) {
  const c = await first(env, 'SELECT id FROM clients WHERE id = ?', params.id);
  if (!c) throw notFound();
  const kind = user.role === 'agent' ? 'agent' : oneOf(body.kind, ['note', 'call'], 'note');
  const id = await logActivity(env, { client_id: c.id, user_id: user.id, kind, text: reqStr(body.text, 'Текст', 4000) });
  return json({ ok: true, id }, 201);
}

// ---- услуги ----

export async function createService({ env, params, body, user }) {
  const c = await first(env, 'SELECT id FROM clients WHERE id = ?', params.id);
  if (!c) throw notFound();
  const f = pick(body, SERVICE_FIELDS);
  if (!f.service) f.service = 'other';
  if (!f.direction) f.direction = directionOf(f.service);
  const id = await insert(env, 'services', { client_id: c.id, ...serviceRow(f) });
  await logActivity(env, { client_id: c.id, user_id: user.id, text: `Добавлена услуга: ${SERVICE_NAMES[f.service]}` });
  return json({ id }, 201);
}

export async function updateService({ env, params, body, user }) {
  const s = await first(env, 'SELECT * FROM services WHERE id = ?', params.id);
  if (!s) throw notFound();
  const f = pick(body, SERVICE_FIELDS);
  await update(env, 'services', s.id, serviceRow(f));
  const changes = [];
  if ('monthly' in f && f.monthly !== s.monthly_minor) changes.push(`абонплата ${s.monthly_minor / 100} → ${f.monthly / 100} ${f.currency || s.currency}`);
  if (f.status && f.status !== s.status) changes.push(`статус: ${f.status}`);
  if ('ad_budget' in f && f.ad_budget !== s.ad_budget_minor) changes.push(`рекламный бюджет → ${f.ad_budget == null ? '—' : f.ad_budget / 100}`);
  if (changes.length) {
    await logActivity(env, { client_id: s.client_id, user_id: user.id, text: `${SERVICE_NAMES[s.service]}: ${changes.join(', ')}` });
  }
  return json({ ok: true });
}

export async function deleteService({ env, params, user }) {
  if (user.role !== 'owner') throw forbidden();
  // По услуге считаются комиссии партнёра и защита от двойной абонплаты — со счетами её не удаляем.
  const inv = await first(env, "SELECT COUNT(*) AS n FROM invoices WHERE service_id = ? AND status IN ('issued','paid')", params.id);
  if (inv && inv.n) {
    throw new HttpError(409, 'has_invoices', 'По услуге есть счета. Поставьте ей статус «Завершена» — счета и комиссии сохранятся');
  }
  await run(env, 'DELETE FROM services WHERE id = ?', params.id);
  return json({ ok: true });
}
