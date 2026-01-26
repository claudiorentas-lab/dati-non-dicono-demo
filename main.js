import { defaultSchema, interpretHumanismForKey } from "./humanism.js";

// ---- DOM (devono esistere in index.html)
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
let confirmed = { ...defaultSchema.values };
let p5Instance = null;

// ---- Helpers
function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }
function qsAll(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// ---- Init UI (questa iterazione non fa OCR: il bottone resta, ma non è prioritario)
setStatus("Carica uno screenshot (facoltativo) e inserisci/correggi i valori. Poi “Applica & genera”.");
if (btnAnalyze) btnAnalyze.disabled = true; // per ora: non usiamo OCR
if (btnVideo) btnVideo.disabled = true;
if (btnToggleValues) btnToggleValues.disabled = false;

if (valuesBox) valuesBox.classList.add("hidden");
if (debugEl) debugEl.textContent = "";

renderFields(confirmed, defaultSchema);

// ---- Events
if (fileInput) {
  fileInput.addEventListener("change", () => {
    imgFile = fileInput.files?.[0] || null;
    if (imgFile) setStatus(`Screenshot caricato: ${imgFile.name}. Ora conferma i valori.`);
  });
}

if (btnToggleValues) {
  btnToggleValues.addEventListener("click", () => {
    if (!valuesBox) return;
    valuesBox.classList.toggle("hidden");
  });
}

if (btnHide) {
  btnHide.addEventListener("click", () => {
    if (!valuesBox) return;
    valuesBox.classList.add("hidden");
  });
}

if (btnApply) {
  btnApply.addEventListener("click", () => {
    confirmed = readFieldsIntoValues();
    if (valuesBox) valuesBox.classList.add("hidden");

    // testo narrativo generale (breve) + visual
    const top = topEntry(confirmed);
    const general = `Ritratto dati: il valore dominante è ${top.label} (${formatNum(top.value)}). Passa il mouse sulle meduse per leggere il significato “humanism” di ogni dato.`;
    if (narrativeEl) narrativeEl.innerHTML = `<p>${escapeHtml(general)}</p>`;

    mountSketch({ values: confirmed });
    if (btnVideo) btnVideo.disabled = false;
    setStatus("Visual generato. Hover sulle meduse per la spiegazione.");
  });
}

// Video export (opzionale)
if (btnVideo) {
  btnVideo.addEventListener("click", () => {
    if (!p5Instance) return;
    const canvas = canvasMount?.querySelector("canvas");
    if (!canvas) return;

    setStatus("Registrazione video 10s…");
    btnVideo.disabled = true;

    try {
      const stream = canvas.captureStream(30);
      const chunks = [];

      const preferred = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ];
      const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) || "";
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "meduse_datahumanism.webm";
        a.click();
        URL.revokeObjectURL(a.href);
        setStatus("Video pronto (download avviato).");
        btnVideo.disabled = false;
      };

      rec.start();
      setTimeout(() => rec.stop(), 10_000);
    } catch (e) {
      console.error(e);
      setStatus("Errore registrazione video. Prova Chrome/Edge.");
      btnVideo.disabled = false;
    }
  });
}

// ---- Fields UI
function renderFields(values, schema) {
  if (!fieldsEl) return;
  fieldsEl.innerHTML = "";
  for (const key of schema.order) {
    const label = document.createElement("label");
    label.textContent = schema.labels[key] ?? key;

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
  if (!fieldsEl) return next;

  const inputs = qsAll("input[data-key]", fieldsEl);
  for (const inp of inputs) {
    const k = inp.dataset.key;
    const v = Number(String(inp.value).replace(",", "."));
    next[k] = Number.isFinite(v) ? v : 0;
  }
  return next;
}

function topEntry(values) {
  const entries = defaultSchema.order.map(k => ({
    key: k, label: defaultSchema.labels[k], value: Number(values[k] ?? 0)
  }));
  entries.sort((a, b) => b.value - a.value);
  return entries[0] || { key: "", label: "-", value: 0 };
}

function formatNum(n) {
  if (!Number.isFinite(n)) return "0";
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return isInt ? String(Math.round(n)) : n.toFixed(2).replace(".", ",");
}

// ---- p5 Visual: “meduse nel mare”
function mountSketch(state) {
  if (!canvasMount) return;

  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }

  const W = canvasMount.clientWidth;
  const H = Math.max(580, Math.floor(W * 0.70));

  const schema = defaultSchema;
  const entries = schema.order.map(k => ({
    key: k,
    label: schema.labels[k],
    value: Number(state.values?.[k] ?? 0)
  }));

  const vals = entries.map(e => Math.max(0, e.value));
  const vmax = Math.max(...vals, 1);
  const vmin = Math.min(...vals, 0);

  const palette = {
    bg: "#060a12",
    haze: "#0d1b2a",
    ink: "#d6e2ff",
    caption: "#c9d4ea",
    cMin: "#4dd4c6",
    cMax: "#ff6aa2"
  };

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  function intensityFor(v) {
    if (vmax === vmin) return 0.5;
    return clamp01((v - vmin) / (vmax - vmin));
  }

  // size log-compress: 0..1
  function sizeForValue(p, v) {
    const nv = Math.log1p(Math.max(0, v)) / Math.log1p(vmax);
    return p.lerp(36, 120, clamp01(nv));
  }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(A.r + (B.r - A.r) * t);
    const g = Math.round(A.g + (B.g - A.g) * t);
    const bb = Math.round(A.b + (B.b - A.b) * t);
    return `rgb(${r},${g},${bb})`;
  }

  function rgbaFromRgbString(rgbStr, a) {
    const m = rgbStr.match(/(\d+),(\d+),(\d+)/);
    if (!m) return [255, 255, 255, a];
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }

  // Jelly objects
  const jellies = entries.map((e, i) => ({
    id: i + 1,
    key: e.key,
    label: e.label,
    value: e.value,
    info: interpretHumanismForKey(e.key, e.value),
    r: 50,
    color: "rgb(255,255,255)",
    x0: 0, y0: 0,
    x: 0, y: 0,
    vx: 0, vy: 0,
    phase: i * 9.7,
    hover: false
  }));

  // Layout (griglia editoriale 3x2 con piccola asimmetria)
  function layout(p) {
    const cols = 3;
    const padX = W * 0.14;
    const padY = H * 0.18;
    const cellW = (W - padX * 2) / (cols - 1);
    const cellH = (H - padY * 2) / 1; // 2 righe -> una distanza

    jellies.forEach((j, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);

      const x = padX + c * cellW + (r ? -10 : 10) + (c === 1 ? 12 : 0);
      const y = padY + r * cellH + (c === 2 ? 10 : 0);

      j.x0 = x;
      j.y0 = y;
      j.x = x;
      j.y = y;

      const inten = intensityFor(j.value);
      j.color = mixHex(palette.cMin, palette.cMax, inten);
      j.r = sizeForValue(p, j.value);
    });
  }

  const sketch = (p) => {
    let t = 0;

    p.setup = () => {
      const c = p.createCanvas(W, H);
      c.parent(canvasMount);
      p.pixelDensity(1);
      p.noiseDetail(3, 0.45);
      p.textFont("ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial");
      layout(p);
    };

    p.draw = () => {
      t += 0.012;
      p.background(palette.bg);
      drawHaze(p, t, palette);

      const hovered = pickHovered(p);

      // update + draw
      for (const j of jellies) {
        j.hover = hovered && hovered.id === j.id;

        // flow field (corrente)
        const ang = p.noise(j.id * 2.1, j.x * 0.002, j.y * 0.002, t * 0.20) * p.TWO_PI * 2;
        const axF = Math.cos(ang) * 0.06;
        const ayF = Math.sin(ang) * 0.06;

        // spring verso base
        const axHome = (j.x0 - j.x) * 0.012;
        const ayHome = (j.y0 - j.y) * 0.012;

        // hover: attrazione dolce (come se il mouse fosse una luce)
        let axM = 0, ayM = 0;
        if (j.hover) {
          const dx = p.mouseX - j.x;
          const dy = p.mouseY - j.y;
          axM = dx * 0.002;
          ayM = dy * 0.002;
        }

        // damping setoso
        j.vx = (j.vx + axF + axHome + axM) * 0.92;
        j.vy = (j.vy + ayF + ayHome + ayM) * 0.92;
        j.x += j.vx;
        j.y += j.vy;

        drawJelly(p, j, t, palette, rgbaFromRgbString);
      }

      if (hovered) drawTooltip(p, hovered, palette, rgbaFromRgbString);

      // footer small
      p.noStroke();
      p.fill(...rgbaFromRgbString("rgb(201,212,234)", 210));
      p.textSize(12);
      p.text("Hover sulle meduse per leggere il significato dei dati.", 14, p.height - 14);
    };

    function pickHovered(p) {
      let best = null;
      let bestD = Infinity;
      for (const j of jellies) {
        const d = Math.hypot(p.mouseX - j.x, p.mouseY - j.y);
        if (d < j.r * 0.95 && d < bestD) {
          best = j; bestD = d;
        }
      }
      return best;
    }
  };

  p5Instance = new p5(sketch);
}

function drawHaze(p, t, palette) {
  p.noStroke();
  for (let i = 0; i < 10; i++) {
    const rx = p.width * p.noise(i * 7.1, t * 0.18);
    const ry = p.height * p.noise(i * 9.3, t * 0.18 + 2);
    const rr = p.lerp(180, 390, p.noise(i * 3.7, t * 0.14));
    p.fill(13, 27, 42, 18);
    p.ellipse(rx, ry, rr, rr);
  }
}

function drawJelly(p, j, t, palette, rgbaFromRgbString) {
  const baseCol = rgbaFromRgbString(j.color, j.hover ? 220 : 175);
  const edgeCol = rgbaFromRgbString("rgb(214,226,255)", j.hover ? 200 : 120);

  // shadow
  p.noStroke();
  p.fill(0, 0, 0, 40);
  p.ellipse(j.x + 10, j.y + 16, j.r * 2.2, j.r * 1.2);

  p.push();
  p.translate(j.x, j.y);

  const phase = t + j.phase;
  const wob = 0.18 + (j.hover ? 0.10 : 0.0);
  const rx = j.r * (1.05 + Math.sin(phase * 0.9) * wob);
  const ry = j.r * (0.85 + Math.cos(phase * 0.7) * wob);

  // glow
  p.noStroke();
  p.fill(...rgbaFromRgbString(j.color, j.hover ? 42 : 26));
  p.ellipse(0, 0, rx * 2.4, ry * 2.1);

  // bell
  p.stroke(...edgeCol);
  p.strokeWeight(j.hover ? 2.1 : 1.2);
  p.fill(...baseCol);

  p.beginShape();
  const pts = 16;
  for (let i = 0; i <= pts + 2; i++) {
    const a = (i / pts) * p.TWO_PI;
    const n = p.noise(Math.cos(a) * 0.9 + j.id * 2.2, Math.sin(a) * 0.9 + phase * 0.6);
    const r = 1.0 + (n - 0.5) * 0.35;
    const x = Math.cos(a) * rx * r;
    const y = Math.sin(a) * ry * r * 0.78;
    p.curveVertex(x, y);
  }
  p.endShape(p.CLOSE);

  // label under
  p.noStroke();
  p.fill(...rgbaFromRgbString("rgb(201,212,234)", 235));
  p.textAlign(p.CENTER, p.TOP);
  p.textSize(12);
  p.text(`${j.label}: ${formatNum(j.value)}`, 0, j.r * 0.95 + 10);

  // tentacles
  drawTentacles(p, j, rx, ry, phase, rgbaFromRgbString);

  p.pop();
}

function drawTentacles(p, j, rx, ry, phase, rgbaFromRgbString) {
  const nTent = 9;
  const vmax = 120;
  const len = p.lerp(60, 145, Math.min(1, j.r / vmax));
  const sway = 10 + (j.hover ? 10 : 0);

  p.noFill();
  p.stroke(...rgbaFromRgbString(j.color, j.hover ? 140 : 90));
  p.strokeWeight(1);

  for (let i = 0; i < nTent; i++) {
    const u = (i / (nTent - 1)) * 1.6 - 0.8;
    const x0 = u * rx * 0.75;
    const y0 = ry * 0.55;

    p.beginShape();
    for (let s = 0; s < 12; s++) {
      const v = s / 11;
      const x = x0 + Math.sin(phase * 1.2 + v * 3 + i) * sway * (1 - v);
      const y = y0 + v * len + p.noise(i * 3.3, v * 2.1, phase * 0.6) * 8;
      p.curveVertex(x, y);
    }
    p.endShape();
  }
}

function drawTooltip(p, j, palette, rgbaFromRgbString) {
  const pad = 12;
  const title = `${j.label} — ${formatNum(j.value)}`;
  const body = j.info;

  p.textSize(12);
  const maxW = Math.min(380, p.width - 40);

  const lines = wrapText(p, body, maxW - pad * 2);
  const w = Math.min(
    maxW,
    Math.max(p.textWidth(title), ...lines.map(l => p.textWidth(l))) + pad * 2
  );
  const h = pad * 2 + 16 + lines.length * 16;

  let x = p.mouseX + 16;
  let y = p.mouseY + 16;
  if (x + w > p.width - 10) x = p.width - w - 10;
  if (y + h > p.height - 10) y = p.height - h - 10;

  p.noStroke();
  p.fill(0, 0, 0, 175);
  p.rect(x, y, w, h, 14);

  p.fill(...rgbaFromRgbString("rgb(214,226,255)", 235));
  p.textAlign(p.LEFT, p.TOP);
  p.text(title, x + pad, y + pad);

  p.fill(...rgbaFromRgbString("rgb(201,212,234)", 225));
  let yy = y + pad + 18;
  for (const l of lines) {
    p.text(l, x + pad, yy);
    yy += 16;
  }
}

function wrapText(p, str, maxWidth) {
  const words = String(str).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? (line + " " + w) : w;
    if (p.textWidth(test) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}
