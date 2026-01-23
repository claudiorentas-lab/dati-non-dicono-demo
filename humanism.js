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
    straordinario_ore: "Straordinario autorizzato (ore)"
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

export function toFeatureVector(values, schema) {
  const arr = schema.order.map(k => Number(values[k] ?? 0));
  const sum = arr.reduce((a, b) => a + b, 0);
  const mean = sum / Math.max(1, arr.length);

  const variance = arr.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(1, arr.length);
  const std = Math.sqrt(variance);

  const max = Math.max(...arr, 0);
  const min = Math.min(...arr, 0);
  const zeros = arr.filter(x => Math.abs(x) < 1e-9).length / arr.length;

  const diffs = arr.slice(1).map((x, i) => x - arr[i]);
  const driftRaw = diffs.reduce((a, b) => a + Math.abs(b), 0) / Math.max(1, diffs.length);
  const drift = clamp01(driftRaw / (mean + 1));

  const zMax = std > 1e-9 ? (max - mean) / std : 0;

  return { arr, sum, mean, std, max, min, zeros, drift, zMax };
}

export function interpretHumanism(values, features, schema) {
  const entries = schema.order
    .map(k => ({ key: k, label: schema.labels[k], value: Number(values[k] ?? 0) }))
    .sort((a, b) => b.value - a.value);

  const top = entries[0];
  const low = entries[entries.length - 1];

  const density = clamp01((Math.log1p(features.sum) / 6) * (1 - 0.75 * features.zeros));
  const voids = clamp01(features.zeros * 0.95 + (density < 0.22 ? 0.18 : 0));
  const drift = clamp01(features.drift);
  const outlierMark = clamp01((features.zMax - 0.8) / 2.5);

  const params = {
    layers: Math.floor(lerp(6, 16, density)),
    depth: lerp(10, 56, drift),
    layerShrink: lerp(0.028, 0.048, drift),
    layerWobble: lerp(4, 26, drift),
    stroke: lerp(1, 2.2, density),

    baseRadius: lerp(95, 140, density),
    radiusAmp: lerp(35, 95, density),

    voidRadius: lerp(22, 120, voids),
    voidDrift: lerp(0, 70, drift),
    parallax: lerp(0, 55, drift),

    detail: clamp01(density * 0.9 + drift * 0.25),
    outlierMark
  };

  const palette = pickPalette(features);
  const caption = `${top.label}: ${formatNum(top.value)} · min: ${low.label} ${formatNum(low.value)}`;

  const text = buildNarrative(entries, features);
  const summaryLine = buildSummaryLine(entries, features);

  return { params, palette, caption, text, summaryLine };
}

function buildNarrative(entries, features) {
  const top = entries[0];
  const second = entries[1];
  const zerosCount = entries.filter(e => Math.abs(e.value) < 1e-9).length;

  let t = `Lo screenshot contiene ${entries.length} valori. `;
  t += `${top.label} è il valore più alto (${formatNum(top.value)}). `;

  if (second && second.value > 0) {
    t += `Il secondo valore è ${second.label} (${formatNum(second.value)}). `;
  }

  if (zerosCount >= 2) {
    t += `Ci sono ${zerosCount} campi nulli o assenti: il quadro è parziale e va letto con cautela. `;
  } else if (zerosCount === 1) {
    t += `Un indicatore risulta nullo: possibile assenza di dato o valore effettivamente pari a zero. `;
  } else {
    t += `Tutti gli indicatori risultano presenti. `;
  }

  if (features.drift > 0.55) {
    t += `La distribuzione è discontinua: le differenze tra valori sono marcate. `;
  } else {
    t += `La distribuzione è abbastanza coerente: le differenze sono moderate. `;
  }

  if (features.zMax > 2.2) {
    t += `Un valore spicca nettamente rispetto agli altri (outlier).`;
  } else {
    t += `Non emergono outlier estremi.`;
  }

  return t.trim();
}

function buildSummaryLine(entries, features) {
  const top3 = entries.slice(0, 3).map(e => `${e.label} ${formatNum(e.value)}`).join(" · ");
  const caution =
    features.zeros > 0.33 ? "Nota: possibili dati incompleti." :
    features.drift > 0.6 ? "Nota: distribuzione molto irregolare." :
    "Nota: quadro complessivo leggibile.";
  return `${top3} — ${caution}`;
}

function pickPalette(features) {
  const tension = clamp01(features.drift * 0.7 + features.zeros * 0.5);

  const presets = [
    {
      bg: "#0b0d12",
      fog: "#1b2030",
      primary: "#e7e7e7",
      accent1: "#ff6b6b",
      accent2: "#4dabf7",
      line: "#e7e7e7",
      shadow: "#000000",
      caption: "#cfd3dc"
    },
    {
      bg: "#070b10",
      fog: "#18212a",
      primary: "#e9e5dc",
      accent1: "#ffd166",
      accent2: "#06d6a0",
      line: "#e9e5dc",
      shadow: "#000000",
      caption: "#cfc8bb"
    },
    {
      bg: "#0a0710",
      fog: "#231a33",
      primary: "#e6e2ff",
      accent1: "#b388ff",
      accent2: "#5eead4",
      line: "#e6e2ff",
      shadow: "#000000",
      caption: "#d7d0ff"
    }
  ];

  const idx = tension > 0.66 ? 0 : (tension > 0.33 ? 2 : 1);
  return presets[idx];
}

// utils
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a, b, t) { return a + (b - a) * clamp01(t); }

function formatNum(n) {
  if (!Number.isFinite(n)) return "0";
  const isInt = Math.abs(n - Math.round(n)) < 1e-9;
  return isInt ? String(Math.round(n)) : n.toFixed(1);
}
