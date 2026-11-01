# План запуска ADrenaline CRM: GitHub → Cloudflare → Telegram → Railway

Версия CRM 0.2.0. Всё делается через сайты, командная строка не нужна.
Секреты (токен бота, ключи) вводятся только в BotFather и в Cloudflare. В чаты и в GitHub их не кладём.

## Кто где работает

| Что | Где живёт | Что делает |
|---|---|---|
| CRM (сайт и мини-приложение) | Cloudflare Pages + база D1 | сделки, клиенты, задачи, деньги |
| Бот CRM (новый) | BotFather, «живёт» внутри CRM | вход, кнопка мини-приложения, уведомления команде |
| Сайт adrenalinegrowth.com | Cloudflare Pages (уже работает) | форма заявок, по желанию шлёт копию в CRM |
| Демо-бот @CladchatBot | Railway (уже работает) | демо AI-администратора, воронка |

CRM на Railway **не нужна**. Railway в этом плане — только проверка демо-бота (этап 8).

## Что подготовить заранее
- Вход в аккаунт Cloudflare, где подключён домен `adrenalinegrowth.com` (это аккаунт Даниила).
- Аккаунт GitHub, который подключён к этому Cloudflare.
- Менеджер паролей или защищённая заметка для токена и ключей.
- Архив `adrenaline-crm-0.2.0.zip`, распакованный на компьютере.

---

## Этап 1. Telegram: бот для CRM (5 минут)
1. Откройте @BotFather → `/newbot` → имя `ADrenaline CRM` → логин, например `adrenaline_crm_bot`.
2. Сохраните **токен** в менеджере паролей. Это `TG_BOT_TOKEN`.
3. В @BotFather: `/setdomain` → выберите бота → `crm.adrenalinegrowth.com`. Без этого не появится кнопка «Войти через Telegram» на сайте.
4. Узнайте свой Telegram ID у @userinfobot. Это `OWNER_TG_ID` (будущий владелец CRM).
5. ID группы для уведомлений: добавьте бота в группу команды → напишите в группе любое сообщение → откройте в браузере `https://api.telegram.org/bot<ТОКЕН>/getUpdates` → число после `"chat":{"id":`, начинается с `-100`. Это `TG_NOTIFY_CHAT_ID`.

Готово, когда: есть токен, ваш ID и ID группы.

## Этап 2. Cloudflare: база D1 (5 минут)
1. Cloudflare → **Storage & Databases → D1 SQL Database** (в старом меню: Workers & Pages → D1) → **Create** → имя `adrenaline-crm`.
2. Скопируйте **Database ID** (не секрет).
3. Откройте базу → **Console** → вставьте весь текст файла `migrations/0001_init.sql` → **Execute**.
4. Проверка: во вкладке **Tables** есть `users`, `clients`, `deals`, `services`, `invoices`, `tasks`, `activities`, `partners`, `partner_payouts`, `settings`.

Готово, когда: таблицы созданы, Database ID сохранён.

## Этап 3. Заполнить `wrangler.toml` (на компьютере, 3 минуты)
Откройте файл `wrangler.toml` из архива в любом текстовом редакторе и впишите:
```toml
database_id = "ID базы из этапа 2"

[vars]
TG_BOT_USERNAME = "adrenaline_crm_bot"            # логин бота без @
OWNER_TG_ID = "123456789"                         # ID Даниила
CRM_URL = "https://crm.adrenalinegrowth.com"
TG_NOTIFY_CHAT_ID = "-100..."                     # ID группы
TG_APP_SHORTNAME = ""                             # пока пусто, заполним на этапе 6
```
Это не секреты, их можно хранить в репозитории. Cloudflare берёт подключение базы и эти значения **из файла**: в панели Cloudflare их потом можно только смотреть.

## Этап 4. GitHub: репозиторий (5 минут)
1. GitHub → **New repository** → имя `adrenaline-crm` → **Private** → Create.
   Репозиторий создаёт владелец аккаунта, подключённого к Cloudflare. Другим участникам — доступ через Settings → Collaborators.
2. **Add file → Upload files** → перетащите **содержимое** папки `adrenaline-crm` (вместе с заполненным `wrangler.toml`).
   Не загружайте папки `node_modules`, `.wrangler` и файл `.dev.vars`, если они появились.
3. **Commit changes**.

Готово, когда: в корне репозитория видны `public`, `functions`, `lib`, `migrations`, `wrangler.toml`.

## Этап 5. Cloudflare Pages: сайт CRM (15 минут)
1. Cloudflare → **Workers & Pages → Create** → вкладка **Pages** → **Import an existing Git repository** (Connect to Git).
2. Выберите GitHub и репозиторий `adrenaline-crm`. Если его нет в списке — нажмите ссылку на настройку GitHub-приложения Cloudflare и дайте доступ к этому репозиторию.
3. Настройки сборки:
   - Project name: **`adrenaline-crm`** (должно совпадать с `name` в `wrangler.toml`)
   - Framework preset: **None**
   - Build command: **пусто**
   - Build output directory: **`public`**
4. **Save and Deploy**. Дождитесь зелёной сборки.
5. **Секреты**: проект → **Settings → Variables and Secrets** → Add, тип **Secret**, окружение **Production**:

   | Имя | Значение |
   |---|---|
   | `TG_BOT_TOKEN` | токен из этапа 1 |
   | `SESSION_SECRET` | случайная строка, 40 символов (буквы и цифры) |
   | `AGENT_API_KEY` | другая случайная строка, 40 символов |
   | `INTAKE_KEY` | третья случайная строка, 40 символов |

   Строки сгенерируйте в менеджере паролей и сохраните там же. **`DEV_MODE` не добавлять**: он включает вход без Telegram.
6. **Deployments** → у последней сборки **⋯ → Retry deployment**, чтобы подхватились секреты.
7. **Custom domains → Set up a custom domain** → `crm.adrenalinegrowth.com` → Activate. Домен уже в Cloudflare, запись DNS создастся сама. Ждите статус **Active** (обычно несколько минут).

Проверка: `https://crm.adrenalinegrowth.com/api/auth/me` показывает `"bot_username":"adrenaline_crm_bot"`, а главная страница — кнопку «Войти через Telegram».

## Этап 6. Telegram: мини-приложение (5 минут)
1. @BotFather → `/newapp` → выберите бота CRM.
2. Введите по очереди: название `ADrenaline CRM`, короткое описание, картинку 640×360 (любая с логотипом), GIF — пропустить (`/empty`).
3. URL приложения: `https://crm.adrenalinegrowth.com`.
4. Короткое имя (short name): `crm`. Ссылка на приложение будет `https://t.me/adrenaline_crm_bot/crm`.
5. Кнопка внизу чата с ботом (по желанию): `/mybots` → бот → **Bot Settings → Menu Button** → URL `https://crm.adrenalinegrowth.com`, текст `CRM`.
6. В GitHub откройте `wrangler.toml` → карандаш (Edit) → `TG_APP_SHORTNAME = "crm"` → **Commit changes**. Cloudflare пересоберёт CRM сам. Теперь ссылки в уведомлениях открывают мини-приложение сразу на нужной сделке.

## Этап 7. Первый вход и команда (10 минут)
1. Даниил открывает `https://t.me/adrenaline_crm_bot/crm` (или сайт CRM) — вход происходит сам, Даниил становится владельцем.
2. Остальные открывают ту же ссылку и видят «Доступа пока нет» и свой Telegram ID. Они присылают ID Даниилу.
3. Даниил: CRM → **Команда** → добавить человека по ID → отметить «Доля AI», если нужно.
4. Каждый один раз нажимает **Start** в чате с ботом CRM, иначе бот не сможет присылать ему задачи.
5. CRM → **Команда** → проверьте курс USD/UAH.

## Этап 8. Railway: демо-бот @CladchatBot (5 минут, только проверка)
CRM к Railway не подключается. Здесь проверяем, что демо-бот в порядке перед связкой с CRM:
1. Railway → проект бота → **Deployments**: последняя сборка зелёная, коммит — последний из `Telegram-bot`.
2. **Variables**: на месте `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `OWNER_ID`, `SALES_CHAT_ID`, `SALES_STAFF_IDS`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`.
3. В Telegram: `/start` у @CladchatBot отвечает на украинском.
4. Проверить группу «Заявки»: тестовая заявка приходит, кнопки видны только сотрудникам (это и есть непроверенный патч `group_guard`).

Связка «заявки из бота → CRM» — следующая доработка кода бота. После неё в Railway → Variables добавятся `CRM_INTAKE_URL = https://crm.adrenalinegrowth.com/api/intake` и `CRM_INTAKE_KEY` (тот же `INTAKE_KEY`).

## Этап 9. Сайт → CRM (по желанию, 5 минут)
Если в коде сайта `functions/api/lead.js` уже есть отправка копии заявки в CRM (по README так и сделано — проверить):
1. Cloudflare → Pages → проект сайта → **Settings → Variables and Secrets**:
   - `CRM_INTAKE_URL` = `https://crm.adrenalinegrowth.com/api/intake`
   - `CRM_INTAKE_KEY` (Secret) = тот же `INTAKE_KEY`
2. **Retry deployment** сайта.
3. Отправьте тестовую заявку с формы сайта → она появляется в CRM в «Новая», в группу приходит «🔥 Новая заявка в CRM».

## Этап 10. Финальная проверка
- [ ] Сайт CRM открывается по `https://crm.adrenalinegrowth.com`, вход через Telegram работает.
- [ ] Мини-приложение открывается по `https://t.me/adrenaline_crm_bot/crm` на телефоне и в Telegram на компьютере.
- [ ] Незнакомому человеку показывается его ID, войти он не может.
- [ ] Новая задача на коллегу приходит ему в Telegram, ссылка открывает мини-приложение.
- [ ] Тестовая сделка → «Оплатили» → появились клиент, услуга и счёт за запуск. Потом удалите тестовые данные (сначала счёт, затем клиента).
- [ ] Деньги → «Выставить абонплату за месяц» не создаёт дублей при повторном нажатии.
- [ ] (если этап 9) тестовая заявка с сайта попала в CRM.

## Как обновлять потом
- Новые файлы кода → GitHub `adrenaline-crm` → Add file → Upload files → Commit. Cloudflare обновит CRM сам за 1–2 минуты.
- Если в обновлении есть новый файл в `migrations/` (например `0002_...sql`) — один раз выполните его текст в Console базы D1.
- Если что-то сломалось: Cloudflare → Pages → Deployments → у предыдущей рабочей сборки **Rollback**.

## Если что-то не работает
| Симптом | Что проверить |
|---|---|
| Нет кнопки «Войти через Telegram» | `/setdomain` в BotFather, `TG_BOT_USERNAME` в `wrangler.toml` |
| «Не удалось проверить вход» | `TG_BOT_TOKEN` в секретах от того же бота; Retry deployment после добавления секретов |
| «D1 не подключена» | `database_id` в `wrangler.toml`, имя проекта Pages = `adrenaline-crm` |
| Мини-приложение — пустой экран в веб-версии Telegram | файл `public/_headers` загружен в репозиторий |
| Задачи не приходят коллеге | он не нажал Start у бота CRM |
| Уведомлений о заявках нет | бот добавлен в группу, `TG_NOTIFY_CHAT_ID` начинается с `-100` |
