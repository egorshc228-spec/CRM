// HTTP-хелперы: JSON-ответы, ошибки, валидация входных данных.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const bad = (code, message) => new HttpError(400, code, message);
export const notFound = (what = 'not_found') => new HttpError(404, what);
export const forbidden = () => new HttpError(403, 'forbidden');

export async function readJson(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const text = await request.text();
  if (!text) return {};
  if (text.length > 200_000) throw new HttpError(413, 'too_large');
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    throw bad('bad_json');
  }
}

// ---- валидация полей ----

export function str(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export function reqStr(v, field, max = 500) {
  const s = str(v, max);
  if (!s) throw bad('required', `Поле «${field}» обязательно`);
  return s;
}

export function int(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function oneOf(v, allowed, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  if (!allowed.includes(v)) throw bad('invalid_value', `Недопустимое значение: ${v}`);
  return v;
}

export function day(v) {
  const s = str(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw bad('invalid_date', 'Дата в формате ГГГГ-ММ-ДД');
  return s;
}

// «1 250,50» / 1250.5 / "1250" → 125050 (в центах). Пусто → 0.
export function money(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1e9) throw bad('invalid_money', 'Неверная сумма');
  return Math.round(n * 100);
}

export function pct(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw bad('invalid_pct', 'Процент от 0 до 100');
  return n;
}

// Берёт из body только разрешённые поля, прогоняя их через функции-валидаторы.
// Возвращает объект только с теми ключами, что пришли (для PATCH).
export function pick(body, spec) {
  const out = {};
  for (const [key, fn] of Object.entries(spec)) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = fn(body[key]);
  }
  return out;
}
