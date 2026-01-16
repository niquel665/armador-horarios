const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie"];
const START = "08:00";
const END = "22:00";
const SLOT_MIN = 30; // grilla cada 30 min

let catalog = [];
let selected = [];

const nrcInput = document.getElementById("nrcInput");
const addByNrcBtn = document.getElementById("addByNrc");
const asigSelect = document.getElementById("asigSelect");
const secSelect = document.getElementById("secSelect");
const addBySelectBtn = document.getElementById("addBySelect");
const selectedList = document.getElementById("selectedList");
const ttGrid = document.getElementById("ttGrid");
const clearAllBtn = document.getElementById("clearAll");

function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function uniq(arr) {
  return [...new Set(arr)];
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function loadCatalog() {
  const res = await fetch("data/courses.json");
  catalog = await res.json();
  buildSelectors();
  buildGrid();
  renderAll();
}

function buildSelectors() {
  const asigs = uniq(catalog.map(c => c.asignatura)).sort((a,b)=>a.localeCompare(b));
  asigSelect.innerHTML = asigs.map(a => `<option value="${escapeHtml(a)}">${a}</option>`).join("");
  updateSectionOptions();
  asigSelect.addEventListener("change", updateSectionOptions);
}

function updateSectionOptions() {
  const asig = asigSelect.value;
  const secs = catalog
    .filter(c => c.asignatura === asig)
    .sort((a,b) => (a.seccion ?? "").localeCompare(b.seccion ?? "") || (a.nrc ?? "").localeCompare(b.nrc ?? ""));
  secSelect.innerHTML = secs.map(s => {
    const label = `Sección ${s.seccion ?? "?"} — NRC ${s.nrc} — ${s.profesor}`;
    return `<option value="${s.nrc}">${escapeHtml(label)}</option>`;
  }).join("");
}

function buildGrid() {
  // grid: columna 0 = horas, columnas 1..5 = días, filas = slots
  ttGrid.innerHTML = "";

  const startMin = toMin(START);
  const endMin = toMin(END);
  const totalSlots = Math.ceil((endMin - startMin) / SLOT_MIN);

  // Header row (dibujado como celdas en primera fila)
  // Construimos toda la grilla como celdas para que se vea “tabla”
  // fila 0: encabezados
  // luego slots
  // La posición absoluta de bloques se calcula sobre el contenedor.
  ttGrid.style.height = `${(totalSlots + 1) * 40}px`;

  // Encabezados
  ttGrid.appendChild(makeCell("", "cell time"));
  for (const d of DAYS) ttGrid.appendChild(makeCell(d, "cell"));

  // Filas
  for (let i = 0; i < totalSlots; i++) {
    const t = startMin + i * SLOT_MIN;
    const label = (i % 2 === 0) ? minToTime(t) : "";
    ttGrid.appendChild(makeCell(label, "cell time"));

    for (let j = 0; j < DAYS.length; j++) {
      ttGrid.appendChild(makeCell("", "cell"));
    }
  }
}

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
}

function makeCell(text, cls) {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  return div;
}

function renderAll() {
  renderSelectedList();
  renderBlocks();
}

function renderSelectedList() {
  selectedList.innerHTML = "";
  if (selected.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nada seleccionado aún.";
    selectedList.appendChild(li);
    return;
  }

  for (const sec of selected) {
    const li = document.createElement("li");
    li.textContent = `${sec.asignatura} (NRC ${sec.nrc}, Sec ${sec.seccion}) — ${sec.profesor} — Nivel ${sec.nivel}`;
    const btn = document.createElement("button");
    btn.textContent = "Quitar";
    btn.onclick = () => {
      selected = selected.filter(s => s.nrc !== sec.nrc);
      renderAll();
    };
    li.appendChild(btn);
    selectedList.appendChild(li);
  }
}

function computeFlatBlocks() {
  // “aplana” horarios (una sección puede tener varios días)
  // devuelve: { nrc, asignatura, profesor, nivel, dia, inicioMin, finMin, seccion }
  const blocks = [];
  for (const sec of selected) {
    for (const h of sec.horarios) {
      blocks.push({
        nrc: sec.nrc,
        asignatura: sec.asignatura,
        profesor: sec.profesor,
        nivel: sec.nivel,
        seccion: sec.seccion,
        dia: h.dia,
        inicioMin: toMin(h.inicio),
        finMin: toMin(h.fin),
      });
    }
  }
  return blocks;
}

function markConflicts(blocks) {
  // marca conflicto si choca con otro bloque el mismo día
  const out = blocks.map(b => ({...b, conflict: false, conflictWith: []}));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      if (out[i].dia !== out[j].dia) continue;
      if (overlaps(out[i].inicioMin, out[i].finMin, out[j].inicioMin, out[j].finMin)) {
        out[i].conflict = true;
        out[j].conflict = true;
        out[i].conflictWith.push(out[j].nrc);
        out[j].conflictWith.push(out[i].nrc);
      }
    }
  }
  return out;
}

function renderBlocks() {
  // Borra bloques antiguos
  ttGrid.querySelectorAll(".block").forEach(el => el.remove());

  const startMin = toMin(START);
  const endMin = toMin(END);
  const rowH = 40;
  const colW = ttGrid.clientWidth / 6; // 6 columnas (hora + 5 días)
  const dayW = colW; // aprox
  const timeColW = colW;

  const blocks = markConflicts(computeFlatBlocks());

  for (const b of blocks) {
    // solo dibuja lo que cae dentro del rango visible
    const topMin = clamp(b.inicioMin, startMin, endMin);
    const botMin = clamp(b.finMin, startMin, endMin);
    if (botMin <= startMin || topMin >= endMin) continue;

    const dayIndex = DAYS.indexOf(b.dia);
    if (dayIndex === -1) continue;

    // +1 fila por encabezados
    const topPx = rowH + ((topMin - startMin) / SLOT_MIN) * rowH;
    const heightPx = ((botMin - topMin) / SLOT_MIN) * rowH;

    const leftPx = timeColW + dayIndex * dayW + 6; // padding visual
    const widthPx = dayW - 12;

    const div = document.createElement("div");
    div.className = `block ${b.conflict ? "conflict" : "ok"}`;
    div.style.top = `${topPx}px`;
    div.style.left = `${leftPx}px`;
    div.style.height = `${Math.max(44, heightPx)}px`;
    div.style.width = `${widthPx}px`;

    div.innerHTML = `
      <strong>${escapeHtml(b.asignatura)}</strong>
      <div class="meta">NRC ${escapeHtml(b.nrc)} · Sec ${escapeHtml(b.seccion)} · Nivel ${escapeHtml(b.nivel)}</div>
      <div class="meta">${escapeHtml(b.profesor)}</div>
      <div class="meta">${escapeHtml(b.dia)} ${minToTime(b.inicioMin)}–${minToTime(b.finMin)}</div>
      ${b.conflict ? `<span class="tag">TOPE</span>` : `<span class="tag">OK</span>`}
    `;
    ttGrid.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function addSection(sec) {
  if (!sec) return;
  if (selected.some(s => s.nrc === sec.nrc)) return; // evita duplicados por NRC
  selected.push(sec);
  renderAll();
}

addByNrcBtn.addEventListener("click", () => {
  const nrc = nrcInput.value.trim();
  const sec = catalog.find(c => String(c.nrc) === nrc);
  if (!sec) {
    alert("No encontré ese NRC en el catálogo.");
    return;
  }
  addSection(sec);
  nrcInput.value = "";
});

addBySelectBtn.addEventListener("click", () => {
  const nrc = secSelect.value;
  const sec = catalog.find(c => String(c.nrc) === String(nrc));
  addSection(sec);
});

clearAllBtn.addEventListener("click", () => {
  selected = [];
  renderAll();
});

window.addEventListener("resize", () => {
  // recalcula posiciones al cambiar el ancho
  renderBlocks();
});

loadCatalog();
