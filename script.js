
/* -----------------------------------------------
   Upload → OCR → Estrazione → Narrazione esplicita → Grafica → Video
   p5.js + Tesseract.js + MediaRecorder — tutto in locale
-------------------------------------------------- */

// ============= SETTINGS =============
const SHOW_DEBUG = true;    // mostra i valori riconosciuti

// ======== ELEMENTI UI ========
const fileInput   = document.getElementById('fileInput');
const analyzeBtn  = document.getElementById('analyzeBtn');
const recordBtn   = document.getElementById('recordBtn');
const statusEl    = document.getElementById('status');
const narrativeEl = document.getElementById('narrativeBox');
const numbersEl   = document.getElementById('numbersBox');
const metricsEl   = document.getElementById('metricsBox');

// ======== STATO =========
let upImage  = null;
let values   = [];
let p5Sketch = null;
let canvasEl = null;
let chunks   = [];
let visualParams = null; // variante estetica

// ======== PROMPT DI RIFERIMENTO (tono e template) ========
const PROMPT_REF = {
  tonePacks: [
    { more:'più del dovuto', steady:'ritmo affidabile', care:'cura silenziosa', energy:'energia che si addensa' },
    { more:'oltre le attese', steady:'cadenza costante', care:'attenzione discreta', energy:'impegno che si concentra' },
    { more:'ben oltre il minimo', steady:'battito regolare', care:'premura concreta', energy:'forza che si raccoglie' }
  ],
  templates: {
    // Ogni funzione riceve {val, label} e deve INIZIARE citando il valore+etichetta
    ferie: [
      ({val,label}) => `**${val} giorni di ferie** rappresentano pause rimandate per responsabilità.`,
      ({val,label}) => `**${val} giorni di ferie** indicano che prima dei riposi hai messo i compiti.`,
      ({val,label}) => `**${val} giorni di ferie** dicono che quando serve, scegli di esserci.`
    ],
    festivita: [
      ({val,label}) => `**${val} festività soppresse** sono micro‑rinunce fatte senza proclami.`,
      ({val,label}) => `**${val} festività soppresse** segnano piccoli sacrifici che tengono insieme il lavoro.`,
      ({val,label}) => `**${val} festività soppresse**: scelte minute che pesano più di quanto sembrino.`
    ],
    riposi: [
      ({val,label}) => Number(val)===0
        ? `**${val} riposi compensativi** dicono che quando dai di più non chiedi indietro.`
        : `**${val} riposi compensativi** mostrano qualche rientro in equilibrio.`,
      ({val,label}) => Number(val)===0
        ? `**${val} riposi compensativi**: ciò che dai resta avanti, non si recupera subito.`
        : `**${val} riposi compensativi** raccontano un ritmo che prova a bilanciarsi.`,
      ({val,label}) => `**${val} riposi compensativi** spiegano come preferisci far scorrere il lavoro.`
    ],
    pozzetto: [
      ({val,label,tone}) => `**${val} ore nel pozzetto** sono tempo messo da parte ${tone.more}, frammento dopo frammento.`,
      ({val,label})       => `**${val} ore nel pozzetto**: scorte di lavoro che raccontano disponibilità.`,
      ({val,label})       => `**${val} ore nel pozzetto** mostrano passaggi extra non visibili a colpo d’occhio.`
    ],
    buoni: [
      ({val,label,tone}) => `**${val} buoni pasto** indicano presenza quotidiana: ${tone.steady}.`,
      ({val,label})       => `**${val} buoni pasto**: la trama regolare delle giornate operative.`,
      ({val,label})       => `**${val} buoni pasto** misurano l’abitudine a esserci con continuità.`
    ],
    straord: [
      ({val,label}) => `**${val} ore straordinarie autorizzate** sono la parte visibile di un impegno più grande.`,
      ({val,label}) => `**${val} ore straordinarie autorizzate**: la punta di un iceberg di disponibilità.`,
      ({val,label}) => `**${val} ore straordinarie autorizzate** mostrano ciò che spesso resta implicito.`
    ]
  },
  closers: [
    `Non dicono quanto sei presente: dicono come lo sei.`,
    `Il dato misura il tempo, l’interpretazione misura la cura.`,
    `Le forme rivelano ciò che le tabelle lasciano in ombra.`,
    `Questa visualizzazione non spiega: suggerisce.`,
    `Il significato emerge quando smettiamo di contare e iniziamo a guardare.`
  ]
};

// ========== UPLOAD ==========
fileInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    upImage = reader.result;
    status('File caricato. Analizzo…');
    analyzeBtn.disabled = true;
    recordBtn.disabled  = true;
    await runAnalysis();
  };
  reader.readAsDataURL(file);
});
analyzeBtn.addEventListener('click', runAnalysis);

// ========== ANALISI ==========
async function runAnalysis() {
  if (!upImage) { status('Carica prima un file.'); return; }
  analyzeBtn.disabled = true; recordBtn.disabled = true;
  status('Analisi in corso… (OCR)');

  let text = '', usedLang = 'ita+eng';
  try {
    const big = await upscale2x(upImage);
    const res = await Tesseract.recognize(big, 'ita+eng'); // CDN default
    text = res?.data?.text || '';
  } catch (err) {
    console.warn('[OCR] ita+eng non disponibile, fallback a eng');
    usedLang = 'eng';
    try {
      const big = await upscale2x(upImage);
      const res2 = await Tesseract.recognize(big, 'eng');
      text = res2?.data?.text || '';
    } catch (e2) {
      console.error('[OCR fallback] error:', e2);
      text = '';
    }
  }

  // Estrazione per scheda (con etichette/righe)
  const metrics = extractMetricsWithLabels(text);

  // Numeri per grafica (fallback generico se serve)
  let nums = Object.values(metrics)
    .map(m => Number.isFinite(m?.value) ? m.value : null)
    .filter(v => v !== null);
  if (!nums.length) nums = extractNumbers(text);
  if (!nums.length) { nums = [50, 17.34, 4, 6, 0]; status('OCR parziale: uso valori di esempio.'); }
  else { status(`Analisi ok (${usedLang}): trovati ${nums.length} numeri utili.`); }

  values = pickTopFive(nums);
  numbersEl.textContent = values.map(n => formatIT(n)).join(' • ');
  if (SHOW_DEBUG) {
    metricsEl.textContent =
      `Ferie: ${fmtOrDash(metrics.ferie?.value)}  |  Festività: ${fmtOrDash(metrics.festivita?.value)}\n` +
      `Riposi: ${fmtOrDash(metrics.riposi?.value)} |  Pozzetto ore: ${fmtOrDash(metrics.pozzetto?.value)}\n` +
      `Buoni pasto: ${fmtOrDash(metrics.buoni?.value)} |  Straordinario: ${fmtOrDash(metrics.straord?.value)}\n` +
      `[OCR con: ${usedLang}]`;
  } else metricsEl.textContent = '';

  // Narrazione ESPRESSA con i valori trovati (esplicita le scritte OCR)
  const lines = buildExplicitNarration(metrics, values);
  narrativeEl.textContent = lines.join('\n');

  // Variante grafica deterministica (palette/forme cambiano, sfondo uguale)
  const visSeed = buildVisualSeed(metrics, values);
  initVisualVariant(visSeed);
  startOrUpdateSketch(values);

  analyzeBtn.disabled = false; recordBtn.disabled = false;
}

// ========== VIDEO ==========
recordBtn.addEventListener('click', () => {
  if (!canvasEl) { status('Canvas non pronto.'); return; }
  if (!('MediaRecorder' in window)) { status('MediaRecorder non supportato.'); return; }

  const stream = canvasEl.captureStream(30);
  chunks = [];
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';

  const rec = new MediaRecorder(stream, { mimeType: mime });
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'quello-che-i-dati-non-dicono.webm';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    status('Video generato (WebM).');
  };

  status('Registrazione video (10s)…');
  rec.start(); setTimeout(() => rec.stop(), 10000);
});

// ========== UTILITIES ==========
function status(msg){ statusEl.textContent = msg; }
function formatIT(n){ try { return n.toLocaleString('it-IT',{maximumFractionDigits:2}); } catch { return String(n); } }
function fmtOrDash(v){ return Number.isFinite(v) ? formatIT(v) : '—'; }

function extractNumbers(text){
  const re = /(?<![A-Za-z])[-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?(?![A-Za-z])/g;
  const matches = (text || '').match(re) || [];
  const nums = matches.map(s => {
    const norm = s.replace(/\./g,'').replace(',', '.');
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

// ========== OCR: EXTRACTOR CON ETICHETTE ==========
function extractMetricsWithLabels(text){
  const raw = (text || '').replace(/\r/g,'').split('\n').map(s => s.trim()).filter(Boolean);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const lines = raw.map((s,i)=>({ i, s, n: norm(s) }));

  // ancore come titoli di card
  const anchors = {
    ferie:      [/^ferie\b/],
    festivita:  [/^festivita\b.*soppresse\b/, /^festivita\b/],
    riposi:     [/^riposi\b.*compensativ/],
    pozzetto:   [/^pozzetto\b.*ore\b/, /^banca\b.*ore\b/, /^saldo\b.*ore\b/],
    buoni:      [/^buoni\b.*pasto\b/, /^ticket\b.*rest/],
    straord:    [/^ore\b.*straordinari?[o]?\b.*autorizzat[ei]?\b/, /^straordinari[oi]\b.*autorizz/]
  };

  const ignoreHints  = [/^programmati?$/i, /da programmare/i];
  const residuoHints = [/^residuo\b.*(giorni|ore)/i, /\bresiduo\b.*(fine mese|autorizzate)?/i];
  const numberRe     = /([-+]?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)/;
  const parseIT      = s => parseFloat(String(s).replace(/\./g,'').replace(',', '.'));

  const pickValueInWindow = (startIdx) => {
    const WIN = 6;
    const window = lines.slice(startIdx, Math.min(startIdx+WIN, lines.length));
    // 1) riga con "Residuo ..." preferita
    for (const ln of window) {
      if (residuoHints.some(rx => rx.test(ln.s))) {
        const m = ln.s.match(numberRe);
        if (m) return { value: parseIT(m[1]), valueLine: ln.s, labelText: 'Residuo' };
      }
    }
    // 2) numero maggiore non-zero, evitando programmazioni
    let best = null;
    for (const ln of window) {
      if (ignoreHints.some(rx => rx.test(ln.s))) continue;
      const m = ln.s.match(numberRe);
      if (!m) continue;
      const v = parseIT(m[1]);
      if (!Number.isFinite(v)) continue;
      if (best === null || v > best.value) best = { value: v, valueLine: ln.s, labelText: ln.s.replace(numberRe,'').trim() || null };
    }
    return best;
  };

  const out = {};
  for (const key of Object.keys(anchors)) {
    // trova la riga-ancora
    let idx = -1, anchorLine = null;
    for (let i=0;i<lines.length;i++){
      if (anchors[key].some(rx=>rx.test(lines[i].n))) { idx = i; anchorLine = lines[i].s; break; }
    }
    if (idx >= 0) {
      const picked = pickValueInWindow(idx);
      if (picked && Number.isFinite(picked.value)) {
        out[key] = { label: key, value: picked.value, unit: null, anchor: anchorLine, valueLine: picked.valueLine };
      } else {
        out[key] = { label: key, value: null, unit: null, anchor: anchorLine, valueLine: null };
      }
    } else out[key] = { label: key, value: null, unit: null, anchor: null, valueLine: null };
  }
  return out;
}

// ========== NARRAZIONE ESPRESSA (esplicita le scritte OCR) ==========
function buildExplicitNarration(metrics, values){
  // seed testuale dai numeri
  const seed = computeDataSeed(metrics, values);
  const rng  = mulberry32(seed);
  const tone = PROMPT_REF.tonePacks[Math.floor(rng()*PROMPT_REF.tonePacks.length)];

  // helper value → string IT
  const f = v => Number.isFinite(v) ? v.toLocaleString('it-IT',{maximumFractionDigits:2}) : null;

  // ordina: ORE → GIORNI → RIPOSI
  const order = ['pozzetto','straord','ferie','festivita','riposi','buoni'];

  const lines = [];
  const pushU = (s)=>{ if(s && !lines.includes(s)) lines.push(s); };

  for (const k of order){
    const m = metrics[k];
    if (!m || !Number.isFinite(m.value)) continue;

    const valStr = f(m.value);
    const label  = k === 'ferie' ? 'giorni di ferie'
                : k === 'festivita' ? 'festività soppresse'
                : k === 'riposi' ? 'riposi compensativi'
                : k === 'pozzetto' ? 'ore nel pozzetto'
                : k === 'buoni' ? 'buoni pasto'
                : k === 'straord' ? 'ore straordinarie autorizzate'
                : (m.anchor || 'dato');

    // scegli un template casuale deterministico
    const templates = PROMPT_REF.templates[k] || [ ({val}) => `**${val} ${label}**: dato rilevante.` ];
    const pick = templates[Math.floor(rng()*templates.length)];
    pushU(pick({val: valStr, label, tone}));
  }

  // 1–2 frasi di insieme in base alla dispersione
  const mx = Math.max(...values), mn = Math.min(...values);
  const contrast = (mx>0) ? ( (mx-mn) / (mx||1) ) : 0;

  if (contrast > 0.6)
    pushU(`Questi numeri non misurano quantità: mostrano attenzione dove l’${tone.energy}.`);
  else
    pushU(`Questi numeri raccontano continuità: differenze piccole che fanno scorrere il lavoro.`);

  // profilo finale (deterministico)
  const prof = [
    `Il profilo che emerge è affidabile, costante, generoso, tenace.`,
    `Qui c’è equilibrio, affidabilità e un senso di responsabilità che si vede.`,
    `Traspare una presenza solida: cura, continuità e disponibilità.`
  ][Math.floor(rng()*3)];
  pushU(prof);

  // chiusure variabili (senza ripetizioni)
  const closers = [...PROMPT_REF.closers];
  while (lines.length < 10 && closers.length){
    const i = Math.floor(rng()*closers.length);
    const take = closers.splice(i,1)[0];
    pushU(take);
  }
  return lines.slice(0,10);
}

// ========== VARIANTE VISIVA (palette/forme; sfondo fisso) ==========
function buildVisualSeed(metrics, values) {
  return fnv1a32('VIS|' + String(computeDataSeed(metrics, values)));
}
function initVisualVariant(seed) {
  const rng = mulberry32(seed);
  const baseHue = Math.floor(rng()*360);
  const hueOffsets = [0, 35+Math.floor(rng()*10), 140+Math.floor(rng()*10), 200+Math.floor(rng()*10), 300+Math.floor(rng()*10)];
  const paletteHSB = hueOffsets.map(h => ({ h:(baseHue+h)%360, s:72+Math.floor(rng()*20), b:95 }));

  const spiralModes = ['plain','dashed','breathing'];
  const mode = spiralModes[Math.floor(rng()*spiralModes.length)];

  visualParams = {
    paletteHSB,
    arms: 1 + Math.floor(rng()*3),
    turns: 3.6 + rng()*1.8,
    step: 0.06 + rng()*0.05,
    rotSpeed: 0.10 + rng()*0.10,
    flow: 0.15 + rng()*0.07,
    breathAmp: 6 + rng()*10,
    breathFreq: 1.6 + rng()*1.0,
    breathSpeed: 0.6 + rng()*0.4,
    grainBase: 5 + rng()*2,
    grainAmp: 2.4 + rng()*1.6,
    grainFreq: 2.2 + rng()*1.2,
    grainSpeed: 1.0 + rng()*0.5,
    armPhase: [rng()*0.8, rng()*0.8, rng()*0.8],
    pitchMul: 0.9 + rng()*0.4,
    hueStart: (baseHue + (rng()*120-60) + 360) % 360,
    hueEnd:   (baseHue + 180 + rng()*120) % 360,
    spiralSat: 60 + rng()*20,
    spiralAlpha: 82,
    ringRadiusMul: 0.26 + rng()*0.10,
    ringRotSpeed:  0.10 + rng()*0.06,
    ringRotPhase:  rng()*1.0,
    ringPulse:     0.04 + rng()*0.06,
    ringPulseSpeed:0.6 + rng()*0.6,
    ringJitter:    8 + rng()*12,
    ringJitPhaseX: rng()*Math.PI*2,
    ringJitPhaseY: rng()*Math.PI*2,
    ringGlowMul:   1.25 + rng()*0.25,
    ringFillAlpha: 92,
    ringGlowAlpha: 22,
    spiralMode: mode,
    extraHalo: rng() < 0.6,
    extraPetals: rng() < 0.5,
  };
}

// ========== GRAFICA p5 (sfondo invariato) ==========
function startOrUpdateSketch(vals) {
  if (p5Sketch && p5Sketch.remove) p5Sketch.remove();

  p5Sketch = new p5(p => {
    let t = 0;
    const BG = [12,18,28]; // sfondo fisso
    const MIN_R = 18, MAX_R = 110;
    let palette = [];

    p.setup = function () {
      const cnv = p.createCanvas(p.windowWidth * 0.58, p.windowHeight * 0.68);
      cnv.parent('canvasHost'); canvasEl = cnv.canvas;
      p.colorMode(p.HSB, 360, 100, 100, 100); p.noStroke();
      palette = visualParams.paletteHSB.map(c => p.color(c.h, c.s, c.b));
    };

    p.draw = function () {
      p.background(BG[0], BG[1], BG[2], 96);
      p.translate(p.width/2, p.height/2);

      // Spirale
      const pitchBase = vals.length>1 ? Math.abs(vals[1]) : median(vals);
      const vmax = Math.max(...vals);
      const pitch = p.map(pitchBase || 0.0001, 0, vmax || 1, 5, 22) * visualParams.pitchMul;
      const maxA  = p.TWO_PI * visualParams.turns;

      p.push(); p.rotate(t * visualParams.rotSpeed);
      for (let arm=0; arm<visualParams.arms; arm++){
        const armOffset = (p.TWO_PI/visualParams.arms)*arm + (visualParams.armPhase[arm] || 0);
        for (let a=0; a<=maxA; a+=visualParams.step){
          const r  = a*pitch + visualParams.breathAmp*Math.sin(a*visualParams.breathFreq + t*visualParams.breathSpeed + arm*0.6);
          const x  = r*Math.cos(a + t*visualParams.flow + armOffset);
          const y  = r*Math.sin(a + t*visualParams.flow + armOffset);
          let sz   = visualParams.grainBase + visualParams.grainAmp*Math.sin(a*visualParams.grainFreq + t*visualParams.grainSpeed + arm);

          if (visualParams.spiralMode === 'dashed'){
            const idx = Math.floor(a/visualParams.step);
            if ((idx+arm)%3===0) continue;
          } else if (visualParams.spiralMode === 'breathing'){
            sz *= (1 + 0.15*Math.sin(t*0.9 + a));
          }

          const h = lerpHue(visualParams.hueStart, visualParams.hueEnd, a/maxA);
          p.fill((h+360)%360, visualParams.spiralSat, 96, visualParams.spiralAlpha);
          p.circle(x,y,sz);
        }
      }
      p.pop();

      // Cerchi dei dati
      const R = Math.min(p.width,p.height) * visualParams.ringRadiusMul;
      const vmin = Math.min(...vals);
      for (let i=0;i<vals.length;i++){
        const v   = vals[i];
        const rad = p.map(v, vmin, vmax, MIN_R, MAX_R);
        const ang = (p.TWO_PI/vals.length)*i + t*visualParams.ringRotSpeed + visualParams.ringRotPhase;
        const ox  = (R + visualParams.ringJitter*Math.sin(t+i+visualParams.ringJitPhaseX)) * Math.cos(ang);
        const oy  = (R + visualParams.ringJitter*Math.sin(t*0.9+i+visualParams.ringJitPhaseY)) * Math.sin(ang);

        const col = palette[i % palette.length];
        p.fill(p.hue(col), p.saturation(col), p.brightness(col), visualParams.ringFillAlpha);
        p.circle(ox, oy, rad * (1 + visualParams.ringPulse*Math.sin(t*visualParams.ringPulseSpeed + i)));

        p.fill(p.hue(col), p.saturation(col), p.brightness(col), 22);
        p.circle(ox, oy, rad * visualParams.ringGlowMul);
      }

      // Layer extra (sempre cerchi)
      if (visualParams.extraHalo){
        p.push();
        p.rotate(t*0.15);
        const haloR = Math.min(p.width,p.height)*0.44, dots=48;
        p.fill(210,30,30,12);
        for (let i=0;i<dots;i++){
          const a=(p.TWO_PI/dots)*i;
          p.circle(haloR*Math.cos(a), haloR*Math.sin(a), 12+4*Math.sin(t+i));
        }
        p.pop();
      }
      if (visualParams.extraPetals){
        p.push();
        const petals=6, radius=Math.min(p.width,p.height)*0.22;
        for (let k=0;k<petals;k++){
          const a=(p.TWO_PI/petals)*k + t*0.12;
          const x=radius*Math.cos(a), y=radius*Math.sin(a);
          const col = palette[(k+2)%palette.length];
          p.fill(p.hue(col), p.saturation(col), p.brightness(col), 30);
          for (let s=0;s<10;s++){
            const rr=6+s*2;
            p.circle(x + rr*Math.cos(a+s*0.2), y + rr*Math.sin(a+s*0.2), 6);
          }
        }
        p.pop();
      }

      t += 0.02;
    };

    p.windowResized = function(){
      if (!document.getElementById('canvasHost')) return;
      p.resizeCanvas(p.windowWidth*0.58, p.windowHeight*0.68);
    };

    function median(arr){
      if (!arr || !arr.length) return 0;
      const a=[...arr].sort((x,y)=>x-y), m=Math.floor(a.length/2);
      return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
    }
    function lerpHue(h1,h2,t){ const d=(((h2-h1)%360)+540)%360-180; return h1+d*t; }
  });
}

// ========== Upscale 2× per OCR ==========
async function upscale2x(dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width*2; c.height = img.height*2;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataURL;
  });
}

// ========== REROLL SOLO VISIVO (SHIFT+R) ==========
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase()==='r' && e.shiftKey){
    initVisualVariant(fnv1a32('VIS|' + Date.now()));
    if (p5Sketch && p5Sketch.remove) p5Sketch.remove();
    startOrUpdateSketch(values);
  }
});
