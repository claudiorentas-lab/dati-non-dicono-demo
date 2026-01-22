
/* -----------------------------------------------
   DEMO: Upload → OCR → Grafica → Narrazione → Video
   Tech: p5.js + Tesseract.js + MediaRecorder (WebM)
   Tutto in locale: nessun dato inviato a server
-------------------------------------------------- */

// ======== SETTINGS ========
const SHOW_DEBUG = true;   // mostra riga "Debug (valori riconosciuti)"
const TESS_LANG_PATH = 'https://tessdata.projectnaptha.com/5'; // path dei modelli lingua
const TESS_LANGS_PREF = 'ita+eng';      // preferenza
const TESS_LANGS_FALLBACK = 'eng';      // fallback automatico

// ======== ELEMENTI UI ========
const fileInput   = document.getElementById('fileInput');
const analyzeBtn  = document.getElementById('analyzeBtn');
const recordBtn   = document.getElementById('recordBtn');
const statusEl    = document.getElementById('status');
const narrativeEl = document.getElementById('narrativeBox');
const numbersEl   = document.getElementById('numbersBox');
const metricsEl   = document.getElementById('metricsBox');

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
  let usedLang = TESS_LANGS_PREF;
  try {
    // 2× per OCR più robusto su cifre e virgole
    const big = await upscale2x(upImage);
    const res = await Tesseract.recognize(big, TESS_LANGS_PREF, { langPath: TESS_LANG_PATH }); // nessun logger
    text = (res.data && res.data.text) ? res.data.text : '';
  } catch (err) {
    console.warn('[OCR] ita+eng non disponibile, fallback a eng:', err);
    usedLang = TESS_LANGS_FALLBACK;
    try {
      const big = await upscale2x(upImage);
      const res2 = await Tesseract.recognize(big, TESS_LANGS_FALLBACK, { langPath: TESS_LANG_PATH });
      text = (res2.data && res2.data.text) ? res2.data.text : '';
    } catch (e2) {
      console.error('[OCR fallback] error:', e2);
      text = '';
    }
  }

  // 1) CAMPI nominali per scheda (Ferie, Festività, Riposi, Pozzetto, Buoni, Straord.)
  const metrics = extractMetricsFromText_Strict(text);

  // 2) Numeri per la GRAFICA (fallback a parser generico se servono)
  let nums = Object.values(metrics)
    .map(m => Number.isFinite(m?.value) ? m.value : null)
    .filter(v => v !== null);

  if (!nums.length) nums = extractNumbers(text);
  if (!nums.length) {
    nums = [50, 17.34, 4, 6, 0];
    status('OCR parziale: uso valori di esempio per la grafica.');
  } else {
    status(`Analisi ok (${usedLang}): trovati ${nums.length} numeri utili.`);
  }

  // 3) UI: numeri + debug
  values = pickTopFive(nums);
  numbersEl.textContent = values.map(n => formatIT(n)).join(' • ');
  if (SHOW_DEBUG) {
    metricsEl.textContent =
      `Ferie: ${fmtOrDash(metrics.ferie?.value)}  |  Festività: ${fmtOrDash(metrics.festivita?.value)}\n` +
      `Riposi: ${fmtOrDash(metrics.riposi?.value)} |  Pozzetto ore: ${fmtOrDash(metrics.pozzetto?.value)}\n` +
      `Buoni pasto: ${fmtOrDash(metrics.buoni?.value)} |  Straordinario: ${fmtOrDash(metrics.straord?.value)}\n` +
      `[OCR con: ${usedLang}]`;
  } else {
    metricsEl.textContent = '';
  }

  // 4) Narrazione (10 righe, priorità ore → giorni → riposi)
  const tenLines = generateNarrationTenLines_Prioritized(metrics, values);
  narrativeEl.textContent = tenLines.join('\n');

  // 5) Grafica
  startOrUpdateSketch(values);

  recordBtn.disabled = false;
  analyzeBtn.disabled = false;
}

/* ============ EXPORT VIDEO (10s) ============ */
recordBtn.addEventListener('click', () => {
  if (!canvasEl) { status('Canvas non pronto.'); return; }
  if (!('MediaRecorder' in window)) { status('MediaRecorder non supportato.'); return; }

  const stream = canvasEl.captureStream(30);
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const rec = new MediaRecorder(stream, { mimeType: mime });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quello-che-i-dati-non-dicono.webm';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    status('Video generato (WebM).');
  };

  status('Registrazione video (10s)…');
  rec.start();
  setTimeout(() => rec.stop(), 10000);
});

/* ============ UTILITIES UI ============ */
function status(msg) { statusEl.textContent = msg; }
function formatIT(n){ try { return n.toLocaleString('it-IT',{maximumFractionDigits:2}); } catch { return String(n); } }
function fmtOrDash(v){ return Number.isFinite(v) ? formatIT(v) : '—'; }

/* ============ OCR → PARSE NUMERI (generico) ============ */
function extractNumbers(text) {
  const re = /(?<![A-Za-z])[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?![A-Za-z])/g;
  const matches = (text || '').match(re) || [];
  const nums = matches.map(s => {
    const norm = s.replace(/\./g, '').replace(',', '.');
    const val  = parseFloat(norm);
    return Number.isFinite(val) ? val : null;
  }).filter(v => v !== null);
  return nums.filter(v => Math.abs(v) < 1e7);
}
function pickTopFive(arr){
  if (arr.length <= 5) return arr;
  const uniq = [...new Set(arr)];
  uniq.sort((a,b) => Math.abs(b) - Math.abs(a));
  return uniq.slice(0, 5);
}

/* ============ EXTRACTOR “PER SCHEDA” (ancore + finestre) ============ */
function extractMetricsFromText_Strict(text) {
  const raw = (text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const lines = raw.map((s,i) => ({ i, s, n: norm(s) }));

  // Ancore che riconoscono i titoli delle card del tuo screenshot
  const anchors = {
    ferie:      [/^ferie\b/],
    festivita:  [/^festivita\b.*soppresse\b/, /^festivita\b/],
    riposi:     [/^riposi\b.*compensativ/],
    pozzetto:   [/^pozzetto\b.*ore\b/, /^banca\b.*ore\b/, /^saldo\b.*ore\b/],
    buoni:      [/^buoni\b.*pasto\b/, /^ticket\b.*rest/],
    // nello screenshot compare "Ore straordinario autorizzate"
    straord:    [/^ore\b.*straordinari?[o]?\b.*autorizzat[ei]?\b/, /^straordinari[oi]\b.*autorizz/]
  };

  const ignoreHints  = [/^programmati?$/i, /da programmare/i];
  const residuoHints = [/^residuo\b.*(giorni|ore)/i, /\bresiduo\b.*(fine mese|autorizzate)?/i];
  const numberRe     = /([-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)/;
  const parseNumberIT = s => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));

  const pickValueInWindow = (startIdx) => {
    const WIN = 6;
    const window = lines.slice(startIdx, Math.min(startIdx + WIN, lines.length));

    // 1) priorità alle righe “Residuo …”
    for (const ln of window) {
      if (residuoHints.some(rx => rx.test(ln.s))) {
        const m = ln.s.match(numberRe);
        if (m) return { value: parseNumberIT(m[1]), unit: /ore/i.test(ln.s) ? 'ore' : (/giorni/i.test(ln.s) ? 'giorni' : null) };
      }
    }
    // 2) altrimenti scegli il numero maggiore non-zero (ignora “Programmati/Da programmare”)
    let best = null;
    for (const ln of window) {
      if (ignoreHints.some(rx => rx.test(ln.s))) continue;
      const m = ln.s.match(numberRe);
      if (!m) continue;
      const v = parseNumberIT(m[1]);
      if (!Number.isFinite(v)) continue;
      if (best === null || v > best.value) best = { value: v, unit: /ore/i.test(ln.s) ? 'ore' : (/giorni/i.test(ln.s) ? 'giorni' : null) };
    }
    return best;
  };

  const out = {};
  for (const key of Object.keys(anchors)) {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (anchors[key].some(rx => rx.test(lines[i].n))) { idx = i; break; }
    }
    if (idx >= 0) {
      const picked = pickValueInWindow(idx);
      out[key] = picked && Number.isFinite(picked.value)
        ? { label: key, value: picked.value, unit: picked.unit }
        : { label: key, value: null, unit: null };
    } else {
      out[key] = { label: key, value: null, unit: null };
    }
  }
  return out;
}

/* ============ NARRAZIONE 10 RIGHE (priorità ore → giorni → riposi) ============ */
function generateNarrationTenLines_Prioritized(metrics, values) {
  const f = v => Number.isFinite(v) ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : null;
  const pick = k => Number.isFinite(metrics[k]?.value) ? metrics[k].value : null;

  const pozzetto  = pick('pozzetto');
  const straord   = pick('straord');
  const ferie     = pick('ferie');
  const festivita = pick('festivita');
  const riposi    = pick('riposi');
  const buoni     = pick('buoni');

  const L = [];
  if (pozzetto !== null)  L.push(`${f(pozzetto)} ore nel “pozzetto” sono tempo regalato oltre il dovuto, frammento dopo frammento.`);
  if (straord  !== null)  L.push(`${f(straord)} ore straordinarie autorizzate sono la punta visibile di un impegno più grande.`);
  if (ferie    !== null)  L.push(`${f(ferie)} giorni di ferie non sono un residuo: sono pause rimandate per responsabilità.`);
  if (festivita!== null)  L.push(`${f(festivita)} festività soppresse sono micro‑rinunce silenziose fatte quando serviva esserci.`);
  if (riposi   !== null)  L.push(`${f(riposi)} riposi compensativi dicono che il ritmo non si ferma e non chiede indietro.`);
  if (buoni    !== null)  L.push(`${f(buoni)} buoni pasto indicano presenza e routine affidabile: il battito del lavoro quotidiano.`);

  const mx = Math.max(...values);
  const mn = Math.min(...values);
  const spread = mx - mn;
