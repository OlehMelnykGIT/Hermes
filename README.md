# INB Hermes

Робочий сайт для складу: фури та брами наживо з Google Таблиці, команда на зміні,
макроси VBA для Excel і посилання. Двомовний (PL за замовчуванням / UA), закритий паролем,
працює на Vercel.

| Сторінка | Що показує |
| --- | --- |
| **Rozładunek** | Аркуш Rozładunek: прогрес дня, дедлайни, Replen / Stol B3, закриті дні; блок NCG за датами |
| **Zespół** | Аркуш Zespół: хто в якому процесі, розподіл перерв, UDT / VNA |
| **Makra VBA** | Код макросів (перегляд, копіювання, завантаження) і посилання з аркуша Linki |

## Структура

```text
middleware.js         пароль на весь сайт (/login, /logout, перевірка сесії)
api/                  серверні функції Vercel: config, sheet (читання), links (запис)
server/               спільний серверний код: сесія, запити до Apps Script, сторінка входу
src/
  main.js             шапка, мова, маршрути (#/trucks, #/team, #/scripts)
  i18n/               pl.json, uk.json — усі тексти інтерфейсу
  lib/                html (безпечні шаблони), api, sheet (одне джерело даних), ui, storage
  pages/<сторінка>/   model.js — логіка без DOM, view.js — розмітка й події
  styles/             tokens (кольори, темна тема), base, layout, components, сторінки
tests/                npm test — вхід, API, логіка сторінок
StolPaletB3.txt       макроси VBA (сайт показує їх як є)
ReplenPrint.txt
```

## Локальний запуск

Потрібен Node.js 22+.

```sh
npm install
cp .env.example .env.local   # і заповнити значення
npm run dev                  # http://localhost:5173 — з даними з таблиці, без сторінки входу
npm test                     # тести
npm run build                # збірка в dist/
```

Повна перевірка з паролем, як на Vercel: `npx vercel dev`.

## Змінні середовища

Задаються у Vercel → **Settings → Environment Variables** (Production і Preview),
локально — у `.env.local`. Шаблон: [.env.example](.env.example).

| Змінна | Призначення |
| --- | --- |
| `SITE_PASSWORD` | пароль для входу |
| `SESSION_SECRET` | секрет сесій, мін. 32 символи (`openssl rand -base64 48`) |
| `SHEET_URL` | посилання на Google Таблицю (посилання «Replenishment SLA» у шапці) |
| `SHEET_API_URL` | адреса Apps Script Web App (закінчується на `/exec`) |
| `SHEET_API_TOKEN` | токен читання (`API_TOKEN` в Apps Script) |
| `SHEET_API_WRITE_TOKEN` | токен запису аркуша Linki (`API_WRITE_TOKEN` в Apps Script) |

Після зміни змінних — **Deployments → Redeploy**. Зміна `SITE_PASSWORD` або `SESSION_SECRET`
розлогінює всіх; сесія живе 12 годин. Без пароля й секрету сайт нікого не пускає.

**Ніколи не комітьте** паролі, токени, посилання на таблицю чи робочі дані.

## Дані з Google Таблиці

Браузер → `/api/*` на Vercel (перевіряє сесію) → Apps Script Web App (перевіряє токен).
Токени є лише на сервері, у браузер вони не потрапляють.

- `GET` → `{ updated, fbo, team, links }` — усі сторінки; оновлюється щохвилини.
- `POST` `{ action: "saveLinks", links }` — кнопка «Edytuj»; замінює весь список в аркуші Linki.
- З аркуша Zespół на сайт потрапляють лише ім'я з ініціалом, зміна, процес, перерва, UDT / VNA і примітка.
- Необов'язкові поля `euro`, `fboColors`, `ncg`, `ncgColors` — сайт покаже EURO (I1), кольори днів
  і таблицю NCG, щойно `Api.gs` почне їх віддавати.

Після зміни `Api.gs`: **Deploy → Manage deployments → Edit → Version: New version → Deploy**
(Execute as: **Me**, Who has access: **Anyone**). Адреса `/exec` не змінюється.

## Автор

**Oleh Melnyk** — автор проєкту, головний розробник і модератор сайту.
Operator CL · Inbound Dep.
