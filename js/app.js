// =======================
// CONFIG GENERAL
// =======================
const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie"];
const START = "08:00";
const END = "22:00";
const SLOT_MIN = 30; // grilla cada 30 min

// Catálogo (cursos) y selección actual
let allCourses = [];
let catalog = [];
let selected = [];

// URL de tu Web App (Google Apps Script)
const ALUMNOS_API_URL =
  "https://script.google.com/macros/s/AKfycby61QFbCuOgOmQr6_mPG-wZd8cpwcOAdbI6Bd1PUHNUtL-eZseKohzYeKr6RX2Nw6EGiw/exec";

// =======================
// ELEMENTOS DOM - CURSOS/HORARIO
// =======================
const nrcInput = document.getElementById("nrcInput");
const addByNrcBtn = document.getElementById("addByNrc");
const asigSelect = document.getElementById("asigSelect");
const secSelect = document.getElementById("secSelect");
const addBySelectBtn = document.getElementById("addBySelect");
const selectedList = document.getElementById("selectedList");
const ttGrid = document.getElementById("ttGrid");
const clearAllBtn = document.getElementById("clearAll");
const jornadaSelect = document.getElementById("jornadaSelect");

// =======================
// ELEMENTOS DOM - ALUMNO
// =======================
const rutInput = document.getElementById("rutInput");
const buscarRutBtn = document.getElementById("buscarRutBtn");

const alumnoBox = document.getElementById("alumnoBox");
const alNombre = document.getElementById("alNombre");
const alRut = document.getElementById("alRut");
const alCorreo = document.getElementById("alCorreo");
const alJornada = document.getElementById("alJornada");

// =======================
// ELEMENTOS DOM - PDF
// =======================
const genPdfBtn = document.getElementById("genPdfBtn");
const pdfForm = document.getElementById("pdfForm");
const pdfPayload = document.getElementById("pdfPayload");

// =======================
// HELPERS
// =======================
function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
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

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Normaliza RUT para el frontend (mismo criterio que Apps Script)
function normRutWeb(rut) {
  return String(rut || "")
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

// =======================
// UI: ALUMNO
// =======================
function clearAlumnoUI() {
  if (rutInput) rutInput.value = "";
  if (alumnoBox) alumnoBox.style.display = "none";
  if (alNombre) alNombre.textContent = "";
  if (alRut) alRut.textContent = "";
  if (alCorreo) alCorreo.textContent = "";
  if (alJornada) alJornada.textContent = "";
}

async function buscarAlumno() {
  const rut = normRutWeb(rutInput?.value);
  if (!rut) return alert("Escribe un RUT.");

  try {
    const url = `${ALUMNOS_API_URL}?rut=${encodeURIComponent(rut)}`;
    const res = await fetch(url, { cache: "no-store" });

    // Si el servidor devuelve HTML o algo raro, esto fallará. Capturamos abajo.
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || "Error desconocido");

    if (!data.alumno) {
      if (alumnoBox) alumnoBox.style.display = "none";
      alert("Alumno no encontrado.");
      return;
    }

    if (alNombre) alNombre.textContent = data.alumno.nombre_completo || "(sin nombre)";
    if (alRut) alRut.textContent = `RUT: ${data.alumno.rut || rut}`;
    if (alCorreo) alCorreo.textContent = `Correo: ${data.alumno.correo || "-"}`;
    if (alJornada) alJornada.textContent = `Jornada: ${data.alumno.jornada || "-"}`;
    if (alumnoBox) alumnoBox.style.display = "block";
  } catch (err) {
    console.error(err);
    alert("Error buscando alumno: " + (err?.message || err));
  }
}

// =======================
// JORNADA
// =======================
function applyJornadaFilter() {
  const jornada = jornadaSelect?.value || "Diurno";
  catalog = allCourses.filter((c) => (c.jornada || "Diurno") === jornada);

  // Seguridad: no mezclar jornadas
  selected = [];
  buildSelectors();
  renderAll();
}

// =======================
// CATÁLOGO
// =======================
async function loadCatalog() {
  try {
    const res = await fetch("data/courses.json?v=3", { cache: "no-store" });
    if (!res.ok) throw new Error(`No pude cargar courses.json (${res.status})`);

    allCourses = await res.json();

    // default Diurno
    catalog = allCourses.filter((c) => (c.jornada || "Diurno") === "Diurno");

    buildSelectors();
    buildGrid();
    renderAll();

    if (jornadaSelect) {
      jornadaSelect.addEventListener("change", () => {
        const ok = confirm("Cambiar jornada limpiará el horario actual. ¿Continuar?");
        if (!ok) {
          // revertir (simple)
          jornadaSelect.value = jornadaSelect.value === "Diurno" ? "Vespertino" : "Diurno";
          return;
        }
        applyJornadaFilter();
      });
    }
  } catch (err) {
    console.error(err);
    alert("Error cargando catálogo: " + (err?.message || err));
  }
}

function buildSelectors() {
  if (!asigSelect || !secSelect) return;

  const asigs = uniq(catalog.map((c) => c.asignatura))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  asigSelect.innerHTML = asigs
    .map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`)
    .join("");

  updateSectionOptions();

  // Evita duplicar listeners si llamas buildSelectors varias veces
  asigSelect.onchange = updateSectionOptions;
}

function updateSectionOptions() {
  if (!asigSelect || !secSelect) return;

  const asig = asigSelect.value;

  const secs = catalog
    .filter((c) => c.asignatura === asig)
    .sort(
      (a, b) =>
        String(a.seccion ?? "").localeCompare(String(b.seccion ?? "")) ||
        String(a.nrc ?? "").localeCompare(String(b.nrc ?? ""))
    );

  secSelect.innerHTML = secs
    .map((s) => {
      const label = `Sección ${s.seccion ?? "?"} — NRC ${s.nrc} — ${s.profesor}`;
      return `<option value="${escapeHtml(String(s.nrc))}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

// =======================
// GRILLA HORARIO
// =======================
function makeCell(text, cls) {
  const div = document.createElement("div");
  div.className = cls;
  div.textContent = text;
  return div;
}

function buildGrid() {
  if (!ttGrid) return;

  ttGrid.innerHTML = "";

  const startMin = toMin(START);
  const endMin = toMin(END);
  const totalSlots = Math.ceil((endMin - startMin) / SLOT_MIN);

  ttGrid.style.height = `${(totalSlots + 1) * 40}px`;

  // Encabezados
  ttGrid.appendChild(makeCell("", "cell time"));
  for (const d of DAYS) ttGrid.appendChild(makeCell(d, "cell"));

  // Filas
  for (let i = 0; i < totalSlots; i++) {
    const t = startMin + i * SLOT_MIN;
    const label = i % 2 === 0 ? minToTime(t) : "";
    ttGrid.appendChild(makeCell(label, "cell time"));

    for (let j = 0; j < DAYS.length; j++) {
      ttGrid.appendChild(makeCell("", "cell"));
    }
  }
}

// =======================
// SELECCIONADOS + TOPES
// =======================
function renderAll() {
  renderSelectedList();
  renderBlocks();
}

function renderSelectedList() {
  if (!selectedList) return;

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
      selected = selected.filter((s) => s.nrc !== sec.nrc);
      renderAll();
    };

    li.appendChild(btn);
    selectedList.appendChild(li);
  }
}

function computeFlatBlocks() {
  const blocks = [];
  for (const sec of selected) {
    for (const h of sec.horarios || []) {
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
  const out = blocks.map((b) => ({ ...b, conflict: false, conflictWith: [] }));
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
  if (!ttGrid) return;

  ttGrid.querySelectorAll(".block").forEach((el) => el.remove());

  const startMin = toMin(START);
  const endMin = toMin(END);

  const allCells = ttGrid.querySelectorAll(".cell");
  const timeCells = ttGrid.querySelectorAll(".cell.time");
  const dayCells = ttGrid.querySelectorAll(".cell:not(.time)");

  const firstTimeCell = timeCells[0] || null;
  const firstBodyDayCell = dayCells[5] || null;

  const rowH =
    firstBodyDayCell?.getBoundingClientRect().height ||
    allCells[0]?.getBoundingClientRect().height ||
    40;

  const timeColW = firstTimeCell?.getBoundingClientRect().width || 64;
  const dayW =
    firstBodyDayCell?.getBoundingClientRect().width ||
    (ttGrid.clientWidth - timeColW) / 5;

  const pad = 6;

  const blocks = markConflicts(computeFlatBlocks());

  for (const b of blocks) {
    const topMin = clamp(b.inicioMin, startMin, endMin);
    const botMin = clamp(b.finMin, startMin, endMin);
    if (botMin <= startMin || topMin >= endMin) continue;

    const dayIndex = DAYS.indexOf(b.dia);
    if (dayIndex === -1) continue;

    const topBase = rowH; // 1 fila encabezado
    const topPx = topBase + ((topMin - startMin) / SLOT_MIN) * rowH;
    const heightPx = ((botMin - topMin) / SLOT_MIN) * rowH;

    const leftPx = timeColW + dayIndex * dayW + pad;
    const widthPx = dayW - pad * 2;

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

// =======================
// AGREGAR SECCIONES
// =======================
function addSection(sec) {
  if (!sec) return;

  const j = jornadaSelect?.value || "Diurno";
  if ((sec.jornada || "Diurno") !== j) {
    alert("Esa sección es de otra jornada.");
    return;
  }

  if (selected.some((s) => s.nrc === sec.nrc)) return;
  selected.push(sec);
  renderAll();
}

// =======================
// GENERAR PDF (POST payload)
// =======================
function generarPdf() {
  const rut = normRutWeb(rutInput?.value);
  if (!rut) return alert("Ingresa el RUT del alumno.");
  if (selected.length === 0) return alert("No hay cursos seleccionados.");

  if (!pdfForm || !pdfPayload) {
    alert("Falta el form oculto pdfForm/pdfPayload en el HTML.");
    return;
  }

  const cursos = selected.map((s) => ({
    nrc: String(s.nrc),
    asignatura: String(s.asignatura || ""),
    seccion: String(s.seccion || ""),
    profesor: String(s.profesor || ""),
    horarios: Array.isArray(s.horarios) ? s.horarios : [],
    nivel: String(s.nivel || ""),
    jornada: String(s.jornada || ""),
  }));

  const body = {
    action: "generatePdf",
    rut,
    jornada: jornadaSelect?.value || "Diurno",
    cursos,
  };

  pdfForm.action = ALUMNOS_API_URL;
  pdfPayload.value = JSON.stringify(body);
  pdfForm.submit();
}

// =======================
// EVENTOS
// =======================
if (addByNrcBtn) {
  addByNrcBtn.addEventListener("click", () => {
    const nrc = nrcInput?.value?.trim();
    if (!nrc) return;

    const sec = catalog.find((c) => String(c.nrc) === String(nrc));
    if (!sec) {
      alert("No encontré ese NRC en el catálogo.");
      return;
    }

    addSection(sec);
    if (nrcInput) nrcInput.value = "";
  });
}

if (addBySelectBtn) {
  addBySelectBtn.addEventListener("click", () => {
    const nrc = secSelect?.value;
    const sec = catalog.find((c) => String(c.nrc) === String(nrc));
    addSection(sec);
  });
}

if (clearAllBtn) {
  clearAllBtn.addEventListener("click", () => {
    selected = [];
    renderAll();
    clearAlumnoUI();
  });
}

window.addEventListener("resize", () => {
  renderBlocks();
});

if (buscarRutBtn) {
  buscarRutBtn.addEventListener("click", buscarAlumno);
}

if (genPdfBtn) {
  genPdfBtn.addEventListener("click", generarPdf);
}

// =======================
// INIT
// =======================
loadCatalog();
