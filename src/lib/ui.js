// Спільні елементи інтерфейсу: іконки, заголовок сторінки, індикатор «na żywo», скелетон.

import { formatTime, t } from "../i18n/index.js";
import { errorMessage, isSilentError } from "./api.js";
import { html, raw } from "./html.js";

// ===================== Іконки =====================
// Вбудовані SVG (CSP не дозволяє зовнішні ресурси). 24×24, колір — currentColor.

const ICON_PATHS = {
  trucks: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 4.5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6"/>',
  scripts: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 9v12"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17.2v.1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  handover: '<path d="M4 12h12M12 7l5 5-5 5M20 5v14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  notes: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  pushpin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  // процеси на сторінці «Zespół»
  unloading: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>',
  stowing: '<path d="M4 3v18M20 3v18M4 9h16M4 15h16"/><path d="M7 12h4v3H7zM13 6h4v3h-4z"/>',
  replenishment: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  leader: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
  other: '<circle cx="12" cy="12" r="3.5"/>',
};

export function icon(name, className = "icon") {
  return raw(
    `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ICON_PATHS.other}</svg>`,
  );
}

// ===================== Заголовок сторінки =====================

// iconName — іконка ліворуч від заголовка (така сама, як у меню).
export function pageHead({ title, lead, actions = "", iconName = null }) {
  return html`<section class="page-head">
    <div class="page-title">
      ${iconName && html`<span class="page-icon" aria-hidden="true">${icon(iconName)}</span>`}
      <div>
        <h1>${title}</h1>
        ${lead && html`<p class="muted">${lead}</p>`}
      </div>
    </div>
    <div class="page-actions">${actions}</div>
  </section>`;
}

// Порожній стан: іконка + текст.
export function emptyState(text, iconName = "info") {
  return html`<div class="empty">${icon(iconName, "icon empty-icon")}<p>${text}</p></div>`;
}

// ===================== Стан даних таблиці =====================

// «przed chwilą» / «3 min temu» — скільки минуло від оновлення даних.
export function timeAgo(date, now = new Date()) {
  const minutes = Math.floor((now - date) / 60000);
  return minutes < 1 ? t("live.justNow") : t("live.agoMin", { n: minutes });
}

// Індикатор «Na żywo · 14:05 · 2 min temu» / «Ładowanie…» / «Brak połączenia».
// Частину «… temu» оновлює updateTimeAgo() без перемальовування сторінки.
export function liveBadge(state) {
  const updated = state.data?.updated ? new Date(state.data.updated) : null;
  let kind = "ok";
  let text = updated ? t("live.ok", { time: formatTime(updated) }) : t("live.loading");
  if (state.error && !isSilentError(state.error)) {
    kind = "error";
    text = t("live.error");
  } else if (state.loading) {
    kind = "loading";
  }
  const ago = updated && kind !== "error"
    ? html` · <span data-ago="${updated.toISOString()}">${timeAgo(updated)}</span>`
    : "";
  return html`<span class="live live--${kind}" role="status"><i aria-hidden="true"></i><span>${text}${ago}</span></span>`;
}

export function updateTimeAgo(root, now = new Date()) {
  root.querySelectorAll("[data-ago]").forEach((el) => {
    el.textContent = timeAgo(new Date(el.dataset.ago), now);
  });
}

export function refreshButton(id, loading) {
  return html`<button id="${id}" class="button button--primary" type="button" ${loading ? raw("disabled") : ""}>
    ${icon("refresh", `icon${loading ? " icon--spin" : ""}`)}<span>${t("common.refresh")}</span>
  </button>`;
}

// Повідомлення про помилку (лише якщо вона варта показу).
export function errorBox(error) {
  if (!error || isSilentError(error)) return "";
  return html`<p class="message message--error" role="alert">${icon("alert")}<span>${errorMessage(error)}</span></p>`;
}

// Динамічні стилі після рендеру. CSP забороняє атрибут style у HTML, але дозволяє
// задавати стилі з JavaScript, тож розмітка несе лише data-атрибути:
//   data-width="42"     → ширина у відсотках (смуги прогресу);
//   data-color="#d9ead3" → колір дня з таблиці (CSS-змінна --day).
export function applyDynamicStyles(root) {
  root.querySelectorAll("[data-width]").forEach((el) => {
    el.style.width = `${Math.max(0, Math.min(100, Number(el.dataset.width) || 0))}%`;
  });
  root.querySelectorAll("[data-color]").forEach((el) => {
    if (/^#[0-9a-f]{6}$/i.test(el.dataset.color)) el.style.setProperty("--day", el.dataset.color);
  });
}

// Сірі «заглушки», поки дані вперше завантажуються.
export function skeleton(rows = 5) {
  return html`<div class="skeleton" aria-busy="true" aria-label="${t("common.loading")}">
    ${Array.from({ length: rows }, () => html`<span></span>`)}
  </div>`;
}
