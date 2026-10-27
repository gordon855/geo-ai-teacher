export type SpeechSplit = {
  segments: string[];
  remainder: string;
};

const HARD_BOUNDARIES = new Set(["。", "！", "？", "!", "?", "；", ";", "."]);
const SOFT_BOUNDARIES = new Set(["，", ",", "：", ":"]);

function firstBoundary(text: string, boundaries: Set<string>, minimumLength: number, maximumLength: number) {
  const upper = Math.min(text.length, maximumLength);
  for (let index = Math.max(0, minimumLength - 1); index < upper; index += 1) {
    if (boundaries.has(text[index])) return index + 1;
  }
  return -1;
}

function bestSoftBoundary(text: string, minimumLength: number, maximumLength: number) {
  const upper = Math.min(text.length, maximumLength);
  let candidate = -1;
  for (let index = Math.max(0, minimumLength - 1); index < upper; index += 1) {
    if (SOFT_BOUNDARIES.has(text[index]) || /\s/u.test(text[index])) candidate = index + 1;
  }
  return candidate;
}

export function splitRealtimeSpeech(input: string, flush = false): SpeechSplit {
  let remainder = input.replace(/\s+/gu, " ").trimStart();
  const segments: string[] = [];

  while (remainder) {
    const hard = firstBoundary(remainder, HARD_BOUNDARIES, 6, 76);
    if (hard > 0) {
      segments.push(remainder.slice(0, hard).trim());
      remainder = remainder.slice(hard).trimStart();
      continue;
    }

    if (remainder.length >= 48) {
      const soft = bestSoftBoundary(remainder, 18, 46);
      const take = soft > 0 ? soft : 38;
      segments.push(remainder.slice(0, take).trim());
      remainder = remainder.slice(take).trimStart();
      continue;
    }

    break;
  }

  if (flush && remainder.trim()) {
    segments.push(remainder.trim());
    remainder = "";
  }

  return { segments: segments.filter(Boolean), remainder };
}

