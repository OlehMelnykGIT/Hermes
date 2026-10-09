import './style.css';
import stol from '../StolPaletB3.txt?raw';
import replen from '../ReplenPrint.txt?raw';
import stolUrl from '../StolPaletB3.txt?url';
import replenUrl from '../ReplenPrint.txt?url';

const files = [
  { name: 'StolPaletB3.txt', description: 'Сортування адрес місць у таблиці Excel.', content: stol, url: stolUrl },
  { name: 'ReplenPrint.txt', description: 'Підготовка звіту зі штрихкодами до друку.', content: replen, url: replenUrl },
];
document.querySelector('#app').innerHTML = `
  <header><a class="brand" href="#">H<span>Hermes</span></a><span class="badge">Бібліотека макросів</span></header>
  <main><section class="intro"><p class="eyebrow">РОБОЧІ ІНСТРУМЕНТИ</p><h1>Усе потрібне.<br><span>В одному місці.</span></h1><p>Виберіть файл, щоб переглянути код, скопіювати його або завантажити.</p></section>
  <nav class="files" aria-label="Вибір файлу">${files.map(file => `<a class="file" href="#${file.name}"><span class="icon" aria-hidden="true">&lt;/&gt;</span><div><span class="type">EXCEL · VBA</span><h2>${file.name}</h2><p>${file.description}</p></div><span class="arrow" aria-hidden="true">↗</span></a>`).join('')}</nav>
  <section id="viewer" aria-labelledby="filename" hidden><div class="toolbar"><div><h2 id="filename"></h2><p id="info"></p></div><div class="actions"><button id="copy" type="button">Копіювати код</button><a id="download">Завантажити ↓</a></div></div><pre tabindex="0" aria-label="Вміст вибраного файлу"><code id="code"></code></pre><div class="viewer-footer"><span>Перегляд коду · Для запуску потрібен Excel</span><span id="status" role="status" aria-live="polite"></span></div></section>
  <div id="empty">Виберіть один із двох файлів вище, щоб відкрити його вміст.</div></main>
  <footer>Hermes<span>2 файли · Excel VBA</span></footer>`;
let selected;
function selectFile() {
  selected = files.find(file => `#${file.name}` === location.hash);
  document.querySelector('#viewer').hidden = !selected;
  document.querySelector('#empty').hidden = Boolean(selected);
  document.querySelectorAll('.file').forEach((link, index) => {
    if (files[index] === selected) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('#status').textContent = '';
  if (!selected) return;
  document.querySelector('#filename').textContent = selected.name;
  document.querySelector('#info').textContent = `${selected.content.trimEnd().split('\n').length} рядків · Текстовий файл`;
  document.querySelector('#code').textContent = selected.content;
  const download = document.querySelector('#download');
  download.href = selected.url;
  download.download = selected.name;
  document.querySelector('pre').scrollTo(0, 0);
}
document.querySelector('#copy').addEventListener('click', async () => {
  if (!selected) return;
  const file = selected;
  try {
    await navigator.clipboard.writeText(file.content);
    if (selected === file) document.querySelector('#status').textContent = 'Код скопійовано';
  } catch {
    if (selected === file) document.querySelector('#status').textContent = 'Не вдалося скопіювати. Виділіть код і скопіюйте вручну.';
  }
});
window.addEventListener('hashchange', selectFile);
selectFile();
