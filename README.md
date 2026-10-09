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

## GitHub Pages

1. У репозиторії відкрийте **Settings → Pages → Build and deployment**.
2. У полі **Source** виберіть **GitHub Actions**.
3. Завантажте зміни, включно з `.github/workflows/deploy.yml`, у гілку `main`.
4. У вкладці **Actions** дочекайтеся успішного завершення **Deploy to GitHub Pages**.
   За потреби запустіть його вручну через **Run workflow**.

Сайт: https://OlehMelnykGIT.github.io/Hermes/

Workflow встановлює залежності через `npm ci`, збирає Vite та публікує `dist/`.
Шлях до ресурсів визначається з налаштувань GitHub Pages автоматично.
Публікація вихідного коду через **Deploy from a branch** не виконує збірку Vite.
