// Тонкая обёртка над D1.

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
// Рабочий часовой пояс команды. «Сегодня», сроки и даты оплат считаются по Киеву, а не по Гринвичу.
export const TZ = 'Europe/Kiev';
export const localDay = (ms = Date.now()) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });
export const today = () => localDay();
export const addDays = (n) => {
  const [y, m, d] = today().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export async function all(env, sql, ...binds) {
  const r = await env.DB.prepare(sql).bind(...binds).all();
  return r.results || [];
}

export async function first(env, sql, ...binds) {
  return (await env.DB.prepare(sql).bind(...binds).first()) || null;
}

export async function run(env, sql, ...binds) {
  return env.DB.prepare(sql).bind(...binds).run();
}

// INSERT из объекта; возвращает id.
export async function insert(env, table, obj) {
  const keys = Object.keys(obj);
  const sql = `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
  const r = await run(env, sql, ...keys.map((k) => obj[k]));
  return r.meta.last_row_id;
}

// UPDATE по id из объекта (только переданные поля). updated_at проставляется, если есть в таблице.
export async function update(env, table, id, obj, { touch = true } = {}) {
  const data = { ...obj };
  if (touch) data.updated_at = nowIso();
  const keys = Object.keys(data);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  await run(env, sql, ...keys.map((k) => data[k]), id);
}

export async function logActivity(env, { client_id = null, deal_id = null, user_id = null, kind = 'system', text }) {
  if (!text) return null;
  return insert(env, 'activities', { client_id, deal_id, user_id, kind, text: String(text).slice(0, 4000) });
}

export async function getSetting(env, key, fallback = null) {
  const row = await first(env, 'SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}
