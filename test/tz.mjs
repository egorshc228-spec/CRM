// Проверка: «сегодня» считается по Киеву, а не по Гринвичу (ночные часы, переход на зимнее время).
import { localDay } from '../lib/db.js';
const cases = [
  ['2026-10-31T22:30:00Z', '2026-11-01'], // 00:30 по Киеву (UTC+2) — уже 1 ноября
  ['2026-07-14T21:30:00Z', '2026-07-15'], // 00:30 летом (UTC+3)
  ['2026-11-01T10:00:00Z', '2026-11-01'],
];
let bad = 0;
for (const [utc, want] of cases) {
  const got = localDay(Date.parse(utc));
  if (got !== want) { bad++; console.log('  FAIL', utc, got, '≠', want); } else console.log('  ok  ', utc, '→', got);
}
process.exit(bad ? 1 : 0);
