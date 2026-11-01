# План запуска ADrenaline CRM на Railway

Версия CRM 0.3.0. Всё делается через сайты, командная строка не нужна.
Секреты (токен бота, ключи) вводятся только в BotFather и в Railway Variables. В чаты и в GitHub их не кладём.

## Что где работает

| Что | Где | Что делает |
|---|---|---|
| CRM (сайт и мини-приложение Telegram) | Railway, сервис `adrenaline-crm` + Volume с базой | сделки, клиенты, задачи, деньги |
| Бот CRM (новый) | BotFather | вход, кнопка мини-приложения, уведомления команде, резервные копии |
| Демо-бот @CladchatBot | Railway (уже работает) | демо AI-администратора, воронка |
| Сайт adrenalinegrowth.com и DNS | Cloudflare (уже работает) | форма заявок; поддомен `crm` указывает на Railway |

CRM ставим **в тот же проект Railway, что и демо-бот**: всё в одном месте, одна схема деплоя.
Стоимость: тариф Railway Hobby — $5 в месяц, внутри $5 на ресурсы; CRM добавится к расходам бота, сверх $5 — доплата по факту.

## Что подготовить заранее
- Вход в Railway (проект демо-бота), GitHub и Cloudflare (DNS домена `adrenalinegrowth.com`).
- Менеджер паролей для токена и ключей.
- Распакованный архив `adrenaline-crm-0.3.0.zip`.

---

## Этап 1. Telegram: бот для CRM (5 минут)
1. @BotFather → `/newbot` → имя `ADrenaline CRM` → логин, например `adrenaline_crm_bot`.
2. Сохраните **токен** в менеджере паролей. Это `TG_BOT_TOKEN`.
3. Узнайте свой Telegram ID у @userinfobot. Это `OWNER_TG_ID` (владелец CRM).
4. ID группы для уведомлений: добавьте бота в группу команды → напишите в группе сообщение → откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates` → число после `"chat":{"id":`, начинается с `-100`. Это `TG_NOTIFY_CHAT_ID`.
5. Владелец один раз нажимает **Start** в чате с ботом CRM: иначе бот не сможет присылать ему задачи и резервные копии.

## Этап 2. GitHub: репозиторий (5 минут)
1. GitHub → **New repository** → `adrenaline-crm` → **Private** → Create.
2. **Add file → Upload files** → перетащите **содержимое** папки `adrenaline-crm` из архива (не саму папку). Папки `node_modules`, `data` и файл `.dev.vars` не загружать, если появились.
3. **Commit changes**.

Готово, когда: в корне репозитория видны `server`, `public`, `lib`, `functions`, `migrations`, `Dockerfile`, `railway.json`.

## Этап 3. Railway: сервис CRM (15 минут)
1. Railway → проект демо-бота → **Create** (или **+ New**) → **GitHub Repo** → `adrenaline-crm`.
   Нет в списке — нажмите **Configure GitHub App** и дайте Railway доступ к этому репозиторию.
2. Сервис → **Settings**:
   - **Root Directory** — оставить **пустым** (у CRM код в корне репозитория, в отличие от бота с `/demo-bot`);
   - Branch — `main`, автодеплой включён.
   Сборку Railway возьмёт из `Dockerfile` и `railway.json` сам.
3. **Volume** (обязательно, иначе база пропадёт при каждом деплое): нажмите правой кнопкой на сервис на схеме проекта → **Attach Volume** (или Ctrl/Cmd+K → «Volume») → **Mount path:** `/srv/data`.
4. Сервис → **Variables** → **Raw Editor** → вставьте и заполните:
   ```
   DATA_DIR=/srv/data
   TG_BOT_TOKEN=токен из этапа 1
   TG_BOT_USERNAME=adrenaline_crm_bot
   OWNER_TG_ID=ваш ID
   TG_NOTIFY_CHAT_ID=-100...
   CRM_URL=https://crm.adrenalinegrowth.com
   SESSION_SECRET=случайная строка 40 символов
   AGENT_API_KEY=другая случайная строка 40 символов
   INTAKE_KEY=третья случайная строка 40 символов
   BACKUP_TG_CHAT_ID=ваш ID
   TG_APP_SHORTNAME=
   ```
   Случайные строки — из генератора паролей (буквы и цифры), сохраните их там же.
   **`DEV_MODE` не добавлять.** Даже если добавить по ошибке, на Railway CRM его проигнорирует.
5. **Deploy** (или дождитесь автодеплоя). В **Deployments → View logs** должно быть:
   ```
   ADrenaline CRM запущена: порт ..., база /srv/data/crm.sqlite
   Применены миграции: 0001_init.sql
   Резервные копии в Telegram: каждый день после 3:00 по Киеву
   ```
   Строк с ⚠️ быть не должно.

## Этап 4. Домен crm.adrenalinegrowth.com (10 минут)
1. Railway → сервис CRM → **Settings → Networking**:
   - **Generate Domain** — получите временный адрес `….up.railway.app` и проверьте, что CRM открывается;
   - **+ Custom Domain** → `crm.adrenalinegrowth.com` → Railway покажет запись DNS (CNAME, иногда ещё TXT для проверки).
2. Cloudflare → домен `adrenalinegrowth.com` → **DNS → Records → Add record**:
   - Type **CNAME**, Name **`crm`**, Target — адрес, который показал Railway;
   - **Proxy status: DNS only** (серое облако) — так Railway сам выпустит HTTPS-сертификат;
   - если Railway показал TXT-запись — добавьте и её.
3. Через 5–30 минут в Railway напротив домена появится зелёная галочка.

Проверка: `https://crm.adrenalinegrowth.com/healthz` отвечает `ok`, а `https://crm.adrenalinegrowth.com/api/auth/me` — `"bot_username":"adrenaline_crm_bot"`.

## Этап 5. Telegram: вход на сайте и мини-приложение (10 минут)
1. @BotFather → `/setdomain` → бот CRM → `crm.adrenalinegrowth.com`. Появится кнопка «Войти через Telegram» на сайте.
2. @BotFather → `/newapp` → бот CRM → название `ADrenaline CRM`, описание, картинка 640×360, GIF — `/empty` → URL `https://crm.adrenalinegrowth.com` → короткое имя `crm`.
   Ссылка на приложение: `https://t.me/adrenaline_crm_bot/crm`.
3. Кнопка внизу чата с ботом (по желанию): `/mybots` → бот → **Bot Settings → Menu Button** → URL `https://crm.adrenalinegrowth.com`, текст `CRM`.
4. Railway → Variables → `TG_APP_SHORTNAME=crm`. Railway перезапустит CRM сам. Теперь ссылки в уведомлениях открывают мини-приложение сразу на нужной сделке.

## Этап 6. Первый вход и команда (10 минут)
1. Владелец открывает `https://t.me/adrenaline_crm_bot/crm` (или сайт CRM) — вход происходит сам, владелец создаётся автоматически.
2. Остальные открывают ту же ссылку, видят «Доступа пока нет» и свой Telegram ID и присылают его владельцу.
3. Владелец: CRM → **Команда** → добавить по ID → отметить «Доля AI», если нужно.
4. Каждый один раз нажимает **Start** у бота CRM.
5. CRM → **Команда** → проверьте курс USD/UAH.

## Этап 7. Резервные копии
Примерно через минуту после первого запуска владельцу в Telegram придёт файл `adrenaline-crm-ГГГГ-ММ-ДД.sqlite` с подписью «Резервная копия CRM» и числом клиентов, сделок, счетов и задач. Дальше — каждый день после 3:00 по Киеву.
- Не пришла — проверьте в логах строку «Резервная копия не отправлена» и что владелец нажал Start у бота.
- Файл открывается программой DB Browser for SQLite — можно посмотреть данные.
- Восстановление из копии делается разово, через Railway CLI: напишите разработчику.

## Этап 8. Заявки с сайта в CRM (по желанию, 5 минут)
По README форма сайта (`functions/api/lead.js` в проекте сайта на Cloudflare) уже умеет отправлять копию заявки в CRM.
1. Cloudflare → Pages → проект сайта → **Settings → Variables and Secrets**:
   - `CRM_INTAKE_URL` = `https://crm.adrenalinegrowth.com/api/intake`
   - `CRM_INTAKE_KEY` (Secret) = тот же `INTAKE_KEY`
2. **Retry deployment** сайта.
3. Тестовая заявка с формы → в CRM в «Новая», в группу приходит «🔥 Новая заявка в CRM». Не пришла — значит, в коде сайта отправки нет: пришлите его, добавлю.

## Этап 9. Демо-бот @CladchatBot (проверка, 5 минут)
1. Railway → сервис бота → **Deployments**: последняя сборка зелёная.
2. **Variables** на месте: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `OWNER_ID`, `SALES_CHAT_ID`, `SALES_STAFF_IDS`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`.
3. `/start` у @CladchatBot отвечает на украинском; в группе «Заявки» кнопки видны только сотрудникам (патч `group_guard`).

Связка «заявки из бота → CRM» — следующая доработка кода бота. Так как оба сервиса в одном проекте Railway, адрес CRM можно будет передать боту ссылкой на переменную, а ключ — `CRM_INTAKE_KEY`.

## Финальная проверка
- [ ] `https://crm.adrenalinegrowth.com` открывается, вход через Telegram работает.
- [ ] Мини-приложение `https://t.me/adrenaline_crm_bot/crm` открывается на телефоне и в Telegram на компьютере.
- [ ] Незнакомому человеку показывается его ID, войти он не может.
- [ ] Задача на коллегу приходит ему в Telegram, ссылка открывает мини-приложение.
- [ ] Тестовая сделка → «Оплатили» → появились клиент, услуга и счёт. Потом удалите тестовые данные (сначала счёт, затем клиента).
- [ ] После любого нового деплоя данные на месте (значит, Volume подключён правильно).
- [ ] Пришла резервная копия в Telegram.

## Как обновлять потом
- Новые файлы → GitHub `adrenaline-crm` → Upload files → Commit. Railway пересоберёт и перезапустит CRM за 1–2 минуты.
- Новые таблицы и поля (файлы в `migrations/`) применяются **сами** при запуске — в консоль базы ничего вставлять не нужно.
- Сломалось после обновления: Railway → Deployments → у прошлой рабочей сборки **Redeploy** (откат), затем разбираемся.

## Если что-то не работает

| Симптом | Что проверить |
|---|---|
| Сборка падает на healthcheck | Deployments → View logs: текст ошибки при запуске |
| Данные пропали после деплоя | подключён ли Volume с путём `/srv/data` и есть ли `DATA_DIR=/srv/data` |
| Нет кнопки «Войти через Telegram» | `/setdomain` в BotFather, `TG_BOT_USERNAME` в Variables |
| «Не удалось проверить вход» | `TG_BOT_TOKEN` от того же бота, что в BotFather |
| Домен не открывается | CNAME `crm` в Cloudflare в режиме **DNS only**, зелёная галочка в Railway |
| Мини-приложение — пустой экран | открывается ли `https://crm.adrenalinegrowth.com` в браузере; URL в `/newapp` |
| Задачи не приходят коллеге | он не нажал Start у бота CRM |
| Нет уведомлений о заявках | бот добавлен в группу, `TG_NOTIFY_CHAT_ID` начинается с `-100` |
