// Авторизация: вход через Telegram Login Widget, сессия в подписанной cookie, ключи для агента и сайта.
import { HttpError } from './http.js';
import { first, insert } from './db.js';

const enc = new TextEncoder();
const COOKIE = 'crm_s';
const SESSION_DAYS = 30;

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// Сравнение строк за постоянное время
export function safeEqual(a, b) {
  a = String(a ?? '');
  b = String(b ?? '');
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, enc.encode(data));
}

// https://core.telegram.org/widgets/login#checking-authorization
export async function verifyTelegram(data, botToken, maxAgeSec = 86400) {
  if (!botToken) throw new HttpError(500, 'not_configured', 'TG_BOT_TOKEN не задан');
  const { hash, ...fields } = data || {};
  if (!hash || !fields.id || !fields.auth_date) return false;
  const check = Object.keys(fields)
    .filter((k) => fields[k] !== undefined && fields[k] !== null && fields[k] !== '')
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(botToken));
  const sig = hex(await hmac(secret, check));
  if (!safeEqual(sig, String(hash))) return false;
  const age = Math.floor(Date.now() / 1000) - Number(fields.auth_date);
  return age >= 0 && age <= maxAgeSec;
}

// Проверка данных Telegram Mini App (window.Telegram.WebApp.initData).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Возвращает { user, start_param } или null.
export async function verifyWebApp(initData, botToken, maxAgeSec = 86400) {
  if (!botToken) throw new HttpError(500, 'not_configured', 'TG_BOT_TOKEN не задан');
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');
  if (!hash || !params.get('auth_date') || !params.get('user')) return null;
  const pairs = [...params.entries()].filter(([k]) => k !== 'hash');
  const secret = new Uint8Array(await hmac(enc.encode('WebAppData'), botToken));
  const sign = async (list) =>
    hex(await hmac(secret, list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n')));
  // Поле signature (новые версии Telegram) проверяем в обоих вариантах: в строке проверки и без него.
  let ok = safeEqual(await sign([...pairs]), hash);
  if (!ok && params.has('signature')) ok = safeEqual(await sign(pairs.filter(([k]) => k !== 'signature')), hash);
  if (!ok) return null;
  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date'));
  if (!(age >= 0 && age <= maxAgeSec)) return null;
  let user;
  try { user = JSON.parse(params.get('user')); } catch { return null; }
  if (!user || !user.id) return null;
  return { user, start_param: params.get('start_param') || null };
}

export async function makeSession(env, userId) {
  if (!env.SESSION_SECRET) throw new HttpError(500, 'not_configured', 'SESSION_SECRET не задан');
  const payload = b64url(enc.encode(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = b64url(new Uint8Array(await hmac(enc.encode(env.SESSION_SECRET), payload)));
  return `${payload}.${sig}`;
}

export function sessionCookie(value, maxAgeSec = SESSION_DAYS * 86400) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

// Сессия: cookie в браузере или заголовок X-Session внутри Telegram
// (в веб-версии Telegram приложение открывается во фрейме, где cookie сторонних сайтов блокируются).
async function readSession(env, request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  const raw = request.headers.get('X-Session') || (m && m[1]);
  if (!raw || !env.SESSION_SECRET) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const expected = b64url(new Uint8Array(await hmac(enc.encode(env.SESSION_SECRET), payload)));
  if (!safeEqual(expected, sig)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.uid || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// Кто делает запрос: человек по cookie или агент по ключу. null — никто.
export async function currentUser(env, request) {
  const key = bearer(request);
  if (key) {
    if (!env.AGENT_API_KEY || !safeEqual(key, env.AGENT_API_KEY)) throw new HttpError(401, 'bad_api_key');
    return first(env, "SELECT * FROM users WHERE role = 'agent' AND active = 1 ORDER BY id LIMIT 1");
  }
  const s = await readSession(env, request);
  if (!s) return null;
  const u = await first(env, 'SELECT * FROM users WHERE id = ? AND active = 1', s.uid);
  return u && u.role !== 'agent' ? u : null;
}

// Найти или создать пользователя после проверки Telegram. Владельца создаём сами (OWNER_TG_ID).
export async function userFromTelegram(env, tg) {
  const tgId = Number(tg.id);
  let u = await first(env, 'SELECT * FROM users WHERE tg_id = ?', tgId);
  if (!u && env.OWNER_TG_ID && String(env.OWNER_TG_ID) === String(tgId)) {
    const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ') || tg.username || 'Владелец';
    const id = await insert(env, 'users', { tg_id: tgId, tg_username: tg.username || null, name, role: 'owner', ai_share: 1 });
    u = await first(env, 'SELECT * FROM users WHERE id = ?', id);
  }
  if (!u || !u.active) return null;
  if (tg.username && tg.username !== u.tg_username) {
    await env.DB.prepare('UPDATE users SET tg_username = ? WHERE id = ?').bind(tg.username, u.id).run();
  }
  return u;
}

export function publicUser(u) {
  return u && { id: u.id, name: u.name, role: u.role, tg_username: u.tg_username, ai_share: !!u.ai_share };
}
