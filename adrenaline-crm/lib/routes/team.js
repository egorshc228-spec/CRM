import { json, notFound, bad, forbidden, str, reqStr, int, oneOf, pick } from '../http.js';
import { all, first, insert, update, run } from '../db.js';
import { publicUser } from '../auth.js';

const owner = (user) => { if (user.role !== 'owner') throw forbidden(); };

// Список людей виден всем (для выбора исполнителя), управление — только владельцу
export async function listUsers({ env, user }) {
  const rows = await all(env, "SELECT * FROM users WHERE role != 'agent' ORDER BY active DESC, id");
  return json({
    users: rows.map((u) => ({ ...publicUser(u), active: !!u.active, tg_id: user.role === 'owner' ? u.tg_id : undefined })),
  });
}

export async function createUser({ env, body, user }) {
  owner(user);
  const tgId = int(body.tg_id);
  if (!tgId) throw bad('tg_id', 'Нужен Telegram ID (человек увидит его на экране входа)');
  if (await first(env, 'SELECT id FROM users WHERE tg_id = ?', tgId)) throw bad('exists', 'Этот Telegram ID уже добавлен');
  const id = await insert(env, 'users', {
    tg_id: tgId,
    name: reqStr(body.name, 'Имя', 80),
    role: oneOf(body.role, ['owner', 'member'], 'member'),
    ai_share: body.ai_share ? 1 : 0,
  });
  return json({ id }, 201);
}

export async function updateUser({ env, params, body, user }) {
  owner(user);
  const u = await first(env, "SELECT * FROM users WHERE id = ? AND role != 'agent'", params.id);
  if (!u) throw notFound();
  const f = pick(body, {
    name: (v) => reqStr(v, 'Имя', 80),
    role: (v) => oneOf(v, ['owner', 'member']),
    ai_share: (v) => (v ? 1 : 0),
    active: (v) => (v ? 1 : 0),
  });
  if (u.id === user.id && (f.role === 'member' || f.active === 0)) throw bad('self', 'Нельзя снять права с самого себя');
  await update(env, 'users', u.id, f, { touch: false });
  return json({ ok: true });
}

export async function getSettings({ env }) {
  const rows = await all(env, 'SELECT key, value FROM settings');
  return json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

export async function updateSettings({ env, body, user }) {
  owner(user);
  if ('usd_uah' in body) {
    const n = Number(String(body.usd_uah).replace(',', '.'));
    if (!(n > 1 && n < 1000)) throw bad('usd_uah', 'Курс от 1 до 1000');
    await run(env, "INSERT INTO settings (key, value) VALUES ('usd_uah', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(n));
  }
  return json({ ok: true });
}
