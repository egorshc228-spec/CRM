// Резервная копия базы раз в сутки — файлом в Telegram (обычно владельцу в личку).
// Включается переменной BACKUP_TG_CHAT_ID. Час отправки по Киеву — BACKUP_HOUR (по умолчанию 3).
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { localDay, TZ } from '../lib/db.js';

const hourInKyiv = () => Number(new Date().toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }));

function lastBackup(database) {
  const row = database.native.prepare("SELECT value FROM settings WHERE key = 'last_backup'").get();
  return row ? row.value : null;
}

function saveLastBackup(database, day) {
  database.native
    .prepare("INSERT INTO settings (key, value) VALUES ('last_backup', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(day);
}

export async function backupNow({ database, env, dataDir, log = console }) {
  const day = localDay();
  const tmp = join(dataDir, `backup-${day}.sqlite`);
  if (existsSync(tmp)) unlinkSync(tmp);
  // VACUUM INTO — целостный снимок базы, даже если в этот момент идут запросы
  database.native.prepare('VACUUM INTO ?').run(tmp);
  try {
    const file = readFileSync(tmp);
    const stats = ['clients', 'deals', 'invoices', 'tasks']
      .map((t) => `${t}: ${database.native.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n}`)
      .join(', ');
    const form = new FormData();
    form.append('chat_id', String(env.BACKUP_TG_CHAT_ID));
    form.append('caption', `Резервная копия CRM за ${day}\n${stats}`);
    form.append('document', new Blob([file]), `adrenaline-crm-${day}.sqlite`);
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
    if (!r.ok) throw new Error(`Telegram ответил ${r.status}: ${(await r.text()).slice(0, 200)}`);
    saveLastBackup(database, day);
    log.log(`Резервная копия за ${day} отправлена (${Math.round(file.length / 1024)} КБ)`);
    return true;
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
}

export function startBackups({ database, env, dataDir, log = console }) {
  if (!env.BACKUP_TG_CHAT_ID || !env.TG_BOT_TOKEN) {
    log.log('Резервные копии в Telegram выключены (BACKUP_TG_CHAT_ID не задан)');
    return null;
  }
  const hour = Number.isInteger(Number(env.BACKUP_HOUR)) && env.BACKUP_HOUR !== '' ? Number(env.BACKUP_HOUR) : 3;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    const last = lastBackup(database);
    // Раз в день после нужного часа; самая первая копия — сразу после запуска
    if (last === localDay() || (last && hourInKyiv() < hour)) return;
    busy = true;
    try {
      await backupNow({ database, env, dataDir, log });
    } catch (e) {
      log.error('Резервная копия не отправлена:', e.message);
    } finally {
      busy = false;
    }
  };
  log.log(`Резервные копии в Telegram: каждый день после ${hour}:00 по Киеву`);
  setTimeout(tick, 60_000).unref();
  return setInterval(tick, 10 * 60_000).unref();
}
