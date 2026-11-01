// Smoke-тест API против локального `npm run dev` (DEV_MODE=1, ключи из .dev.vars).
// Запуск: node test/smoke.mjs [http://localhost:8788]
const BASE = process.argv[2] || 'http://localhost:8788';
let cookie = '';
let failed = 0;

async function api(method, path, body, headers = {}) {
  const r = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: BASE, ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

function check(name, cond, extra) {
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const run = Math.floor(Math.random() * 1e6);
const month = new Date().toISOString().slice(0, 7);

// --- вход ---
let r = await api('GET', '/dashboard');
check('без входа — 401', r.status === 401);
r = await api('POST', '/auth/dev', { tg_id: 111000111, name: 'Даниил' });
check('dev-вход', r.status === 200 && r.data.user, r.data);
r = await api('GET', '/auth/me');
check('me', r.data.user && r.data.user.name, r.data);

// --- приём заявки с сайта ---
const lead = { name: `Тест ${run}`, contact: `+38050${String(run).padStart(7, '0')}`, niche: 'Стоматологія, Одеса', service: 'AI-адміністратор', budget: '$500', attribution: { gclid: 'abc', utm_term: 'ai бот' } };
r = await api('POST', '/intake', lead);
check('intake без ключа — 401', r.status === 401);
r = await api('POST', '/intake', lead, { 'X-Intake-Key': 'dev-intake-key' });
check('intake создаёт сделку', r.status === 201 && r.data.deal_id, r.data);
const dealId = r.data.deal_id;
r = await api('POST', '/intake', lead, { 'X-Intake-Key': 'dev-intake-key' });
check('повторная заявка — дубль', r.data.duplicate === true && r.data.deal_id === dealId, r.data);

r = await api('GET', `/deals/${dealId}`);
check('сделка: AI-директ, источник ads', r.data.deal.service === 'ai_direct' && r.data.deal.source === 'ads' && r.data.deal.direction === 'ai', r.data.deal);
check('сделка: 2 события', r.data.activities.length >= 2, r.data.activities.length);

// --- воронка ---
r = await api('PATCH', `/deals/${dealId}`, { stage: 'lost' });
check('отказ без причины — 400', r.status === 400);
r = await api('PATCH', `/deals/${dealId}`, { stage: 'proposal', setup: 800, monthly: 160, next_step: 'Созвон', next_step_at: '2020-01-01' });
check('сделка → КП', r.status === 200, r.data);
r = await api('GET', '/dashboard');
check('дашборд: просроченный следующий шаг', r.data.follow_ups.some((d) => d.id === dealId), r.data.follow_ups);

// --- партнёр и выигрыш ---
r = await api('POST', '/partners', { name: `Партнёр ${run}`, terms: '20% запуска + 10% абонплаты 12 мес' });
const partnerId = r.data.id;
await api('PATCH', `/deals/${dealId}`, { partner_id: partnerId });
r = await api('POST', `/deals/${dealId}/win`, { client_name: `Клиника ${run}`, start_date: `${month}-05` });
check('выигрыш создаёт клиента и услугу', r.data.client_id && r.data.service_id, r.data);
const clientId = r.data.client_id;
const serviceId = r.data.service_id;

r = await api('GET', `/clients/${clientId}`);
check('клиент: услуга $160/мес', r.data.services[0]?.monthly_minor === 16000, r.data.services);
check('клиент: счёт за запуск $800', r.data.invoices.some((i) => i.kind === 'setup' && i.amount_minor === 80000), r.data.invoices);
check('клиент: история сделки перенесена', r.data.activities.length >= 3, r.data.activities.length);

// --- счета ---
r = await api('POST', '/invoices/generate', { period: month });
check('ежемесячные счета созданы', r.data.created >= 1, r.data);
r = await api('POST', '/invoices/generate', { period: month });
check('повторно не дублируются', r.data.created === 0, r.data);
r = await api('GET', `/clients/${clientId}`);
for (const inv of r.data.invoices) await api('PATCH', `/invoices/${inv.id}`, { status: 'paid' });
r = await api('GET', '/commissions?status=due');
const mine = r.data.commissions.filter((c) => c.client_name === `Клиника ${run}`);
check('комиссии партнёра: 160 + 16', mine.length === 2 && mine.reduce((s, c) => s + c.commission_minor, 0) === 17600, mine);
r = await api('POST', '/commissions/pay', { invoice_id: mine[0].invoice_id });
check('комиссия выплачена', r.status === 201, r.data);

r = await api('GET', `/money/summary?month=${month}`);
check('сводка: MRR AI ≥ 160', r.data.mrr.ai >= 160, r.data.mrr);
check('сводка: получено AI ≥ 960', r.data.received.ai >= 960, r.data.received);
check('сводка: доля AI посчитана', Array.isArray(r.data.ai_split.members), r.data.ai_split);

// --- услуги ---
r = await api('PATCH', `/services/${serviceId}`, { ad_budget: 15000, ad_budget_currency: 'UAH', ad_account: '123-456-7890' });
check('бюджет и кабинет', r.status === 200, r.data);

// --- задачи ---
r = await api('POST', '/tasks', { title: 'Подключить Instagram', client_id: clientId, due: '2030-01-01', priority: 1 });
check('задача создана', r.status === 201, r.data);
const taskId = r.data.id;
r = await api('PATCH', `/tasks/${taskId}`, { status: 'done' });
r = await api('GET', `/tasks?status=done&client_id=${clientId}`);
check('задача закрыта', r.data.tasks.some((t) => t.id === taskId && t.done_at), r.data.tasks);

// --- агент ---
const saved = cookie;
cookie = '';
const agent = { Authorization: 'Bearer dev-agent-key' };
r = await api('GET', '/agent/summary', null, agent);
const ac = r.data.clients?.find((c) => c.id === clientId);
check('агент: сводка с бюджетом и кабинетом', ac && ac.services[0].ad_account === '123-456-7890' && ac.services[0].ad_budget === 15000, ac);
r = await api('POST', `/clients/${clientId}/notes`, { text: 'Агент: CPL вырос на 30%' }, agent);
check('агент: заметка', r.status === 201, r.data);
r = await api('POST', '/invoices/generate', { period: month }, agent);
check('агенту счета запрещены', r.status === 403, r.data);
r = await api('GET', '/clients', null, { Authorization: 'Bearer wrong' });
check('неверный ключ — 401', r.status === 401);
cookie = saved;

r = await api('GET', `/clients/${clientId}`);
check('заметка агента в ленте', r.data.activities.some((a) => a.kind === 'agent'), r.data.activities.slice(0, 3));

// --- CSRF ---
r = await api('POST', '/tasks', { title: 'x' }, { Origin: 'https://evil.example' });
check('чужой Origin — 403', r.status === 403);

// --- исправления 01.11.2026 ---
// 1. Оплату нельзя поставить в обход «Оплатили»
r = await api('POST', '/deals', { title: `Обход ${run}` });
const bypassId = r.data.id;
r = await api('PATCH', `/deals/${bypassId}`, { stage: 'won' });
check('этап «Оплата» без «Оплатили» — 400', r.status === 400 && r.data.code === 'use_win', r.data);
r = await api('POST', '/deals', { title: `Сразу оплачена ${run}`, stage: 'won' });
check('новая сделка сразу «Оплата» — 400', r.status === 400 && r.data.code === 'use_win', r.data);

// 2. Процент партнёра только 0–100
r = await api('POST', '/deals', { title: `Партнёр 500% ${run}`, partner_id: partnerId, setup: 100, monthly: 10 });
const pctDeal = r.data.id;
r = await api('POST', `/deals/${pctDeal}/win`, { client_name: `Клиент 500% ${run}`, partner_setup_pct: 500 });
check('процент партнёра 500 — 400', r.status === 400 && r.data.code === 'invalid_pct', r.data);
r = await api('GET', `/deals/${pctDeal}`);
check('после ошибки сделка не выиграна', r.data.deal.stage !== 'won', r.data.deal.stage);
r = await api('GET', `/clients?status=all&q=${encodeURIComponent(`Клиент 500% ${run}`)}`);
check('после ошибки лишний клиент не создан', r.data.clients.length === 0, r.data.clients.map((c) => c.name));

// 3. Клиента и услугу со счетами удалить нельзя, деньги не пропадают
r = await api('GET', `/money/summary?month=${month}`);
const receivedBefore = r.data.received.total;
r = await api('DELETE', `/services/${serviceId}`);
check('услугу со счетами удалить нельзя — 409', r.status === 409 && r.data.code === 'has_invoices', r.data);
r = await api('DELETE', `/clients/${clientId}`);
check('клиента со счетами удалить нельзя — 409', r.status === 409 && r.data.code === 'has_invoices', r.data);
r = await api('GET', `/money/summary?month=${month}`);
check('«Получено» не изменилось', r.data.received.total === receivedBefore, [receivedBefore, r.data.received.total]);
r = await api('POST', '/clients', { name: `Пустой ${run}` });
r = await api('DELETE', `/clients/${r.data.id}`);
check('клиента без счетов удалить можно', r.status === 200, r.data);

// 4. Счёт с выплаченной комиссией нельзя «разоплатить» или удалить
r = await api('PATCH', `/invoices/${mine[0].invoice_id}`, { status: 'issued' });
check('снять оплату со счёта с выплаченной комиссией — 409', r.status === 409 && r.data.code === 'commission_paid', r.data);
r = await api('PATCH', `/invoices/${mine[0].invoice_id}`, { amount: 1 });
check('поменять его сумму — 409', r.status === 409, r.data);
r = await api('DELETE', `/invoices/${mine[0].invoice_id}`);
check('удалить его — 409', r.status === 409, r.data);
r = await api('PATCH', `/invoices/${mine[1].invoice_id}`, { status: 'issued' });
check('счёт без выплаты можно вернуть в «Ждём оплату»', r.status === 200, r.data);
await api('PATCH', `/invoices/${mine[1].invoice_id}`, { status: 'paid' });

// 5. «Сегодня» по Киеву
r = await api('GET', '/dashboard');
const kyivToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kiev' });
check('дашборд: сегодня по Киеву', r.data.today === kyivToday, [r.data.today, kyivToday]);

// --- вход из Telegram Mini App (токен бота из .dev.vars: 123:dev) ---
const { createHmac } = await import('node:crypto');
function initData(tgId, start) {
  const f = { query_id: 'AAE1', user: JSON.stringify({ id: tgId, first_name: 'Даниил' }), auth_date: String(Math.floor(Date.now() / 1000)), ...(start ? { start_param: start } : {}) };
  const dcs = Object.keys(f).sort().map((k) => `${k}=${f[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update('123:dev').digest();
  return new URLSearchParams({ ...f, hash: createHmac('sha256', secret).update(dcs).digest('hex') }).toString();
}
const savedCookie = cookie;
cookie = '';
r = await api('POST', '/auth/webapp', { initData: initData(111000111, 'deals_5') });
check('мини-приложение: вход', r.status === 200 && r.data.session && r.data.start_param === 'deals_5', r.data);
const sid = r.data.session;
cookie = '';
r = await api('GET', '/dashboard', null, { 'X-Session': sid });
check('мини-приложение: сессия в заголовке без cookie', r.status === 200, r.status);
r = await api('GET', '/dashboard', null, { 'X-Session': sid.slice(0, -2) + 'xx' });
check('подделанная сессия — 401', r.status === 401, r.status);
r = await api('POST', '/auth/webapp', { initData: initData(999999999) });
check('мини-приложение: не приглашён — 403 с ID', r.status === 403 && r.data.tg_id === 999999999, r.data);
r = await api('POST', '/auth/webapp', { initData: initData(111000111).replace('hash=', 'hash=0') });
check('мини-приложение: неверная подпись — 401', r.status === 401, r.data);
r = await api('GET', '/auth/me', null, { 'X-Session': sid });
check('me: имя мини-приложения', r.data.app_short_name === 'crm', r.data);
cookie = savedCookie;

console.log(failed ? `\n${failed} FAILED` : '\nВсё ок');
process.exit(failed ? 1 : 0);
