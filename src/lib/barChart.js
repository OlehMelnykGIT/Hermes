// Маленький стовпчиковий графік однієї серії (картки статистики).
//
// - одна серія → без легенди: назву дає заголовок картки;
// - стовпчик з current: true (поточний день) — насичений колір, решта — приглушені;
// - тонкі стовпчики з проміжком 2px, верх заокруглений, низ спирається на базову лінію;
// - підписи: лише перша й остання дата під графіком (не число на кожному стовпчику);
// - наведення: підказка «дата: значення» на всю висоту колонки (ціль більша за стовпчик);
// - доступність: aria-label містить усі значення текстом.
//
// Стилі (кольори) — у styles/components.css, бо CSP забороняє атрибут style.

import { html, raw } from "./html.js";

const WIDTH = 280;
const HEIGHT = 64;
const GAP = 2;
const RADIUS = 3;

// Стовпчик із заокругленим верхом і прямим низом.
function barPath(x, y, w, h) {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// points: [{ label, value, current? }] у хронологічному порядку; title — назва для aria-label.
export function barChart(points, { title, firstLabel, lastLabel }) {
  if (points.length === 0) return "";
  const max = Math.max(1, ...points.map((p) => p.value));
  const barWidth = (WIDTH - GAP * (points.length - 1)) / points.length;
  const summary = points.map((p) => `${p.label}: ${p.value}`).join(", ");

  const bars = points.map((point, i) => {
    const x = i * (barWidth + GAP);
    const h = Math.max(point.value > 0 ? 2 : 0, (point.value / max) * (HEIGHT - 4));
    return html`<g class="bar-col">
      <title>${point.label}: ${point.value}</title>
      <rect class="bar-hit" x="${x}" y="0" width="${barWidth}" height="${HEIGHT}"></rect>
      <path class="bar ${point.current ? "bar--current" : ""}" d="${barPath(x, HEIGHT - h, barWidth, h)}"></path>
    </g>`;
  });

  return html`<figure class="mini-chart">
    <svg viewBox="0 0 ${WIDTH} ${HEIGHT + 1}" preserveAspectRatio="none" role="img" aria-label="${title}: ${summary}">
      ${bars}
      ${raw(`<line class="baseline" x1="0" x2="${WIDTH}" y1="${HEIGHT + 0.5}" y2="${HEIGHT + 0.5}" vector-effect="non-scaling-stroke"></line>`)}
    </svg>
    <figcaption><span>${firstLabel}</span><span>${lastLabel}</span></figcaption>
  </figure>`;
}
