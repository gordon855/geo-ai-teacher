// Cumulative text -> bounded speech segments. Audio is prefetched only one segment ahead.
export function speechText(text) {
  return text.replace(/\[S\d+\]/gu, '').replace(/\[S?\d*$/u, '')
    .replace(/https?:\/\/\S+/gu, '').replace(/[`*_#>|]+/gu, '').replace(/\s+/gu, ' ').trim();
}
export function takeSpeechSegment(text, final = false) {
  let end = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const punctuation = /[。！？!?；;\n]/u.test(ch) || (ch === '.' && /\s/.test(text[i + 1] || '') && !/\d/.test(text[i - 1] || ''));
    if (punctuation && speechText(text.slice(0, i + 1)).length >= 12) { end = i + 1; break; }
  }
  if (!end && text.length >= 160) {
    const prefix = text.slice(0, 160);
    end = Math.max(prefix.lastIndexOf('，'), prefix.lastIndexOf(','), prefix.lastIndexOf(' ')) + 1;
    if (end < 60) end = 160;
    const bracket = text.lastIndexOf('[', end - 1);
    if (bracket >= 0 && !text.slice(bracket, end).includes(']')) end = bracket || end;
    if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  }
  if (!end && final) end = text.length;
  return { segment: text.slice(0, end), rest: text.slice(end) };
}
export class SpeechQueue {
  constructor({ fetchAudio, playAudio, onPending = () => {}, onError = () => {} }) {
    this.fetchAudio = fetchAudio; this.playAudio = playAudio;
    this.onPending = onPending; this.onError = onError;
    this.controller = new AbortController(); this.items = []; this.seen = ''; this.tail = '';
    this.running = false; this.finished = false; this.failed = false;
  }
  push(text, final = false) {
    if (this.controller.signal.aborted || this.failed || this.finished) return;
    // Upstream revisions must not speak two incompatible versions of an answer.
    if (!text.startsWith(this.seen)) { this.cancel(); return; }
    this.tail += text.slice(this.seen.length); this.seen = text; this.finished = final;
    while (this.tail) {
      const { segment, rest } = takeSpeechSegment(this.tail, final);
      if (!segment) break;
      this.tail = rest; const clean = speechText(segment);
      if (clean) this.items.push({ text: clean, audio: null });
    }
    this.prefetch(); void this.drain();
  }
  prefetch() {
    // At most two live blobs: the playing/current item and the next one.
    for (const item of this.items.slice(0, 2)) {
      if (!item.audio) {
        item.audio = Promise.resolve().then(() => {
          if (this.controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError');
          return this.fetchAudio(item.text, this.controller.signal);
        });
        void item.audio.catch(() => {});
      }
    }
  }
  async drain() {
    if (this.running || this.controller.signal.aborted || this.failed || !this.items.length) return;
    this.running = true; this.onPending(true);
    try {
      while (this.items.length && !this.controller.signal.aborted) {
        this.prefetch(); const item = this.items[0]; const blob = await item.audio;
        if (this.controller.signal.aborted) break;
        await this.playAudio(blob, item.text, this.controller.signal);
        this.items.shift();
      }
    } catch (error) {
      if (!this.controller.signal.aborted) { this.failed = true; this.onError(error); this.controller.abort(); }
      this.items.length = 0;
    } finally { this.running = false; this.onPending(false); }
  }
  cancel() { this.controller.abort(); this.items.length = 0; this.tail = ''; this.onPending(false); }
}
