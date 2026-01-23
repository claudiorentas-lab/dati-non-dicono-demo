import { defaultSchema, interpretHumanism, buildVisualModel } from "./humanism.js";

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
let extracted = { ...defaultSchema.values }; // proposto
let confirmed = { ...defaultSchema.values }; // confermato
let current = null;
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

// ---- Init
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

// genera SOLO dopo conferma
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
    setStatus("Preprocessing immagine…");

    const processedBlob = await preprocessImageForOCR(imgFile, { scale: 2, threshold: 165 });
    const url = URL.createObjectURL(processedBlob);

    setStatus("OCR in corso…");

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

    // ✅ parsing label-aware
    extracted = extractValuesLabelAware(ocrText, defaultSchema);

    // fallback se ha preso troppo poco
    const filled = defaultSchema.order.filter(k => Number(extracted[k] ?? 0) !== 0).length;
    if (filled < 2) {
      extracted = extractValuesByOrder(ocrText, defaultSchema);
    }

    renderFields(extracted, defaultSchema);

    btnToggleValues.disabled = false;
    valuesBox.classList.remove("hidden");
    setStatus("OCR completato. Correggi i valori e clicca “Applica & genera”.");
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

    // VP9 non sempre supportato: fallback VP8
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
    setStatus("Errore registrazione video. Prova Chrome/Edge.");
    btnVideo.disabled = false;
  }
});

// ---- UI fields
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

// ---- Regenerate (humanism + visual model)
function regenerateFromConfirmed() {
  current = interpretHumanism(confirmed, defaultSchema);

  narrativeEl.innerHTML = `
    <p>${escapeHtml(current.text)}</p>
    <p class="muted small">${escapeHtml(current.summaryLine)}</p>
  `;

  mountSketch(current);
}

// ---- OCR preprocessing (canvas)
async function preprocessImageForOCR(file, { scale = 2, threshold = 165 } = {}) {
  const img = await fileToImage(file);

  const c = document.createElement("canvas");
  const ctx = c.getContext("2d", { willReadFrequently: true });

  c.width = Math.floor(img.width * scale);
  c.height = Math.floor(img.height * scale);

  // draw scaled
  ctx.drawImage(img, 0, 0, c.width, c.height);

  // get pixels
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;

  // grayscale + contrast-ish + threshold
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b; // luma
    // boost contrast
    y = (y - 128) * 1.25 + 128;
    const v = y > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(id, 0, 0);

  return new Promise((resolve) => c.toBlob(b => resolve(b), "image/png"));
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

// ---- Parsing (label-aware + fallback)
function normalizeOCRText(text) {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumberFromString(s) {
  if (!s) return null;
  let x = String(s).replace(/\s/g, "");
  const hasComma = x.includes(",");
  const hasDot = x.includes(".");
  if (hasComma && hasDot) {
    x = x.replace(/\./g, "").replace(",", ".");
  } else {
    x = x.replace(",", ".");
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function extractValuesLabelAware(text, schema) {
  const clean = normalizeOCRText(text);
  const out = { ...schema.values };

  // dizionario sinonimi (aggiungi le tue varianti reali)
  const dict = {
    ferie_giorni: ["ferie"],
    festivita_soppresse: ["festivita soppresse", "festività soppresse", "festivita"],
    riposi_compensativi: ["riposi compensativi", "riposi"],
    pozzetto_ore: ["pozzetto", "pozzetto ore", "pozzetto(ore)"],
    buoni_pasto: ["buoni pasto", "buoni"],
    straordinario_ore: ["straordinario", "straord", "straordinario autorizzato"]
  };

  // cerca riga per riga: "label .... numero"
  const lines = clean.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);

  for (const key of schema.order) {
    const patterns = dict[key] || [schema.labels[key].toLowerCase()];
    for (const line of lines) {
      const low = line.toLowerCase();
      const hit = patterns.some(p => low.includes(p));
      if (!hit) continue;

      // prende l’ultimo numero nella riga (di solito è il valore)
      const m = line.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g);
      if (m && m.length) {
        const n = parseNumberFromString(m[m.length - 1]);
        if (n !== null) {
          out[key] = n;
          break;
        }
      }
    }
  }

  return out;
}

function extractValuesByOrder(text, schema) {
  const clean = normalizeOCRText(text);
  const matches = clean.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g) || [];
  const nums = matches.map(parseNumberFromString).filter(n => n !== null);

  const out = { ...schema.values };
  for (let i = 0; i < schema.order.length; i++) out[schema.order[i]] = nums[i] ?? 0;
  return out;
}

// ---- p5 Visual (shapes + hover + legend)
function mountSketch(state) {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }

  const W = canvasMount.clientWidth;
  const H = Math.max(520, Math.floor(W * 0.72));

  const sketch = (p) => {
    let t = 0;

    // modello visivo: 1 forma per dato
    const model = buildVisualModel(state.values, state.palette, state.mapping);
    const shapes = model.shapes;

    // “fisica” semplice
    for (const s of shapes) {
      s.vx = 0; s.vy = 0;
      s.x = s.x0; s.y = s.y0;
    }

    p.setup = () => {
      const c = p.createCanvas(W, H);
      c.parent(canvasMount);
      p.pixelDensity(1);
      p.textFont("ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial");
    };

    p.draw = () => {
      t += 0.012;

      // bg
      p.background(state.palette.bg);
      drawFog(p, state.palette.fog, t);

      const mx = p.mouseX, my = p.mouseY;

      // update shapes (hover repulsion + spring to base)
      for (const s of shapes) {
        // spring verso posizione base
        const ax0 = (s.x0 - s.x) * 0.02;
        const ay0 = (s.y0 - s.y) * 0.02;

        // repulsione dal mouse
        const dx = s.x - mx;
        const dy = s.y - my;
        const dist = Math.hypot(dx, dy);
        const hoverR = s.r * 1.2 + 30;

        let axM = 0, ayM = 0;
        s.hover = false;

        if (dist < hoverR) {
          s.hover = true;
          const f = (1 - dist / hoverR) * 0.9;
          axM = (dx / (dist + 0.001)) * f * 6;
          ayM = (dy / (dist + 0.001)) * f * 6;
        }

        // micro wobble
        const wob = 0.7;
        const axW = (p.noise(s.id * 10.1, t) - 0.5) * wob;
        const ayW = (p.noise(s.id * 12.7, t + 2) - 0.5) * wob;

        s.vx = (s.vx + ax0 + axM + axW) * 0.90;
        s.vy = (s.vy + ay0 + ayM + ayW) * 0.90;

        s.x += s.vx;
        s.y += s.vy;
      }

      // draw depth layers: shadow first
      for (const s of shapes) {
        drawShadow(p, s);
      }

      // draw main shapes
      for (const s of shapes) {
        drawShape(p, s);
      }

      // legend (mapping: forma/colore/dimensione)
      drawLegend(p, model, state.palette);

      // tooltip hover
      const hovered = shapes.find(s => s.hover) || pickHoveredByHit(p, shapes);
      if (hovered) drawTooltip(p, hovered, state.palette);

      // caption
      p.noStroke();
      p.fill(state.palette.caption);
      p.textSize(12);
      p.text(state.caption, 14, p.height - 14);
    };

    function pickHoveredByHit(p, shapes) {
      // hit-test se il mouse è dentro forma (approssimazione con r)
      for (const s of shapes) {
        const d = Math.hypot(p.mouseX - s.x, p.mouseY - s.y);
        if (d < s.r * 0.9) return s;
      }
      return null;
    }

    function drawFog(p, fogHex, t) {
      const fog = hexToRGBA(fogHex, 18);
      p.noStroke();
      for (let i = 0; i < 10; i++) {
        p.fill(...fog);
        const rx = p.width * p.noise(i * 7.1, t * 0.2);
        const ry = p.height * p.noise(i * 9.3, t * 0.2 + 2);
        const rr = p.lerp(140, 340, p.noise(i * 3.7, t * 0.15));
        p.ellipse(rx, ry, rr, rr);
      }
    }

    function drawShadow(p, s) {
      p.noStroke();
      p.fill(0, 0, 0, 50);
      p.ellipse(s.x + 12, s.y + 18, s.r * 2.2, s.r * 1.4);
    }

    function drawShape(p, s) {
      // contorno
      p.stroke(...hexToRGBA(state.palette.line, s.hover ? 210 : 150));
      p.strokeWeight(s.hover ? 2.1 : 1.3);
      p.fill(...hexToRGBA(s.color, s.hover ? 220 : 190));

      const z = s.depth; // “finto” 3d: scale e offset
      p.push();
      p.translate(s.x, s.y);
      p.scale(1 - z * 0.06);

      // piccolo highlight
      p.noStroke();
      p.fill(255, 255, 255, s.hover ? 35 : 22);
      p.ellipse(-s.r * 0.25, -s.r * 0.25, s.r * 0.55, s.r * 0.35);

      // shape principale
      p.stroke(...hexToRGBA(state.palette.line, s.hover ? 210 : 150));
      p.fill(...hexToRGBA(s.color, s.hover ? 220 : 190));

      switch (s.shape) {
        case "circle":
          p.ellipse(0, 0, s.r * 2, s.r * 2);
          break;
        case "square":
          p.rectMode(p.CENTER);
          p.rect(0, 0, s.r * 2, s.r * 2, 14);
          break;
        case "triangle":
          p.triangle(-s.r, s.r, 0, -s.r, s.r, s.r);
          break;
        case "hex":
          drawPolygon(p, 0, 0, s.r, 6);
          break;
        case "diamond":
          p.beginShape();
          p.vertex(0, -s.r);
          p.vertex(s.r, 0);
          p.vertex(0, s.r);
          p.vertex(-s.r, 0);
          p.endShape(p.CLOSE);
          break;
        default:
          drawBlob(p, s);
      }

      // label minimo vicino alla forma (sempre visibile)
      p.noStroke();
      p.fill(...hexToRGBA(state.palette.caption, 210));
      p.textSize(12);
      p.textAlign(p.CENTER, p.TOP);
      p.text(`${s.label}: ${s.value}`, 0, s.r + 10);

      p.pop();
    }

    function drawBlob(p, s) {
      p.beginShape();
      for (let a = 0; a < p.TWO_PI + 0.01; a += 0.55) {
        const n = p.noise(Math.cos(a) * 0.8 + s.id * 3.1, Math.sin(a) * 0.8 + t * 0.6);
        const rr = s.r * (0.85 + n * 0.45);
        p.vertex(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      p.endShape(p.CLOSE);
    }

    function drawPolygon(p, x, y, r, n) {
      p.beginShape();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * p.TWO_PI;
        p.vertex(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      p.endShape(p.CLOSE);
    }

    function drawLegend(p, model, palette) {
      const x = 14;
      const y = 14;
      const w = Math.min(420, p.width - 28);
      const h = 138;

      p.noStroke();
      p.fill(0, 0, 0, 35);
      p.rect(x, y, w, h, 14);

      p.noStroke();
      p.fill(...hexToRGBA(palette.caption, 220));
      p.textSize(12);
      p.textAlign(p.LEFT, p.TOP);
      p.text("Legenda (mappatura dati → forme)", x + 12, y + 10);

      p.fill(...hexToRGBA(palette.caption, 170));
      p.text("• Forma = categoria   • Grandezza = valore   • Colore = intensità (min→max)", x + 12, y + 30);

      // mini swatches min/max
      p.fill(...hexToRGBA(model.minColor, 210));
      p.rect(x + 12, y + 54, 22, 10, 3);
      p.fill(...hexToRGBA(model.maxColor, 210));
      p.rect(x + 40, y + 54, 22, 10, 3);

      p.fill(...hexToRGBA(palette.caption, 170));
      p.text(`min ${model.minValue}  max ${model.maxValue}`, x + 70, y + 52);

      // elenco righe
      let yy = y + 72;
      for (const s of shapes) {
        p.fill(...hexToRGBA(s.color, 220));
        p.rect(x + 12, yy + 4, 10, 10, 2);

        p.fill(...hexToRGBA(palette.caption, 210));
        p.text(`${s.label} → ${s.value}`, x + 28, yy);

        yy += 18;
      }
    }

    function drawTooltip(p, s, palette) {
      const pad = 10;
      const txt = `${s.label}\nValore: ${s.value}\nForma: ${s.shape}\nColore/Intensità: ${s.intensity.toFixed(2)}`;
      const lines = txt.split("\n");

      p.textSize(12);
      const w = Math.min(280, Math.max(...lines.map(l => p.textWidth(l))) + pad * 2);
      const h = lines.length * 16 + pad * 2;

      let x = p.mouseX + 14;
      let y = p.mouseY + 14;
      if (x + w > p.width - 10) x = p.width - w - 10;
      if (y + h > p.height - 10) y = p.height - h - 10;

      p.noStroke();
      p.fill(0, 0, 0, 160);
      p.rect(x, y, w, h, 12);

      p.fill(...hexToRGBA(palette.caption, 235));
      let yy = y + pad;
      for (const l of lines) {
        p.text(l, x + pad, yy);
        yy += 16;
      }
    }

    function hexToRGBA(hex, a = 255) {
      const h = hex.replace("#", "");
      const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
      const n = parseInt(full, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
    }
  };

  p5Instance = new p5(sketch);
}
