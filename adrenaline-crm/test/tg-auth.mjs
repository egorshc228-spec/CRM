// Проверка подписей Telegram тем же алгоритмом, что у Telegram:
// 1) кнопка «Войти через Telegram» (Login Widget), 2) мини-приложение (initData).
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegram, verifyWebApp } from '../lib/auth.js';

const token = '123456:TEST';
let failed = 0;
const check = (name, cond) => { console.log(cond ? '  ok  ' : '  FAIL', name); if (!cond) failed++; };
const now = Math.floor(Date.now() / 1000);

// --- Login Widget ---
const data = { id: 42, first_name: 'Даниил', username: 'daniil', auth_date: now };
const dcs = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
const hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(dcs).digest('hex');
check('виджет: верная подпись', await verifyTelegram({ ...data, hash }, token));
check('виджет: подменённое имя', !(await verifyTelegram({ ...data, first_name: 'Хакер', hash }, token)));
check('виджет: вход старше суток', !(await verifyTelegram({ ...data, auth_date: now - 200000, hash }, token)));

// --- Mini App initData ---
function initData(fields, { tok = token, skipInHash = [] } = {}) {
  const dcs = Object.keys(fields).filter((k) => !skipInHash.includes(k)).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(tok).digest();
  const h = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash: h }).toString();
}
const user = JSON.stringify({ id: 42, first_name: 'Даниил', username: 'daniil' });
const base = { query_id: 'AAE1', user, auth_date: String(now), start_param: 'deals_12' };

let r = await verifyWebApp(initData(base), token);
check('мини-приложение: верная подпись', r && r.user.id === 42 && r.start_param === 'deals_12');
r = await verifyWebApp(initData({ ...base, signature: 'abc' }), token);
check('мини-приложение: с полем signature в подписи', r && r.user.id === 42);
r = await verifyWebApp(initData({ ...base, signature: 'abc' }, { skipInHash: ['signature'] }), token);
check('мини-приложение: signature вне подписи', r && r.user.id === 42);
const forged = initData(base).replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
check('мини-приложение: подменённый пользователь', !(await verifyWebApp(forged, token)));
check('мини-приложение: чужой бот', !(await verifyWebApp(initData(base, { tok: '999:OTHER' }), token)));
check('мини-приложение: старше суток', !(await verifyWebApp(initData({ ...base, auth_date: String(now - 200000) }), token)));
check('мини-приложение: пусто', !(await verifyWebApp('', token)));

process.exit(failed ? 1 : 0);
