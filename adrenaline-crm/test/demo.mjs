// Демо-данные для локальной проверки интерфейса (вымышленные компании). node test/demo.mjs
const BASE = process.argv[2] || 'http://localhost:8788';
let cookie = '';
async function api(method, path, body) {
  const r = await fetch(BASE + '/api' + path, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const s = r.headers.get('set-cookie'); if (s) cookie = s.split(';')[0];
  const d = await r.json(); if (!r.ok) throw new Error(path + ' ' + JSON.stringify(d)); return d;
}
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
await api('POST', '/auth/dev', { tg_id: 111000111, name: 'Даниил' });
const users = (await api('GET', '/users')).users;
if (users.length < 3) {
  await api('POST', '/users', { tg_id: 222000222, name: 'Єгор', ai_share: true });
  await api('POST', '/users', { tg_id: 333000333, name: 'Даня', ai_share: true });
}
const u = (await api('GET', '/users')).users;
const egor = u.find((x) => x.name === 'Єгор').id;
const danya = u.find((x) => x.name === 'Даня').id;

const deals = [
  { title: 'Студия маникюра «Лак» — AI-директ', stage: 'new', service: 'ai_direct', source: 'site', contact_name: 'Ирина', phone: '+380501112233', monthly: 160, setup: 800 },
  { title: 'Автосервис «Мотор» — Google Ads', stage: 'contacted', service: 'google_ads', source: 'bm', contact_name: 'Олег', telegram: '@oleg_motor', monthly: 600, setup: 300, next_step: 'Прислать разбор ниши', next_step_at: day(0) },
  { title: 'Стоматология «Белый» — пакет', stage: 'call', service: 'package', source: 'referral', contact_name: 'Анна', monthly: 730, setup: 1100, next_step: 'Разбор в Zoom', next_step_at: day(2) },
  { title: 'Магазин одежды «Север» — AI-директ', stage: 'proposal', service: 'ai_direct', source: 'outreach', contact_name: 'Марина', monthly: 160, setup: 800, next_step: 'Ответ по КП', next_step_at: day(-1) },
  { title: 'Фитнес-клуб «Пульс» — SEO', stage: 'proposal', service: 'seo', source: 'site', contact_name: 'Денис', monthly: 350, next_step: 'Созвон с владельцем', next_step_at: day(4) },
];
for (const d of deals) await api('POST', '/deals', { ...d, currency: 'USD' });

const c1 = (await api('POST', '/clients', { name: 'Клиника «Здоровье»', niche: 'Медицина', city: 'Одесса', source: 'agency', contact_name: 'Светлана', telegram: '@svet_clinic' })).id;
await api('POST', `/clients/${c1}/services`, { service: 'google_ads', monthly: 900, currency: 'USD', start_date: day(-60), ad_budget: 40000, ad_budget_currency: 'UAH', ad_account: '123-456-7890', billing_day: 5 });
const c2 = (await api('POST', '/clients', { name: 'СТО «Электро»', niche: 'Автосервис', city: 'Киев', source: 'referral' })).id;
await api('POST', `/clients/${c2}/services`, { service: 'google_ads', monthly: 600, currency: 'USD', start_date: day(-90), ad_budget: 25000, ad_budget_currency: 'UAH', billing_day: 10 });
await api('POST', `/clients/${c2}/services`, { service: 'ai_direct', monthly: 160, currency: 'USD', start_date: day(-20), billing_day: 10 });
await api('POST', '/invoices/generate', { period: day(0).slice(0, 7) });

const tasks = [
  { title: 'Проверить поисковые запросы и минус-слова', client_id: c1, due: day(0), priority: 1 },
  { title: 'Отчёт клиенту за неделю', client_id: c1, due: day(1) },
  { title: 'Подключить Instagram к AI-директу', client_id: c2, assignee_id: egor, due: day(-1) },
  { title: 'Список 20 салонов для рассылки', assignee_id: danya, due: day(3) },
  { title: 'Зарегистрироваться в партнёрке Binotel', due: day(5) },
];
const me = u.find((x) => x.name === 'Даниил').id;
for (const t of tasks) await api('POST', '/tasks', { assignee_id: me, ...t });
await api('POST', `/clients/${c1}/notes`, { text: 'Созвон: клиент хочет больше первичных пациентов на имплантацию, бюджет поднимаем с ноября.', kind: 'call' });
console.log('demo ok');
