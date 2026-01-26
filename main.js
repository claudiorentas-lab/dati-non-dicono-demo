
/* =========================================================
   ✅ TESSERACT.JS – IMPORT CORRETTO (DEFAULT EXPORT)
   ========================================================= */
import Tesseract from "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js";

/* =========================================================
   ✅ DOM
   ========================================================= */
const fileInput = document.getElementById("fileInput");
const btnAnalyze = document.getElementById("btnAnalyze");
const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug");

let imgFile = null;
let lastOCRText = "";

/* =========================================================
   ✅ STATUS HELPER
   ========================================================= */
function setStatus(msg) {
  statusEl.textContent = msg;
}

/* =========================================================
   ✅ OCR (ROBUSTO, FUNZIONA SU GITHUB PAGES)
   ========================================================= */
async function runOCR(imageFile) {
  const worker = await Tesseract.createWorker({
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
    corePath:
      "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.1/tesseract-core-simd.wasm",
    logger: (m) => {
      if (m.status === "recognizing text") {
        setStatus(`OCR… ${Math.round((m.progress || 0) * 100)}%`);
      }
    },
  });

  await worker.loadLanguage("eng");
  await worker.initialize("eng");

  const { data } = await worker.recognize(imageFile);

  await worker.terminate();
  return data.text || "";
}

/* =========================================================
   ✅ UI EVENTS
   ========================================================= */
fileInput.addEventListener("change", () => {
  imgFile = fileInput.files[0] || null;
  btnAnalyze.disabled = !imgFile;
  setStatus(imgFile ? `File pronto: ${imgFile.name}` : "Carica un'immagine.");
});

btnAnalyze.addEventListener("click", async () => {
  if (!imgFile) return;

  btnAnalyze.disabled = true;
  debugEl.textContent = "";
  setStatus("OCR in corso…");

  try {
    lastOCRText = await runOCR(imgFile);
    debugEl.textContent = lastOCRText || "(vuoto)";
    setStatus("OCR completato.");
  } catch (err) {
    console.error(err);
    setStatus("Errore OCR. Vedi console.");
  } finally {
    btnAnalyze.disabled = false;
  }
});

/* =========================================================
   ✅ P5.JS — TUTTO DENTRO LO SKETCH (NESSUN WARNING)
   ========================================================= */
const sketch = (p) => {
  p.setup = () => {
    const c = p.createCanvas(500, 200);
    c.parent("canvasMount");
    p.textSize(14);
  };

  p.draw = () => {
    p.background(245);

    // ✅ dist() USATA CORRETTAMENTE
    const d = p.dist(p.mouseX, p.mouseY, p.width / 2, p.height / 2);

    p.fill(0);
    p.text("Muovi il mouse", 10, 20);
    p.text(`dist: ${Math.round(d)}`, 10, 40);

    // Visual basata sull'OCR (se presente)
    if (lastOCRText) {
      p.text("OCR presente ✔", 10, 70);
    }
  };
};

new p5(sketch);
