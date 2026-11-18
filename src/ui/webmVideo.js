// Tuvalden WebM: MediaRecorder + süre yaması. Kütüphane yok.
//
// MediaRecorder canlı yayın gibi yazar: dosyada toplam süre bulunmaz, oynatıcılar
// ilerleme çubuğu gösteremez ve sitelere yüklenince süre "0:00" görünür. Süre,
// dosyanın başındaki Info bölümüne tek alan olarak eklenir.

const ID = {
  SEGMENT: 0x18538067, INFO: 0x1549a966, DURATION: 0x4489,
};

const CODECS = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** Tarayıcının yazabildiği ilk biçim; yoksa null. */
export function webmMimeType() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  return CODECS.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function readId(bytes, at) {
  const first = bytes[at];
  const length = first >= 0x80 ? 1 : first >= 0x40 ? 2 : first >= 0x20 ? 3 : first >= 0x10 ? 4 : 0;
  if (!length) return null;
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[at + i];
  return { value, length };
}

function readSize(bytes, at) {
  const first = bytes[at];
  let length = 1;
  for (let mask = 0x80; length <= 8 && !(first & mask); mask >>= 1) length++;
  if (length > 8) return null;
  let value = first & (0xff >> length);
  let unknown = value === (0xff >> length);
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[at + i];
    if (bytes[at + i] !== 0xff) unknown = false;
  }
  return { value, length, unknown };
}

function writeSize(bytes, at, length, value) {
  let rest = value;
  for (let i = length - 1; i > 0; i--) {
    bytes[at + i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  bytes[at] = rest | (0x80 >> (length - 1));
}

/**
 * WebM'e süre yazar. Beklenmedik yapıda dosya olduğu gibi döner: süresiz video,
 * bozulmuş videodan iyidir.
 * @param {Blob} blob @param {number} durationMs
 * @returns {Promise<Blob>}
 */
export async function withWebmDuration(blob, durationMs) {
  const head = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  let at = 0;
  const header = readId(head, at);
  const headerSize = header && readSize(head, at + header.length);
  if (!headerSize || headerSize.unknown) return blob;
  at += header.length + headerSize.length + headerSize.value;

  const segment = readId(head, at);
  if (segment?.value !== ID.SEGMENT) return blob;
  const segmentAt = at + segment.length;
  const segmentSize = readSize(head, segmentAt);
  if (!segmentSize) return blob;
  at = segmentAt + segmentSize.length;

  while (at < head.length - 12) {
    const id = readId(head, at);
    const size = id && readSize(head, at + id.length);
    if (!size || size.unknown) return blob;
    const body = at + id.length + size.length;
    if (id.value !== ID.INFO) {
      at = body + size.value;
      continue;
    }
    const end = body + size.value;
    if (end > head.length) return blob;
    for (let inner = body; inner < end;) {
      const field = readId(head, inner);
      const fieldSize = field && readSize(head, inner + field.length);
      if (!fieldSize) return blob;
      if (field.value === ID.DURATION) return blob;
      inner += field.length + fieldSize.length + fieldSize.value;
    }
    // Süre alanı: kimlik (2) + boy (1) + 64 bit kayan nokta (8). Birim
    // TimecodeScale'dir; MediaRecorder'ın varsayılanı 1 ms.
    const added = new Uint8Array(11);
    added.set([0x44, 0x89, 0x88]);
    new DataView(added.buffer).setFloat64(3, durationMs, false);
    const before = head.slice(0, end);
    writeSize(before, at + id.length, size.length, size.value + added.length);
    if (!segmentSize.unknown) {
      writeSize(before, segmentAt, segmentSize.length, segmentSize.value + added.length);
    }
    return new Blob([before, added, blob.slice(end)], { type: blob.type });
  }
  return blob;
}

/**
 * Tuvali kaydeder. Görüntüyü çağıran üretir; burası yalnız akışı ve dosyayı yönetir.
 * @param {HTMLCanvasElement} canvas
 * @returns {null | {pause: Function, resume: Function, cancel: Function, finish: () => Promise<Blob|null>}}
 */
export function recordCanvas(canvas, { fps = 30, bitsPerSecond = 5_000_000 } = {}) {
  const mimeType = webmMimeType();
  if (!mimeType) return null;
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
  const stopTracks = () => { for (const track of stream.getTracks()) track.stop(); };
  let cancelled = false;
  let heldMs = 0;
  let pausedAt = 0;
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(1000);
  const startedAt = performance.now();
  return {
    pause() {
      if (recorder.state !== 'recording') return;
      recorder.pause();
      pausedAt = performance.now();
    },
    resume() {
      if (recorder.state !== 'paused') return;
      recorder.resume();
      heldMs += performance.now() - pausedAt;
    },
    cancel() {
      cancelled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      stopTracks();
    },
    async finish() {
      const durationMs = performance.now() - startedAt - heldMs;
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      stopTracks();
      if (cancelled || !chunks.length) return null;
      return withWebmDuration(new Blob(chunks, { type: 'video/webm' }), durationMs);
    },
  };
}
