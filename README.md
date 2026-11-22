# Hermes

Сайт на Vite та звичайному JavaScript для перегляду `StolPaletB3.txt` і `ReplenPrint.txt`.
Можна вибрати файл, переглянути код, скопіювати або завантажити його.
Макроси виконуються в Excel; сайт показує їхній код.

## Запуск

Потрібен Node.js 22.12+ або 20.19+.

```sh
npm install
npm run dev
```

Відкрийте адресу з термінала (зазвичай http://localhost:5173).

## Збірка

```sh
npm run build
npm run preview
```

Для статичного хостингу використовуйте папку `dist/`. Відносні шляхи підтримують розміщення в підкаталозі.
Редагуйте початкові `.txt` файли в корені: Vite підхоплює їх без дублювання.
Копіювання використовує Clipboard API та потребує localhost або HTTPS.

## Деплой на Vercel

Увесь сайт, включно з `/api/*`, закритий паролем через [middleware.js](middleware.js).
Без змінних середовища сайт нікого не пускає (fail closed).

1. На <https://vercel.com> → **Add New → Project** імпортуйте цей репозиторій.
   Налаштування збірки беруться з [vercel.json](vercel.json).
2. **Settings → Environment Variables** (Production і Preview), див. [.env.example](.env.example):
   - `SITE_PASSWORD`: пароль для входу (довгий, не такий, як у робочих акаунтах);
   - `SESSION_SECRET`: `openssl rand -base64 48`;
   - `SHEET_URL`: посилання на Google Таблицю (кнопка «Arkusz» у шапці);
   - `EXCEL_URL`: посилання на таблицю Excel у SharePoint (запасне, поки аркуш Linki порожній);
   - `SHEET_API_URL`, `SHEET_API_TOKEN`, `SHEET_API_WRITE_TOKEN`: Apps Script Web App.
3. **Deployments → Redeploy**, щоб змінні підхопилися.
4. **Settings → Deployment Protection**: Preview-деплої теж залиште закритими.

Зміна `SITE_PASSWORD` або `SESSION_SECRET` розлогінює всіх. Сесія живе 12 годин.

Локально: `npm run dev` бере змінні з `.env.local` (він у `.gitignore`) і запускає `/api/*`,
але без сторінки входу. Повна перевірка з паролем: `npx vercel dev`.

**Ніколи не комітьте** паролі, токени, посилання на таблицю чи робочі дані.

## Дані з Google Таблиці

Браузер → `/api/sheet`, `/api/links` (Vercel, перевіряють сесію) → Apps Script Web App (перевіряє токен).
Токени є лише у змінних Vercel і в Apps Script, у браузер вони не потрапляють.

- `GET` (`SHEET_API_TOKEN`) → `{ updated, fbo, team, links }`: сторінки «Fury / Bramy», «Zespół», «Makra VBA».
- `POST` (`SHEET_API_WRITE_TOKEN`) `{ action: "saveLinks", links }`: кнопка «Edytuj» в посиланнях; замінює весь аркуш Linki.
- З аркуша Zespół на сайт потрапляють лише Osoba (ім'я + ініціал), Zmiana, Proces teraz, Przerwa, UDT / VNA, Uwagi.

Після зміни `Api.gs`: **Deploy → Manage deployments → Edit → Version: New version → Deploy**
(Execute as: **Me**, Who has access: **Anyone**). URL `/exec` залишається тим самим.

### Вимкнення GitHub Pages

Після переходу на Vercel: **Settings → Pages → Unpublish site** і видаліть
`.github/workflows/deploy.yml`, бо Pages публікує сайт без пароля.
