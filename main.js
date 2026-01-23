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
    const stream = canvas.captureStream(30);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });

    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dati-non-dicono_demo.webm";
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("Video pronto (download avviato).");
      btnVideo.disabled = false;
    };

    rec.start();
    setTimeout(() => rec.stop(), 10_000);
  } catch (e) {
    console.error(e);
    setStatus("Errore registrazione video (browser/codec). Prova Chrome/Edge.");
    btnVideo.disabled = false;
  }
});

// ---- Data extraction (più robusta)
function normalizeOCRText(text) {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/€/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumbers(text) {
  const matches = text.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g) || [];
  const nums = matches
    .map(s => s.replace(/\s/g, ""))
    .map(s => {
      const hasComma = s.includes(",");
      const hasDot = s.includes(".");
      if (hasComma && hasDot) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(",", ".");
      }
      return Number(s);
    })
    .filter(n => Number.isFinite(n))
    .filter(n => Math.abs(n) < 1e9);
  return nums;
}

function extractNumbersFromText(text, schema) {
  const clean = normalizeOCRText(text);
  const nums = parseNumbers(clean);

  const out = { ...schema.values };
  const keys = schema.order;
  for (let i = 0; i < keys.length; i++) out[keys[i]] = nums[i] ?? 0;

  return out;
}

function renderFields(values, schema) {
  fieldsEl.innerHTML = "";
  for (const key of schema.order) {
    const label = document.createElement("label");
    label.textContent = schema.labels[key] ?? key;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
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

// ---- Regenerate from confirmed (✅ vero output)
function regenerateFromConfirmed() {
  const features = toFeatureVector(confirmed, defaultSchema);
  current = interpretHumanism(confirmed, features, defaultSchema);

  narrativeEl.innerHTML = `
    <p>${escapeHtml(current.text)}</p>
    <p class="muted small">${escapeHtml(current.summaryLine)}</p>
  `;

  mountSketch(current);
}

// ---- Visual: colore + 3D finto + composizione contemporanea
function mountSketch(state) {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }

  const W = canvasMount.clientWidth;
  const H = Math.max(460, Math.floor(W * 0.70));

  const sketch = (p) => {
    let t = 0;

    const palette = state.palette;
    const params = state.params;

    function hexToRgb(hex) {
      const h = hex.replace("#", "");
      const bigint = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
      return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    }
    function fillHex(hex, a = 255) {
      const { r, g, b } = hexToRgb(hex);
      p.fill(r, g, b, a);
    }
    function strokeHex(hex, a = 255) {
      const { r, g, b } = hexToRgb(hex);
      p.stroke(r, g, b, a);
    }

    p.setup = () => {
      const c = p.createCanvas(W, H);
      c.parent(canvasMount);
      p.pixelDensity(1);
      p.noiseDetail(3, 0.45);
    };

    p.draw = () => {
      t += 0.012;

      p.noStroke();
      fillHex(palette.bg, 255);
      p.rect(0, 0, p.width, p.height);

      // fog
      for (let i = 0; i < 8; i++) {
        fillHex(palette.fog, 18);
        const rx = p.width * p.noise(i * 10.1, t * 0.2);
        const ry = p.height * p.noise(i * 12.7, t * 0.2 + 2);
        const rr = p.lerp(140, 320, p.noise(i * 4.3, t * 0.15));
        p.ellipse(rx, ry, rr, rr);
      }

      const cx = p.width * 0.52 + Math.sin(t * 0.8) * params.parallax;
      const cy = p.height * 0.52 + Math.cos(t * 0.6) * params.parallax;

      p.translate(cx, cy);

      const layers = params.layers;
      const depth = params.depth;

      const voidR = params.voidRadius;
      const voidX = Math.sin(t * 0.7) * params.voidDrift;
      const voidY = Math.cos(t * 0.5) * params.voidDrift;

      for (let i = layers; i >= 0; i--) {
        const z = i * depth;

        const sc = 1 - i * params.layerShrink;
        const alpha = p.map(i, 0, layers, 230, 65);

        const wobX = Math.sin(t * 0.9 + i * 0.6) * params.layerWobble;
        const wobY = Math.cos(t * 0.7 + i * 0.6) * params.layerWobble;

        p.push();
        p.translate(wobX, wobY);

        // shadow
        p.noStroke();
        fillHex(palette.shadow, 55);
        p.ellipse(10, 16 + z * 0.04, 280 * sc, 170 * sc);

        // blob
        p.strokeWeight(params.stroke);
        strokeHex(palette.line, Math.min(180, alpha));

        const isAccent = (i % 3 === 0);
        const fillCol = isAccent ? palette.accent1 : palette.primary;

        fillHex(fillCol, Math.min(210, alpha));
        p.scale(sc);

        p.beginShape();
        const step = 0.42;
        for (let a = 0; a < p.TWO_PI + 0.01; a += step) {
          const base = params.baseRadius;
          const amp = params.radiusAmp;

          const n = p.noise(
            Math.cos(a) * 0.8 + i * 2.2,
            Math.sin(a) * 0.8 + t * 0.7
          );

          let r = base + n * amp;

          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          const d = Math.hypot(x - voidX, y - voidY);
          if (d < voidR) r *= p.map(d, 0, voidR, 0.15, 1);

          p.vertex(Math.cos(a) * r, Math.sin(a) * r);
        }
        p.endShape(p.CLOSE);

        // details
        if (params.detail > 0) {
          strokeHex(palette.accent2, 80);
          p.strokeWeight(1);

          const pts = Math.floor(p.lerp(8, 32, params.detail));
          for (let k = 0; k < pts; k++) {
            const a = p.random(p.TWO_PI);
            const rr = p.random(params.baseRadius * 0.3, params.baseRadius * 1.05);
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;

            const d = Math.hypot(x - voidX, y - voidY);
            if (d < voidR) continue;

            p.point(x, y);

            if (k % 5 === 0) {
              const x2 = x + p.noise(k * 0.2, t) * 18;
              const y2 = y + p.noise(k * 0.2 + 3, t) * 18;
              p.line(x, y, x2, y2);
            }
          }
        }

        p.pop();
      }

      // void outline
      p.noFill();
      strokeHex(palette.line, 70);
      p.strokeWeight(1);
      p.ellipse(voidX, voidY, voidR * 2, voidR * 2);

      // outlier mark
      if (params.outlierMark > 0.2) {
        p.push();
        p.translate(-p.width * 0.32, -p.height * 0.26);
        strokeHex(palette.accent1, 170);
        p.strokeWeight(2);
        const s = p.lerp(18, 60, params.outlierMark);
        p.line(-s, 0, s, 0);
        p.line(0, -s, 0, s);
        p.pop();
      }

      // caption
      p.resetMatrix();
      p.noStroke();
      fillHex(palette.caption, 210);
      p.textSize(12);
      p.text(state.caption, 14, p.height - 14);
    };
  };

  p5Instance = new p5(sketch);
}
