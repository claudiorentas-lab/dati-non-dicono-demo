import { defaultSchema } from "./humanism.js";

const fileInput = document.getElementById("fileInput");
const btnAnalyze = document.getElementById("btnAnalyze");
const btnToggleValues = document.getElementById("btnToggleValues");

const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug");

const valuesBox = document.getElementById("valuesBox");
const fieldsEl = document.getElementById("fields");
const btnApply = document.getElementById("btnApply");
const btnHide = document.getElementById("btnHide");

const narrativeEl = document.getElementById("narrative");

let imgFile = null;

function setStatus(s) { statusEl.textContent = s; }
function qsAll(sel, root=document){ return [...root.querySelectorAll(sel)]; }

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
  setStatus("Valori applicati (per ora solo output testuale).");
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

    // IMPORTANT: niente "ita.special-words". Usiamo solo CDN standard.
    const { data } = await Tesseract.recognize(url, "ita+eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          setStatus(`OCR… ${Math.round((m.progress || 0) * 100)}%`);
        }
      }
    });

    URL.revokeObjectURL(url);

    const text = (data?.text || "").trim();
    debugEl.textContent = text || "(vuoto)";

    const values = extractFromAccumuloScreen(text);
    renderFields(values);

    btnToggleValues.disabled = false;
    valuesBox.classList.remove("hidden");
    setStatus("OCR completato. Correggi se serve, poi Applica & genera.");
  } catch (e) {
    console.error(e);
    setStatus("Errore OCR. Controlla console.");
  } finally {
    btnAnalyze.disabled = false;
  }
});

// ---------- parsing mirato al tuo screenshot “Dati di accumulo”
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
  // prende il primo numero che segue: LABEL ... METRICA ... NUMERO
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

// ---------- fields UI
function renderFields(values){
  fieldsEl.innerHTML = "";
  for (const key of defaultSchema.order){
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

function readFieldsIntoValues(){
  const next = { ...defaultSchema.values };
  const inputs = qsAll("input[data-key]", fieldsEl);
  for (const inp of inputs){
    const k = inp.dataset.key;
    const v = Number(String(inp.value).replace(",","."));
    next[k] = Number.isFinite(v) ? v : 0;
  }
  return next;
}
