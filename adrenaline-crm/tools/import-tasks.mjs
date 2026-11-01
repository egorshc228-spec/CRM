// Перенос задач со старой доски команды в CRM (через API агента).
// node tools/import-tasks.mjs https://crm.example.com AGENT_API_KEY [tools/team-board-tasks.json]
// Исполнителей ищет по имени (Даниил, Єгор, Даня); «Команда» → без исполнителя.
// Запускать один раз, когда вся команда уже добавлена в «Команду».
import { readFile } from 'node:fs/promises';

const [base, key, file = new URL('./team-board-tasks.json', import.meta.url).pathname] = process.argv.slice(2);
if (!base || !key) { console.error('Использование: node tools/import-tasks.mjs <CRM_URL> <AGENT_API_KEY> [файл.json]'); process.exit(1); }
const api = async (method, path, body) => {
  const r = await fetch(base.replace(/\/$/, '') + '/api' + path, {
    method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`${path}: ${d.error || r.status}`);
  return d;
};

const tasks = JSON.parse(await readFile(file, 'utf8'));
const { users } = await api('GET', '/users');
const find = (name) => users.find((u) => u.name.toLowerCase().startsWith(String(name || '').toLowerCase()));
const missing = [...new Set(tasks.map((t) => t.owner).filter((o) => o && o !== 'Команда' && !find(o)))];
if (missing.length) console.warn('Нет в команде (задачи будут без исполнителя):', missing.join(', '));

let n = 0;
for (const t of tasks) {
  const u = t.owner && t.owner !== 'Команда' ? find(t.owner) : null;
  await api('POST', '/tasks', {
    title: t.title, note: t.note || null, due: t.due || null, area: t.area || null,
    status: ['todo', 'doing', 'done'].includes(t.status) ? t.status : 'todo', assignee_id: u ? u.id : null, silent: true,
  });
  n++;
}
console.log(`Перенесено задач: ${n}`);
