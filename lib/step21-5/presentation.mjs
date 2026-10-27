export function fitSlideWidth(width, height, slideWidth, slideHeight) {
  if (![width, height, slideWidth, slideHeight].every(n => Number.isFinite(n) && n > 0)) return 1;
  return Math.max(1, Math.floor(Math.min(width, height * slideWidth / slideHeight)));
}
export function translationSpeech(result) {
  return [result.translation, result.contextMeaning, result.explanation].filter(Boolean).join('。');
}
