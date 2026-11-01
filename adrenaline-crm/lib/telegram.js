// Уведомления в Telegram. Ошибки не роняют запрос: CRM работает и без бота.

export const escHtml = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function sendTelegram(env, chatId, html) {
  if (!env.TG_BOT_TOKEN || !chatId) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: html.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// В общий чат команды (TG_NOTIFY_CHAT_ID)
export const notifyTeam = (env, html) => sendTelegram(env, env.TG_NOTIFY_CHAT_ID, html);

// Ссылка на объект в CRM для сообщения
// Если задан TG_APP_SHORTNAME — ссылка открывает мини-приложение сразу на нужной карточке
// (t.me/<бот>/<приложение>?startapp=deals_12), иначе — сайт CRM.
export function crmLink(env, path, label) {
  const bot = String(env.TG_BOT_USERNAME || '').replace(/^@/, '');
  const app = env.TG_APP_SHORTNAME;
  if (bot && app) {
    const start = path.replace(/^\//, '').replace(/\//g, '_') || 'home';
    return `<a href="https://t.me/${bot}/${app}?startapp=${encodeURIComponent(start)}">${escHtml(label)}</a>`;
  }
  const base = (env.CRM_URL || '').replace(/\/$/, '');
  return base ? `<a href="${base}/#${path}">${escHtml(label)}</a>` : escHtml(label);
}
