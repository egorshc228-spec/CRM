// База для Railway: обычный SQLite-файл на Volume с тем же интерфейсом, что у Cloudflare D1
// (prepare → bind → all / first / run). Код CRM в lib/ работает с ним без изменений.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// D1 сам превращает true/false в 1/0 и не принимает undefined; здесь — так же предсказуемо
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  // WAL — чтение не блокирует запись; foreign_keys — как в D1 (там они включены всегда)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args.map(norm));
    }
    async all() {
      const rows = db.prepare(this.sql).all(...this.args).map((r) => ({ ...r }));
      return { success: true, results: rows, meta: {} };
    }
    async first(column) {
      const row = db.prepare(this.sql).get(...this.args);
      if (!row) return null;
      return column ? row[column] ?? null : { ...row };
    }
    async run() {
      const r = db.prepare(this.sql).run(...this.args);
      return { success: true, meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } };
    }
  }

  return {
    prepare: (sql) => new Statement(sql),
    exec: (sql) => db.exec(sql),
    native: db,
    close: () => db.close(),
  };
}

// Применяет новые файлы из migrations/ по порядку, каждый — один раз и целиком (в транзакции).
export function migrate(database, dir) {
  const db = database.native;
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(dir, name), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(name, new Date().toISOString());
      db.exec('COMMIT');
      applied.push(name);
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`Миграция ${name} не применилась: ${e.message}`);
    }
  }
  return applied;
}
