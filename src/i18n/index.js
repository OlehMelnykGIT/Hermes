import pl from "./pl.json";
import uk from "./uk.json";

const dictionaries = { pl, uk };
export const LANGUAGES = [
  { code: "pl", label: "PL" },
  { code: "uk", label: "UA" },
];

const valid = (value) => (value === "pl" || value === "uk" ? value : null);

function storedLang() {
  try {
    return valid(localStorage.getItem("hermes.lang"));
  } catch {
    return null;
  }
}

function cookieLang() {
  return valid(/(?:^|;\s*)hermes_lang=(pl|uk)\b/.exec(document.cookie)?.[1]);
}

let current = storedLang() || cookieLang() || "pl";

export function getLang() {
  return current;
}

// Мова зберігається і в localStorage, і в cookie (щоб сторінка входу теж її знала).
export function setLang(lang) {
  current = valid(lang) || "pl";
  try {
    localStorage.setItem("hermes.lang", current);
  } catch {
    /* localStorage недоступний */
  }
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `hermes_lang=${current}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
  document.documentElement.lang = current;
}

// Якщо перекладу немає, показуємо польський текст. {name} замінюється на params.name.
export function t(key, params = {}) {
  const text = dictionaries[current][key] ?? pl[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// dd.MM.yyyy HH:mm для обох мов
export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
  );
}
