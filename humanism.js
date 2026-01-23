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
    ferie_giorni: "Ferie (giorni)",
    festivita_soppresse: "Festività soppresse",
    riposi_compensativi: "Riposi compensativi",
    pozzetto_ore: "Pozzetto (ore)",
    buoni_pasto: "Buoni pasto",
    straordinario_ore: "Straord. autorizzate (ore)"
  },
  // valori di default (0)
  values: {
    ferie_giorni: 0,
    festivita_soppresse: 0,
    riposi_compensativi: 0,
    pozzetto_ore: 0,
    buoni_pasto: 0,
    straordinario_ore: 0
  }
};

export function toFeatureVector(values, schema){
  const arr = schema.order.map(k => Number(values[k] ?? 0));
  const sum = arr.reduce((a,b)=>a+b,0);
  const mean = sum / Math.max(1, arr.length);

  const variance = arr.reduce((a,x)=>a + (x-mean)**2, 0) / Math.max(1, arr.length);
  const std = Math.sqrt(variance);

  // normalizzazioni “semplici”
  const max = Math.max(...arr, 0);
  const min = Math.min(...arr, 0);
  const range = Math.max(1e-9, max - min);

  // quanto “sbilanciati” sono i dati (outlier)
  const zMax = std > 1e-9 ? (max - mean) / std : 0;

  // vuoti: se molti valori sono 0 o quasi
  const zeros = arr.filter(x => Math.abs(x) < 0.0001).length / arr.length;

  // drift: trend interno (differenze successive)
  const diffs = arr.slice(1).map((x,i)=>x-arr[i]);
  const driftRaw = diffs.reduce((a,b)=>a+Math.abs(b),0) / Math.max(1, diffs.length);
  const drift = clamp01(driftRaw / (mean + 1));

  return {
    arr, sum, mean, std, max, min, range,
    zeros,
    zMax,
    drift
  };
}

export function interpretHumanism(values, features, schema){
  // MAPPING “DATA HUMANISM”
  // - density: quanta “vita” (somma + uniformità)
  // - voids: quanto spazio vuoto intenzionale (dati mancanti/zero)
  // - drift: instabilità / discontinuità
  // - outlier: un valore che spicca rispetto agli altri (z-score)

  const density = clamp01(
    // più somma e meno zeri → più densità
    (Math.log1p(features.sum) / 6) * (1 - 0.8*features.zeros)
  );

  const voids = clamp01(features.zeros * 0.9 + (density < 0.25 ? 0.25 : 0));

  const outlier = clamp01((features.zMax - 0.8) / 2.5); // scatta oltre ~0.8σ

  const drift = clamp01(features.drift);

  const caption = buildCaption(values, schema);
  const text = buildNarrative(values, features, schema);

  return {
    text,
    caption,
    params: { density, voids, drift, outlier }
  };
}

function buildCaption(values, schema){
  // micro-didascalia “umana”, non KPI
  const entries = schema.order.map(k => ({ k, v: Number(values[k] ?? 0), label: schema.labels[k] }));
  entries.sort((a,b)=>b.v-a.v);
  const top = entries[0];
  return `${top.label}: ${formatNum(top.v)} — il resto fa da contesto, non da rumore.`;
}

function buildNarrative(values, features, schema){
  const entries = schema.order.map(k => ({ k, v: Number(values[k] ?? 0), label: schema.labels[k] }));
  const zeros = entries.filter(e => Math.abs(e.v) < 0.0001);

  const sorted = [...entries].sort((a,b)=>b.v-a.v);
  const top = sorted[0];
  const second = sorted[1];

  const parts = [];

  parts.push(`I numeri qui non sono “verità”: sono tracce.`);

  if (zeros.length >= 2){
    parts.push(`Ci sono vuoti (${zeros.length} campi a zero): non è assenza, è informazione non raccontata.`);
  } else {
    parts.push(`Quasi tutto parla: pochi vuoti, molte piccole presenze.`);
  }

  parts.push(`Il peso maggiore cade su **${top.label}** (${formatNum(top.v)}).`);

  if (second && second.v > 0){
    parts.push(`Subito dopo, **${second.label}** (${formatNum(second.v)}): un secondo ritmo, meno evidente.`);
  }

  if (features.drift > 0.55){
    parts.push(`L’insieme è discontinuo: i passaggi tra valori sono bruschi, come una settimana che cambia piano ogni giorno.`);
  } else {
    parts.push(`L’insieme è coerente: differenze moderate, una continuità che regge.`);
  }

  return parts.join(" ");
}

function formatNum(n){
  if (!Number.isFinite(n)) return "0";
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return isInt ? String(Math.round(n)) : n.toFixed(1);
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
