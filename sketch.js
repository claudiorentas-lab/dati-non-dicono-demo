
// =======================================================
// Data Humanism — SOLO GRAFICA (nessun testo)
// Spirale di cerchi in movimento + cerchi proporzionali ai dati (2D)
// - Sfondo sempre uguale (blu-notte)
// - Dati via URL ?data=50,17.34,4,6,0 (altrimenti default)
// - Casualità controllata: ?seed=12345 | 'R' reroll | 'S' salva PNG
// =======================================================

const DEFAULT_DATA = [50, 17.34, 4, 6, 0];
let values = [];

let t = 0;
const BG = [12, 18, 28];
const MIN_R = 18, MAX_R = 110;

let palette = [];
let params = {};
let currentSeed = null;

function setup(){
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();

  values = parseDataFromURL() || DEFAULT_DATA.slice();
  currentSeed = parseSeedFromURL();
  initVariant(currentSeed);
}

function draw(){
  background(BG[0], BG[1], BG[2], 96);
  translate(width*0.5, height*0.5);

  const pitchBase = (values.length>1) ? abs(values[1]) : median(values);
  const vmax = max(values);
  const pitch = mapSafe(pitchBase||0.0001, 0, vmax||1, 5, 22) * params.pitchMul;

  const maxA = TWO_PI * params.turns;

  push();
  rotate(t*params.rotSpeed + params.rotOffset);
  for(let arm=0; arm<params.arms; arm++){
    const armOffset = (TWO_PI/params.arms)*arm + params.armPhase[arm];
    for(let a=0; a<=maxA; a+=params.step){
      const r = a*pitch + params.breathAmp * sin(a*params.breathFreq + t*params.breathSpeed + arm*0.6);
      const x = r*cos(a + t*params.flow + armOffset);
      const y = r*sin(a + t*params.flow + armOffset);
      const sz = params.grainBase + params.grainAmp * sin(a*params.grainFreq + t*params.grainSpeed + arm);
      const h  = wrapHue(lerpHue(params.hueStart, params.hueEnd, a/maxA));
      fill(h, params.spiralSat, params.spiralBri, params.spiralAlpha);
      circle(x, y, sz);
    }
  }
  pop();

  const Rcorona = min(width, height) * params.ringRadiusMul;
  const vmin = min(values);
  for(let i=0; i<values.length; i++){
    const v   = values[i];
    const rad = mapSafe(v, vmin, vmax, MIN_R, MAX_R);
    const ang = (TWO_PI/values.length)*i + t*params.ringRotSpeed + params.ringRotPhase;
    const ox  = (Rcorona + params.ringJitter * sin(t + i + params.ringJitPhaseX)) * cos(ang);
    const oy  = (Rcorona + params.ringJitter * sin(t*0.9 + i + params.ringJitPhaseY)) * sin(ang);

    const col = palette[i % palette.length];
    fill(hue(col), saturation(col), brightness(col), params.ringFillAlpha);
    circle(ox, oy, rad * (1 + params.ringPulse * sin(t*params.ringPulseSpeed + i)));

    fill(hue(col), saturation(col), brightness(col), params.ringGlowAlpha);
    circle(ox, oy, rad * params.ringGlowMul);
  }

  drawAmbientGlow();
  t += 0.02;
}

function windowResized(){ resizeCanvas(windowWidth, windowHeight); }

// ---------- Varianti casuali ----------
function initVariant(seed){
  if(seed!==null){ randomSeed(seed); noiseSeed(seed); }
  else{ currentSeed = floor(random(1e9)); randomSeed(currentSeed); noiseSeed(currentSeed); }

  const baseHue = floor(random(360));
  palette = buildPalette(baseHue);

  params = {
    arms: random()<0.5 ? 1 : 2,
    turns: random(3.6, 5.2),
    step: random(0.06, 0.10),
    rotSpeed: random(0.10, 0.20),
    rotOffset: random(-0.8, 0.8),
    flow: random(0.15, 0.22),
    breathAmp: random(6, 14),
    breathFreq: random(1.6, 2.4),
    breathSpeed: random(0.6, 0.9),
    grainBase: random(5, 7),
    grainAmp: random(2.4, 3.6),
    grainFreq: random(2.2, 3.4),
    grainSpeed: random(1.0, 1.5),
    armPhase: [random(0, 0.8), random(0, 0.8)],
    pitchMul: random(0.9, 1.2),

    hueStart: (baseHue + random(-60, 60)) % 360,
    hueEnd:   (baseHue + random(180, 300)) % 360,
    spiralSat: random(60, 80),
    spiralBri: 96,
    spiralAlpha: 82,

    ringRadiusMul: random(0.24, 0.34),
    ringRotSpeed:  random(0.10, 0.16),
    ringRotPhase:  random(-0.5, 0.5),
    ringPulse:     random(0.04, 0.08),
    ringPulseSpeed:random(0.6, 1.0),
    ringJitter:    random(8, 18),
    ringJitPhaseX: random(0, TWO_PI),
    ringJitPhaseY: random(0, TWO_PI),
    ringFillAlpha: 92,
    ringGlowAlpha: 22,
    ringGlowMul:   random(1.25, 1.45)
  };
}

function drawAmbientGlow(){
  push();
  let g=6;
  for(let i=0;i<g;i++){
    let ang=(TWO_PI/g)*i;
    let R=min(width,height)*0.45;
    let x=R*cos(ang+0.2*sin(t));
    let y=R*sin(ang+0.2*cos(t));
    fill(210,30,30,10);
    circle(x,y,180);
  }
  pop();
}

// ---------- Palette / Hue helpers ----------
function buildPalette(baseHue){
  const offsets=[0,35,140,200,300];
  const hues=offsets.map(o=>(baseHue+o+360)%360);
  return hues.map(h=>color(h, random(72,92), 95));
}
function lerpHue(h1,h2,tt){ const d=(((h2-h1)%360)+540)%360-180; return h1+d*tt; }
function wrapHue(h){ h%=360; return (h<0)?h+360:h; }

// ---------- URL params ----------
function parseDataFromURL(){
  try{
    const q=new URLSearchParams(window.location.search);
    const s=q.get('data'); if(!s) return null;
    const arr=s.split(',').map(x=>parseFloat(x.trim())).filter(isFinite);
    return arr.length?arr:null;
  }catch(e){ return null; }
}
function parseSeedFromURL(){
  try{
    const q=new URLSearchParams(window.location.search);
    const s=q.get('seed'); if(!s) return null;
    const num=Number(s);
    if(Number.isFinite(num)) return Math.floor(num);
    return strHash32(s);
  }catch(e){ return null; }
}
function strHash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function mapSafe(v,a,b,A,B){ return (a===b)?(A+B)/2:map(v,a,b,A,B); }
function median(arr){ if(!arr||!arr.length) return 0; const a=[...arr].sort((x,y)=>x-y); const m=floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }

// ---------- Shortcuts ----------
function keyPressed(){
  if(key==='r'||key==='R'){ currentSeed=null; initVariant(currentSeed); }
  if(key==='s'||key==='S'){ saveCanvas('quello-che-i-dati-non-dicono','png'); }
}
``
