// Мови сайту: польська (за замовчуванням) і українська.
// Тексти — у pl.json / uk.json; нова фраза додається одразу в обидва файли.
// Дані з таблиці (WAB, LU, адреси, імена) не перекладаються.

import pl from "./pl.json";
import uk from "./uk.json";
import { load, save } from "../lib/storage.js";

const dictionaries = { pl, uk };

export const LANGUAGES = [
  { code: "pl", label: "PL" },
  { code: "uk", label: "UA" },
];

const validLang = (value) => (value === "pl" || value === "uk" ? value : null);

// Сторінка входу запам'ятовує вибір у cookie — беремо його, якщо в localStorage порожньо.
const cookieLang = () => validLang(/(?:^|;\s*)hermes_lang=(pl|uk)\b/.exec(document.cookie)?.[1]);

let current = validLang(load("lang")) || cookieLang() || "pl";

export const getLang = () => current;

export function setLang(lang) {
  current = validLang(lang) || "pl";
  save("lang", current);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `hermes_lang=${current}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
  document.documentElement.lang = current;
}

// t("key", { n: 3 }) — підставляє {n}. Немає перекладу → польський текст → сам ключ.
export function t(key, params = {}) {
  const text = dictionaries[current][key] ?? pl[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

// ===================== Дата і час (однаково для обох мов) =====================

const pad = (n) => String(n).padStart(2, "0");
const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

// dd.MM.yyyy HH:mm
export function formatDateTime(date) {
  if (!isValidDate(date)) return "";
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${formatTime(date)}`;
}

// HH:mm
export function formatTime(date) {
  return isValidDate(date) ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : "";
}

// 135 → «2 h 15 min», 40 → «40 min»
export function formatDuration(minutes) {
  const total = Math.abs(Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t("time.hm", { h, m }) : t("time.m", { m });
}
