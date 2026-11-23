// Безпечне складання HTML.
//
//   html`<p>${text}</p>`  — усі вставлені значення екрануються автоматично;
//   raw(markup)           — довірений HTML (іконки, вже зібрані фрагменти), без екранування.
//
// Масиви склеюються, а null / undefined / false не виводяться, тому зручно писати
// html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>` і ${condition && html`…`}.
// Результат можна одразу присвоїти element.innerHTML.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const raw = (markup) => new SafeHtml(String(markup ?? ""));

function render(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1];
  });
  return new SafeHtml(out);
}
