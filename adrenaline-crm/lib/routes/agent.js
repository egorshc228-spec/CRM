// Сжатая сводка для рекламного AI-агента: клиенты, услуги, бюджеты, кабинеты, задачи, долги.
import { json } from '../http.js';
import { all } from '../db.js';
import { SERVICE_NAMES } from '../const.js';

export async function agentSummary({ env }) {
  const [clients, services, tasks, debts, notes] = await Promise.all([
    all(env, "SELECT id, name, niche, city, status, contact_name, telegram, website FROM clients WHERE status != 'churned' ORDER BY name"),
    all(env, "SELECT id, client_id, service, direction, status, currency, monthly_minor, ad_budget_minor, ad_budget_currency, ad_account, start_date FROM services WHERE status != 'ended'"),
    all(env, `SELECT t.id, t.client_id, t.title, t.due, t.status, u.name AS assignee FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
               WHERE t.status != 'done' AND t.client_id IS NOT NULL ORDER BY t.due IS NULL, t.due`),
    all(env, "SELECT client_id, currency, SUM(amount_minor) AS sum, MIN(due_at) AS oldest_due FROM invoices WHERE status = 'issued' GROUP BY client_id, currency"),
    all(env, `SELECT client_id, text, created_at FROM activities a WHERE kind IN ('note','call','agent') AND client_id IS NOT NULL
               AND id IN (SELECT id FROM activities b WHERE b.client_id = a.client_id AND b.kind IN ('note','call','agent') ORDER BY created_at DESC LIMIT 3)
               ORDER BY created_at DESC`),
  ]);
  const by = (arr, id) => arr.filter((x) => x.client_id === id);
  return json({
    generated_at: new Date().toISOString(),
    clients: clients.map((c) => ({
      ...c,
      services: by(services, c.id).map((s) => ({
        id: s.id, service: SERVICE_NAMES[s.service] || s.service, direction: s.direction, status: s.status,
        monthly: s.monthly_minor / 100, currency: s.currency,
        ad_budget: s.ad_budget_minor == null ? null : s.ad_budget_minor / 100, ad_budget_currency: s.ad_budget_currency,
        ad_account: s.ad_account, start_date: s.start_date,
      })),
      open_tasks: by(tasks, c.id).map(({ client_id, ...t }) => t),
      unpaid: by(debts, c.id).map((d) => ({ amount: d.sum / 100, currency: d.currency, oldest_due: d.oldest_due })),
      last_notes: by(notes, c.id).map(({ text, created_at }) => ({ text, created_at })),
    })),
  });
}
