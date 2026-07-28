// =======================
// CONFIG GENERAL
// =======================
const DAYS = [
  { key: "Lun", label: "LUNES" },
  { key: "Mar", label: "MARTES" },
  { key: "Mie", label: "MIÉRCOLES" },
  { key: "Jue", label: "JUEVES" },
  { key: "Vie", label: "VIERNES" },
];

// Módulos institucionales de la Facultad de Derecho.
// Cada fila representa un bloque real, no intervalos genéricos de 30 minutos.
const FACULTY_MODULES = [
  { inicio: "08:00", fin: "08:40" },
  { inicio: "08:41", fin: "09:20" },
  { inicio: "09:30", fin: "10:10" },
  { inicio: "10:11", fin: "10:50" },
  { inicio: "11:00", fin: "11:40" },
  { inicio: "11:41", fin: "12:20" },
  { inicio: "12:30", fin: "13:10" },
  { inicio: "13:20", fin: "13:50", protegido: true, label: "BLOQUE PROTEGIDO" },
  { inicio: "14:00", fin: "14:40" },
  { inicio: "14:41", fin: "15:20" },
  { inicio: "15:30", fin: "16:10" },
  { inicio: "16:11", fin: "16:50" },
  { inicio: "17:00", fin: "17:40" },
  { inicio: "17:41", fin: "18:20" },
  { inicio: "18:30", fin: "19:10" },
];

// Se deja la estructura separada para poder incorporar después
// una grilla vespertina distinta sin tocar la lógica de dibujo.
const SCHEDULES = {
  Diurno: FACULTY_MODULES,
  Vespertino: FACULTY_MODULES,
};

const GRID_HEADER_PX = 44;
const GRID_ROW_PX = 52;

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
const creditTotal = document.getElementById("creditTotal");

function getCourseCredits(course) {
  const credits = Number(course?.creditos ?? 0);
  return Number.isFinite(credits) ? credits : 0;
}

function renderCreditTotal() {
  if (!creditTotal) return;

  const total = selected.reduce(
    (sum, course) => sum + getCourseCredits(course),
    0
  );

  creditTotal.textContent = total;
}

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
  buildGrid();
  renderAll();
}

// =======================
// CATÁLOGO
// =======================
async function loadCatalog() {
  try {
    const res = await fetch("data/courses.json?v=6", { cache: "no-store" });
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

function getActiveSchedule() {
  const jornada = jornadaSelect?.value || "Diurno";
  return SCHEDULES[jornada] || FACULTY_MODULES;
}

function setGridPosition(el, column, row) {
  el.style.gridColumn = String(column);
  el.style.gridRow = String(row);
  return el;
}

function buildGrid() {
  if (!ttGrid) return;

  ttGrid.innerHTML = "";

  const schedule = getActiveSchedule();
  ttGrid.style.gridTemplateRows = `${GRID_HEADER_PX}px repeat(${schedule.length}, ${GRID_ROW_PX}px)`;
  ttGrid.style.height = `${GRID_HEADER_PX + schedule.length * GRID_ROW_PX}px`;

  // Encabezados
  ttGrid.appendChild(setGridPosition(makeCell("MÓDULOS", "cell time header-cell"), 1, 1));
  DAYS.forEach((day, index) => {
    ttGrid.appendChild(setGridPosition(makeCell(day.label, "cell header-cell"), index + 2, 1));
  });

  // Filas por módulos institucionales
  schedule.forEach((module, rowIndex) => {
    const gridRow = rowIndex + 2;
    const range = `${module.inicio}–${module.fin}`;
    const timeClass = module.protegido
      ? "cell time module-cell protected-time"
      : "cell time module-cell";

    ttGrid.appendChild(setGridPosition(makeCell(range, timeClass), 1, gridRow));

    if (module.protegido) {
      const band = makeCell(module.label || "BLOQUE PROTEGIDO", "protected-band");
      band.style.gridColumn = "2 / 7";
      band.style.gridRow = String(gridRow);
      ttGrid.appendChild(band);
      return;
    }

    DAYS.forEach((_, dayIndex) => {
      ttGrid.appendChild(
        setGridPosition(makeCell("", "cell module-cell"), dayIndex + 2, gridRow)
      );
    });
  });
}

// =======================
// SELECCIONADOS + TOPES
// =======================
function renderAll() {
  renderSelectedList();
  renderBlocks();
  renderCreditTotal();
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

function findCoveredModuleRows(startMin, endMin, schedule) {
  return schedule
    .map((module, index) => ({
      ...module,
      index,
      inicioMin: toMin(module.inicio),
      finMin: toMin(module.fin),
    }))
    .filter(
      (module) =>
        !module.protegido &&
        overlaps(startMin, endMin, module.inicioMin, module.finMin)
    );
}

function renderBlocks() {
  if (!ttGrid) return;

  ttGrid.querySelectorAll(".block").forEach((el) => el.remove());

  const schedule = getActiveSchedule();
  const headerTimeCell = ttGrid.querySelector(".header-cell.time");
  const moduleColW = headerTimeCell?.getBoundingClientRect().width || 96;
  const dayW = (ttGrid.clientWidth - moduleColW) / DAYS.length;
  const padX = 5;
  const padY = 4;

  const blocks = markConflicts(computeFlatBlocks());

  for (const b of blocks) {
    const dayIndex = DAYS.findIndex((day) => day.key === b.dia);
    if (dayIndex === -1) continue;

    const coveredRows = findCoveredModuleRows(b.inicioMin, b.finMin, schedule);
    if (coveredRows.length === 0) continue;

    const firstRow = coveredRows[0].index;
    const lastRow = coveredRows[coveredRows.length - 1].index;
    const rowsSpanned = lastRow - firstRow + 1;

    const topPx = GRID_HEADER_PX + firstRow * GRID_ROW_PX + padY;
    const heightPx = rowsSpanned * GRID_ROW_PX - padY * 2;
    const leftPx = moduleColW + dayIndex * dayW + padX;
    const widthPx = dayW - padX * 2;

    const div = document.createElement("div");
    div.className = `block ${b.conflict ? "conflict" : "ok"}`;
    div.style.top = `${topPx}px`;
    div.style.left = `${leftPx}px`;
    div.style.height = `${Math.max(44, heightPx)}px`;
    div.style.width = `${widthPx}px`;
    div.title = `${b.asignatura} · NRC ${b.nrc} · ${b.profesor} · ${b.dia} ${minToTime(b.inicioMin)}–${minToTime(b.finMin)}`;

    div.innerHTML = `
      <strong>${escapeHtml(b.asignatura)}</strong>
      <div class="meta">NRC ${escapeHtml(b.nrc)} · Nivel ${escapeHtml(b.nivel)}</div>
      <div class="meta professor">${escapeHtml(b.profesor)}</div>
      <div class="meta">${minToTime(b.inicioMin)}–${minToTime(b.finMin)}</div>
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

    const sec = catalog.find(
      (c) => String(c.nrc) === String(nrc)
    );

    if (!sec) {
      alert("No encontré ese NRC en el catálogo.");
      return;
    }

    addSection(sec);

    if (nrcInput) {
      nrcInput.value = "";
      nrcInput.focus();
    }
  });
}

// Permitir agregar el NRC presionando Enter
if (nrcInput) {
  nrcInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addByNrcBtn?.click();
    }
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
