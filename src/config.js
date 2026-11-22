import { api } from "./api.js";

// Налаштування з сервера завантажуються один раз; у `npm run dev` без .env.local — null.
export const configReady = api("/api/config").catch(() => null);
