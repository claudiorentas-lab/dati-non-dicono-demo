import { defaultSchema } from "./humanism.js";

// ---- DOM
const fileInput = document.getElementById("fileInput");
const btnAnalyze = document.getElementById("btnAnalyze");
const btnToggleValues = document.getElementById("btnToggleValues");

const statusEl = document.getElementById("status");
const narrativeEl = document.getElementById("narrative");
const debugEl = document.getElementById("debug");

const valuesBox = document.getElementById("valuesBox");
const fieldsEl = document.getElementById("fields");
const btnApply = document.getElementById("btnApply");
const btnHide = document.getElementById("btnHide");

// ---- State
let imgFile = null;

// ---- Helpers
function setStatus(s) { statusEl.textContent = s; }
function qsAll(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function renderFields(values) {
  fieldsEl.innerHTML = "";
  for (const key of defaultSchema.order) {
    const label = document.createElement("label");
    label.textContent = defaultSchema.labels[key] ?? key;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.value = values[key] ?? 0;
    input.dataset.key = key;

    fieldsEl.appendChild(label);
    fieldsEl.appendChild(input);
  }
}

function readFieldsIntoValues() {
  const next = { ...defaultSchema.values };
  const inputs = qsAll("input[data-key]", fieldsEl);
  for (const inp of inputs) {
    const k = inp.dataset.key;
    const v = Number(String(inp.value).replace(",", "."));
    next[k] = Number.isFinite(v) ? v : 0;
  }
  return next;
}

function normalize(t){
  return String(t)
    .replace(/\u00A0/g," ")
    .replace(/[–—]/g,"-")
    .replace(/\s+/g," ")
    .trim();
}
function parseNum(s){
  if (!s) return null;
  let x = String(s).replace(/\s/g,"");
  const hasComma = x.includes(",");
  const hasDot = x.includes(".");
  if (hasComma && hasDot) x = x.replace(/\./g,"").replace(",",".");
  else x = x.replace(",",".");
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function pickCardValue(clean, labelRegex, metricRegex){
  const re = new RegExp(
    labelRegex.source + `[\\s\\S]{0,220}?` +
    metricRegex.source + `[\\s\\S]{0,80}?` +
    `(-?\\d{1,3}(?:[.\\s]\\d{3})*(?:[.,]\\d+)?|-?\\d+(?:[.,]\\d+)?)`,
    "i"
  );
  const m = clean.match(re);
  if (!m) return null;
  return parseNum(m[1]);
}

function extractFromAccumuloScreen(text){
  const clean = normalize(text);
  const out = { ...defaultSchema.values };

  out.ferie_giorni =
    pickCardValue(clean, /\bFerie\b/i, /\bResiduo\s+giorni\s+fine\s+mese\b/i) ?? 0;

  out.festivita_soppresse =
    pickCardValue(clean, /\bFestivit[aà]\s+soppresse\b/i, /\bResiduo\s+giorni\s+fine\s+mese\b/i) ?? 0;

  out.riposi_compensativi =
    pickCardValue(clean, /\bRiposi\s+compensativi\b/i, /\bResiduo\s+giorni\s+fine\s+mese\b/i) ?? 0;

  out.pozzetto_ore =
    pickCardValue(clean, /\bPozzetto\s+ore\b/i, /\bResiduo\s+ore\s+fine\s+mese\b/i) ?? 0;

  out.buoni_pasto =
    pickCardValue(clean, /\bBuoni\s+pasto\b/i, /\bAccumuli\s+nel\s+mese\b/i) ?? 0;

  out.straordinario_ore =
    pickCardValue(clean, /\bOre\s+straordinario\s+autorizzate\b/i, /\bResiduo\s+ore\s+autorizzate\b/i) ?? 0;

  return out;
}

// ---- OCR (worker) - SOLO ENG per evitare ita.special-words
async function runOCR(imageUrl) {
  const worker = await Tesseract.createWorker({
    logger: (m) => {
      // utile per debug
      if (m.status === "recognizing text") {
        setStatus(`OCR… ${Math.round((m.progress || 0) * 100)}%`);
      }
    }
  });

  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  // piccoli aiuti per numeri/colonne: whitelist
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789,.-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàèéìòùÀÈÉÌÒÙ ",
  });

  const { data } = await worker.recognize(imageUrl);
  await worker.terminate();

  return data?.text || "";
}

// ---- Init UI
setStatus("Carica uno screenshot e clicca Analizza (OCR).");
btnAnalyze.disabled = true;
btnToggleValues.disabled = true;
valuesBox.classList.add("hidden");
renderFields({ ...defaultSchema.values });

fileInput.addEventListener("change", () => {
  imgFile = fileInput.files?.[0] || null;
  btnAnalyze.disabled = !imgFile;
  setStatus(imgFile ? `File pronto: ${imgFile.name}` : "Carica uno screenshot.");
});

btnToggleValues.addEventListener("click", () => {
  valuesBox.classList.toggle("hidden");
});

btnHide.addEventListener("click", () => valuesBox.classList.add("hidden"));

btnApply.addEventListener("click", () => {
  const values = readFieldsIntoValues();
  narrativeEl.innerHTML = `<pre>${JSON.stringify(values, null, 2)}</pre>`;
  setStatus("Valori applicati (output testuale). Step 3: visual.");
});

btnAnalyze.addEventListener("click", async () => {
  if (!imgFile) return;

  btnAnalyze.disabled = true;
  btnToggleValues.disabled = true;
  valuesBox.classList.add("hidden");
  debugEl.textContent = "";
  narrativeEl.innerHTML = "";

  try {
    setStatus("OCR in corso…");
    const url = URL.createObjectURL(imgFile);

    const text = await runOCR(url);
    URL.revokeObjectURL(url);

    debugEl.textContent = text || "(vuoto)";

    const extracted = extractFromAccumuloScreen(text);
    renderFields(extracted);

    btnToggleValues.disabled = false;
    valuesBox.classList.remove("hidden");
    setStatus("OCR completato. Correggi valori e clicca Applica & genera.");
  } catch (e) {
    console.error(e);
    setStatus("Errore OCR. Vedi console.");
  } finally {
    btnAnalyze.disabled = false;
  }
});
