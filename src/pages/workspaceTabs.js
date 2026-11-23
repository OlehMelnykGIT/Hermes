// Перемикач розділу «Notatki i makra»: одна вкладка меню, три підрозділи.
// Це звичайні посилання (#/notes, #/scripts, #/links), тож працюють «назад» у браузері й закладки.

import { t } from "../i18n/index.js";
import { html } from "../lib/html.js";
import { icon } from "../lib/ui.js";

const TABS = [
  { id: "notes", labelKey: "nav.notes", iconName: "notes" },
  { id: "scripts", labelKey: "nav.scripts", iconName: "scripts" },
  { id: "links", labelKey: "nav.links", iconName: "link" },
];

export function workspaceTabs(active) {
  return html`<nav class="subnav" aria-label="${t("nav.workspace")}">
    ${TABS.map(
      (tab) => html`<a href="#/${tab.id}" ${tab.id === active ? html`aria-current="page"` : ""}>
        ${icon(tab.iconName)}<span>${t(tab.labelKey)}</span>
      </a>`,
    )}
  </nav>`;
}
