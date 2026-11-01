// Приём заявок с сайта (functions/api/lead.js сайта шлёт сюда копию) и из других источников.
import { json, HttpError, str } from '../http.js';
import { first, insert, logActivity } from '../db.js';
import { safeEqual } from '../auth.js';
import { notifyTeam, escHtml, crmLink } from '../telegram.js';
import { directionOf, SERVICE_NAMES } from '../const.js';

function guessService(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/голос|дзвін|звон|voice/.test(s)) return 'ai_voice';
  if (/crm|срм/.test(s)) return 'crm';
  if (/ai|аі|ші|бот|директ|direct|адміністр|администр/.test(s)) return 'ai_direct';
  if (/пакет|повний|полный|package|заявка → клієнт/.test(s)) return 'package';
  if (/seo|сео|карт|maps/.test(s)) return 'seo';
  if (/meta|facebook|instagram|таргет/.test(s)) return 'meta';
  if (/аналіт|аналит|analytics|облік/.test(s)) return 'analytics';
  if (/google|гугл|контекст|ads/.test(s)) return 'google_ads';
  return 'other';
}

// контакт из формы: телефон, @telegram или почта
function splitContact(contact) {
  const c = String(contact || '').trim();
  if (/^\S+@\S+\.\S+$/.test(c)) return { email: c.slice(0, 120) };
  if (/^@?[a-zA-Z][\w]{4,31}$/.test(c) || /t\.me\//i.test(c)) {
    return { telegram: '@' + c.replace(/^.*t\.me\//i, '').replace(/^@/, '').slice(0, 40) };
  }
  const digits = c.replace(/[^\d+]/g, '');
  return digits.length >= 9 ? { phone: digits.slice(0, 20) } : { telegram: c.slice(0, 80) };
}

export async function intake({ env, request, body }) {
  if (!env.INTAKE_KEY || !safeEqual(request.headers.get('X-Intake-Key'), env.INTAKE_KEY)) {
    throw new HttpError(401, 'bad_intake_key');
  }
  const name = str(body.name, 120);
  const contact = str(body.contact, 120);
  if (!name || !contact) throw new HttpError(400, 'missing_fields');

  const a = body.attribution || {};
  const paid = !!(a.gclid || /cpc|ppc|paid/i.test(a.utm_medium || ''));
  const source = str(body.source, 30) || (paid ? 'ads' : 'site');
  const service = guessService(body.service);
  const c = splitContact(contact);

  // дубль: тот же контакт за последние 24 часа в открытой сделке — дописываем, а не плодим
  const key = c.phone || c.telegram || c.email;
  const dup = await first(
    env,
    `SELECT id, client_id FROM deals WHERE (phone = ? OR telegram = ? OR email = ?) AND stage NOT IN ('won','lost')
      AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day') ORDER BY id DESC LIMIT 1`,
    key, key, key,
  );

  const details = {
    service_text: str(body.service, 200), budget: str(body.budget, 120), pain: str(body.pain, 1000),
    term: str(body.term, 60), calc: str(body.calc, 300), lang: str(body.lang, 5),
    utm_source: str(a.utm_source, 100), utm_medium: str(a.utm_medium, 100), utm_campaign: str(a.utm_campaign, 150),
    utm_term: str(a.utm_term, 150), gclid: str(a.gclid, 200), landing: str(a.landing, 300), referrer: str(a.referrer, 300),
  };
  for (const k of Object.keys(details)) if (details[k] == null) delete details[k];

  const summary = [
    details.service_text && `Интерес: ${details.service_text}`,
    details.budget && `Бюджет: ${details.budget}`,
    details.pain && `Проблема: ${details.pain}`,
    details.utm_term && `Ключ: ${details.utm_term}`,
    details.landing && `Страница: ${details.landing}`,
  ].filter(Boolean).join('\n');

  if (dup) {
    await logActivity(env, { deal_id: dup.id, client_id: dup.client_id, kind: 'system', text: `Повторная заявка с сайта\n${summary}` });
    return json({ ok: true, deal_id: dup.id, duplicate: true });
  }

  const id = await insert(env, 'deals', {
    title: [name, str(body.niche, 80)].filter(Boolean).join(' — '),
    stage: 'new', source, service, direction: directionOf(service), contact_name: name,
    website: str(body.site, 200), niche: str(body.niche, 120), details: JSON.stringify(details), ...c,
  });
  await logActivity(env, { deal_id: id, kind: 'system', text: `Заявка с сайта${summary ? '\n' + summary : ''}` });
  await notifyTeam(env, [
    `🔥 <b>Новая заявка в CRM</b>: ${crmLink(env, `/deals/${id}`, name)}`,
    service ? `Услуга: ${escHtml(SERVICE_NAMES[service])}` : null,
    `Контакт: ${escHtml(contact)}`,
    `Источник: ${source === 'ads' ? 'реклама' : 'сайт'}`,
  ].filter(Boolean).join('\n'));
  return json({ ok: true, deal_id: id }, 201);
}
