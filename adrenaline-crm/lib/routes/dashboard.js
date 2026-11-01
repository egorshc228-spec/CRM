import { json } from '../http.js';
import { all, first, today, addDays } from '../db.js';
import { OPEN_STAGES } from '../const.js';

// Главный экран: что сделать сегодня
export async function dashboard({ env, user }) {
  const t = today();
  const week = addDays(7);
  const open = OPEN_STAGES.map(() => '?').join(',');

  const [myTasks, newDeals, followUps, pipeline, invoicesDue, teamOverdue, recent] = await Promise.all([
    all(env, `SELECT t.*, c.name AS client_name, d.title AS deal_title FROM tasks t
                LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN deals d ON d.id = t.deal_id
               WHERE t.assignee_id = ? AND t.status != 'done' AND (t.due IS NULL OR t.due <= ?)
               ORDER BY t.due IS NULL, t.due, t.priority LIMIT 30`, user.id, week),
    all(env, "SELECT id, title, source, service, contact_name, phone, telegram, created_at FROM deals WHERE stage = 'new' ORDER BY created_at DESC LIMIT 20"),
    all(env, `SELECT d.id, d.title, d.stage, d.next_step, d.next_step_at, u.name AS owner_name FROM deals d LEFT JOIN users u ON u.id = d.owner_id
               WHERE d.stage IN (${open}) AND d.next_step_at IS NOT NULL AND d.next_step_at <= ? ORDER BY d.next_step_at LIMIT 20`, ...OPEN_STAGES, t),
    all(env, `SELECT stage, COUNT(*) AS n, SUM(monthly_minor) AS monthly, SUM(setup_minor) AS setup, currency FROM deals WHERE stage IN (${open}) GROUP BY stage, currency`, ...OPEN_STAGES),
    all(env, `SELECT i.id, i.amount_minor, i.currency, i.due_at, i.note, c.id AS client_id, c.name AS client_name FROM invoices i JOIN clients c ON c.id = i.client_id
               WHERE i.status = 'issued' AND (i.due_at IS NULL OR i.due_at <= ?) ORDER BY i.due_at LIMIT 20`, week),
    first(env, "SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND due < ?", t),
    all(env, `SELECT a.id, a.kind, a.text, a.created_at, a.client_id, a.deal_id, u.name AS user_name, c.name AS client_name, d.title AS deal_title
                FROM activities a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN deals d ON d.id = a.deal_id
               WHERE a.kind IN ('note','call','stage','agent') ORDER BY a.created_at DESC, a.id DESC LIMIT 15`),
  ]);
  return json({ today: t, my_tasks: myTasks, new_deals: newDeals, follow_ups: followUps, pipeline, invoices_due: invoicesDue, team_overdue: teamOverdue.n, recent });
}
