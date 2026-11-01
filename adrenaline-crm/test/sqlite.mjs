// Проверка базы для Railway: SQLite с интерфейсом D1, миграции, внешние ключи.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, migrate } from '../server/sqlite-d1.mjs';

const dir = mkdtempSync(join(tmpdir(), 'crm-'));
const migrations = fileURLToPath(new URL('../migrations', import.meta.url));
let failed = 0;
const check = (name, cond, extra) => { console.log(cond ? '  ok  ' : '  FAIL', name, cond ? '' : JSON.stringify(extra ?? '')); if (!cond) failed++; };

try {
  let db = openDatabase(join(dir, 'crm.sqlite'));
  check('миграции применяются', migrate(db, migrations).includes('0001_init.sql'));
  check('повторно не применяются', migrate(db, migrations).length === 0);

  const env = { DB: db };
  const agent = await env.DB.prepare("SELECT * FROM users WHERE role = 'agent'").bind().first();
  check('служебный AI-агент создан', agent && agent.name === 'AI-агент', agent);
  check('курс по умолчанию', (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind('usd_uah').first('value')) === '41.5');

  const r = await env.DB.prepare('INSERT INTO clients (name, notes) VALUES (?, ?)').bind('Клиника', undefined).run();
  check('insert возвращает last_row_id', r.meta.last_row_id > 0 && r.meta.changes === 1, r.meta);
  const id = r.meta.last_row_id;
  await env.DB.prepare('INSERT INTO services (client_id, service, monthly_minor) VALUES (?, ?, ?)').bind(id, 'ai_direct', 16000).run();
  const all = await env.DB.prepare('SELECT * FROM services WHERE client_id = ?').bind(id).all();
  check('all возвращает results', all.results.length === 1 && all.results[0].monthly_minor === 16000, all);
  check('first без строк — null', (await env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(-1).first()) === null);
  await env.DB.prepare('UPDATE users SET ai_share = ? WHERE id = ?').bind(true, agent.id).run();
  check('true сохраняется как 1', (await env.DB.prepare('SELECT ai_share FROM users WHERE id = ?').bind(agent.id).first('ai_share')) === 1);

  let fkError = null;
  try { await env.DB.prepare('INSERT INTO services (client_id, service) VALUES (?, ?)').bind(999999, 'seo').run(); } catch (e) { fkError = e.message; }
  check('внешние ключи проверяются, как в D1', /FOREIGN KEY/i.test(fkError || ''), fkError);

  const svc = (await env.DB.prepare('SELECT id FROM services WHERE client_id = ?').bind(id).first()).id;
  const ins = () => env.DB.prepare("INSERT INTO invoices (client_id, service_id, kind, period, amount_minor) VALUES (?, ?, 'monthly', '2026-11', 16000)").bind(id, svc).run();
  await ins();
  let uniq = null;
  try { await ins(); } catch (e) { uniq = e.message; }
  check('двойная абонплата ловится по UNIQUE', /UNIQUE/.test(uniq || ''), uniq);

  db.close();
  db = openDatabase(join(dir, 'crm.sqlite'));
  check('данные сохраняются после перезапуска', (await db.prepare('SELECT COUNT(*) AS n FROM invoices').bind().first('n')) === 1);
  db.close();
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
