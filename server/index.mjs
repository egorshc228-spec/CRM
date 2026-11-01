// ADrenaline CRM для Railway: один Node.js-процесс отдаёт интерфейс (public/) и API (/api/*).
// API — тот же код, что на Cloudflare (functions/api/[[path]].js), база — SQLite-файл на Volume.
// Внешних зависимостей нет: нужен Node.js 22.13+ (встроенный node:sqlite).
import http from 'node:http';
import { mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequest } from '../functions/api/[[path]].js';
import { openDatabase, migrate } from './sqlite-d1.mjs';
import { startBackups } from './backup.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 8788;
const MAX_BODY = 1_000_000;

const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

// ---- база ----
mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = join(DATA_DIR, 'crm.sqlite');
const database = openDatabase(DB_FILE);
const applied = migrate(database, join(ROOT, 'migrations'));

// ---- настройки ----
const env = { ...process.env, DB: database };
if (env.DEV_MODE === '1' && onRailway) {
  // Вход без Telegram на боевом сервере — дыра. Выключаем, даже если переменная задана по ошибке.
  console.warn('⚠️  DEV_MODE=1 на Railway игнорируется: вход только через Telegram');
  env.DEV_MODE = '0';
}
const missing = ['TG_BOT_TOKEN', 'TG_BOT_USERNAME', 'OWNER_TG_ID', 'SESSION_SECRET'].filter((k) => !env[k]);

// Те же заголовки, что в public/_headers для Cloudflare
const SECURITY_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'self' https://web.telegram.org https://*.web.telegram.org",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Адрес, который видит браузер: за прокси Railway — https и публичный домен
function publicUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  return new URL(req.url, `${proto}://${host}`);
}

async function handleApi(req, res, url) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const body = hasBody ? await readBody(req) : undefined;
  const request = new Request(url, { method: req.method, headers, body: hasBody && body.length ? body : undefined });
  const response = await onRequest({
    request,
    env,
    waitUntil: (p) => Promise.resolve(p).catch((e) => console.error('waitUntil:', e)),
  });
  const out = { ...SECURITY_HEADERS };
  response.headers.forEach((value, key) => { if (key !== 'set-cookie') out[key] = value; });
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

function handleStatic(req, res, url) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, SECURITY_HEADERS).end();
    return;
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { rel = '/'; }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(PUBLIC, rel));
  const name = file.split(sep).pop();
  // Только файлы из public/, без служебных (_headers) и скрытых
  if (!file.startsWith(PUBLIC + sep) || name.startsWith('_') || name.startsWith('.')) {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено');
    return;
  }
  let data;
  try {
    if (!statSync(file).isFile()) throw new Error('not file');
    data = readFileSync(file);
  } catch {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Не найдено');
    return;
  }
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    // Обновления видны сразу после деплоя; картинки можно кешировать
    'Cache-Control': ['.svg', '.png', '.ico'].includes(extname(file)) ? 'public, max-age=86400' : 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : data);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = publicUrl(req);
    if (url.pathname === '/healthz') {
      database.native.prepare('SELECT 1').get();
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }).end('ok');
      return;
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return handleStatic(req, res, url);
  } catch (e) {
    if (e.status === 413) {
      res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' }).end('{"ok":false,"code":"too_large"}');
      return;
    }
    console.error('Ошибка запроса', req.method, url ? url.pathname : req.url, e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('{"ok":false,"code":"server_error","error":"Ошибка сервера"}');
  }
});

server.listen(PORT, () => {
  console.log(`ADrenaline CRM запущена: порт ${PORT}, база ${DB_FILE}`);
  console.log(applied.length ? `Применены миграции: ${applied.join(', ')}` : 'База актуальна, новых миграций нет');
  if (missing.length) console.warn(`⚠️  Не заданы переменные: ${missing.join(', ')} — вход через Telegram работать не будет`);
  if (onRailway && !process.env.DATA_DIR) {
    console.warn('⚠️  DATA_DIR не задан: база лежит внутри контейнера и пропадёт при следующем деплое. Подключите Volume и задайте DATA_DIR');
  }
  startBackups({ database, env, dataDir: DATA_DIR });
});

// Railway при деплое посылает SIGTERM: дописываем запросы и закрываем базу
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`${sig}: останавливаюсь`);
    server.close(() => {
      database.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
