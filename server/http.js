// Спільні відповіді для /api/*: завжди JSON і без кешування (дані робочі та змінюються).

export const NO_STORE = { "Cache-Control": "no-store" };

export const json = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

export const fail = (error, status) => json({ error }, status);
