
/* -----------------------------------------------
   DEMO: Upload → OCR → Grafica → Narrazione → Video
   Tech: p5.js + Tesseract.js + MediaRecorder (WebM)
   Tutto in locale: nessun dato inviato a server
-------------------------------------------------- */

// ======== ELEMENTI UI ========
const fileInput   = document.getElementById('fileInput');
const analyzeBtn  = document.getElementById('analyzeBtn');
const recordBtn   = document.getElementById('recordBtn');
const statusEl    = document.getElementById('status');
const narrativeEl = document.getElementById('narrativeBox');
const numbersEl   = document.getElementById('numbersBox');

// ======== STATO =========
let upImage  = null;   // dataURL dell'immagine caricata
let values   = [];     // numeri estratti
let p5Sketch = null;   // istanza p5
let canvasEl = null;   // canvas p5 per MediaRecorder
let recorder = null;
let chunks   = [];

/* ============ AVVIO AUTOMATICO DOPO UPLOAD ============ */
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    upImage = reader.result; // dataURL
    status('File caricato. Analizzo…');
    analyzeBtn.disabled = true;   // evita doppi avvii
    recordBtn.disabled  = true;
    await runAnalysis();          // avvio automatico
  };
  reader.readAsDataURL(file);
});

/* ============ FALLBACK MANUALE (stesso flusso) ============ */
analyzeBtn.addEventListener('click', runAnalysis);

/* ============ ANALISI: OCR → NUMERI → GRAFICA → TESTO ============ */
async function runAnalysis() {
  if (!upImage) { status('Carica prima un file.'); return; }

  analyzeBtn.disabled = true;
  recordBtn.disabled  = true;
  status('Analisi in corso… (OCR)');

  let text = '';
  try {
    const { data } = await Tesseract.recognize(upImage, 'ita+eng', { logger: () => {} });
    text = (data && data.text) ? data.text : '';
  } catch (err) {
    console.error('[OCR] error:', err);
    text = '';
  }

  // 1) CAMPI nominali (ferie, festività, riposi, pozzetto, buoni, straord.)
  const metrics = extractMetricsFromText(text);

  // 2) Numeri per la GRAFICA (fallback a parser generico se servono)
  let nums = Object.values(metrics)
    .map(m => Number.isFinite(m?.value) ? m.value : null)
    .filter(v => v !== null);

  if (!nums.length) nums = extractNumbers(text);
  if (!nums.length) {
    nums = [50, 17.34, 4, 6, 0]; // fallback demo
    status('OCR parziale: uso valori di esempio per la grafica.');
  } else {
    status(`Analisi ok: trovati ${nums.length} numeri utili.`);
  }

  values = pickTopFive(nums);
  numbersEl.textContent = values.map(n => formatIT(n)).join(' • ');

  // 3) NARRAZIONE a 10 righe in stile “data humanism”
  const tenLines = generateNarrationTenLines(metrics, values);
  narrativeEl.textContent = tenLines.join('\n');

  // 4) Avvia / aggiorna la GRAFICA
  startOrUpdateSketch(values);

  recordBtn.disabled = false;
  analyzeBtn.disabled = false;
}

/* ============ EXPORT VIDEO (10s) ============ */
recordBtn.addEventListener('click', () => {
  if (!canvasEl) { status('Canvas non pronto.'); return; }

  const stream = canvasEl.captureStream(30); // 30 fps
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  recorder = new MediaRecorder(stream, { mimeType: mime });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quello-che-i-dati-non-dicono.webm';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    status('Video generato (WebM).');
  };

  status('Registrazione video (10s)…');
  recorder.start();
  setTimeout(() => recorder.stop(), 10000);
});

/* ============ UTILITIES UI ============ */
function status(msg) { statusEl.textContent = msg; }
function formatIT(n) {
  try { return n.toLocaleString('it-IT', { maximumFractionDigits: 2 }); }
  catch { return String(n); }
}

/* ============ OCR → PARSE NUMERI ============ */
function extractNumbers(text) {
  // Interi e decimali, con . o , (formati IT/EN)
  const re = /(?<![A-Za-z])[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?![A-Za-z])/g;
  const matches = (text || '').match(re) || [];
  const nums = matches.map(s => {
    const norm = s.replace(/\./g, '').replace(',', '.'); // IT → punto decimale
    const val  = parseFloat(norm);
    return Number.isFinite(val) ? val : null;
  }).filter(v => v !== null);
  return nums.filter(v => Math.abs(v) < 1e7);
}

function pickTopFive(arr) {
  if (arr.length <= 5) return arr;
  const uniq = [...new Set(arr)];
  uniq.sort((a, b) => Math.abs(b) - Math.abs(a));
  return uniq.slice(0, 5);
}

/* ============ EXTRACTOR CAMPI DA TESTO OCR ============ */
function extractMetricsFromText(text) {
  const t = (text || '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,''); // togli accenti

  const defs = {
    ferie: [
      /ferie(?:\s+(?:residue|residuo|maturate|anno|totale)?)?[^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}ferie(?:\s+(?:residue|residuo|maturate|anno|totale)?)?/i
    ],
    festivita: [
      /festivita(?:\s+suppresse?)?[^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}festivita(?:\s+suppresse?)?/i
    ],
    riposi: [
      /riposi?\s+compensativ[io][^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}riposi?\s+compensativ[io]/i
    ],
    pozzetto: [
      /(?:pozzetto|banca\s*ore|saldo\s*ore)[^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}(?:pozzetto|banca\s*ore|saldo\s*ore)/i
    ],
    buoni: [
      /(?:buoni\s*pasto|ticket\s*restaurant?)[^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}(?:buoni\s*pasto|ticket\s*restaurant?)/i
    ],
    straord: [
      /(?:ore\s+)?straordinari?[^\n\r]{0,20}autorizzat[ei]?[^\d-+]{0,20}([-+]?\d+(?:[.,]\d+)?)/i,
      /([-+]?\d+(?:[.,]\d+)?)[^\d-+]{0,20}(?:ore\s+)?straordinari?[^\n\r]{0,20}autorizzat[ei]?/i
    ]
  };

  function find(defArr) {
    for (const re of defArr) {
      const m = t.match(re);
      if (m && m[1]) {
        const v = parseNumberIT(m[1]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  }

  const ferie     = find(defs.ferie);
  const festivita = find(defs.festivita);
  const riposi    = find(defs.riposi);
  const pozzetto  = find(defs.pozzetto);
  const buoni     = find(defs.buoni);
  const straord   = find(defs.straord);

  return {
    ferie:     { label: 'ferie',               value: ferie     },
    festivita: { label: 'festività soppresse', value: festivita },
    riposi:    { label: 'riposi compensativi', value: riposi    },
    pozzetto:  { label: 'pozzetto',            value: pozzetto  },
    buoni:     { label: 'buoni pasto',         value: buoni     },
    straord:   { label: 'straordinarie',       value: straord   }
  };
}

function parseNumberIT(s) {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
}

/* ============ NARRAZIONE 10 RIGHE “DATA HUMANISM” ============ */
function generateNarrationTenLines(metrics, values) {
  const f = (v) => Number.isFinite(v) ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : null;

  const ferie     = metrics.ferie?.value;
  const festivita = metrics.festivita?.value;
  const riposi    = metrics.riposi?.value;
  const pozzetto  = metrics.pozzetto?.value;
  const buoni     = metrics.buoni?.value;
  const straord   = metrics.straord?.value;

  const L = [];
  if (Number.isFinite(ferie))     L.push(`${f(ferie)} giorni di ferie non sono un residuo: sono pause rimandate per responsabilità.`);
  if (Number.isFinite(festivita)) L.push(`${f(festivita)} festività soppresse sono micro‑rinunce silenziose fatte quando serviva esserci.`);
  if (Number.isFinite(riposi))    L.push(`${f(riposi)} riposi compensativi dicono che il ritmo non si ferma e non chiede indietro.`);
  if (Number.isFinite(pozzetto))  L.push(`${f(pozzetto)} ore nel “pozzetto” sono tempo regalato oltre il dovuto, frammento dopo frammento.`);
  if (Number.isFinite(buoni))     L.push(`${f(buoni)} buoni pasto indicano presenza e routine affidabile: il battito del lavoro quotidiano.`);
  if (Number.isFinite(straord))   L.push(`${f(straord)} ore straordinarie autorizzate sono la punta visibile di un impegno più grande.`);

  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const spread = mx - mn;
  const contrast = (mx > 0) ? spread / (mx || 1) : 0;

  L.push(contrast > 0.6
    ? `Questi numeri non misurano quantità: mostrano attenzione dove l’energia si è addensata.`
    : `Questi numeri raccontano continuità: piccole differenze che fanno scorrere il lavoro.`);

  L.push(`Il profilo che emerge è affidabile, costante, generoso, tenace.`);
  L.push(`Non dicono quanto sei presente: dicono come lo sei.`);
  L.push(`Per questo, qui, la persona al centro sei tu.`);

  const TEN = 10;
  if (L.length > TEN) return L.slice(0, TEN);
  while (L.length < TEN) L.push(`Quello che i dati non dicono, le forme lo mostrano.`);
  return L;
}

/* ============ GRAFICA — p5.js (spirale + cerchi) ============ */
function startOrUpdateSketch(vals) {
  if (p5Sketch && p5Sketch.remove) p5Sketch.remove();

  p5Sketch = new p5(p => {
    let t = 0;
    const BG = [12, 18, 28];
    const MIN_R = 18, MAX_R = 110;
    let palette = [];

    p.setup = function () {
      const cnv = p.createCanvas(p.windowWidth * 0.58, p.windowHeight * 0.68);
      cnv.parent('canvasHost');
      canvasEl = cnv.canvas;

      p.colorMode(p.HSB, 360, 100, 100, 100);
      p.noStroke();
      palette = [
        p.color(200, 80, 95), // azzurro
        p.color(25, 90, 96),  // corallo
        p.color(135, 70, 95), // menta
