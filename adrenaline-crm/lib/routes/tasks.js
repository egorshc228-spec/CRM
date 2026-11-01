import { json, notFound, str, reqStr, int, oneOf, day, pick } from '../http.js';
import { all, first, insert, update, run, nowIso, logActivity } from '../db.js';
import { sendTelegram, escHtml, crmLink } from '../telegram.js';

const TASK_FIELDS = {
  title: (v) => reqStr(v, 'Задача', 300),
  note: (v) => str(v, 4000),
  status: (v) => oneOf(v, ['todo', 'doing', 'done'], 'todo'),
  priority: (v) => { const n = int(v); return n >= 1 && n <= 3 ? n : 2; },
  assignee_id: int,
  client_id: int,
  deal_id: int,
  area: (v) => str(v, 60),
  due: day,
};

export async function listTasks({ env, url, user }) {
  const who = url.searchParams.get('assignee') || 'all';
  const status = url.searchParams.get('status') || 'open';
  const where = [];
  const binds = [];
  if (who === 'me') where.push('t.assignee_id = ?'), binds.push(user.id);
  else if (who === 'none') where.push('t.assignee_id IS NULL');
  else if (who !== 'all') where.push('t.assignee_id = ?'), binds.push(int(who));
  if (status === 'open') where.push("t.status != 'done'");
  else if (status !== 'all') where.push('t.status = ?'), binds.push(oneOf(status, ['todo', 'doing', 'done']));
  const clientId = int(url.searchParams.get('client_id'));
  if (clientId) where.push('t.client_id = ?'), binds.push(clientId);
  const tasks = await all(
    env,
    `SELECT t.*, u.name AS assignee_name, c.name AS client_name, d.title AS deal_title
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN deals d ON d.id = t.deal_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY t.status = 'done', t.due IS NULL, t.due, t.priority, t.id
      LIMIT 1000`,
    ...binds,
  );
  return json({ tasks });
}

export async function getTask({ env, params }) {
  const task = await first(env, 'SELECT * FROM tasks WHERE id = ?', params.id);
  if (!task) throw notFound();
  return json({ task });
}

async function notifyAssignee(env, task, by) {
  if (!task.assignee_id || task.assignee_id === by.id) return;
  const a = await first(env, 'SELECT tg_id FROM users WHERE id = ? AND active = 1', task.assignee_id);
  if (!a || !a.tg_id) return;
  const due = task.due ? `\nСрок: ${task.due.split('-').reverse().join('.')}` : '';
  await sendTelegram(env, a.tg_id, `📌 <b>Новая задача от ${escHtml(by.name)}</b>\n${crmLink(env, '/tasks', task.title)}${due}`);
}

export async function createTask({ env, body, user }) {
  const f = pick(body, TASK_FIELDS);
  if (!f.title) f.title = reqStr(body.title, 'Задача', 300);
  if (f.deal_id && !f.client_id) {
    const d = await first(env, 'SELECT client_id FROM deals WHERE id = ?', f.deal_id);
    if (d && d.client_id) f.client_id = d.client_id;
  }
  if (f.status === 'done') f.done_at = nowIso();
  const id = await insert(env, 'tasks', { created_by: user.id, ...f });
  if (f.client_id || f.deal_id) {
    await logActivity(env, { client_id: f.client_id || null, deal_id: f.deal_id || null, user_id: user.id, kind: user.role === 'agent' ? 'agent' : 'system', text: `Задача: ${f.title}` });
  }
  if (!body.silent) await notifyAssignee(env, { ...f, id }, user);
  return json({ id }, 201);
}

export async function updateTask({ env, params, body, user }) {
  const t = await first(env, 'SELECT * FROM tasks WHERE id = ?', params.id);
  if (!t) throw notFound();
  const f = pick(body, TASK_FIELDS);
  if (f.status && f.status !== t.status) f.done_at = f.status === 'done' ? nowIso() : null;
  await update(env, 'tasks', t.id, f);
  if (f.assignee_id && f.assignee_id !== t.assignee_id) await notifyAssignee(env, { ...t, ...f }, user);
  if (f.status === 'done' && t.status !== 'done' && (t.client_id || t.deal_id)) {
    await logActivity(env, { client_id: t.client_id, deal_id: t.deal_id, user_id: user.id, kind: 'system', text: `Сделано: ${t.title}` });
  }
  return json({ ok: true });
}

export async function deleteTask({ env, params }) {
  await run(env, 'DELETE FROM tasks WHERE id = ?', params.id);
  return json({ ok: true });
}
