import { defaultSchema, toFeatureVector, interpretHumanism } from "./humanism.js";

// ---- DOM
const fileInput = document.getElementById("fileInput");
const btnAnalyze = document.getElementById("btnAnalyze");
const btnVideo = document.getElementById("btnVideo");
const btnToggleValues = document.getElementById("btnToggleValues");

const statusEl = document.getElementById("status");
const narrativeEl = document.getElementById("narrative");
const debugEl = document.getElementById("debug");

const valuesBox = document.getElementById("valuesBox");
const fieldsEl = document.getElementById("fields");
const btnApply = document.getElementById("btnApply");
const btnHide = document.getElementById("btnHide");

const canvasMount = document.getElementById("canvasMount");

// ---- State
let imgFile = null;
let ocrText = "";
let extracted = { ...defaultSchema.values };     // valori OCR (proposti)
let confirmed = { ...defaultSchema.values };     // valori confermati dall’utente
let current = null;                              // interpretazione corrente
let p5Instance = null;

// ---- Helpers
function setStatus(msg) { statusEl.textContent = msg; }
function enable(on) { btnAnalyze.disabled = !on; }
function qsAll(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ---- UI init
setStatus("Carica uno screenshot.");
enable(false);
btnVideo.disabled = true;
btnToggleValues.disabled = true;
valuesBox.classList.add("hidden");

// ---- Events
fileInput.addEventListener("change", () => {
  imgFile = fileInput.files?.[0] || null;
  if (!imgFile) {
    enable(false);
    btnVideo.disabled = true;
    btnToggleValues.disabled = true;
    setStatus("Carica uno screenshot.");
    return;
  }
  enable(true);
  btnVideo.disabled = true;
  btnToggleValues.disabled = true;
  setStatus(`File pronto: ${imgFile.name}`);
});

btnToggleValues.addEventListener("click", () => {
  valuesBox.classList.toggle("hidden");
});

btnHide.addEventListener("click", () => {
  valuesBox.classList.add("hidden");
});

// ✅ genera SOLO dopo conferma
btnApply.addEventListener("click", () => {
  confirmed = readFieldsIntoValues();
  valuesBox.classList.add("hidden");
  regenerateFromConfirmed();
  btnVideo.disabled = false;
  setStatus("Visual generato dai valori confermati.");
});

btnAnalyze.addEventListener("click", async () => {
  if (!imgFile) return;

  btnAnalyze.disabled = true;
  btnVideo.disabled = true;
  btnToggleValues.disabled = true;

  narrativeEl.innerHTML = `<p class="muted">In attesa di valori confermati.</p>`;
  debugEl.textContent = "";
  valuesBox.classList.add("hidden");

  try {
    setStatus("OCR in corso…");

    const url = URL.createObjectURL(imgFile);
    const { data } = await Tesseract.recognize(url, "ita", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round((m.progress || 0) * 100);
          setStatus(`OCR… ${pct}%`);
        }
      }
    });
    URL.revokeObjectURL(url);

    ocrText = (data?.text || "").trim();
    debugEl.textContent = ocrText || "(vuoto)";

    extracted = extractNumbersFromText(ocrText, defaultSchema);
    renderFields(extracted, defaultSchema);

    // Mostra campi da correggere
    btnToggleValues.disabled = false;
    valuesBox.classList.remove("hidden");
    setStatus("OCR completato. Correggi i valori e clicca “Applica & genera”.");

    // ⛔ NON rigeneriamo qui
  } catch (err) {
    console.error(err);
    setStatus("Errore OCR. Prova con screenshot più nitido o ritagliato.");
  } finally {
    btnAnalyze.disabled = false;
  }
});

btnVideo.addEventListener("click", () => {
  if (!p5Instance) return;

  const canvas = canvasMount.querySelector("canvas");
  if (!canvas) {
    setStatus("Nessun canvas trovato.");
    return;
  }

  setStatus("Registrazione video 10s…");
  btnVideo.disabled = true;

  try {
    c
