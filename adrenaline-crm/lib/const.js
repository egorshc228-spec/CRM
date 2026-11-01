// Справочники CRM. Подписи для интерфейса — в public/app.js (LABELS).

export const STAGES = ['new', 'contacted', 'call', 'proposal', 'won', 'lost'];
export const OPEN_STAGES = ['new', 'contacted', 'call', 'proposal'];

export const SERVICES = ['google_ads', 'meta', 'seo', 'analytics', 'ai_direct', 'ai_voice', 'ai_other', 'crm', 'package', 'other'];
export const AI_SERVICES = ['ai_direct', 'ai_voice', 'ai_other', 'crm'];
export const directionOf = (service) => (AI_SERVICES.includes(service) ? 'ai' : 'ads');

export const SOURCES = ['site', 'ads', 'telegram', 'bm', 'referral', 'outreach', 'agency', 'partner', 'other'];
export const CURRENCIES = ['USD', 'UAH'];
export const DIRECTIONS = ['ads', 'ai'];

export const SERVICE_NAMES = {
  google_ads: 'Google Ads', meta: 'Meta Ads', seo: 'SEO', analytics: 'Аналитика',
  ai_direct: 'AI-директ', ai_voice: 'Голосовой AI', ai_other: 'AI-решение', crm: 'CRM',
  package: 'Пакет', other: 'Другое',
};

export const STAGE_NAMES = {
  new: 'Новая', contacted: 'На связи', call: 'Разбор', proposal: 'КП', won: 'Оплата', lost: 'Отказ',
};
