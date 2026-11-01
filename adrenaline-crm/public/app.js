// ADrenaline CRM — интерфейс без сборки. Хеш-роутер, рендер через шаблонные строки, делегирование событий.

// ---------- справочники ----------
const L = {
  stage: { new: 'Новая', contacted: 'На связи', call: 'Разбор', proposal: 'КП', won: 'Оплата', lost: 'Отказ' },
  stageColor: { new: 'blue', contacted: '', call: 'amber', proposal: 'amber', won: 'green', lost: 'red' },
  service: {
    google_ads: 'Google Ads', meta: 'Meta Ads', seo: 'SEO', analytics: 'Аналитика', ai_direct: 'AI-директ',
    ai_voice: 'Голосовой AI', ai_other: 'AI-решение', crm: 'CRM', package: 'Пакет', other: 'Другое',
  },
  source: {
    site: 'Сайт', ads: 'Реклама', telegram: 'Telegram', bm: 'Business Match', referral: 'Рекомендация',
    outreach: 'Рассылка', agency: 'Агентство', partner: 'Партнёр', other: 'Другое',
  },
  dir: { ads: 'Реклама', ai: 'AI' },
  clientStatus: { active: 'Активен', paused: 'Пауза', churned: 'Ушёл' },
  serviceStatus: { active: 'Активна', paused: 'Пауза', ended: 'Завершена' },
  invStatus: { draft: 'Черновик', issued: 'Ждём оплату', paid: 'Оплачен', void: 'Аннулирован' },
  invKind: { setup: 'Запуск', monthly: 'Абонплата', other: 'Разовый' },
  taskStatus: { todo: 'К выполнению', doing: 'В работе', done: 'Готово' },
  priority: { 1: 'Высокий', 2: 'Обычный', 3: 'Низкий' },
  role: { owner: 'Владелец', member: 'Команда' },
};
const AI_SERVICES = ['ai_direct', 'ai_voice', 'ai_other', 'crm'];
const OPEN_STAGES = ['new', 'contacted', 'call', 'proposal'];
const opts = (obj) => Object.entries(obj);

const ICON = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  deals: '<path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v5h-4z"/>',
  clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.3 0 4 1.5 4.5 4"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9v.01M17 15v.01"/>',
  team: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 3.8-6 7-6s6 2 7 6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// ---------- утилиты ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const money = (minor, cur = 'USD') => (minor == null ? '—' : cur === 'UAH' ? `${nf.format(minor / 100)} ₴` : `$${nf.format(minor / 100)}`);
const usd = (n) => `$${nf0.format(n || 0)}`;
// Даты по местному времени (Киев), а не по Гринвичу: иначе ночью «сегодня» было бы вчерашним днём
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kiev' });
const addDays = (n) => {
  const [y, m, d] = today().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const fmtDay = (d) => {
  if (!d) return '—';
  const s = d.slice(0, 10);
  if (s === today()) return 'сегодня';
  if (s === addDays(1)) return 'завтра';
  if (s === addDays(-1)) return 'вчера';
  const [y, m, dd] = s.split('-');
  return y === today().slice(0, 4) ? `${dd}.${m}` : `${dd}.${m}.${y.slice(2)}`;
};
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtDay(d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Kiev' }))} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kiev' })}`;
};
const dueBadge = (due, done) => {
  if (!due) return '';
  const cls = !done && due < today() ? 'red' : !done && due === today() ? 'amber' : '';
  return `<span class="badge ${cls}">${fmtDay(due)}</span>`;
};
const tgLink = (t) => (t ? `<a href="https://t.me/${esc(String(t).replace(/^@/, ''))}" target="_blank" rel="noopener">${esc(t)}</a>` : '—');
const telLink = (p) => (p ? `<a href="tel:${esc(p)}">${esc(p)}</a>` : '—');
const webLink = (w) => (w ? `<a href="${esc(/^https?:/.test(w) ? w : 'https://' + w)}" target="_blank" rel="noopener">${esc(w.replace(/^https?:\/\//, ''))}</a>` : '—');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Telegram Mini App ----------
// Внутри Telegram есть window.Telegram.WebApp с непустым initData; в обычном браузере — нет.
const TG = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
const SESSION_KEY = 'crm_session';
const session = {
  get() { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  set(v) { try { v ? sessionStorage.setItem(SESSION_KEY, v) : sessionStorage.removeItem(SESSION_KEY); } catch { /* приватный режим */ } },
};

// startapp=deals_12 → #/deals/12
function hashFromStartParam(p) {
  const m = /^(home|deals|clients|tasks|money|team)(?:_(\d+))?$/.exec(String(p || ''));
  if (!m) return null;
  const name = m[1] === 'home' ? '' : m[1];
  return `#/${name}${m[2] ? '/' + m[2] : ''}`;
}

async function tgLogin() {
  const r = await fetch('/api/auth/webapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: TG.initData }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok && d.user) { session.set(d.session); return { user: d.user }; }
  return { error: d };
}

function setupTelegram() {
  if (!TG) return;
  document.documentElement.classList.add('in-tg');
  try { TG.ready(); TG.expand(); } catch { /* старый клиент */ }
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) { TG.setHeaderColor(bg); TG.setBackgroundColor(bg); }
  } catch { /* необязательно */ }
  // «Назад» в шапке Telegram: из карточки — в её раздел (из сделки — в воронку)
  try { TG.BackButton.onClick(() => { const r = route(); location.hash = r.id ? `#/${r.name}` : '#/'; }); } catch { /* нет кнопки */ }
  const start = hashFromStartParam(TG.initDataUnsafe && TG.initDataUnsafe.start_param);
  if (start && (!location.hash || location.hash === '#/' || location.hash === '#')) location.hash = start;
}

async function api(method, path, body) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  const sid = session.get();
  if (sid) headers['X-Session'] = sid;
  const r = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await r.json(); } catch { /* пусто */ }
  if (r.status === 401 && path !== '/auth/me') {
    session.set(null);
    state.me = null;
    if (TG) tgSignIn(); else render();
    throw new Error('Нужно войти');
  }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || `Ошибка ${r.status}`), { status: r.status, data });
  return data;
}

// ---------- состояние ----------
const state = { me: null, boot: null, users: [], partners: [] };
const userOpts = (withEmpty = true) => [...(withEmpty ? [['', '— не назначено —']] : []), ...state.users.filter((u) => u.active).map((u) => [u.id, u.name])];

async function loadRefs() {
  const [u, p] = await Promise.all([api('GET', '/users'), api('GET', '/partners')]);
  state.users = u.users;
  state.partners = p.partners;
}

// ---------- модальные формы ----------
// fields: [{ name, label, type, options, wide, required, placeholder, hint }]
function field(f, v) {
  const val = v ?? f.value ?? '';
  const id = `f_${f.name}`;
  const req = f.required ? 'required' : '';
  let input;
  if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
  else if (f.type === 'select') input = `<select id="${id}" name="${f.name}" ${req}>${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (f.type === 'checkbox') return `<label class="check ${f.wide ? 'wide' : ''}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  else {
    const type = f.type === 'money' || f.type === 'number' ? 'text' : f.type || 'text';
    const mode = f.type === 'money' || f.type === 'number' ? 'inputmode="decimal"' : '';
    input = `<input id="${id}" type="${type}" name="${f.name}" value="${esc(val)}" ${req} ${mode} placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
  }
  return `<label class="f ${f.wide ? 'wide' : ''}" for="${id}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${input}${f.hint ? `<span class="small mute">${esc(f.hint)}</span>` : ''}</label>`;
}

function openModal({ title, body, footer, onMount, wide }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay" data-close="1"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${wide ? 'style="width:min(820px,100%)"' : ''}>
    <div class="mh"><h2>${esc(title)}</h2><button class="x" data-close="1" aria-label="Закрыть">×</button></div>
    <div class="mb">${body}</div>${footer ? `<div class="mf">${footer}</div>` : ''}</div></div>`;
  const overlay = root.firstElementChild;
  overlay.addEventListener('click', (e) => { if (e.target.dataset.close) closeModal(); });
  if (onMount) onMount(root.querySelector('.modal'));
  const first = root.querySelector('input:not([type=checkbox]), select, textarea');
  if (first) first.focus();
}
const closeModal = () => { $('#modal-root').innerHTML = ''; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function openForm({ title, fields, values = {}, submit = 'Сохранить', onSubmit, extraFooter = '' }) {
  openModal({
    title,
    body: `<form class="form" id="mform" novalidate>${fields.map((f) => field(f, values[f.name])).join('')}<button type="submit" hidden></button></form>`,
    footer: `<span class="err" id="merr"></span>${extraFooter}<button class="btn" data-close="1" type="button">Отмена</button><button class="btn primary" id="msubmit" type="button">${esc(submit)}</button>`,
    onMount(m) {
      const form = $('#mform', m);
      const go = async () => {
        const data = {};
        for (const f of fields) {
          const el = form.elements[f.name];
          if (!el) continue;
          data[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
          if (f.required && !data[f.name]) { $('#merr', m).textContent = `Заполните «${f.label}»`; el.focus(); return; }
        }
        const btn = $('#msubmit', m);
        btn.disabled = true;
        try {
          await onSubmit(data);
          closeModal();
        } catch (err) {
          $('#merr', m).textContent = err.message;
          btn.disabled = false;
        }
      };
      $('#msubmit', m).addEventListener('click', go);
      form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
    },
  });
}

function confirmModal(text, onYes, yes = 'Удалить') {
  openModal({
    title: 'Подтвердите',
    body: `<p>${esc(text)}</p>`,
    footer: `<button class="btn" data-close="1">Отмена</button><button class="btn primary" id="myes">${esc(yes)}</button>`,
    onMount(m) {
      $('#myes', m).addEventListener('click', async () => {
        closeModal();
        try { await onYes(); } catch (e) { toast(e.message); }
      });
    },
  });
}

// ---------- формы сущностей ----------
const dealFields = () => [
  { name: 'title', label: 'Название сделки', required: true, wide: true, placeholder: 'Клиника «Усмешка» — Google Ads' },
  { name: 'contact_name', label: 'Контактное лицо' },
  { name: 'phone', label: 'Телефон' },
  { name: 'telegram', label: 'Telegram', placeholder: '@username' },
  { name: 'website', label: 'Сайт' },
  { name: 'niche', label: 'Ниша и город' },
  { name: 'source', label: 'Источник', type: 'select', options: [['', '—'], ...opts(L.source)] },
  { name: 'service', label: 'Услуга', type: 'select', options: [['', '—'], ...opts(L.service)] },
  { name: 'stage', label: 'Этап', type: 'select', options: opts(L.stage).filter(([k]) => k !== 'won') },
  { name: 'currency', label: 'Валюта', type: 'select', options: [['USD', 'USD'], ['UAH', 'UAH']] },
  { name: 'setup', label: 'Запуск', type: 'money' },
  { name: 'monthly', label: 'Абонплата в месяц', type: 'money' },
  { name: 'owner_id', label: 'Ответственный', type: 'select', options: userOpts() },
  { name: 'partner_id', label: 'Партнёр (кто привёл)', type: 'select', options: [['', '—'], ...state.partners.map((p) => [p.id, p.name])] },
  { name: 'next_step', label: 'Следующий шаг', placeholder: 'Созвон, отправить КП…' },
  { name: 'next_step_at', label: 'Когда', type: 'date' },
  { name: 'lost_reason', label: 'Причина отказа', wide: true },
];
const dealValues = (d) => ({ ...d, setup: d.setup_minor ? d.setup_minor / 100 : '', monthly: d.monthly_minor ? d.monthly_minor / 100 : '' });

const clientFields = () => [
  { name: 'name', label: 'Название', required: true, wide: true },
  { name: 'niche', label: 'Ниша' },
  { name: 'city', label: 'Город' },
  { name: 'contact_name', label: 'Контактное лицо' },
  { name: 'phone', label: 'Телефон' },
  { name: 'telegram', label: 'Telegram' },
  { name: 'email', label: 'Почта' },
  { name: 'website', label: 'Сайт' },
  { name: 'source', label: 'Откуда пришёл', type: 'select', options: [['', '—'], ...opts(L.source)] },
  { name: 'status', label: 'Статус', type: 'select', options: opts(L.clientStatus) },
  { name: 'owner_id', label: 'Ответственный', type: 'select', options: userOpts() },
  { name: 'notes', label: 'Заметки (доступы, особенности)', type: 'textarea', wide: true },
];

const serviceFields = () => [
  { name: 'service', label: 'Услуга', type: 'select', options: opts(L.service) },
  { name: 'status', label: 'Статус', type: 'select', options: opts(L.serviceStatus) },
  { name: 'currency', label: 'Валюта оплаты', type: 'select', options: [['USD', 'USD'], ['UAH', 'UAH']] },
  { name: 'monthly', label: 'Абонплата в месяц', type: 'money' },
  { name: 'setup', label: 'Запуск', type: 'money' },
  { name: 'billing_day', label: 'День оплаты (1–28)', type: 'number' },
  { name: 'start_date', label: 'Начало', type: 'date' },
  { name: 'end_date', label: 'Окончание', type: 'date' },
  { name: 'ad_budget', label: 'Рекламный бюджет в месяц', type: 'money' },
  { name: 'ad_budget_currency', label: 'Валюта бюджета', type: 'select', options: [['', '—'], ['UAH', 'UAH'], ['USD', 'USD']] },
  { name: 'ad_account', label: 'ID рекламного кабинета', wide: true, placeholder: '196-638-6000 или act_123…' },
  { name: 'partner_id', label: 'Партнёр', type: 'select', options: [['', '—'], ...state.partners.map((p) => [p.id, p.name])] },
  { name: 'partner_months', label: 'Месяцев комиссии', type: 'number' },
  { name: 'partner_setup_pct', label: '% партнёру с запуска', type: 'number' },
  { name: 'partner_monthly_pct', label: '% партнёру с абонплаты', type: 'number' },
  { name: 'notes', label: 'Заметки', type: 'textarea', wide: true },
];
const serviceValues = (s) => ({
  ...s,
  monthly: s.monthly_minor ? s.monthly_minor / 100 : '', setup: s.setup_minor ? s.setup_minor / 100 : '',
  ad_budget: s.ad_budget_minor != null ? s.ad_budget_minor / 100 : '',
});

const taskFields = (clients = []) => [
  { name: 'title', label: 'Задача', required: true, wide: true },
  { name: 'assignee_id', label: 'Исполнитель', type: 'select', options: userOpts() },
  { name: 'due', label: 'Срок', type: 'date' },
  { name: 'priority', label: 'Приоритет', type: 'select', options: opts(L.priority) },
  { name: 'status', label: 'Статус', type: 'select', options: opts(L.taskStatus) },
  ...(clients.length ? [{ name: 'client_id', label: 'Клиент', type: 'select', options: [['', '—'], ...clients.map((c) => [c.id, c.name])], wide: true }] : []),
  { name: 'note', label: 'Подробности', type: 'textarea', wide: true },
];

async function clientOptions() {
  const r = await api('GET', '/clients?status=all');
  return r.clients;
}

function taskForm(values = {}, onDone) {
  const isNew = !values.id;
  const show = async () => {
    const clients = values.client_id || values.deal_id ? [] : await clientOptions();
    openForm({
      title: isNew ? 'Новая задача' : 'Задача',
      fields: taskFields(clients),
      values: { priority: 2, status: 'todo', assignee_id: isNew ? state.me.id : '', ...values },
      extraFooter: isNew ? '' : '<button class="btn danger" type="button" id="tdel">Удалить</button>',
      onSubmit: async (d) => {
        const body = { ...d };
        if (values.client_id && !('client_id' in d)) body.client_id = values.client_id;
        if (values.deal_id) body.deal_id = values.deal_id;
        if (isNew) await api('POST', '/tasks', body);
        else await api('PATCH', `/tasks/${values.id}`, body);
        toast(isNew ? 'Задача добавлена' : 'Сохранено');
        onDone && onDone();
      },
    });
    const del = $('#tdel');
    if (del) del.addEventListener('click', () => confirmModal('Удалить задачу?', async () => { await api('DELETE', `/tasks/${values.id}`); toast('Удалено'); onDone && onDone(); }));
  };
  show().catch((e) => toast(e.message));
}

function invoiceForm(client, services, onDone, values = {}) {
  openForm({
    title: 'Новый счёт',
    fields: [
      { name: 'service_id', label: 'Услуга', type: 'select', options: [['', '— без услуги —'], ...services.map((s) => [s.id, `${L.service[s.service]} · ${money(s.monthly_minor, s.currency)}/мес`])], wide: true },
      { name: 'kind', label: 'Тип', type: 'select', options: opts(L.invKind) },
      { name: 'direction', label: 'Направление', type: 'select', options: opts(L.dir) },
      { name: 'amount', label: 'Сумма', type: 'money', required: true },
      { name: 'currency', label: 'Валюта', type: 'select', options: [['USD', 'USD'], ['UAH', 'UAH']] },
      { name: 'period', label: 'Месяц (для абонплаты)', placeholder: today().slice(0, 7) },
      { name: 'due_at', label: 'Оплатить до', type: 'date' },
      { name: 'status', label: 'Статус', type: 'select', options: [['issued', 'Выставлен'], ['paid', 'Уже оплачен'], ['draft', 'Черновик']] },
      { name: 'note', label: 'Комментарий', wide: true },
    ],
    values: { kind: 'monthly', direction: 'ads', currency: 'USD', status: 'issued', due_at: today(), ...values },
    onSubmit: async (d) => {
      await api('POST', '/invoices', { ...d, client_id: client.id });
      toast('Счёт создан');
      onDone && onDone();
    },
  });
}

// ---------- каркас ----------
const NAV = [
  ['', 'home', 'Сводка'],
  ['deals', 'deals', 'Воронка'],
  ['clients', 'clients', 'Клиенты'],
  ['tasks', 'tasks', 'Задачи'],
  ['money', 'money', 'Деньги'],
  ['team', 'team', 'Команда'],
];

function shell(active, content) {
  return `<div class="shell">
    <aside class="side">
      <div class="brand"><img src="/favicon.svg" alt="">ADrenaline CRM</div>
      <nav class="nav">${NAV.map(([href, ic, label]) => `<a href="#/${href}" class="${active === href ? 'on' : ''}">${icon(ic)}<span>${label}</span>${href === 'deals' && state.newDeals ? `<span class="badge blue">${state.newDeals}</span>` : ''}</a>`).join('')}</nav>
      <div class="me">${esc(state.me.name)} · ${L.role[state.me.role] || ''}<br><button data-act="logout">Выйти</button></div>
    </aside>
    <main class="main" id="view">${content}</main>
  </div>`;
}

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  return { name: name || '', id: id ? Number(id) : null };
}

let renderSeq = 0;
async function render() {
  const app = $('#app');
  app.classList.remove('boot');
  if (!state.me) return renderLogin();
  const r = route();
  if (TG) { try { r.id ? TG.BackButton.show() : TG.BackButton.hide(); } catch { /* нет кнопки */ } }
  const seq = ++renderSeq;
  const views = { '': viewDashboard, deals: r.id ? viewDeal : viewDeals, clients: r.id ? viewClient : viewClients, tasks: viewTasks, money: viewMoney, team: viewTeam };
  const fn = views[r.name] || viewDashboard;
  if (!$('.shell') || app.dataset.section !== r.name) {
    app.innerHTML = shell(r.name, '<div class="mute">Загрузка…</div>');
    app.dataset.section = r.name;
  } else {
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#/${r.name}`));
  }
  try {
    const html = await fn(r);
    if (seq !== renderSeq) return;
    $('#view').innerHTML = html;
    if (fn.mount) fn.mount($('#view'), r);
  } catch (e) {
    if (seq !== renderSeq) return;
    $('#view').innerHTML = `<div class="card"><h2>Не получилось загрузить</h2><p class="mute">${esc(e.message)}</p></div>`;
  }
}
const refresh = () => render();

// ---------- вход ----------
function renderLogin(extra = '') {
  const b = state.boot || {};
  if (TG) return renderTgLogin(extra);
  $('#app').innerHTML = `<div class="login"><div class="card">
    <img src="/favicon.svg" alt="">
    <h1>ADrenaline CRM</h1>
    <p class="mute">Вход для команды через Telegram</p>
    <div class="tg" id="tg-login">${b.bot_username ? '' : '<span class="mute small">Бот для входа не настроен (TG_BOT_USERNAME)</span>'}</div>
    <div id="login-msg">${extra}</div>
    ${b.dev ? `<hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><p class="small mute">Режим разработки</p>
      <form id="devform" class="grid" style="gap:8px"><input type="text" name="tg_id" placeholder="Telegram ID" value="111000111"><input type="text" name="name" placeholder="Имя" value="Даниил"><button class="btn primary">Войти (dev)</button></form>` : ''}
  </div></div>`;
  if (b.bot_username) {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.dataset.telegramLogin = b.bot_username;
    s.dataset.size = 'large';
    s.dataset.radius = '10';
    s.dataset.onauth = 'onTelegramAuth(user)';
    s.dataset.requestAccess = 'write';
    $('#tg-login').appendChild(s);
  }
  const dev = $('#devform');
  if (dev) dev.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('POST', '/auth/dev', { tg_id: dev.tg_id.value, name: dev.name.value });
    state.me = r.user;
    await afterLogin();
  });
}

// Внутри Telegram виджет входа не нужен: вход по данным, которые передаёт Telegram
function renderTgLogin(extra = '') {
  $('#app').innerHTML = `<div class="login"><div class="card">
    <img src="/favicon.svg" alt="">
    <h1>ADrenaline CRM</h1>
    <div id="login-msg">${extra || '<p class="mute">Входим через Telegram…</p>'}</div>
    <button class="btn primary" id="tg-retry" style="margin-top:12px">Войти ещё раз</button>
  </div></div>`;
  $('#tg-retry').addEventListener('click', () => tgSignIn());
}

function tgDenied(d) {
  if (d && d.code === 'not_invited') {
    return `<p>Доступа пока нет. Отправьте Даниилу ваш Telegram ID:</p><p><code>${esc(d.tg_id)}</code></p>`;
  }
  return `<p class="overdue">${esc((d && d.error) || 'Не получилось войти')}</p>`;
}

async function tgSignIn() {
  renderTgLogin();
  try {
    const r = await tgLogin();
    if (r.user) { state.me = r.user; await afterLogin(); return; }
    renderTgLogin(tgDenied(r.error));
  } catch (e) {
    renderTgLogin(tgDenied({ error: e.message }));
  }
}

window.onTelegramAuth = async (user) => {
  try {
    const r = await fetch('/api/auth/telegram', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
    const d = await r.json();
    if (r.ok && d.user) { state.me = d.user; await afterLogin(); return; }
    if (d.code === 'not_invited') {
      $('#login-msg').innerHTML = `<p>Доступа пока нет. Отправьте Даниилу ваш Telegram ID:</p><p><code>${esc(d.tg_id)}</code></p>`;
    } else {
      $('#login-msg').innerHTML = `<p class="overdue">${esc(d.error || 'Не получилось войти')}</p>`;
    }
  } catch (e) {
    $('#login-msg').innerHTML = `<p class="overdue">${esc(e.message)}</p>`;
  }
};

async function afterLogin() {
  await loadRefs();
  render();
}

// ---------- сводка ----------
async function viewDashboard() {
  const [d, m] = await Promise.all([api('GET', '/dashboard'), api('GET', '/money/summary')]);
  state.newDeals = d.new_deals.length;
  const pipeline = OPEN_STAGES.map((s) => {
    const rows = d.pipeline.filter((p) => p.stage === s);
    return { s, n: rows.reduce((a, r) => a + r.n, 0) };
  });
  const t = today();
  return `
  <div class="head"><h1>Привет, ${esc(state.me.name.split(' ')[0])}</h1>
    <div class="actions"><button class="btn" data-act="new-task">+ Задача</button><button class="btn primary" data-act="new-deal">+ Сделка</button></div></div>
  <div class="grid g4">
    <div class="stat"><div class="l">Абонплата в месяц</div><div class="v">${usd(m.mrr.total)}</div><div class="s">реклама ${usd(m.mrr.ads)} · AI ${usd(m.mrr.ai)}</div></div>
    <div class="stat"><div class="l">Получено в этом месяце</div><div class="v">${usd(m.received.total)}</div><div class="s">${m.month}</div></div>
    <div class="stat"><div class="l">Ждём оплату</div><div class="v">${usd(m.outstanding)}</div><div class="s ${m.overdue ? 'overdue' : ''}">просрочено ${usd(m.overdue)}</div></div>
    <div class="stat"><div class="l">Сделки в работе</div><div class="v">${pipeline.reduce((a, p) => a + p.n, 0)}</div><div class="s">${pipeline.map((p) => `${L.stage[p.s]} ${p.n}`).join(' · ')}</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div>
      <div class="card"><h2>Мои задачи на неделю <a class="small" href="#/tasks">все задачи →</a></h2>
        ${d.my_tasks.length ? `<ul class="list">${d.my_tasks.map(taskRow).join('')}</ul>` : '<div class="empty">На неделю задач нет</div>'}
        ${d.team_overdue ? `<p class="small overdue" style="margin:10px 0 0">У команды просрочено задач: ${d.team_overdue}</p>` : ''}
      </div>
      <div class="card"><h2>Новые заявки <a class="small" href="#/deals">воронка →</a></h2>
        ${d.new_deals.length ? `<ul class="list">${d.new_deals.map((x) => `<li><div class="grow"><a href="#/deals/${x.id}"><b>${esc(x.title)}</b></a>
          <div class="small mute">${[x.service && L.service[x.service], x.source && L.source[x.source], x.phone || x.telegram].filter(Boolean).map(esc).join(' · ')}</div></div>
          <span class="small mute">${fmtTime(x.created_at)}</span></li>`).join('')}</ul>` : '<div class="empty">Новых заявок нет</div>'}
      </div>
    </div>
    <div>
      <div class="card"><h2>Напомнить клиенту</h2>
        ${d.follow_ups.length ? `<ul class="list">${d.follow_ups.map((x) => `<li><div class="grow"><a href="#/deals/${x.id}"><b>${esc(x.title)}</b></a>
          <div class="small">${esc(x.next_step || 'Следующий шаг')} <span class="mute">· ${esc(x.owner_name || '')}</span></div></div>
          <span class="badge ${x.next_step_at < t ? 'red' : 'amber'}">${fmtDay(x.next_step_at)}</span></li>`).join('')}</ul>` : '<div class="empty">Все шаги по сделкам в будущем</div>'}
      </div>
      <div class="card"><h2>Оплаты на неделю <a class="small" href="#/money">деньги →</a></h2>
        ${d.invoices_due.length ? `<ul class="list">${d.invoices_due.map((i) => `<li><div class="grow"><a href="#/clients/${i.client_id}"><b>${esc(i.client_name)}</b></a>
          <div class="small mute">${esc(i.note || '')}</div></div><b class="num">${money(i.amount_minor, i.currency)}</b>${dueBadge(i.due_at)}</li>`).join('')}</ul>` : '<div class="empty">Оплат на этой неделе нет</div>'}
      </div>
      <div class="card"><h2>Последние события</h2>
        ${d.recent.length ? `<ul class="feed">${d.recent.map((a) => `<li class="${a.kind === 'agent' ? 'agent' : ''}"><div class="who">${fmtTime(a.created_at)} · ${esc(a.user_name || 'система')} ·
          ${a.client_id ? `<a href="#/clients/${a.client_id}">${esc(a.client_name)}</a>` : a.deal_id ? `<a href="#/deals/${a.deal_id}">${esc(a.deal_title)}</a>` : ''}</div>
          <div class="txt">${esc(a.text.length > 220 ? a.text.slice(0, 220) + '…' : a.text)}</div></li>`).join('')}</ul>` : '<div class="empty">Пока пусто</div>'}
      </div>
    </div>
  </div>`;
}

function taskRow(t) {
  const done = t.status === 'done';
  const ctx = t.client_name ? `<a href="#/clients/${t.client_id}">${esc(t.client_name)}</a>` : t.deal_title ? `<a href="#/deals/${t.deal_id}">${esc(t.deal_title)}</a>` : '';
  return `<li class="${done ? 'task-done' : ''}">
    <button class="task-check ${done ? 'done' : ''}" data-act="toggle-task" data-id="${t.id}" data-status="${t.status}" aria-label="${done ? 'Вернуть в работу' : 'Отметить сделанной'}">${done ? '✓' : ''}</button>
    <div class="grow"><button class="link t-title" data-act="edit-task" data-id="${t.id}" style="text-align:left;color:inherit">${esc(t.title)}</button>
      <div class="small mute">${[ctx, t.assignee_name && esc(t.assignee_name), t.status === 'doing' ? '<span class="badge blue">в работе</span>' : '', t.priority === 1 ? '<span class="badge red">важно</span>' : ''].filter(Boolean).join(' · ')}</div></div>
    ${dueBadge(t.due, done)}</li>`;
}

// ---------- воронка ----------
async function viewDeals() {
  const q = state.dealQuery || '';
  const showClosed = state.dealClosed || '';
  const d = await api('GET', `/deals?stage=${showClosed || 'open'}${q ? '&q=' + encodeURIComponent(q) : ''}`);
  state.dealsCache = d.deals;
  state.newDeals = d.deals.filter((x) => x.stage === 'new').length;
  const card = (x) => `<div class="deal" draggable="true" data-deal="${x.id}">
    <div class="t">${esc(x.title)}</div>
    <div class="small mute">${esc([x.contact_name, x.phone || x.telegram].filter(Boolean).join(' · '))}</div>
    <div class="meta">${x.service ? `<span class="badge ${AI_SERVICES.includes(x.service) ? 'green' : 'blue'}">${L.service[x.service]}</span>` : ''}
      ${x.monthly_minor ? `<span class="badge">${money(x.monthly_minor, x.currency)}/мес</span>` : ''}
      ${x.next_step_at ? `<span class="badge ${x.next_step_at < today() ? 'red' : x.next_step_at === today() ? 'amber' : ''}">${fmtDay(x.next_step_at)}</span>` : ''}
      ${x.open_tasks ? `<span class="small mute">задач ${x.open_tasks}</span>` : ''}</div></div>`;
  const toolbar = `<div class="toolbar"><input type="search" class="search" id="dq" placeholder="Поиск: имя, телефон, ниша" value="${esc(q)}">
    <div class="seg">${[['', 'В работе'], ['won', 'Выигранные'], ['lost', 'Отказы']].map(([k, l]) => `<button data-act="deal-filter" data-v="${k}" class="${showClosed === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
  if (showClosed) {
    return `<div class="head"><h1>Воронка</h1><div class="actions"><button class="btn primary" data-act="new-deal">+ Сделка</button></div></div>${toolbar}
      <div class="card table-wrap"><table><thead><tr><th>Сделка</th><th>Услуга</th><th class="hide-m">Источник</th><th>${showClosed === 'lost' ? 'Причина' : 'Клиент'}</th><th>Закрыта</th></tr></thead><tbody>
      ${d.deals.map((x) => `<tr class="click" data-href="#/deals/${x.id}"><td><b>${esc(x.title)}</b></td><td>${esc(L.service[x.service] || '—')}</td><td class="hide-m">${esc(L.source[x.source] || '—')}</td>
        <td>${showClosed === 'lost' ? esc(x.lost_reason || '—') : x.client_id ? `<a href="#/clients/${x.client_id}">${esc(x.client_name)}</a>` : '—'}</td><td>${fmtDay(x.closed_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Пусто</td></tr>'}
      </tbody></table></div>`;
  }
  return `<div class="head"><h1>Воронка</h1><div class="actions"><button class="btn primary" data-act="new-deal">+ Сделка</button></div></div>${toolbar}
    <div class="board">${OPEN_STAGES.map((s) => {
      const items = d.deals.filter((x) => x.stage === s);
      const sum = items.reduce((a, x) => a + (x.currency === 'USD' ? x.monthly_minor : 0), 0);
      return `<div class="col" data-stage="${s}"><div class="col-h"><h3>${L.stage[s]} <span class="mute">${items.length}</span></h3><span class="small mute">${sum ? money(sum) + '/мес' : ''}</span></div>${items.map(card).join('') || '<div class="empty small">Перетащите сюда сделку</div>'}</div>`;
    }).join('')}</div>
    <p class="small mute">Перетаскивайте карточки между этапами. «Оплата» и «Отказ» — в карточке сделки.</p>`;
}
viewDeals.mount = (root) => {
  const inp = $('#dq', root);
  if (inp) {
    let t;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.dealQuery = inp.value.trim(); refresh().then(() => { const i = $('#dq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 300); });
  }
  root.querySelectorAll('.deal').forEach((el) => {
    el.addEventListener('click', () => { location.hash = `#/deals/${el.dataset.deal}`; });
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.deal); e.dataTransfer.effectAllowed = 'move'; });
  });
  root.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      const deal = (state.dealsCache || []).find((x) => String(x.id) === id);
      if (!deal || deal.stage === col.dataset.stage) return;
      try { await api('PATCH', `/deals/${id}`, { stage: col.dataset.stage }); toast(`→ ${L.stage[col.dataset.stage]}`); refresh(); } catch (err) { toast(err.message); }
    });
  });
};

function newDeal() {
  openForm({
    title: 'Новая сделка',
    fields: dealFields().filter((f) => f.name !== 'lost_reason'),
    values: { stage: 'new', currency: 'USD', owner_id: state.me.id, next_step_at: today() },
    submit: 'Создать',
    onSubmit: async (d) => {
      const r = await api('POST', '/deals', d);
      toast('Сделка создана');
      location.hash = `#/deals/${r.id}`;
    },
  });
}

async function viewDeal({ id }) {
  const { deal: x, activities, tasks } = await api('GET', `/deals/${id}`);
  state.deal = x;
  let details = {};
  try { details = JSON.parse(x.details || '{}'); } catch { /* пусто */ }
  const detailNames = { service_text: 'Что интересует', budget: 'Бюджет', pain: 'Проблема', term: 'Срок', calc: 'Калькулятор', utm_source: 'utm_source', utm_medium: 'utm_medium', utm_campaign: 'Кампания', utm_term: 'Ключ', gclid: 'gclid', landing: 'Страница входа', referrer: 'Откуда' };
  const closed = x.stage === 'won' || x.stage === 'lost';
  return `
  <div class="head"><div><a class="small" href="#/deals">← Воронка</a><h1>${esc(x.title)}</h1>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${L.stageColor[x.stage]}">${L.stage[x.stage]}</span>${x.service ? `<span class="badge">${L.service[x.service]}</span>` : ''}${x.source ? `<span class="badge">${L.source[x.source]}</span>` : ''}</div></div>
    <div class="actions">
      ${closed ? '' : `<select id="stage-sel" aria-label="Этап" style="width:auto">${OPEN_STAGES.map((s) => `<option value="${s}" ${s === x.stage ? 'selected' : ''}>${L.stage[s]}</option>`).join('')}</select>
      <button class="btn" data-act="deal-lost">Отказ</button><button class="btn primary" data-act="deal-win">Оплатили ✓</button>`}
      ${x.stage === 'lost' ? '<button class="btn" data-act="deal-reopen">Вернуть в работу</button>' : ''}
      ${x.stage === 'won' && !x.client_id ? '<button class="btn primary" data-act="deal-win" title="Сделка оплачена, но клиент и услуга не созданы">Создать клиента ✓</button>' : ''}
      ${x.client_id ? `<a class="btn" href="#/clients/${x.client_id}">Карточка клиента →</a>` : ''}
      <button class="btn" data-act="deal-edit">Изменить</button>
      ${state.me.role === 'owner' ? '<button class="btn danger" data-act="deal-del">Удалить</button>' : ''}
    </div></div>
  <div class="detail">
    <div>
      <div class="card"><h2>Заметки и история</h2>
        <div class="note-box"><textarea id="note-text" placeholder="Итог звонка, договорённости…" rows="3"></textarea>
          <div class="row"><button class="btn sm" data-act="add-note" data-kind="call" data-target="deal">Записать звонок</button><button class="btn sm primary" data-act="add-note" data-kind="note" data-target="deal">Добавить заметку</button></div></div>
        ${feed(activities)}
      </div>
    </div>
    <div>
      <div class="card"><h2>Следующий шаг</h2>
        ${x.next_step || x.next_step_at ? `<p style="margin:0"><b>${esc(x.next_step || 'Без описания')}</b></p><p class="mute small" style="margin:4px 0 0">${x.next_step_at ? fmtDay(x.next_step_at) : 'без даты'} · ${esc(x.owner_name || '')}</p>` : '<p class="empty">Не назначен</p>'}
        <p style="margin:10px 0 0"><button class="btn sm" data-act="deal-next">Назначить</button></p>
        ${x.stage === 'lost' ? `<p class="small" style="margin-top:12px"><b>Причина отказа:</b> ${esc(x.lost_reason || '—')}</p>` : ''}
      </div>
      <div class="card"><h2>Контакт</h2><dl class="kv">
        <dt>Имя</dt><dd>${esc(x.contact_name || '—')}</dd><dt>Телефон</dt><dd>${telLink(x.phone)}</dd><dt>Telegram</dt><dd>${tgLink(x.telegram)}</dd>
        <dt>Почта</dt><dd>${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '—'}</dd><dt>Сайт</dt><dd>${webLink(x.website)}</dd><dt>Ниша</dt><dd>${esc(x.niche || '—')}</dd>
      </dl></div>
      <div class="card"><h2>Деньги</h2><dl class="kv">
        <dt>Запуск</dt><dd class="num">${money(x.setup_minor, x.currency)}</dd><dt>Абонплата</dt><dd class="num">${money(x.monthly_minor, x.currency)}/мес</dd>
        <dt>Направление</dt><dd>${L.dir[x.direction]}</dd><dt>Партнёр</dt><dd>${esc(x.partner_name || '—')}</dd><dt>Ответственный</dt><dd>${esc(x.owner_name || '—')}</dd>
      </dl></div>
      <div class="card"><h2>Задачи <button class="btn sm" data-act="new-task" data-deal="${x.id}">+ Задача</button></h2>
        ${tasks.length ? `<ul class="list">${tasks.map(taskRow).join('')}</ul>` : '<div class="empty">Задач нет</div>'}</div>
      ${Object.keys(details).length ? `<div class="card"><h2>Из заявки</h2><dl class="kv">${Object.entries(details).map(([k, v]) => `<dt>${esc(detailNames[k] || k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
    </div>
  </div>`;
}
viewDeal.mount = (root, r) => {
  const sel = $('#stage-sel', root);
  if (sel) sel.addEventListener('change', async () => {
    try { await api('PATCH', `/deals/${r.id}`, { stage: sel.value }); toast(`Этап: ${L.stage[sel.value]}`); refresh(); } catch (e) { toast(e.message); }
  });
};

function feed(items) {
  if (!items.length) return '<div class="empty">Событий пока нет</div>';
  const kind = { call: '📞 ', stage: '➜ ', agent: '🤖 ' };
  return `<ul class="feed">${items.map((a) => `<li class="${a.kind === 'agent' ? 'agent' : ''}"><div class="who">${fmtTime(a.created_at)} · ${esc(a.user_name || 'система')}</div><div class="txt">${kind[a.kind] || ''}${esc(a.text)}</div></li>`).join('')}</ul>`;
}

// ---------- клиенты ----------
async function viewClients() {
  const status = state.clientStatus || 'active';
  const q = state.clientQuery || '';
  const d = await api('GET', `/clients?status=${status}${q ? '&q=' + encodeURIComponent(q) : ''}`);
  const mrr = (c) => {
    const by = {};
    for (const s of c.services) by[s.currency] = (by[s.currency] || 0) + s.monthly_minor;
    return Object.entries(by).map(([cur, v]) => money(v, cur)).join(' + ') || '—';
  };
  return `<div class="head"><h1>Клиенты</h1><div class="actions"><button class="btn primary" data-act="new-client">+ Клиент</button></div></div>
  <div class="toolbar"><input type="search" class="search" id="cq" placeholder="Поиск по названию, нише" value="${esc(q)}">
    <div class="seg">${[['active', 'Активные'], ['paused', 'Пауза'], ['churned', 'Ушли'], ['all', 'Все']].map(([k, l]) => `<button data-act="client-filter" data-v="${k}" class="${status === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="card table-wrap"><table><thead><tr><th>Клиент</th><th>Услуги</th><th class="r">Абонплата</th><th class="r hide-m">Долг</th><th class="hide-m">Задачи</th><th class="hide-m">Ответственный</th></tr></thead><tbody>
  ${d.clients.map((c) => `<tr class="click" data-href="#/clients/${c.id}"><td><b>${esc(c.name)}</b><div class="small mute">${esc([c.niche, c.city].filter(Boolean).join(', '))}</div></td>
    <td>${c.services.map((s) => `<span class="badge ${s.direction === 'ai' ? 'green' : 'blue'}">${L.service[s.service]}</span>`).join(' ') || '<span class="mute">—</span>'}</td>
    <td class="r num">${mrr(c)}</td><td class="r num hide-m ${c.debts.length ? 'overdue' : ''}">${c.debts.map((x) => money(x.sum, x.currency)).join(' + ') || '—'}</td>
    <td class="hide-m">${c.open_tasks || '—'}</td><td class="hide-m">${esc(c.owner_name || '—')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Клиентов нет</td></tr>'}
  </tbody></table></div>`;
}
viewClients.mount = (root) => {
  const inp = $('#cq', root);
  let t;
  inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.clientQuery = inp.value.trim(); refresh().then(() => { const i = $('#cq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 300); });
};

async function viewClient({ id }) {
  const d = await api('GET', `/clients/${id}`);
  state.client = d;
  const c = d.client;
  const openTasks = d.tasks.filter((t) => t.status !== 'done');
  return `
  <div class="head"><div><a class="small" href="#/clients">← Клиенты</a><h1>${esc(c.name)}</h1>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${c.status === 'active' ? 'green' : c.status === 'paused' ? 'amber' : 'red'}">${L.clientStatus[c.status]}</span>${c.niche ? `<span class="badge">${esc(c.niche)}</span>` : ''}${c.source ? `<span class="badge">${L.source[c.source]}</span>` : ''}</div></div>
    <div class="actions"><button class="btn" data-act="client-edit">Изменить</button><button class="btn" data-act="new-invoice">+ Счёт</button><button class="btn primary" data-act="new-task" data-client="${c.id}">+ Задача</button></div></div>
  <div class="detail">
    <div>
      <div class="card"><h2>Услуги <button class="btn sm" data-act="new-service">+ Услуга</button></h2>
        <div class="table-wrap"><table><thead><tr><th>Услуга</th><th class="r">Абонплата</th><th class="r hide-m">Запуск</th><th class="hide-m">Бюджет / кабинет</th><th>Статус</th></tr></thead><tbody>
        ${d.services.map((s) => `<tr class="click" data-act="edit-service" data-id="${s.id}"><td><b>${L.service[s.service]}</b> <span class="badge ${s.direction === 'ai' ? 'green' : 'blue'}">${L.dir[s.direction]}</span>
          <div class="small mute">${s.start_date ? 'с ' + fmtDay(s.start_date) : ''}${s.partner_name ? ' · партнёр ' + esc(s.partner_name) : ''}</div></td>
          <td class="r num">${money(s.monthly_minor, s.currency)}</td><td class="r num hide-m">${s.setup_minor ? money(s.setup_minor, s.currency) : '—'}</td>
          <td class="hide-m small">${s.ad_budget_minor != null ? money(s.ad_budget_minor, s.ad_budget_currency || 'UAH') + '/мес' : '—'}${s.ad_account ? `<div class="mute">${esc(s.ad_account)}</div>` : ''}</td>
          <td><span class="badge ${s.status === 'active' ? 'green' : ''}">${L.serviceStatus[s.status]}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Услуг нет — добавьте, чтобы считались абонплата и счета</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><h2>Счета</h2>
        <div class="table-wrap"><table><thead><tr><th>Счёт</th><th class="r">Сумма</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>
        ${d.invoices.map((i) => invoiceRow(i, false)).join('') || '<tr><td colspan="5" class="empty">Счетов нет</td></tr>'}
        </tbody></table></div></div>
      <div class="card"><h2>Заметки и история</h2>
        <div class="note-box"><textarea id="note-text" placeholder="Что обсудили, что поменяли в кабинете…" rows="3"></textarea>
          <div class="row"><button class="btn sm" data-act="add-note" data-kind="call" data-target="client">Записать звонок</button><button class="btn sm primary" data-act="add-note" data-kind="note" data-target="client">Добавить заметку</button></div></div>
        ${feed(d.activities)}
      </div>
    </div>
    <div>
      <div class="card"><h2>Задачи <span class="mute small">${openTasks.length} открыто</span></h2>
        ${d.tasks.length ? `<ul class="list">${d.tasks.slice(0, 15).map(taskRow).join('')}</ul>` : '<div class="empty">Задач нет</div>'}</div>
      <div class="card"><h2>Контакты</h2><dl class="kv">
        <dt>Контакт</dt><dd>${esc(c.contact_name || '—')}</dd><dt>Телефон</dt><dd>${telLink(c.phone)}</dd><dt>Telegram</dt><dd>${tgLink(c.telegram)}</dd>
        <dt>Почта</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd><dt>Сайт</dt><dd>${webLink(c.website)}</dd>
        <dt>Город</dt><dd>${esc(c.city || '—')}</dd><dt>Ответственный</dt><dd>${esc(c.owner_name || '—')}</dd>
      </dl>${c.notes ? `<p class="small" style="white-space:pre-wrap;margin:12px 0 0">${esc(c.notes)}</p>` : ''}</div>
      ${d.deals.length ? `<div class="card"><h2>Сделки</h2><ul class="list">${d.deals.map((x) => `<li><div class="grow"><a href="#/deals/${x.id}">${esc(x.title)}</a></div><span class="badge ${L.stageColor[x.stage]}">${L.stage[x.stage]}</span></li>`).join('')}</ul></div>` : ''}
    </div>
  </div>`;
}

function invoiceRow(i, withClient) {
  const overdue = i.status === 'issued' && i.due_at && i.due_at < today();
  const cls = { paid: 'green', issued: overdue ? 'red' : 'amber', draft: '', void: '' }[i.status];
  return `<tr><td>${withClient ? `<a href="#/clients/${i.client_id}"><b>${esc(i.client_name)}</b></a><br>` : ''}<span class="small">${L.invKind[i.kind]}${i.period ? ' · ' + i.period : ''}${i.note ? ' · ' + esc(i.note) : ''}</span>
      <span class="badge ${i.direction === 'ai' ? 'green' : 'blue'}" style="margin-left:4px">${L.dir[i.direction]}</span></td>
    <td class="r num"><b>${money(i.amount_minor, i.currency)}</b></td>
    <td class="small">${i.status === 'paid' ? 'оплачен ' + fmtDay(i.paid_at) : fmtDay(i.due_at)}</td>
    <td><span class="badge ${cls}">${overdue ? 'Просрочен' : L.invStatus[i.status]}</span></td>
    <td class="r">${i.status === 'issued' || i.status === 'draft' ? `<button class="btn sm" data-act="inv-paid" data-id="${i.id}">Оплачен</button>` : ''}
      ${i.status !== 'void' && i.status !== 'paid' ? `<button class="link small" data-act="inv-void" data-id="${i.id}">аннулировать</button>` : ''}
      ${i.status === 'paid' ? `<button class="link small" data-act="inv-unpay" data-id="${i.id}">отменить оплату</button>` : ''}</td></tr>`;
}

// ---------- задачи ----------
async function viewTasks() {
  const who = state.taskWho || 'me';
  const status = state.taskStatus || 'open';
  const d = await api('GET', `/tasks?assignee=${who === 'me' ? state.me.id : who}&status=${status}`);
  const t = today();
  const week = addDays(7);
  const groups = status === 'done'
    ? [['Сделано', d.tasks]]
    : [
      ['Просрочено', d.tasks.filter((x) => x.due && x.due < t)],
      ['Сегодня', d.tasks.filter((x) => x.due === t)],
      ['На неделе', d.tasks.filter((x) => x.due && x.due > t && x.due <= week)],
      ['Позже', d.tasks.filter((x) => x.due && x.due > week)],
      ['Без срока', d.tasks.filter((x) => !x.due)],
    ];
  const people = [['me', 'Мои'], ['all', 'Все'], ...state.users.filter((u) => u.active && u.id !== state.me.id).map((u) => [String(u.id), u.name.split(' ')[0]]), ['none', 'Без исполнителя']];
  return `<div class="head"><h1>Задачи</h1><div class="actions"><button class="btn primary" data-act="new-task">+ Задача</button></div></div>
  <div class="toolbar"><div class="seg">${people.map(([k, l]) => `<button data-act="task-who" data-v="${k}" class="${who === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
    <div class="seg">${[['open', 'Открытые'], ['done', 'Сделанные']].map(([k, l]) => `<button data-act="task-status" data-v="${k}" class="${status === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  ${groups.filter(([, items]) => items.length).map(([name, items]) => `<div class="card"><h2>${name} <span class="mute small">${items.length}</span></h2><ul class="list">${items.map(taskRow).join('')}</ul></div>`).join('') || '<div class="card"><div class="empty">Задач нет</div></div>'}`;
}

// ---------- деньги ----------
async function viewMoney() {
  const month = state.moneyMonth || today().slice(0, 7);
  const invStatus = state.invStatus || 'unpaid';
  const [s, inv, com] = await Promise.all([
    api('GET', `/money/summary?month=${month}`),
    api('GET', `/invoices?status=${invStatus}${invStatus === 'all' ? '&month=' + month : ''}`),
    api('GET', '/commissions?status=due'),
  ]);
  const max = Math.max(1, ...s.history.map((h) => h.ads + h.ai));
  return `<div class="head"><h1>Деньги</h1><div class="actions"><input type="month" id="mmonth" value="${month}" style="width:auto">
    <button class="btn" data-act="gen-invoices" data-month="${month}">Выставить абонплату за ${month}</button></div></div>
  <div class="grid g4">
    <div class="stat"><div class="l">Абонплата (MRR)</div><div class="v">${usd(s.mrr.total)}</div><div class="s">реклама ${usd(s.mrr.ads)} (${s.mrr.clients_ads}) · AI ${usd(s.mrr.ai)} (${s.mrr.clients_ai})</div></div>
    <div class="stat"><div class="l">Получено за ${month}</div><div class="v">${usd(s.received.total)}</div><div class="s">реклама ${usd(s.received.ads)} · AI ${usd(s.received.ai)}</div></div>
    <div class="stat"><div class="l">Ждём оплату</div><div class="v">${usd(s.outstanding)}</div><div class="s ${s.overdue ? 'overdue' : ''}">просрочено ${usd(s.overdue)}</div></div>
    <div class="stat"><div class="l">Партнёрам к выплате</div><div class="v">${usd(s.commissions.due_total)}</div><div class="s">начислено за месяц ${usd(s.commissions.ads + s.commissions.ai)}</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>AI-направление: деление за ${month}</h2>
      <p class="small mute" style="margin-top:0">Получено по AI ${usd(s.received.ai)} − партнёрам ${usd(s.commissions.ai)} = <b>${usd(s.ai_split.net)}</b>, поровну между участниками</p>
      ${s.ai_split.members.length ? `<ul class="list">${s.ai_split.members.map((m) => `<li><div class="grow">${esc(m.name)}</div><b class="num">${usd(m.amount)}</b></li>`).join('')}</ul>` : '<div class="empty">Отметьте участников AI в «Команде»</div>'}
      <p class="small mute">Суммы в долларах по курсу ${s.usd_uah} ₴ за $1</p></div>
    <div class="card"><h2>Поступления по месяцам</h2>
      ${s.history.length ? `<div class="bars">${s.history.map((h) => `<div class="b" title="${h.month}: реклама $${h.ads}, AI $${h.ai}"><span class="ai" style="height:${(h.ai / max) * 120}px"></span><span class="ads" style="height:${(h.ads / max) * 120}px"></span><div class="lbl">${h.month.slice(5)}</div></div>`).join('')}</div>
        <div class="legend"><span><i style="background:var(--accent)"></i>Реклама</span><span><i style="background:var(--ok)"></i>AI</span></div>` : '<div class="empty">Оплат ещё не было</div>'}</div>
  </div>
  <div class="card" style="margin-top:14px"><h2>Счета <div class="seg">${[['unpaid', 'Ждём оплату'], ['paid', 'Оплаченные'], ['all', `Все за ${month}`]].map(([k, l]) => `<button data-act="inv-filter" data-v="${k}" class="${invStatus === k ? 'on' : ''}">${l}</button>`).join('')}</div></h2>
    <div class="table-wrap"><table><thead><tr><th>Клиент</th><th class="r">Сумма</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>
    ${inv.invoices.map((i) => invoiceRow(i, true)).join('') || '<tr><td colspan="5" class="empty">Счетов нет</td></tr>'}</tbody></table></div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>Комиссии партнёрам к выплате</h2>
      ${com.commissions.length ? `<ul class="list">${com.commissions.map((c) => `<li><div class="grow"><b>${esc(c.partner_name)}</b><div class="small mute">${esc(c.client_name)} · ${L.invKind[c.kind]}${c.period ? ' ' + c.period : ''} · ${c.rate}% от ${money(c.amount_minor, c.currency)}</div></div>
        <b class="num">${money(c.commission_minor, c.currency)}</b><button class="btn sm" data-act="pay-com" data-id="${c.invoice_id}">Выплачено</button></li>`).join('')}</ul>` : '<div class="empty">Долгов перед партнёрами нет</div>'}</div>
    <div class="card"><h2>Партнёры <button class="btn sm" data-act="new-partner">+ Партнёр</button></h2>
      ${state.partners.length ? `<ul class="list">${state.partners.map((p) => `<li><div class="grow"><button class="link" data-act="edit-partner" data-id="${p.id}">${esc(p.name)}</button><div class="small mute">${esc([p.contact, p.terms].filter(Boolean).join(' · '))}</div></div></li>`).join('')}</ul>` : '<div class="empty">Партнёров пока нет</div>'}</div>
  </div>`;
}
viewMoney.mount = (root) => {
  $('#mmonth', root).addEventListener('change', (e) => { state.moneyMonth = e.target.value || today().slice(0, 7); refresh(); });
};

// ---------- команда ----------
async function viewTeam() {
  const [u, st] = await Promise.all([api('GET', '/users'), api('GET', '/settings')]);
  state.users = u.users;
  const owner = state.me.role === 'owner';
  const origin = location.origin;
  return `<div class="head"><h1>Команда</h1>${owner ? '<div class="actions"><button class="btn primary" data-act="new-user">+ Человек</button></div>' : ''}</div>
  <div class="card table-wrap"><table><thead><tr><th>Имя</th><th>Telegram</th><th>Роль</th><th>Доля AI</th><th>Доступ</th></tr></thead><tbody>
  ${u.users.map((x) => `<tr class="${owner ? 'click' : ''}" ${owner ? `data-act="edit-user" data-id="${x.id}"` : ''}><td><b>${esc(x.name)}</b></td><td>${x.tg_username ? '@' + esc(x.tg_username) : ''} <span class="small mute">${x.tg_id ?? ''}</span></td>
    <td>${L.role[x.role]}</td><td>${x.ai_share ? '<span class="badge green">да</span>' : '—'}</td><td>${x.active ? '<span class="badge green">есть</span>' : '<span class="badge red">отключён</span>'}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h2>Курс для сводки</h2>
      <p class="small mute" style="margin-top:0">Суммы в гривнах переводятся в доллары по этому курсу</p>
      <div style="display:flex;gap:8px"><input type="text" inputmode="decimal" id="rate" value="${esc(st.settings.usd_uah || '')}" ${owner ? '' : 'disabled'} style="max-width:140px">${owner ? '<button class="btn" data-act="save-rate">Сохранить</button>' : ''}</div></div>
    <div class="card"><h2>Как добавить человека</h2>
      <ol class="small" style="margin:0;padding-left:18px"><li>Человек открывает CRM и жмёт «Войти через Telegram».</li><li>Видит свой Telegram ID и присылает его владельцу.</li><li>Владелец добавляет его здесь — можно входить.</li></ol>
      <p class="small mute">Чтобы получать задачи в личку, нужно один раз нажать Start у бота входа.</p></div>
  </div>
  <div class="card" style="margin-top:14px"><h2>Интеграции</h2>
    <dl class="kv small">
      <dt>Заявки с сайта</dt><dd><code>POST ${esc(origin)}/api/intake</code>, заголовок <code>X-Intake-Key</code></dd>
      <dt>AI-агент</dt><dd><code>GET ${esc(origin)}/api/agent/summary</code>, заголовок <code>Authorization: Bearer AGENT_API_KEY</code>. Ещё: клиенты, задачи, заметки — см. README.</dd>
    </dl></div>`;
}

// ---------- обработчики действий ----------
const actions = {
  logout: async () => {
    await api('POST', '/auth/logout');
    session.set(null);
    state.me = null;
    if (TG) { try { TG.close(); return; } catch { /* закрыть не вышло — покажем вход */ } }
    render();
  },
  'new-deal': () => newDeal(),
  'new-task': (el) => taskForm({ ...(el.dataset.client ? { client_id: Number(el.dataset.client) } : {}), ...(el.dataset.deal ? { deal_id: Number(el.dataset.deal) } : {}) }, refresh),
  'edit-task': async (el) => {
    const { task } = await api('GET', `/tasks/${el.dataset.id}`);
    taskForm(task, refresh);
  },
  'toggle-task': async (el) => {
    const next = el.dataset.status === 'done' ? 'todo' : 'done';
    await api('PATCH', `/tasks/${el.dataset.id}`, { status: next });
    toast(next === 'done' ? 'Готово ✓' : 'Вернул в работу');
    refresh();
  },
  'deal-filter': (el) => { state.dealClosed = el.dataset.v; refresh(); },
  'deal-edit': () => openForm({
    title: 'Сделка', fields: dealFields(), values: dealValues(state.deal),
    onSubmit: async (d) => { await api('PATCH', `/deals/${state.deal.id}`, d); toast('Сохранено'); refresh(); },
  }),
  'deal-next': () => openForm({
    title: 'Следующий шаг',
    fields: [{ name: 'next_step', label: 'Что сделать', required: true, wide: true }, { name: 'next_step_at', label: 'Когда', type: 'date' }, { name: 'owner_id', label: 'Кто', type: 'select', options: userOpts() }],
    values: { next_step: state.deal.next_step, next_step_at: state.deal.next_step_at || addDays(1), owner_id: state.deal.owner_id || state.me.id },
    onSubmit: async (d) => { await api('PATCH', `/deals/${state.deal.id}`, d); toast('Шаг назначен'); refresh(); },
  }),
  'deal-lost': () => openForm({
    title: 'Отказ', submit: 'Закрыть сделку',
    fields: [{ name: 'lost_reason', label: 'Причина', type: 'select', required: true, wide: true, options: [['', '—'], ...['Дорого', 'Нет бюджета', 'Выбрали другого', 'Не наш клиент', 'Пропал / не отвечает', 'Сделают сами', 'Другое'].map((x) => [x, x])] }, { name: 'comment', label: 'Комментарий', wide: true }],
    onSubmit: async (d) => {
      await api('PATCH', `/deals/${state.deal.id}`, { stage: 'lost', lost_reason: d.comment ? `${d.lost_reason}: ${d.comment}` : d.lost_reason });
      toast('Сделка закрыта');
      refresh();
    },
  }),
  'deal-reopen': async () => { await api('PATCH', `/deals/${state.deal.id}`, { stage: 'contacted' }); refresh(); },
  'deal-win': async () => {
    const x = state.deal;
    const clients = await clientOptions();
    openForm({
      title: 'Клиент оплатил', submit: 'Создать клиента и услугу',
      fields: [
        { name: 'client_id', label: 'Клиент', type: 'select', wide: true, options: [['', '+ Новый клиент'], ...clients.map((c) => [c.id, c.name])] },
        { name: 'client_name', label: 'Название нового клиента', wide: true },
        { name: 'service', label: 'Услуга', type: 'select', options: opts(L.service) },
        { name: 'currency', label: 'Валюта', type: 'select', options: [['USD', 'USD'], ['UAH', 'UAH']] },
        { name: 'setup', label: 'Запуск (будет счёт)', type: 'money' },
        { name: 'monthly', label: 'Абонплата в месяц', type: 'money' },
        { name: 'start_date', label: 'Начало работы', type: 'date' },
      ],
      values: { client_id: x.client_id || '', client_name: x.title.split(' — ')[0], service: x.service || 'google_ads', currency: x.currency, setup: x.setup_minor ? x.setup_minor / 100 : '', monthly: x.monthly_minor ? x.monthly_minor / 100 : '', start_date: today() },
      onSubmit: async (d) => {
        const r = await api('POST', `/deals/${x.id}/win`, d);
        toast('Есть оплата! Клиент создан');
        location.hash = `#/clients/${r.client_id}`;
      },
    });
  },
  'deal-del': () => confirmModal('Удалить сделку вместе с историей?', async () => { await api('DELETE', `/deals/${state.deal.id}`); toast('Удалено'); location.hash = '#/deals'; }),
  'add-note': async (el) => {
    const ta = $('#note-text');
    const text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    const path = el.dataset.target === 'deal' ? `/deals/${state.deal.id}/notes` : `/clients/${state.client.client.id}/notes`;
    await api('POST', path, { text, kind: el.dataset.kind });
    toast('Записано');
    refresh();
  },
  'new-client': () => openForm({
    title: 'Новый клиент', fields: clientFields(), values: { status: 'active', owner_id: state.me.id }, submit: 'Создать',
    onSubmit: async (d) => { const r = await api('POST', '/clients', d); location.hash = `#/clients/${r.id}`; },
  }),
  'client-filter': (el) => { state.clientStatus = el.dataset.v; refresh(); },
  'client-edit': () => {
    const id = state.client.client.id;
    openForm({
      title: 'Клиент', fields: clientFields(), values: state.client.client,
      extraFooter: state.me.role === 'owner' ? '<button class="btn danger" type="button" id="cdel">Удалить</button>' : '',
      onSubmit: async (d) => { await api('PATCH', `/clients/${id}`, d); toast('Сохранено'); refresh(); },
    });
    bindDelete('#cdel', 'Удалить клиента с услугами и историей? Если есть счета, удалить не получится — переведите клиента в «Ушёл».', `/clients/${id}`, '#/clients');
  },
  'new-service': () => openForm({
    title: 'Новая услуга', fields: serviceFields(), values: { status: 'active', currency: 'USD', billing_day: Number(today().slice(8, 10)) > 28 ? 28 : Number(today().slice(8, 10)), start_date: today(), partner_months: 12, partner_setup_pct: 0, partner_monthly_pct: 0 },
    onSubmit: async (d) => { await api('POST', `/clients/${state.client.client.id}/services`, d); toast('Услуга добавлена'); refresh(); },
  }),
  'edit-service': (el) => {
    const s = state.client.services.find((x) => x.id === Number(el.dataset.id));
    openForm({
      title: L.service[s.service], fields: serviceFields(), values: serviceValues(s),
      extraFooter: state.me.role === 'owner' ? '<button class="btn danger" type="button" id="sdel">Удалить</button>' : '',
      onSubmit: async (d) => { await api('PATCH', `/services/${s.id}`, d); toast('Сохранено'); refresh(); },
    });
    bindDelete('#sdel', 'Удалить услугу? Если по ней есть счета, поставьте статус «Завершена».', `/services/${s.id}`);
  },
  'new-invoice': () => invoiceForm(state.client.client, state.client.services, refresh),
  'inv-paid': async (el) => { await api('PATCH', `/invoices/${el.dataset.id}`, { status: 'paid' }); toast('Оплата отмечена'); refresh(); },
  'inv-unpay': async (el) => { await api('PATCH', `/invoices/${el.dataset.id}`, { status: 'issued' }); refresh(); },
  'inv-void': (el) => confirmModal('Аннулировать счёт?', async () => { await api('PATCH', `/invoices/${el.dataset.id}`, { status: 'void' }); refresh(); }, 'Аннулировать'),
  'inv-filter': (el) => { state.invStatus = el.dataset.v; refresh(); },
  'gen-invoices': (el) => confirmModal(`Выставить счета на абонплату за ${el.dataset.month} всем активным клиентам? Уже выставленные не продублируются.`, async () => {
    const r = await api('POST', '/invoices/generate', { period: el.dataset.month });
    toast(`Создано счетов: ${r.created}`);
    refresh();
  }, 'Выставить'),
  'pay-com': async (el) => { await api('POST', '/commissions/pay', { invoice_id: Number(el.dataset.id) }); toast('Выплата отмечена'); refresh(); },
  'new-partner': () => openForm({
    title: 'Партнёр',
    fields: [{ name: 'name', label: 'Имя / компания', required: true, wide: true }, { name: 'contact', label: 'Контакт', wide: true }, { name: 'terms', label: 'Условия', type: 'textarea', wide: true, placeholder: '20% запуска + 10% абонплаты 12 мес' }],
    onSubmit: async (d) => { await api('POST', '/partners', d); await loadRefs(); toast('Партнёр добавлен'); refresh(); },
  }),
  'edit-partner': (el) => {
    const p = state.partners.find((x) => x.id === Number(el.dataset.id));
    openForm({
      title: 'Партнёр', values: p,
      fields: [{ name: 'name', label: 'Имя / компания', required: true, wide: true }, { name: 'contact', label: 'Контакт', wide: true }, { name: 'terms', label: 'Условия', type: 'textarea', wide: true }],
      onSubmit: async (d) => { await api('PATCH', `/partners/${p.id}`, d); await loadRefs(); toast('Сохранено'); refresh(); },
    });
  },
  'new-user': () => openForm({
    title: 'Добавить человека',
    fields: [{ name: 'name', label: 'Имя', required: true }, { name: 'tg_id', label: 'Telegram ID', required: true, type: 'number', hint: 'Человек увидит его на экране входа' },
      { name: 'role', label: 'Роль', type: 'select', options: opts(L.role) }, { name: 'ai_share', label: 'Получает долю AI-направления', type: 'checkbox', wide: true }],
    values: { role: 'member', ai_share: true },
    onSubmit: async (d) => { await api('POST', '/users', d); await loadRefs(); toast('Добавлен'); refresh(); },
  }),
  'edit-user': (el) => {
    const u = state.users.find((x) => x.id === Number(el.dataset.id));
    openForm({
      title: u.name, values: u,
      fields: [{ name: 'name', label: 'Имя', required: true, wide: true }, { name: 'role', label: 'Роль', type: 'select', options: opts(L.role) },
        { name: 'ai_share', label: 'Доля AI-направления', type: 'checkbox' }, { name: 'active', label: 'Доступ открыт', type: 'checkbox' }],
      onSubmit: async (d) => { await api('PATCH', `/users/${u.id}`, d); await loadRefs(); toast('Сохранено'); refresh(); },
    });
  },
  'save-rate': async () => { await api('PATCH', '/settings', { usd_uah: $('#rate').value }); toast('Курс сохранён'); },
  'task-who': (el) => { state.taskWho = el.dataset.v; refresh(); },
  'task-status': (el) => { state.taskStatus = el.dataset.v; refresh(); },
};

function bindDelete(sel, text, path, go) {
  const b = $(sel);
  if (!b) return;
  b.addEventListener('click', () => confirmModal(text, async () => {
    await api('DELETE', path);
    toast('Удалено');
    if (go) location.hash = go; else refresh();
  }));
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) {
    e.preventDefault();
    e.stopPropagation();
    try { await actions[el.dataset.act](el); } catch (err) { toast(err.message); }
    return;
  }
  const row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a,button')) location.hash = row.dataset.href;
});

window.addEventListener('hashchange', () => { closeModal(); render(); });

// ---------- старт ----------
(async () => {
  setupTelegram();
  try {
    const r = await api('GET', '/auth/me');
    state.boot = r;
    state.me = r.user;
    if (state.me) await loadRefs();
  } catch (e) {
    state.boot = {};
  }
  if (!state.me && TG) return tgSignIn();
  render();
})();
