import { json, notFound, bad, forbidden, HttpError, str, reqStr, int, oneOf, day, money, pick } from '../http.js';
import { all, first, insert, update, run, today, getSetting, logActivity } from '../db.js';
import { CURRENCIES, DIRECTIONS, SERVICE_NAMES } from '../const.js';

const monthRe = /^\d{4}-\d{2}$/;
const curMonth = () => today().slice(0, 7);

function lastDay(period) {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function monthIndex(period) {
  const [y, m] = period.split('-').map(Number);
  return y * 12 + m;
}

// ---- счета ----

export async function listInvoices({ env, url }) {
  const status = url.searchParams.get('status') || 'all';
  const month = url.searchParams.get('month');
  const where = [];
  const binds = [];
  if (status === 'unpaid') where.push("i.status = 'issued'");
  else if (status !== 'all') where.push('i.status = ?'), binds.push(oneOf(status, ['draft', 'issued', 'paid', 'void']));
  if (month) {
    if (!monthRe.test(month)) throw bad('invalid_month');
    where.push("(i.period = ? OR substr(COALESCE(i.paid_at, i.issued_at, i.created_at), 1, 7) = ?)");
    binds.push(month, month);
  }
  const invoices = await all(
    env,
    `SELECT i.*, c.name AS client_name, s.service
       FROM invoices i JOIN clients c ON c.id = i.client_id LEFT JOIN services s ON s.id = i.service_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.status = 'paid', COALESCE(i.due_at, i.issued_at) DESC, i.id DESC LIMIT 1000`,
    ...binds,
  );
  return json({ invoices });
}

export async function createInvoice({ env, body, user }) {
  const clientId = int(body.client_id);
  if (!clientId || !(await first(env, 'SELECT id FROM clients WHERE id = ?', clientId))) throw bad('client_id', 'Выберите клиента');
  const serviceId = int(body.service_id);
  const svc = serviceId ? await first(env, 'SELECT * FROM services WHERE id = ? AND client_id = ?', serviceId, clientId) : null;
  if (serviceId && !svc) throw bad('service_id', 'Услуга не найдена у этого клиента');
  const amount = money(body.amount);
  if (!amount) throw bad('amount', 'Сумма должна быть больше нуля');
  const kind = oneOf(body.kind, ['setup', 'monthly', 'other'], 'other');
  const period = str(body.period, 7);
  if (period && !monthRe.test(period)) throw bad('invalid_month', 'Период в формате ГГГГ-ММ');
  const row = {
    client_id: clientId,
    service_id: svc ? svc.id : null,
    kind,
    direction: oneOf(body.direction, DIRECTIONS) || (svc ? svc.direction : 'ads'),
    period: kind === 'monthly' ? period || curMonth() : period,
    amount_minor: amount,
    currency: oneOf(body.currency, CURRENCIES) || (svc ? svc.currency : 'USD'),
    status: oneOf(body.status, ['draft', 'issued', 'paid'], 'issued'),
    issued_at: day(body.issued_at) || today(),
    due_at: day(body.due_at),
    note: str(body.note, 500),
  };
  if (row.status === 'paid') row.paid_at = day(body.paid_at) || today();
  try {
    const id = await insert(env, 'invoices', row);
    await logActivity(env, { client_id: clientId, user_id: user.id, text: `Счёт ${row.amount_minor / 100} ${row.currency}${row.note ? ' — ' + row.note : ''}` });
    return json({ id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw bad('duplicate', 'Счёт за этот месяц по этой услуге уже есть');
    throw e;
  }
}

export async function updateInvoice({ env, params, body, user }) {
  const inv = await first(env, 'SELECT * FROM invoices WHERE id = ?', params.id);
  if (!inv) throw notFound();
  const f = pick(body, {
    status: (v) => oneOf(v, ['draft', 'issued', 'paid', 'void']),
    amount: money,
    currency: (v) => oneOf(v, CURRENCIES),
    direction: (v) => oneOf(v, DIRECTIONS),
    due_at: day,
    paid_at: day,
    note: (v) => str(v, 500),
  });
  if ('amount' in f) { f.amount_minor = f.amount; delete f.amount; if (!f.amount_minor) throw bad('amount', 'Сумма должна быть больше нуля'); }
  // Партнёру уже выплатили комиссию с этого счёта: снять оплату или поменять сумму — значит потерять выплату из отчёта
  if (inv.status === 'paid' && ((f.status && f.status !== 'paid') || ('amount_minor' in f && f.amount_minor !== inv.amount_minor) || ('currency' in f && f.currency !== inv.currency))) {
    if (await first(env, 'SELECT id FROM partner_payouts WHERE invoice_id = ?', inv.id)) {
      throw new HttpError(409, 'commission_paid', 'С этого счёта партнёру уже выплачена комиссия — изменить оплату или сумму нельзя');
    }
  }
  if (f.status === 'paid' && !f.paid_at && !inv.paid_at) f.paid_at = today();
  if (f.status && f.status !== 'paid') f.paid_at = null;
  await update(env, 'invoices', inv.id, f, { touch: false });
  if (f.status && f.status !== inv.status) {
    const names = { paid: 'оплачен', void: 'аннулирован', issued: 'выставлен', draft: 'черновик' };
    await logActivity(env, { client_id: inv.client_id, user_id: user.id, text: `Счёт ${inv.amount_minor / 100} ${inv.currency}: ${names[f.status]}` });
  }
  return json({ ok: true });
}

export async function deleteInvoice({ env, params, user }) {
  if (user.role !== 'owner') throw forbidden();
  if (await first(env, 'SELECT id FROM partner_payouts WHERE invoice_id = ?', params.id)) {
    throw new HttpError(409, 'commission_paid', 'С этого счёта партнёру уже выплачена комиссия — удалить его нельзя. Аннулировать тоже нельзя');
  }
  await run(env, 'DELETE FROM invoices WHERE id = ?', params.id);
  return json({ ok: true });
}

// Выставить ежемесячные счета за период по всем активным услугам (повторно не создаёт)
export async function generateMonthly({ env, body }) {
  const period = str(body.period, 7) || curMonth();
  if (!monthRe.test(period)) throw bad('invalid_month', 'Период в формате ГГГГ-ММ');
  const services = await all(
    env,
    `SELECT s.* FROM services s JOIN clients c ON c.id = s.client_id
      WHERE s.status = 'active' AND c.status = 'active' AND s.monthly_minor > 0
        AND (s.start_date IS NULL OR s.start_date <= ?)
        AND (s.end_date IS NULL OR s.end_date >= ?)`,
    lastDay(period),
    `${period}-01`,
  );
  let created = 0;
  for (const s of services) {
    const r = await run(
      env,
      `INSERT OR IGNORE INTO invoices (client_id, service_id, kind, direction, period, amount_minor, currency, status, issued_at, due_at, note)
       VALUES (?, ?, 'monthly', ?, ?, ?, ?, 'issued', ?, ?, ?)`,
      s.client_id, s.id, s.direction, period, s.monthly_minor, s.currency, today(),
      `${period}-${String(s.billing_day || 1).padStart(2, '0')}`, SERVICE_NAMES[s.service],
    );
    created += r.meta.changes || 0;
  }
  return json({ ok: true, period, created, skipped: services.length - created });
}

// ---- партнёры ----

export async function listPartners({ env }) {
  return json({ partners: await all(env, 'SELECT * FROM partners ORDER BY name COLLATE NOCASE') });
}

export async function createPartner({ env, body }) {
  const id = await insert(env, 'partners', {
    name: reqStr(body.name, 'Имя партнёра', 120), contact: str(body.contact, 200), terms: str(body.terms, 1000),
  });
  return json({ id }, 201);
}

export async function updatePartner({ env, params, body }) {
  const p = await first(env, 'SELECT id FROM partners WHERE id = ?', params.id);
  if (!p) throw notFound();
  await update(env, 'partners', p.id, pick(body, {
    name: (v) => reqStr(v, 'Имя партнёра', 120), contact: (v) => str(v, 200), terms: (v) => str(v, 1000),
  }), { touch: false });
  return json({ ok: true });
}

// Комиссии партнёров по оплаченным счетам
async function commissions(env, { month = null } = {}) {
  const rows = await all(
    env,
    `SELECT i.id AS invoice_id, i.kind, i.period, i.amount_minor, i.currency, i.paid_at, i.direction,
            c.name AS client_name, s.service, s.start_date, s.partner_id, s.partner_setup_pct, s.partner_monthly_pct, s.partner_months,
            p.name AS partner_name, pp.paid_at AS payout_at, pp.amount_minor AS payout_minor
       FROM invoices i
       JOIN services s ON s.id = i.service_id
       JOIN partners p ON p.id = s.partner_id
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN partner_payouts pp ON pp.invoice_id = i.id
      WHERE i.status = 'paid' ${month ? "AND substr(i.paid_at, 1, 7) = ?" : ''}
      ORDER BY i.paid_at DESC`,
    ...(month ? [month] : []),
  );
  const out = [];
  for (const r of rows) {
    let rate = 0;
    if (r.kind === 'setup') rate = r.partner_setup_pct;
    else if (r.kind === 'monthly') {
      const n = r.start_date && r.period ? monthIndex(r.period) - monthIndex(r.start_date.slice(0, 7)) : 0;
      rate = n < r.partner_months ? r.partner_monthly_pct : 0;
    }
    const amount = Math.round((r.amount_minor * rate) / 100);
    if (amount > 0) out.push({ ...r, rate, commission_minor: amount, paid: !!r.payout_at });
  }
  return out;
}

export async function listCommissions({ env, url }) {
  const status = url.searchParams.get('status') || 'due';
  let list = await commissions(env);
  if (status === 'due') list = list.filter((c) => !c.paid);
  else if (status === 'paid') list = list.filter((c) => c.paid);
  return json({ commissions: list });
}

export async function payCommission({ env, body }) {
  const invoiceId = int(body.invoice_id);
  const c = (await commissions(env)).find((x) => x.invoice_id === invoiceId);
  if (!c) throw bad('no_commission', 'По этому счёту нет комиссии');
  if (c.paid) return json({ ok: true });
  await insert(env, 'partner_payouts', {
    partner_id: c.partner_id, invoice_id: invoiceId, amount_minor: c.commission_minor, currency: c.currency, paid_at: day(body.paid_at) || today(),
  });
  return json({ ok: true }, 201);
}

// ---- сводка по деньгам ----

export async function moneySummary({ env, url }) {
  const month = url.searchParams.get('month') || curMonth();
  if (!monthRe.test(month)) throw bad('invalid_month');
  const rate = Number(await getSetting(env, 'usd_uah', '41.5')) || 41.5;
  const usd = (minor, cur) => (cur === 'UAH' ? minor / rate : minor) / 100;
  const round = (n) => Math.round(n * 100) / 100;

  const services = await all(
    env,
    `SELECT s.direction, s.currency, s.monthly_minor, s.client_id FROM services s JOIN clients c ON c.id = s.client_id
      WHERE s.status = 'active' AND c.status = 'active' AND s.monthly_minor > 0`,
  );
  const mrr = { ads: 0, ai: 0 };
  const mrrClients = { ads: new Set(), ai: new Set() };
  for (const s of services) { mrr[s.direction] += usd(s.monthly_minor, s.currency); mrrClients[s.direction].add(s.client_id); }

  const paid = await all(env, "SELECT id, direction, amount_minor, currency FROM invoices WHERE status = 'paid' AND substr(paid_at, 1, 7) = ?", month);
  const received = { ads: 0, ai: 0 };
  for (const i of paid) received[i.direction] += usd(i.amount_minor, i.currency);

  const open = await all(env, "SELECT amount_minor, currency, due_at FROM invoices WHERE status = 'issued'");
  const t = today();
  let outstanding = 0;
  let overdue = 0;
  for (const i of open) { outstanding += usd(i.amount_minor, i.currency); if (i.due_at && i.due_at < t) overdue += usd(i.amount_minor, i.currency); }

  const monthComm = await commissions(env, { month });
  const comm = { ads: 0, ai: 0 };
  for (const c of monthComm) comm[c.direction] += usd(c.commission_minor, c.currency);
  const allDue = (await commissions(env)).filter((c) => !c.paid);
  const commissionsDue = allDue.reduce((s, c) => s + usd(c.commission_minor, c.currency), 0);

  const members = await all(env, "SELECT id, name FROM users WHERE ai_share = 1 AND active = 1 AND role != 'agent' ORDER BY id");
  const aiNet = received.ai - comm.ai;
  const perMember = members.length ? aiNet / members.length : 0;

  const history = await all(
    env,
    `SELECT substr(paid_at, 1, 7) AS month, direction, currency, SUM(amount_minor) AS sum FROM invoices
      WHERE status = 'paid' AND paid_at >= date('now', '-12 months') GROUP BY 1, 2, 3 ORDER BY 1`,
  );
  const byMonth = {};
  for (const h of history) {
    byMonth[h.month] = byMonth[h.month] || { month: h.month, ads: 0, ai: 0 };
    byMonth[h.month][h.direction] += usd(h.sum, h.currency);
  }

  return json({
    month,
    usd_uah: rate,
    mrr: { ads: round(mrr.ads), ai: round(mrr.ai), total: round(mrr.ads + mrr.ai), clients_ads: mrrClients.ads.size, clients_ai: mrrClients.ai.size },
    received: { ads: round(received.ads), ai: round(received.ai), total: round(received.ads + received.ai) },
    commissions: { ads: round(comm.ads), ai: round(comm.ai), due_total: round(commissionsDue) },
    outstanding: round(outstanding),
    overdue: round(overdue),
    ai_split: { net: round(aiNet), members: members.map((m) => ({ ...m, amount: round(perMember) })) },
    history: Object.values(byMonth).map((m) => ({ month: m.month, ads: round(m.ads), ai: round(m.ai) })),
  });
}
