import { interpretHumanism, defaultSchema, toFeatureVector } from "./humanism.js";

const fileInput = document.getElementById("fileInput");
const btnAnalyze = document.getElementById("btnAnalyze");
const btnVideo = document.getElementById("btnVideo");
const btnToggleValues = document.getElementById("btnToggleValues");
const btnApply = document.getElementById("btnApply");
const btnHide = document.getElementById("btnHide");

const statusEl = document.getElementById("status");
const narrativeEl = document.getElementById("narrative");
const debugEl = document.getElementById("debug");
const valuesBox = document.getElementById("valuesBox");
const fieldsEl = document.getElementById("fields");
const canvasMount = document.getElementById("canvasMount");

let imgFile = null;
let extracted = { ...defaultSchema.values };
let ocrText = "";
let p5Instance = null;
let currentSketchState = null;

function setStatus(msg){ statusEl.textContent = msg; }

function enableControls(on){
  btnAnalyze.disabled = !on;
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0] || null;
  imgFile = f;
  if (!imgFile){
    enableControls(false);
    setStatus("Carica uno screenshot.");
    return;
  }
  enableControls(true);
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

btnApply.addEventListener("click", () => {
  // leggi input campi
  const inputs = [...fieldsEl.querySelectorAll("input[data-key]")];
  const next = { ...extracted };
  for (const inp of inputs){
    const k = inp.dataset.key;
    const v = Number(String(inp.value).replace(",", "."));
    next[k] = Number.isFinite(v) ? v : 0;
  }
  extracted = next;

  // rigenera interpretazione e sketch
  regenerateFromValues();
});

btnAnalyze.addEventListener("click", async () => {
  if (!imgFile) return;

  try{
    setStatus("OCR in corso… (può metterci un po’)");
    btnAnalyze.disabled = true;

    const url = URL.createObjectURL(imgFile);
    const { data } = await Tesseract.recognize(url, "ita", {
      logger: (m) => {
        if (m.status === "recognizing text"){
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

    btnToggleValues.disabled = false;
    valuesBox.classList.remove("hidden");

    regenerateFromValues();

    setStatus("Fatto. Puoi correggere i valori o generare il video.");
    btnVideo.disabled = false;
  } catch (err){
    console.error(err);
    setStatus("Errore OCR. Prova con uno screenshot più nitido o ritagliato.");
  } finally {
    btnAnalyze.disabled = false;
  }
});

btnVideo.addEventListener("click", async () => {
  if (!p5Instance) return;

  // MediaRecorder da canvas
  const canvas = canvasMount.querySelector("canvas");
  if (!canvas){
    setStatus("Nessun canvas trovato.");
    return;
  }

  setStatus("Registrazione video 10s…");
  btnVideo.disabled = true;

  try{
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
  } catch (e){
    console.error(e);
    setStatus("Errore registrazione video (browser/codec). Prova Chrome/Edge.");
    btnVideo.disabled = false;
  }
});

function extractNumbersFromText(text, schema){
  // Estrazione “robusta ma semplice”: prende tutti i numeri e li assegna in ordine alle chiavi.
  // MVP: se lo screenshot ha i 6 valori in ordine, funziona. Altrimenti correggi a mano.
  const nums = (text.match(/-?\d+(?:[.,]\d+)?/g) || [])
    .map(s => Number(s.replace(",", ".")))
    .filter(n => Number.isFinite(n));

  const out = { ...schema.values };
  const keys = schema.order;

  for (let i=0; i<keys.length; i++){
    out[keys[i]] = nums[i] ?? 0;
  }
  return out;
}

function renderFields(values, schema){
  fieldsEl.innerHTML = "";
  for (const key of schema.order){
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

function regenerateFromValues(){
  // 1) feature vector
  const features = toFeatureVector(extracted, defaultSchema);

  // 2) narrazione + parametri
  const interpretation = interpretHumanism(extracted, features, defaultSchema);

  // UI narrazione
  narrativeEl.innerHTML = `
    <p>${escapeHtml(interpretation.text)}</p>
    <p class="muted small">Indizi: densità ${interpretation.params.density.toFixed(2)} · vuoti ${interpretation.params.voids.toFixed(2)} · deriva ${interpretation.params.drift.toFixed(2)}</p>
  `;

  // 3) sketch state
  currentSketchState = interpretation;

  // 4) (ri)avvia p5
  mountSketch(currentSketchState);
}

function mountSketch(state){
  // distruggi precedente
  if (p5Instance){
    p5Instance.remove();
    p5Instance = null;
  }

  const W = canvasMount.clientWidth;
  const H = Math.max(420, Math.floor(W * 0.72));

  const sketch = (p) => {
    let t = 0;

    p.setup = () => {
      const c = p.createCanvas(W, H);
      c.parent(canvasMount);
      p.pixelDensity(1);
      p.noFill();
      p.strokeWeight(1);
    };

    p.draw = () => {
      t += 0.01;

      // sfondo
      p.background(7,8,11);

      // parametri
      const density = state.params.density; // 0..1
      const voids = state.params.voids;     // 0..1
      const drift = state.params.drift;     // 0..1
      const outlier = state.params.outlier; // 0..1

      // “vuoti intenzionali”
      const voidR = p.lerp(40, 150, voids);
      const voidX = p.width * 0.5 + p.sin(t*0.7) * p.lerp(0, 60, drift);
      const voidY = p.height * 0.5 + p.cos(t*0.6) * p.lerp(0, 60, drift);

      // punti
      const n = Math.floor(p.lerp(120, 900, density));
      p.stroke(230,230,230, 150);
      for (let i=0; i<n; i++){
        const a = (i / n) * Math.PI * 2;
        const r = p.lerp(30, Math.min(p.width,p.height)*0.46, (i % 97) / 97);

        // jitter “umano”
        const j = 0.8 + 2.2 * density;
        let x = p.width*0.5 + Math.cos(a + t*0.6) * r + p.noise(i*0.03, t*0.8)*12*j;
        let y = p.height*0.5 + Math.sin(a + t*0.6) * r + p.noise(i*0.04, t*0.7)*12*j;

        // evita il vuoto
        const d = Math.hypot(x-voidX, y-voidY);
        if (d < voidR) continue;

        p.point(x,y);

        // filamenti sottili (non sempre)
        if (i % 11 === 0){
          p.stroke(230,230,230, 45);
          const x2 = x + p.noise(i*0.2, t)*18*(0.2+drift);
          const y2 = y + p.noise(i*0.2+10, t)*18*(0.2+drift);
          p.line(x,y,x2,y2);
          p.stroke(230,230,230, 150);
        }
      }

      // contorno del vuoto
      p.stroke(230,230,230, 35);
      p.circle(voidX, voidY, voidR*2);

      // “outlier”: un segno diverso, non allarme
      if (outlier > 0.25){
        p.stroke(230,230,230, 120);
        const sx = p.width*0.18 + p.sin(t*1.1)*10;
        const sy = p.height*0.22 + p.cos(t*1.3)*10;
        const s = p.lerp(18, 55, outlier);
        p.line(sx-s, sy, sx+s, sy);
        p.line(sx, sy-s, sx, sy+s);
      }

      // micro-annotazioni (pochissime)
      p.noStroke();
      p.fill(180,185,195, 180);
      p.textSize(12);
      p.text(state.caption, 14, p.height - 14);
    };
  };

  p5Instance = new p5(sketch);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
