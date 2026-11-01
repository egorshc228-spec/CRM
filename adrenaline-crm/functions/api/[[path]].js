// Единая точка входа API: /api/*
// Доступ: public — без входа; user — человек из команды; agent: true — также AI-агент по ключу; intake — по ключу сайта.
import { json, readJson, HttpError } from '../../lib/http.js';
import { currentUser } from '../../lib/auth.js';
import * as auth from '../../lib/routes/auth.js';
import * as deals from '../../lib/routes/deals.js';
import * as clients from '../../lib/routes/clients.js';
import * as tasks from '../../lib/routes/tasks.js';
import * as money from '../../lib/routes/money.js';
import * as team from '../../lib/routes/team.js';
import { dashboard } from '../../lib/routes/dashboard.js';
import { intake } from '../../lib/routes/intake.js';
import { agentSummary } from '../../lib/routes/agent.js';

const R = (method, path, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d+)')) + '$');
  return { method, re, keys, handler, access: opts.access || 'user', agent: !!opts.agent };
};

const routes = [
  R('GET', '/auth/me', auth.me, { access: 'optional' }),
  R('POST', '/auth/telegram', auth.telegramLogin, { access: 'public' }),
  R('POST', '/auth/webapp', auth.webappLogin, { access: 'public' }),
  R('POST', '/auth/logout', auth.logout, { access: 'public' }),
  R('POST', '/auth/dev', auth.devLogin, { access: 'public' }),
  R('POST', '/intake', intake, { access: 'public' }), // ключ проверяется внутри

  R('GET', '/dashboard', dashboard),

  R('GET', '/deals', deals.listDeals, { agent: true }),
  R('POST', '/deals', deals.createDeal),
  R('GET', '/deals/:id', deals.getDeal, { agent: true }),
  R('PATCH', '/deals/:id', deals.updateDeal),
  R('DELETE', '/deals/:id', deals.deleteDeal),
  R('POST', '/deals/:id/win', deals.winDeal),
  R('POST', '/deals/:id/notes', deals.addDealNote),

  R('GET', '/clients', clients.listClients, { agent: true }),
  R('POST', '/clients', clients.createClient),
  R('GET', '/clients/:id', clients.getClient, { agent: true }),
  R('PATCH', '/clients/:id', clients.updateClient),
  R('DELETE', '/clients/:id', clients.deleteClient),
  R('POST', '/clients/:id/notes', clients.addClientNote, { agent: true }),
  R('POST', '/clients/:id/services', clients.createService),
  R('PATCH', '/services/:id', clients.updateService),
  R('DELETE', '/services/:id', clients.deleteService),

  R('GET', '/tasks', tasks.listTasks, { agent: true }),
  R('POST', '/tasks', tasks.createTask, { agent: true }),
  R('GET', '/tasks/:id', tasks.getTask, { agent: true }),
  R('PATCH', '/tasks/:id', tasks.updateTask, { agent: true }),
  R('DELETE', '/tasks/:id', tasks.deleteTask),

  R('GET', '/invoices', money.listInvoices),
  R('POST', '/invoices', money.createInvoice),
  R('PATCH', '/invoices/:id', money.updateInvoice),
  R('DELETE', '/invoices/:id', money.deleteInvoice),
  R('POST', '/invoices/generate', money.generateMonthly),
  R('GET', '/money/summary', money.moneySummary),
  R('GET', '/partners', money.listPartners),
  R('POST', '/partners', money.createPartner),
  R('PATCH', '/partners/:id', money.updatePartner),
  R('GET', '/commissions', money.listCommissions),
  R('POST', '/commissions/pay', money.payCommission),

  R('GET', '/users', team.listUsers, { agent: true }),
  R('POST', '/users', team.createUser),
  R('PATCH', '/users/:id', team.updateUser),
  R('GET', '/settings', team.getSettings),
  R('PATCH', '/settings', team.updateSettings),

  R('GET', '/agent/summary', agentSummary, { agent: true }),
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';

  try {
    if (!env.DB) throw new HttpError(500, 'no_db', 'D1 не подключена (binding DB)');
    let route = null;
    let params = {};
    let pathMatched = false;
    for (const r of routes) {
      const m = path.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== request.method) continue;
      route = r;
      params = Object.fromEntries(r.keys.map((k, i) => [k, Number(m[i + 1])]));
      break;
    }
    if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found');

    // CSRF: изменяющие запросы из браузера — только со своего сайта
    if (request.method !== 'GET' && !request.headers.get('Authorization') && route.access !== 'public') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin');
    }

    let user = null;
    if (route.access !== 'public') {
      user = await currentUser(env, request);
      if (route.access === 'user') {
        if (!user) throw new HttpError(401, 'unauthorized');
        if (user.role === 'agent' && !route.agent) throw new HttpError(403, 'forbidden_for_agent');
      }
    }

    const body = await readJson(request);
    return await route.handler({ env, request, url, params, body, user, waitUntil: context.waitUntil.bind(context) });
  } catch (e) {
    if (e instanceof HttpError) return json({ ok: false, code: e.code, error: e.message }, e.status);
    console.error(e);
    return json({ ok: false, code: 'server_error', error: 'Ошибка сервера' }, 500);
  }
}
