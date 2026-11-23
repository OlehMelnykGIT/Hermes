// Налаштування з сервера (/api/config): посилання на таблицю і що ввімкнено.
// Завантажуються один раз; якщо API недоступний — null.

import { api } from "./api.js";

export const configReady = api("/api/config").catch(() => null);
