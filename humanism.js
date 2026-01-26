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

// Tooltip “data humanism” per singolo indicatore.
// Frasi: concrete, contestuali, non moraliste.
export function interpretHumanismForKey(key, value) {
  const v = formatNum(value);

  if (key === "ferie_giorni") {
    return `${v} giorni di ferie significano margine di recupero potenziale. Se restano “da programmare”, non sono riposo reale: sono tempo non ancora protetto in agenda. La lettura humanism chiede: quando diventa recupero vero?`;
  }

  if (key === "festivita_soppresse") {
    return `${v} festività soppresse sono un credito piccolo ma delicato: spesso si perde per mancanza di pianificazione. È un indicatore di micro-spazi di pausa che vanno resi visibili e usabili.`;
  }

  if (key === "riposi_compensativi") {
    if (Number(value) === 0) {
      return `Riposi compensativi a zero: in questo canale non c’è un cuscinetto di recupero. Il riposo passa da ferie, micro-pause e organizzazione del carico.`;
    }
    return `${v} riposi compensativi indicano recupero extra disponibile oltre al normale. Non è “tempo libero”: è un debito/credito di energia che va collocato nel calendario per diventare reale.`;
  }

  if (key === "pozzetto_ore") {
    return `${v} ore di pozzetto sono tempo “sparso”: utile per respirare, gestire imprevisti o spezzare giornate dense. Se resta solo accumulo, segnala che il sistema non sta creando spazio operativo.`;
  }

  if (key === "buoni_pasto") {
    return `${v} buoni pasto nel mese sono una traccia indiretta di presenza e routine. Non misurano benessere, ma descrivono continuità delle giornate “in servizio” e quanto il lavoro occupa il tempo quotidiano.`;
  }

  if (key === "straordinario_ore") {
    if (Number(value) === 0) {
      return `Straordinario autorizzato a zero: qui non emerge carico extra formalizzato. Questo non significa assenza di pressione: significa solo che non è rappresentata in questo indicatore.`;
    }
    return `${v} ore di straordinario autorizzate descrivono un fatto amministrativo (spesso riferito al mese precedente), non energia disponibile. È utile per capire pressione e capacità del sistema di riconoscerla, non per giudicare la persona.`;
  }

  return `${v} — un numero che ha senso solo con contesto (scadenze, salute, carico, vincoli).`;
}

function formatNum(n) {
  if (!Number.isFinite(Number(n))) return "0";
  const x = Number(n);
  const isInt = Math.abs(x - Math.round(x)) < 1e-9;
  return isInt ? String(Math.round(x)) : x.toFixed(2).replace(".", ",");
}
