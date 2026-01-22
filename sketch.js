
async function runAnalysis() {
  if(!upImage) { status('Carica un file prima.'); return; }
  analyzeBtn.disabled = true;
  recordBtn.disabled = true;
  status('Analisi in corso… (OCR)');

  try {
    const { data } = await Tesseract.recognize(upImage, 'ita+eng', { logger: () => {} });
    const text = (data && data.text) ? data.text : '';
    values = extractNumbers(text);

    if(values.length === 0) {
      values = [50, 17.34, 4, 6, 0];
      status('Nessun numero trovato: uso valori di esempio.');
    } else {
      status(`Trovati ${values.length} numeri → userò i 5 più significativi.`);
    }

    values = pickTopFive(values);
    numbersEl.textContent = values.map(n => formatIT(n)).join(' • ');

    const narrative = buildNarrationFromValues(values);
    narrativeEl.textContent = narrative.join('\n\n');

    startOrUpdateSketch(values);

    recordBtn.disabled = false;
    analyzeBtn.disabled = false;
  } catch(err) {
    console.error(err);
    status('Errore durante l’analisi. Riprova con un altro file.');
    analyzeBtn.disabled = false;
  }
}

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
let upImage = null;      // dataURL dell'immagine caricata
let values  = [];        // numeri estratti (array)
let p5Sketch = null;     // istanza p5
let recorder = null;     // MediaRecorder
let chunks = [];         // buffer video
let canvasEl = null;     // canvas p5 reale (per captureStream)

/* ============ 1) UPLOAD FILE ============ */

fileInput.addEventListener('change', e => {
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    upImage = reader.result;          // dataURL
    status('File caricato. Analizzo…');
    analyzeBtn.disabled = true;       // evita doppi avvii
    await runAnalysis();              // ← AVVIO AUTOMATICO
  };
  reader.readAsDataURL(file);
});


/* ============ 2) ANALISI: OCR → NUMERI → GRAFICA → TESTO ============ */
analyzeBtn.addEventListener('click', async () => {
  if(!upImage) { status('Carica un file prima.'); return; }
  analyzeBtn.disabled = true;
  recordBtn.disabled = true;
  status('Analisi in corso… (OCR)');

  try {
    // ---- OCR in locale ----
    const { data } = await Tesseract.recognize(upImage, 'ita+eng', {
      logger: () => {}
    });

    // ---- parsing numeri ----
    const text = (data && data.text) ? data.text : '';
    values = extractNumbers(text);

    if(values.length === 0) {
      values = [50, 17.34, 4, 6, 0]; // fallback di esempio
      status('Nessun numero trovato: uso valori di esempio.');
    } else {
      status(`Trovati ${values.length} numeri → userò i 5 più significativi.`);
    }

    values = pickTopFive(values); // 5 numeri più “parlanti”

    numbersEl.textContent = values.map(n => formatIT(n)).join(' • ');

    // narrazione stile data humanism
    const narrative = buildNarrationFromValues(values);
    narrativeEl.textContent = narrative.join('\n\n');

    // avvia/aggiorna animazione p5
    startOrUpdateSketch(values);

    recordBtn.disabled = false;
    analyzeBtn.disabled = false;

  } catch(err) {
    console.error(err);
    status('Errore durante l’analisi. Riprova con un altro file.');
    analyzeBtn.disabled = false;
  }
});

/* ============ 3) REGISTRAZIONE VIDEO (10s) ============ */
recordBtn.addEventListener('click', async () => {
  if(!canvasEl) { status('Canvas non pronto.'); return; }

  const stream = canvasEl.captureStream(30); // 30 fps
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  recorder = new MediaRecorder(stream, { mimeType: mime });

  recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
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
function status(msg){ statusEl.textContent = msg; }
function formatIT(n){
  try { return n.toLocaleString('it-IT', { maximumFractionDigits: 2 }); }
  catch(e){ return String(n); }
}

/* ============ OCR → PARSE NUMERI ============ */
function extractNumbers(text){
  const re = /(?<![A-Za-z])[-+]?\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d+)?(?![A-Za-z])/g;
  const matches = (text || '').match(re) || [];
  const nums = matches.map(s => {
    let norm = s.replace(/\./g, '').replace(',', '.'); // IT → US decimal
    const val = parseFloat(norm);
    return isFinite(val) ? val : null;
  }).filter(v => v !== null);
  return nums.filter(v => Math.abs(v) < 1e7);
}
function pickTopFive(arr){
  if(arr.length <= 5) return arr;
  const uniq = [...new Set(arr)];
  uniq.sort((a,b) => Math.abs(b) - Math.abs(a));
  return uniq.slice(0, 5);
}

/* ============ NARRAZIONE (data humanism) ============ */
function buildNarrationFromValues(vals){
  const n   = vals.length;
  const s   = vals.reduce((acc,v)=>acc+(isFinite(v)?v:0),0);
  const mn  = Math.min(...vals);
  const mx  = Math.max(...vals);
  const avg = s / (n || 1);
  const med = (() => {
    const a=[...vals].sort((x,y)=>x-y);
    const m=Math.floor(a.length/2);
    return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
  })();
  const zeros    = vals.filter(v => v === 0).length;
  const decimals = vals.filter(v => Math.abs(v - Math.round(v)) > 0.0001).length;
  const spread   = mx - mn;
  const contrast = (mx > 0) ? spread / (mx || 1) : 0;

  const out = [];
  out.push(`Questi numeri sono tracce, non un rendiconto. Indicano come il tempo si è addensato e dove si è fatto più sottile.`);
  out.push(`Il massimo raggiunge ${formatIT(mx)}, il minimo tocca ${formatIT(mn)}: ` +
           (contrast > 0.6 ? `la distanza è marcata: fasi diverse, energie diverse.` :
                              `le differenze sono contenute: una continuità che rassicura.`));
  if (zeros > 0) out.push(`Lo zero non è assenza: è una pausa che orienta più del rumore.`);
  if (decimals > 0) out.push(`I decimali sussurrano precisione: minimi scarti che cambiano la qualità della giornata.`);
  out.push(`La media è ${formatIT(avg)}, la mediana ${formatIT(med)}: due lenti per vedere lo stesso ritmo.`);
  out.push(`Quello che i dati non dicono, le forme lo mostrano: il resto lo intuiamo guardandoli muovere.`);
  return out;
}

/* ============ 4) GRAFICA — p5.js ============ */
// Stile: spirale di cerchi + cerchi proporzionali (sfondo blu notte)
function startOrUpdateSketch(vals){
  if(p5Sketch && p5Sketch.remove) p5Sketch.remove();

  p5Sketch = new p5(p => {
    let t = 0;
    const BG = [12,18,28];
    const MIN_R = 18, MAX_R = 110;
    let palette = [];

    p.setup = function(){
      const cnv = p.createCanvas(p.windowWidth*0.58, p.windowHeight*0.68);
      cnv.parent('canvasHost');
      canvasEl = cnv.canvas;

      p.colorMode(p.HSB, 360, 100, 100, 100);
      p.noStroke();
      palette = [
        p.color(200,80,95),  // azzurro
        p.color(25,90,96),   // corallo
        p.color(135,70,95),  // menta
        p.color(50,85,95),   // giallo
        p.color(285,60,95)   // viola
      ];
    };

    p.draw = function(){
      p.background(BG[0], BG[1], BG[2], 96);
      p.translate(p.width/2, p.height/2);

      const pitchBase = vals.length > 1 ? Math.abs(vals[1]) : median(vals);
      const vmax = Math.max(...vals);
      const pitch = p.map(pitchBase || 0.0001, 0, vmax || 1, 5, 22);
      const turns = 4;
      const maxA = p.TWO_PI * turns;

      // SPIRALE
      p.push();
      p.rotate(t * 0.15);
      const step = 0.08;
      for(let a=0; a<=maxA; a+=step){
        const r  = a * pitch + 10 * Math.sin(a*2 + t*0.7);
        const x  = r * Math.cos(a + t*0.2);
        const y  = r * Math.sin(a + t*0.2);
        const sz = 6 + 3 * Math.sin(a*3 + t*1.2);
        const h  = p.map(a, 0, maxA, 190, 30); // blu → corallo
        p.fill(h, 70, 96, 85);
        p.circle(x, y, sz);
      }
      p.pop();

      // CERCHI DEI DATI
      const Rcorona = Math.min(p.width, p.height) * 0.34;
      const vmin = Math.min(...vals);
      for(let i=0; i<vals.length; i++){
        const v   = vals[i];
        const rad = p.map(v, vmin, vmax, MIN_R, MAX_R);
        const ang = (p.TWO_PI / vals.length) * i + t*0.12;
        const ox  = (Rcorona + 14 * Math.sin(t + i)) * Math.cos(ang);
        const oy  = (Rcorona + 14 * Math.sin(t*0.9 + i)) * Math.sin(ang);

        const col = palette[i % palette.length];
        p.fill(p.hue(col), p.saturation(col), p.brightness(col), 92);
        p.circle(ox, oy, rad * (1 + 0.06 * Math.sin(t*0.8 + i)));

        p.fill(p.hue(col), p.saturation(col), p.brightness(col), 22);
        p.circle(ox, oy, rad * 1.35);
      }

      t += 0.02;
    };

    p.windowResized = function(){
      if(!document.getElementById('canvasHost')) return;
      p.resizeCanvas(p.windowWidth*0.58, p.windowHeight*0.68);
    };

    function median(arr){
      if(!arr || !arr.length) return 0;
      const a = [...arr].sort((x,y)=>x-y);
      const m = Math.floor(a.length/2);
      return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
    }
  });
}


