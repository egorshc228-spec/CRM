import { json, HttpError, bad, str, int } from '../http.js';
import { verifyTelegram, verifyWebApp, makeSession, sessionCookie, userFromTelegram, publicUser } from '../auth.js';
import { first, insert } from '../db.js';

export async function me({ env, user }) {
  return json({
    user: publicUser(user),
    bot_username: env.TG_BOT_USERNAME || null,
    app_short_name: env.TG_APP_SHORTNAME || null,
    dev: env.DEV_MODE === '1',
  });
}

export async function telegramLogin({ env, body }) {
  const ok = await verifyTelegram(body, env.TG_BOT_TOKEN);
  if (!ok) throw new HttpError(401, 'bad_signature', 'Не удалось проверить вход через Telegram');
  const u = await userFromTelegram(env, body);
  if (!u) {
    // Нет доступа — показываем tg id, чтобы владелец добавил человека в «Команду»
    return json({ ok: false, code: 'not_invited', tg_id: Number(body.id) }, 403);
  }
  const token = await makeSession(env, u.id);
  return json({ ok: true, user: publicUser(u) }, 200, { 'Set-Cookie': sessionCookie(token) });
}

// Вход из Telegram Mini App: Telegram сам передаёт, кто открыл приложение.
// Сессия возвращается и в cookie, и в ответе — клиент шлёт её в заголовке X-Session.
export async function webappLogin({ env, body }) {
  const r = await verifyWebApp(body.initData, env.TG_BOT_TOKEN);
  if (!r) throw new HttpError(401, 'bad_signature', 'Не удалось проверить вход из Telegram. Закройте и откройте приложение заново');
  const u = await userFromTelegram(env, {
    id: r.user.id, first_name: r.user.first_name, last_name: r.user.last_name, username: r.user.username,
  });
  if (!u) return json({ ok: false, code: 'not_invited', tg_id: Number(r.user.id) }, 403);
  const token = await makeSession(env, u.id);
  return json({ ok: true, user: publicUser(u), session: token, start_param: r.start_param }, 200, { 'Set-Cookie': sessionCookie(token) });
}

export async function logout() {
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

// Только для локальной разработки (DEV_MODE=1): вход без Telegram.
export async function devLogin({ env, body }) {
  if (env.DEV_MODE !== '1') throw new HttpError(404, 'not_found');
  const tgId = int(body.tg_id);
  if (!tgId) throw bad('required', 'tg_id');
  let u = await first(env, 'SELECT * FROM users WHERE tg_id = ?', tgId);
  if (!u) {
    const owners = await first(env, "SELECT COUNT(*) AS n FROM users WHERE role = 'owner'");
    const id = await insert(env, 'users', {
      tg_id: tgId, name: str(body.name, 80) || 'Dev', role: owners.n ? 'member' : 'owner', ai_share: 1,
    });
    u = await first(env, 'SELECT * FROM users WHERE id = ?', id);
  }
  const token = await makeSession(env, u.id);
  return json({ ok: true, user: publicUser(u) }, 200, { 'Set-Cookie': sessionCookie(token) });
}
