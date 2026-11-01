-- ADrenaline CRM — начальная схема (Cloudflare D1 / SQLite)
-- Даты храним как ISO-строки (UTC): 'YYYY-MM-DDTHH:MM:SSZ', дни — 'YYYY-MM-DD'.
-- Деньги — в целых центах/копейках (amount_minor), валюта — 'USD' или 'UAH'.

-- Внешние ключи в D1 проверяются по умолчанию, PRAGMA не нужна.

-- Люди с доступом. role: owner (всё, включая команду и настройки), member (всё кроме команды), agent (AI-агент по API)
CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id       INTEGER UNIQUE,                 -- Telegram user id (для agent — NULL)
  tg_username TEXT,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member','agent')),
  ai_share    INTEGER NOT NULL DEFAULT 0,      -- 1 = получает долю AI-направления
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Клиенты (после выигранной сделки или заведённые вручную)
CREATE TABLE clients (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  niche         TEXT,
  city          TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','churned')),
  owner_id      INTEGER REFERENCES users(id),
  source        TEXT,                          -- site / telegram / bm / referral / outreach / agency / other
  contact_name  TEXT,
  phone         TEXT,
  telegram      TEXT,
  email         TEXT,
  website       TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Партнёры, которым платим за привлечённых клиентов (KeyCRM-интеграторы, веб-студии, агенты)
CREATE TABLE partners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  contact    TEXT,
  terms      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Сделки = заявки в воронке. До выигрыша контакт хранится прямо в сделке.
CREATE TABLE deals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  stage         TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','call','proposal','won','lost')),
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  owner_id      INTEGER REFERENCES users(id),
  service       TEXT,                          -- google_ads / meta / seo / analytics / ai_direct / ai_voice / crm / package / other
  direction     TEXT NOT NULL DEFAULT 'ads' CHECK (direction IN ('ads','ai')),
  source        TEXT,
  contact_name  TEXT,
  phone         TEXT,
  telegram      TEXT,
  email         TEXT,
  website       TEXT,
  niche         TEXT,
  setup_minor   INTEGER NOT NULL DEFAULT 0,
  monthly_minor INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','UAH')),
  next_step     TEXT,
  next_step_at  TEXT,                          -- YYYY-MM-DD
  lost_reason   TEXT,
  details       TEXT,                          -- JSON: бюджет, боль, utm, gclid, страница входа
  partner_id    INTEGER REFERENCES partners(id),
  closed_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX deals_stage ON deals(stage);
CREATE INDEX deals_phone ON deals(phone);

-- Услуги клиента = подписки (абонплата) + разовый запуск
CREATE TABLE services (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service             TEXT NOT NULL,
  direction           TEXT NOT NULL DEFAULT 'ads' CHECK (direction IN ('ads','ai')),
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  currency            TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','UAH')),
  setup_minor         INTEGER NOT NULL DEFAULT 0,
  monthly_minor       INTEGER NOT NULL DEFAULT 0,
  ad_budget_minor     INTEGER,                 -- рекламный бюджет клиента в месяц (для агента и отчёта)
  ad_budget_currency  TEXT,
  ad_account          TEXT,                    -- id кабинета Google/Meta
  start_date          TEXT,
  end_date            TEXT,
  billing_day         INTEGER DEFAULT 1,
  partner_id          INTEGER REFERENCES partners(id),
  partner_setup_pct   REAL NOT NULL DEFAULT 0, -- 20 = 20% от запуска
  partner_monthly_pct REAL NOT NULL DEFAULT 0, -- 10 = 10% от абонплаты
  partner_months      INTEGER NOT NULL DEFAULT 12,
  notes               TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX services_client ON services(client_id);

-- Счета. period — 'YYYY-MM' для ежемесячных, чтобы не выставить дважды.
CREATE TABLE invoices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'monthly' CHECK (kind IN ('setup','monthly','other')),
  direction    TEXT NOT NULL DEFAULT 'ads' CHECK (direction IN ('ads','ai')),
  period       TEXT,
  amount_minor INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','UAH')),
  status       TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','paid','void')),
  issued_at    TEXT,
  due_at       TEXT,
  paid_at      TEXT,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX invoices_monthly_once ON invoices(service_id, period) WHERE kind = 'monthly' AND status != 'void';
CREATE INDEX invoices_status ON invoices(status);

-- Выплаченные партнёрам комиссии (начисления считаются из оплаченных счетов)
CREATE TABLE partner_payouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id   INTEGER NOT NULL REFERENCES partners(id),
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  paid_at      TEXT NOT NULL,
  UNIQUE (invoice_id)
);

-- Задачи команды
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority    INTEGER NOT NULL DEFAULT 2,       -- 1 высокий, 2 обычный, 3 низкий
  assignee_id INTEGER REFERENCES users(id),
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  deal_id     INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  area        TEXT,
  due         TEXT,
  created_by  INTEGER REFERENCES users(id),
  done_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX tasks_assignee ON tasks(assignee_id, status);

-- Лента событий и заметок по клиенту/сделке
CREATE TABLE activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  deal_id     INTEGER REFERENCES deals(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  kind        TEXT NOT NULL DEFAULT 'note',    -- note / call / stage / system / agent
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX activities_client ON activities(client_id, created_at);
CREATE INDEX activities_deal ON activities(deal_id, created_at);

-- Настройки (курс USD/UAH и т. п.)
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('usd_uah', '41.5');

-- Служебный пользователь для API агента
INSERT INTO users (name, role) VALUES ('AI-агент', 'agent');
