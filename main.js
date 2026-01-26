
// ✅ IMPORT TESSERACT (ESM UFFICIALE)
import { createWorker } from "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js";

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

let imgFile = null;

// ---- Helpers
function setStatus(msg) {
  statusEl.textContent = msg;
}

// ---- OCR (ROBUSTO PER GITHUB PAGES)
async function runOCR(imageFile) {
  const worker = await createWorker({
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.1/tesseract-core-simd.wasm",
    logger: m => {
      if (m.status === "recognizing text") {
        setStatus(`OCR… ${Math.round((m.progress || 0) * 100)}%`);
      }
    }
  });

  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const { data } = await worker.recognize(imageFile);
  await worker.terminate();

  return data.text || "";
}

// ---- UI INIT
setStatus("Carica uno screenshot e clicca Analizza (OCR).");
btnAnalyze.disabled = true;
btnToggleValues.disabled = true;
valuesBox.classList.add("hidden");

fileInput.addEventListener("change", () => {
  imgFile = fileInput.files[0] || null;
  btnAnalyze.disabled = !imgFile;
  setStatus(imgFile ? `File pronto: ${imgFile.name}` : "Carica uno screenshot.");
});

btnAnalyze.addEventListener("click", async () => {
  if (!imgFile) return;

  btnAnalyze.disabled = true;
  debugEl.textContent = "";
  narrativeEl.innerHTML = "";
  valuesBox.classList.add("hidden");

  try {
    setStatus("OCR in corso…");
    const text = await runOCR(imgFile);

    debugEl.textContent = text || "(vuoto)";
    narrativeEl.innerHTML = `<pre>${text}</pre>`;

    btnToggleValues.disabled = false;
    setStatus("OCR completato.");
  } catch (err) {
    console.error(err);
    setStatus("Errore OCR. Vedi console.");
  } finally {
    btnAnalyze.disabled = false;
  }
});

btnToggleValues.addEventListener("click", () => {
  valuesBox.classList.toggle("hidden");
});

btnHide.addEventListener("click", () => {
  valuesBox.classList.add("hidden");
});

btnApply.addEventListener("click", () => {
  narrativeEl.innerHTML = "<p>Valori applicati.</p>";
  setStatus("Valori confermati.");
});
