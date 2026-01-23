export const defaultSchema = {
  order: [
    "ferie_giorni",
    "festivita_soppresse",
    "riposi_compensativi",
    "pozzetto_ore",
    "buoni_pasto",
    "straordinario_ore"
  ],
  labels: {
    ferie_giorni: "Ferie",
    festivita_soppresse: "Festività soppresse",
    riposi_compensativi: "Riposi compensativi",
    pozzetto_ore: "Pozzetto (ore)",
    buoni_pasto: "Buoni pasto",
    straordinario_ore: "Straordinario (ore)"
  },
  values: {
    ferie_giorni: 0,
    festivita_soppresse: 0,
    riposi_compensativi: 0,
    pozzetto_ore: 0,
    buoni_pasto: 0,
    straordinario_ore: 0
  }
};

// palette contemporanee (sobrie ma vive)
const palettes = [
  { bg:"#0b0d12", fog:"#1b2030", line:"#e7e7e7", caption:"#cfd3dc", min:"#5eead4", max:"#ff6b6b" },
  { bg:"#070b10", fog:"#18212a", line:"#e9e5dc", caption:"#cfc8bb", min:"#06d6a0", max:"#ffd166" },
  { bg:"#0a0710", fog:"#231a33", line:"#e6e2ff", caption:"#d7d0ff", min:"#5eead4", max:"#b388ff" }
];

// mapping forma per categoria (stabile = riconoscibile)
export const shapeMap = {
  ferie_giorni: "circle",
  festivita_soppresse: "square",
  riposi_compensativi: "triangle",
  pozzetto_ore: "hex",
  buoni_pasto: "diamond",
  straordinario_ore: "blob"
};

// ---- Humanism interpretation (chiara, trasparente)
export function interpretHumanism(values, schema = defaultSchema) {
  const arr = schema.order.map(k => Number(values[k] ?? 0));
  const sum = arr.reduce((a,b)=>a+b,0);
  const zeros = arr.filter(x => Math.abs(x) < 1e-9).length;

  const entries = schema.order
    .map(k => ({ key:k, label:schema.labels[k], value:Number(values[k] ?? 0) }))
    .sort((a,b)=>b.value-a.value);

  const top = entries[0];
  const second = entries[1];
  const low = entries[entries.length - 1];

  // “qualità dato” = quante assenze/zeri + quanto sbilanciamento
  const mean = sum / Math.max(1, arr.length);
  const variance = arr.reduce((a,x)=>a + (x-mean)**2,0)/Math.max(1,arr.length);
  const std = Math.sqrt(variance);
  const zMax = std > 1e-9 ? (Math.max(...arr) - mean)/std : 0;

  const completeness =
    zeros >= 3 ? "bassa" :
    zeros === 2 ? "media" :
    zeros === 1 ? "discreta" : "alta";

  const balance =
    zMax > 2.2 ? "molto sbilanciata" :
    zMax > 1.2 ? "sbilanciata" : "abbastanza bilanciata";

  // Data humanism = contesto + limiti + significato operativo
  let text = "";
  text += `Questi dati descrivono una situazione attraverso ${entries.length} indicatori. `;
  text += `Completezza stimata: ${completeness} (campi a zero: ${zeros}). `;
  text += `Distribuzione: ${balance}. `;

  text += `${top.label} è l’elemento dominante (${fmt(top.value)}). `;
  if (second && second.value > 0) text += `Segue ${second.label} (${fmt(second.value)}). `;

  text += `Il valore più basso è ${low.label} (${fmt(low.value)}). `;
  text += `Interpretazione “humanism”: non è un giudizio, è un promemoria su dove si concentra il carico e dove mancano segnali.`;

  const summaryLine =
    `Dominante: ${top.label} ${fmt(top.value)} · Secondo: ${second?.label ?? "-"} ${fmt(second?.value ?? 0)} · Dato minimo: ${low.label} ${fmt(low.value)} · Zeri: ${zeros}`;

  // palette scelta in base a “tensione” (sbilanciamento)
  const tension = clamp01((zMax - 0.8) / 2.4 + zeros / 6);
  const palette = tension > 0.66 ? palettes[0] : (tension > 0.33 ? palettes[2] : palettes[1]);

  const caption = `${top.label}: ${fmt(top.value)} · min: ${low.label} ${fmt(low.value)} · zeri: ${zeros}`;

  return {
    values: { ...values },
    text,
    summaryLine,
    caption,
    palette,
    mapping: { shapeMap }
  };
}

// ---- Visual model (1 forma per numero, tracciabile)
export function buildVisualModel(values, palette, mapping) {
  const keys = defaultSchema.order;
  const entries = keys.map(k => ({ key:k, label: defaultSchema.labels[k], value: Number(values[k] ?? 0) }));

  const minValue = Math.min(...entries.map(e => e.value));
  const maxValue = Math.max(...entries.map(e => e.value));
  const denom = Math.max(1e-9, maxValue - minValue);

  // layout editoriale (composizione contemporanea: griglia irregolare)
  // posizioni base (puoi cambiarle per “stile”)
  const positions = [
    { x0: 0.28, y0: 0.30, depth: 1 },
    { x0: 0.68, y0: 0.28, depth: 2 },
    { x0: 0.34, y0: 0.62, depth: 3 },
    { x0: 0.72, y0: 0.60, depth: 4 },
    { x0: 0.52, y0: 0.44, depth: 2 },
    { x0: 0.50, y0: 0.74, depth: 3 }
  ];

  const shapes = entries.map((e, i) => {
    const intensity = clamp01((e.value - minValue) / denom); // 0..1
    const color = mixHex(palette.min, palette.max, intensity);

    // grandezza = valore (con compressione log)
    const size = lerp(34, 110, clamp01(Math.log1p(Math.max(0, e.value)) / Math.log1p(Math.max(1, maxValue))));

    const pos = positions[i] || { x0: 0.5, y0: 0.5, depth: 2 };

    return {
      id: i + 1,
      key: e.key,
      label: e.label,
      value: e.value,
      intensity,
      color,
      shape: (mapping?.shapeMap?.[e.key] || "blob"),
      r: size,
      // x0,y0 verranno scalati su canvas in p5 (qui valori “relativi”)
      x0_rel: pos.x0,
      y0_rel: pos.y0,
      depth: pos.depth,
      // questi verranno impostati in p5 (x0,y0 assoluti)
      x0: 0, y0: 0
    };
  });

  // nota: x0/y0 assoluti vengono impostati nel disegno (perché serve width/height)
  // ma qui lasciamo la ricetta: rel -> abs in p5
  return {
    shapes: shapes.map(s => ({
      ...s,
      // placeholder: verranno sovrascritti all’avvio del p5
      x0: 0,
      y0: 0
    })),
    minValue,
    maxValue,
    minColor: palette.min,
    maxColor: palette.max
  };
}

// ---- Utils
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function lerp(a,b,t){ return a + (b-a)*clamp01(t); }
function fmt(n){
  if (!Number.isFinite(n)) return "0";
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return isInt ? String(Math.round(n)) : n.toFixed(1);
}

// mix colori hex (min->max)
function mixHex(a, b, t){
  const A = hexToRgb(a), B = hexToRgb(b);
  const r = Math.round(lerp(A.r, B.r, t));
  const g = Math.round(lerp(A.g, B.g, t));
  const bb = Math.round(lerp(A.b, B.b, t));
  return rgbToHex(r,g,bb);
}

function hexToRgb(hex){
  const h = hex.replace("#","");
  const full = h.length === 3 ? h.split("").map(c=>c+c).join("") : h;
  const n = parseInt(full, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}

function rgbToHex(r,g,b){
  const to = (x)=>x.toString(16).padStart(2,"0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
