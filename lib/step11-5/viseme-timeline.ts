export type TextViseme = "rest" | "closed" | "open" | "wide" | "round" | "teeth" | "tongue" | "adaptive";

type SpeechUnit = {
  symbol: string;
  weight: number;
  viseme: TextViseme;
};

const PAUSE = /[\s，。！？!?；;：:、,.…—\-()[\]{}“”‘’"']/u;
const HAN = /[\p{Script=Han}]/u;

function latinViseme(value: string): TextViseme {
  const symbol = value.toLowerCase();
  if (/[mbp]/u.test(symbol)) return "closed";
  if (/[fv]/u.test(symbol)) return "teeth";
  if (/[lntd]/u.test(symbol)) return "tongue";
  if (/[eiyj]/u.test(symbol)) return "wide";
  if (/[ouwq]/u.test(symbol)) return "round";
  if (/[aàáâäæhkgx]/u.test(symbol)) return "open";
  return "adaptive";
}

function speechUnits(text: string): SpeechUnit[] {
  const normalized = text
    .replace(/\[S\d+\]/gu, "")
    .replace(/https?:\/\/\S+/gu, "")
    .replace(/[`*_#>|]+/gu, " ")
    .trim();
  const symbols = Array.from(normalized);
  if (!symbols.length) return [{ symbol: "", weight: 1, viseme: "rest" }];
  return symbols.map((symbol) => {
    if (PAUSE.test(symbol)) return { symbol, weight: /[。！？!?；;…]/u.test(symbol) ? 1.8 : 0.7, viseme: "rest" as const };
    if (HAN.test(symbol)) return { symbol, weight: 1.15, viseme: "adaptive" as const };
    if (/[a-zàáâäæ]/iu.test(symbol)) return { symbol, weight: 0.72, viseme: latinViseme(symbol) };
    if (/\d/u.test(symbol)) return { symbol, weight: 0.9, viseme: "adaptive" as const };
    return { symbol, weight: 0.8, viseme: "adaptive" as const };
  });
}

export function visemeAtProgress(text: string, progress: number): TextViseme {
  const units = speechUnits(text);
  const total = units.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.max(0, Math.min(0.999_999, progress)) * total;
  for (const unit of units) {
    if (cursor <= unit.weight) return unit.viseme;
    cursor -= unit.weight;
  }
  return units.at(-1)?.viseme || "rest";
}
