export type ReliableSpeechSplit = {
  segments: string[];
  remainder: string;
};

const HARD_BOUNDARIES = new Set(["。", "！", "？", "!", "?", "；", ";", ".", "\n"]);
const SOFT_BOUNDARIES = new Set(["，", ",", "：", ":", "、"]);

function firstBoundary(text: string, boundaries: Set<string>, minimumLength: number, maximumLength: number) {
  const upper = Math.min(text.length, maximumLength);
  for (let index = Math.max(0, minimumLength - 1); index < upper; index += 1) {
    if (boundaries.has(text[index])) return index + 1;
  }
  return -1;
}

function bestBoundary(text: string, minimumLength: number, maximumLength: number) {
  const upper = Math.min(text.length, maximumLength);
  let candidate = -1;
  for (let index = Math.max(0, minimumLength - 1); index < upper; index += 1) {
    if (SOFT_BOUNDARIES.has(text[index]) || /\s/u.test(text[index])) candidate = index + 1;
  }
  return candidate;
}

/**
 * Step 11.5 keeps the first spoken sentence responsive, while avoiding the
 * dozens of simultaneous short TTS calls that caused Step 11.3 to be limited.
 */
export function splitReliableRealtimeSpeech(input: string, flush = false): ReliableSpeechSplit {
  let remainder = input.replace(/[ \t]+/gu, " ").trimStart();
  const segments: string[] = [];

  while (remainder) {
    const hard = firstBoundary(remainder, HARD_BOUNDARIES, 14, 138);
    if (hard > 0) {
      segments.push(remainder.slice(0, hard).trim());
      remainder = remainder.slice(hard).trimStart();
      continue;
    }

    if (remainder.length >= 152) {
      const soft = bestBoundary(remainder, 84, 138);
      const take = soft > 0 ? soft : 120;
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
