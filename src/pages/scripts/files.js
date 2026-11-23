// Файли макросів. Тут лише назви й адреси — сам код завантажується тільки тоді,
// коли файл відкривають на сторінці «Makra VBA» (головний скрипт сайту лишається легким).

import stolUrl from "../../../StolPaletB3.txt?url";
import replenUrl from "../../../ReplenPrint.txt?url";

const loadText = (url) => () =>
  fetch(url, { credentials: "same-origin" }).then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  });

export const files = [
  { name: "StolPaletB3.txt", descKey: "scripts.desc.stol", url: stolUrl, load: loadText(stolUrl) },
  { name: "ReplenPrint.txt", descKey: "scripts.desc.replen", url: replenUrl, load: loadText(replenUrl) },
];
