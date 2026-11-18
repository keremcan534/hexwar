// TEKRAR KAYDI — kampanyanın sınır tarihi, ayda bir kare.
//
// Kaydedici simülasyonun DIŞINDADIR: haftanın sonunda dünyayı okur, hiçbir
// alanı yazmaz ve zar çekmez. Olaylar da bu yüzden çağrı yerlerinden değil
// durum farkından çıkar (savaş matrisi, yaşayan uluslar): savaş ilanının yedi
// ayrı yoluna kanca takmak hem birini unutmanın hem de simülasyona dokunmanın
// garantisiydi.
//
// Biçim metindir, çünkü kayıt JSON'dur: 6 bitlik karakterlerle değişken boylu
// tam sayı (5 bit veri + devam biti). Bir ay çoğunlukla hiçbir şey değiştirmez
// ve tek karakter tutar; 46 yıllık 160×96 kampanya kaydın %1'inin altında kalır
// (scripts/audit/replay-audit.mjs ölçer).
//
//   base  ilk karenin sahipleri: (sahip+1, tekrar) çiftleri
//   log   sonraki kareler: baş = grup×2 + olayVarMı
//           grup: sahip+1, adet, adet × (province kimliği farkı − 1)
//           olaylar: adet, adet × (tür, a+1, b+1)
//
// Katman kuralı: burada DOM yok; Node'da çözülüp doğrulanabilir.

import { monthOfTurn } from './calendar.js';
import { WAR } from './diplomacy.js';

const FORMAT = 1;

/** Kayıttaki olay türleri (sayılar kayda girer: değiştirilmez, yalnız eklenir). */
export const REPLAY_EVENT = { WAR: 0, PEACE: 1, BORN: 2, FALL: 3 };

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUE[ALPHABET.charCodeAt(i)] = i;

function encodeInt(value) {
  let out = '';
  let rest = value;
  while (rest >= 32) {
    out += ALPHABET[32 | (rest % 32)];
    rest = Math.floor(rest / 32);
  }
  return out + ALPHABET[rest];
}

/** Bozuk metin sessizce yanlış harita çizmesin: tükenen ya da yabancı karakter atar. */
class Reader {
  constructor(text) {
    this.text = text;
    this.at = 0;
  }

  int() {
    let value = 0;
    let shift = 1;
    for (;;) {
      const code = VALUE[this.text.charCodeAt(this.at++)] ?? -1;
      if (code < 0) throw new RangeError('replay: bozuk akış');
      value += (code & 31) * shift;
      if (code < 32) return value;
      shift *= 32;
    }
  }
}

function encodeOwners(owners) {
  let out = '';
  for (let i = 0; i < owners.length;) {
    let run = 1;
    while (i + run < owners.length && owners[i + run] === owners[i]) run++;
    out += encodeInt(owners[i] + 1) + encodeInt(run);
    i += run;
  }
  return out;
}

function decodeOwners(text, count) {
  const owners = new Int16Array(count);
  const reader = new Reader(text);
  for (let i = 0; i < count;) {
    const owner = reader.int() - 1;
    const run = reader.int();
    if (run < 1 || i + run > count) throw new RangeError('replay: bozuk taban');
    owners.fill(owner, i, i + run);
    i += run;
  }
  return owners;
}

function aliveIds(world) {
  const out = [];
  for (const nation of world.nations) if (nation.alive) out.push(nation.id);
  return out;
}

/** Savaştaki çiftler, küçük kimlik önde; artan anahtar sırasıyla. */
function warKeys(world, alive) {
  const size = world.nations.length;
  const out = [];
  for (let i = 0; i < alive.length; i++) {
    const row = world.relations?.[alive[i]];
    if (!row) continue;
    for (let j = i + 1; j < alive.length; j++) {
      if (row[alive[j]]?.state === WAR) out.push(alive[i] * size + alive[j]);
    }
  }
  return out;
}

/** İki artan listenin farkı: ilkinde kalanlar `gone`, yalnız ikincide olanlar `came`. */
function diffSorted(before, after, gone, came) {
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (j >= after.length || (i < before.length && before[i] < after[j])) gone(before[i++]);
    else if (i >= before.length || after[j] < before[i]) came(after[j++]);
    else {
      i++;
      j++;
    }
  }
}

/** Son kareden bugüne fark. Yalnız okur: kayıt da canlı son kare de bunu kullanır. */
function scanWorld(world, owners, seen) {
  const provinces = world.provinces ?? [];
  const moved = new Map();
  for (let id = 0; id < owners.length; id++) {
    const owner = provinces[id]?.owner ?? -1;
    if (owner === owners[id]) continue;
    const ids = moved.get(owner);
    if (ids) ids.push(id);
    else moved.set(owner, [id]);
  }
  const alive = aliveIds(world);
  const wars = warKeys(world, alive);
  const size = world.nations.length;
  const events = [];
  diffSorted(seen.alive, alive,
    (id) => events.push([REPLAY_EVENT.FALL, id, -1]),
    (id) => events.push([REPLAY_EVENT.BORN, id, -1]));
  diffSorted(seen.wars, wars,
    (key) => events.push([REPLAY_EVENT.PEACE, Math.floor(key / size), key % size]),
    (key) => {
      const a = Math.floor(key / size);
      const b = key % size;
      // Saldıran önde: başlık "A, B'ye saldırdı" diyebilsin.
      const flip = world.relations[a]?.[b]?.aggressor === b;
      events.push([REPLAY_EVENT.WAR, flip ? b : a, flip ? a : b]);
    });
  return { moved, events, alive, wars };
}

function encodeFrame(moved, events) {
  let out = encodeInt(moved.size * 2 + (events.length ? 1 : 0));
  for (const [owner, ids] of moved) {
    out += encodeInt(owner + 1) + encodeInt(ids.length);
    let last = -1;
    for (const id of ids) {
      out += encodeInt(id - last - 1);
      last = id;
    }
  }
  if (events.length) {
    out += encodeInt(events.length);
    for (const [kind, a, b] of events) out += encodeInt(kind) + encodeInt(a + 1) + encodeInt(b + 1);
  }
  return out;
}

/** Akışı baştan okur; ziyaretçi her karenin başında, her taşımada ve olayda çağrılır. */
function walkLog(replay, { frame: onFrame, move, event }) {
  const reader = new Reader(replay.log);
  for (let frame = 1; frame < replay.frames; frame++) {
    onFrame?.(frame);
    const head = reader.int();
    for (let group = Math.floor(head / 2); group > 0; group--) {
      const owner = reader.int() - 1;
      let id = -1;
      for (let left = reader.int(); left > 0; left--) {
        id += reader.int() + 1;
        move?.(frame, id, owner);
      }
    }
    if (head % 2) {
      for (let left = reader.int(); left > 0; left--) {
        const kind = reader.int();
        const a = reader.int() - 1;
        const b = reader.int() - 1;
        event?.(frame, kind, a, b);
      }
    }
  }
}

function lastOwners(replay) {
  const owners = decodeOwners(replay.base, replay.provinces);
  walkLog(replay, { move: (_, id, owner) => { owners[id] = owner; } });
  return owners;
}

/**
 * Son karenin sahipleri kayda girmez, akıştan türetilir. Ayrı tablo: kayıt
 * denetimi dünyanın alanlarını canlı ve yüklenmiş hâlde karşılaştırır.
 */
const LAST_OWNERS = new WeakMap();

/** Kaydı bugünden başlatır (yeni kampanya ya da kaydı olmayan eski yuva). */
export function beginReplay(world) {
  const provinces = world.provinces ?? [];
  const owners = Int16Array.from(provinces, (province) => province.owner ?? -1);
  const alive = aliveIds(world);
  const wars = warKeys(world, alive);
  world.replay = {
    format: FORMAT,
    start: monthOfTurn(world.turn ?? 1),
    frames: 1,
    provinces: provinces.length,
    base: encodeOwners(owners),
    log: '',
    // Kayıt savaşın ortasında başlamış olabilir (eski yuva): sayaç doğru başlasın.
    firstWars: wars,
    seen: { alive, wars },
  };
  LAST_OWNERS.set(world, owners);
  return world.replay;
}

/**
 * Haftalık kanca. Yeni takvim ayına girilmediyse hiçbir şey yapmaz; girildiyse
 * son kareden farkı akışa ekler.
 * @returns {boolean} kare yazıldı mı
 */
export function recordReplay(world) {
  const replay = world.replay;
  if (!replay) return false;
  const due = monthOfTurn(world.turn) - (replay.start + replay.frames - 1);
  if (due <= 0) return false;
  let owners = LAST_OWNERS.get(world);
  if (!owners) {
    owners = lastOwners(replay);
    LAST_OWNERS.set(world, owners);
  }
  const { moved, events, alive, wars } = scanWorld(world, owners, replay.seen);
  // Hafta ayı atlayamaz; yine de kare sırası ay sırasıyla bire bir kalsın.
  replay.log += 'A'.repeat(due - 1) + encodeFrame(moved, events);
  replay.frames += due;
  for (const [owner, ids] of moved) for (const id of ids) owners[id] = owner;
  replay.seen = { alive, wars };
  return true;
}

/** Kayda giden kopya: canlı dizileri paylaşmaz. */
export function serializeReplay(world) {
  const replay = world.replay;
  if (!replay) return null;
  return {
    ...replay,
    firstWars: [...replay.firstWars],
    seen: { alive: [...replay.seen.alive], wars: [...replay.seen.wars] },
  };
}

function validReplay(world, saved) {
  if (saved?.format !== FORMAT || saved.provinces !== (world.provinces?.length ?? 0)) return false;
  if (typeof saved.base !== 'string' || typeof saved.log !== 'string') return false;
  if (!Number.isInteger(saved.start) || !Number.isInteger(saved.frames) || saved.frames < 1) return false;
  return Array.isArray(saved.firstWars) && Array.isArray(saved.seen?.alive) && Array.isArray(saved.seen?.wars);
}

/**
 * Yüklemede kayıt geri gelir. Alan yoksa (tekrardan önce alınmış kayıt) ya da
 * okunamıyorsa kampanya bozulmaz: tekrar yükleme ayından itibaren başlar.
 * Sahip listesi dünya kurulduktan SONRA çağrılmalıdır.
 */
export function restoreReplay(world, saved) {
  LAST_OWNERS.delete(world);
  if (!validReplay(world, saved)) return beginReplay(world);
  const replay = {
    ...saved,
    firstWars: [...saved.firstWars],
    seen: { alive: [...saved.seen.alive], wars: [...saved.seen.wars] },
  };
  try {
    LAST_OWNERS.set(world, lastOwners(replay));
  } catch (err) {
    return beginReplay(world);
  }
  world.replay = replay;
  return replay;
}

/**
 * Kaydı oynatılabilir hâle açar. Son kare CANLI dünyadır: ay ortasında açılan
 * ekran ve 1945'in son haftası kaydın gerisinde kalmasın.
 *
 * @returns {null | {
 *   start: number, frames: number, provinces: number,
 *   owners: Int16Array, wars: Uint16Array, nations: Uint16Array,
 *   events: Array<{frame: number, kind: number, a: number, b: number}>,
 * }} `owners` kare × province boyunda düz tablodur (sürüklemede anında erişim)
 */
export function decodeReplay(world) {
  const replay = world?.replay;
  if (!replay) return null;
  const { frames, provinces: count, start } = replay;
  const owners = new Int16Array(frames * count);
  owners.set(decodeOwners(replay.base, count), 0);
  const events = [];
  walkLog(replay, {
    frame: (frame) => owners.copyWithin(frame * count, (frame - 1) * count, frame * count),
    move: (frame, id, owner) => { owners[frame * count + id] = owner; },
    event: (frame, kind, a, b) => events.push({ frame, kind, a, b }),
  });

  const last = frames - 1;
  const tail = scanWorld(world, owners.subarray(last * count, frames * count), replay.seen);
  for (const [owner, ids] of tail.moved) for (const id of ids) owners[last * count + id] = owner;
  for (const [kind, a, b] of tail.events) events.push({ frame: last, kind, a, b });

  // Karedeki savaş ve ulus sayısı (zaman şeridi ve sayaçlar).
  const wars = new Uint16Array(frames);
  const open = new Set(replay.firstWars);
  const size = world.nations.length;
  const pair = (a, b) => Math.min(a, b) * size + Math.max(a, b);
  let at = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (; at < events.length && events[at].frame === frame; at++) {
      const { kind, a, b } = events[at];
      if (kind === REPLAY_EVENT.WAR) open.add(pair(a, b));
      else if (kind === REPLAY_EVENT.PEACE) open.delete(pair(a, b));
    }
    wars[frame] = open.size;
  }
  const nations = new Uint16Array(frames);
  const stamp = new Int32Array(size).fill(-1);
  for (let frame = 0; frame < frames; frame++) {
    let distinct = 0;
    for (let i = frame * count, end = i + count; i < end; i++) {
      const owner = owners[i];
      if (owner >= 0 && stamp[owner] !== frame) {
        stamp[owner] = frame;
        distinct++;
      }
    }
    nations[frame] = distinct;
  }
  return { start, frames, provinces: count, owners, wars, nations, events };
}

/** Karenin sahip satırı (kopyasız görünüm). */
export function replayRow(decoded, frame) {
  const at = Math.max(0, Math.min(decoded.frames - 1, frame)) * decoded.provinces;
  return decoded.owners.subarray(at, at + decoded.provinces);
}

// ---------------------------------------------------------------- BAŞLIKLAR ---

const HEADLINE_LIMIT = 96;
const HEADLINE_PER_YEAR = 4;
/**
 * Doğuş ve yıkılış öne alınır: küçük ulusların olayıdır, toprak ağırlığıyla
 * savaşların gerisinde kalıp akıştan bütünüyle düşüyordu (ölçüldü, 160×96 tam
 * kampanya: 26 doğuş ve 22 yıkılıştan 72 başlığa 0 doğuş, 1 yıkılış girdi).
 */
const RARE_KIND_WEIGHT = 1000;

/** Karedeki ulusların kare (hex) sayısı. */
function tilesAt(world, row) {
  const tiles = new Int32Array(world.nations.length);
  for (let id = 0; id < row.length; id++) {
    if (row[id] >= 0) tiles[row[id]] += world.provinces[id].tileIdx.length;
  }
  return tiles;
}

/** `select(id)` ile seçilen provincelerde en sık görülen değer (-1 ve `skip` hariç). */
function commonest(count, select, skip) {
  const votes = new Map();
  let best = -1;
  let bestVotes = 0;
  for (let id = 0; id < count; id++) {
    const value = select(id);
    if (value == null || value < 0 || value === skip) continue;
    const next = (votes.get(value) ?? 0) + 1;
    votes.set(value, next);
    if (next > bestVotes || (next === bestVotes && value < best)) {
      best = value;
      bestVotes = next;
    }
  }
  return best;
}

/** Aynı ayın savaşları ittifak zinciriyle tek olaya toplanır. */
function clusterPairs(pairs) {
  const parent = new Map();
  const find = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root);
    parent.set(id, root);
    return root;
  };
  for (const { a, b } of pairs) parent.set(find(a), find(b));
  const clusters = new Map();
  for (const entry of pairs) {
    const root = find(entry.a);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(entry);
  }
  return [...clusters.values()];
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/**
 * Akışın büyük olayları: oyuncununkiler ve toprağı en çok oynatanlar, yıla
 * dengeli dağıtılmış. Metinler bir yerde kurulur; ekran ve video aynısını basar.
 * @returns {Array<{frame:number, kind:'war'|'peace'|'born'|'fall', title:string,
 *   detail:string, focus:number, mine:boolean, weight:number}>}
 */
export function replayHeadlines(world, decoded, player = -1) {
  if (!decoded) return [];
  const nameOf = (id) => world.nations[id]?.name ?? 'Unknown';
  const byFrame = new Map();
  for (const event of decoded.events) {
    if (!byFrame.has(event.frame)) byFrame.set(event.frame, []);
    byFrame.get(event.frame).push(event);
  }
  const fallen = new Set();
  const out = [];
  for (const [frame, events] of byFrame) {
    const row = replayRow(decoded, frame);
    const before = replayRow(decoded, frame - 1);
    const tilesNow = tilesAt(world, row);
    const tilesThen = tilesAt(world, before);
    const size = (id) => Math.max(tilesThen[id], tilesNow[id]);
    const fellNow = new Set(events.filter((e) => e.kind === REPLAY_EVENT.FALL).map((e) => e.a));
    const push = (entry, participants) => {
      const mine = participants.includes(player);
      const rare = entry.kind === 'born' || entry.kind === 'fall';
      out.push({
        frame, ...entry, mine, weight: entry.weight + (rare ? RARE_KIND_WEIGHT : 0) + (mine ? 1e6 : 0),
      });
    };

    for (const event of events) {
      if (event.kind === REPLAY_EVENT.BORN) {
        if (tilesNow[event.a] <= 0) continue;
        const from = commonest(row.length, (id) => (row[id] === event.a ? before[id] : null), event.a);
        push({
          kind: 'born',
          title: fallen.has(event.a) ? `${nameOf(event.a)} rises again` : `${nameOf(event.a)} is born`,
          detail: from >= 0 ? `Breaks away from ${nameOf(from)}` : '',
          focus: event.a,
          weight: tilesNow[event.a] * 1.2,
        }, [event.a]);
        fallen.delete(event.a);
      } else if (event.kind === REPLAY_EVENT.FALL) {
        const heir = commonest(row.length, (id) => (before[id] === event.a ? row[id] : null), event.a);
        push({
          kind: 'fall',
          title: `${nameOf(event.a)} falls`,
          detail: heir >= 0 ? `Its lands pass to ${nameOf(heir)}` : '',
          focus: heir >= 0 ? heir : event.a,
          weight: tilesThen[event.a] * 1.5,
        }, [event.a]);
        fallen.add(event.a);
      }
    }

    const wars = events.filter((e) => e.kind === REPLAY_EVENT.WAR);
    for (const cluster of clusterPairs(wars)) {
      const lead = [...cluster].sort((x, y) => (size(y.a) * size(y.b)) - (size(x.a) * size(x.b)))[0];
      const side = new Set(cluster.flatMap((e) => [e.a, e.b]));
      const others = side.size - 2;
      push({
        kind: 'war',
        title: `${nameOf(lead.a)} attacks ${nameOf(lead.b)}`,
        detail: others > 0 ? `${plural(others, 'more nation', 'more nations')} drawn in` : '',
        focus: lead.b,
        weight: Math.sqrt(size(lead.a) * size(lead.b)),
      }, [...side]);
    }

    // Yok olan ulusun "barışı" olay değildir: düşüşü zaten yazıldı.
    const peaces = events.filter((e) => e.kind === REPLAY_EVENT.PEACE
      && !fellNow.has(e.a) && !fellNow.has(e.b));
    for (const cluster of clusterPairs(peaces)) {
      const lead = [...cluster].sort((x, y) => (size(y.a) * size(y.b)) - (size(x.a) * size(x.b)))[0];
      const side = new Set(cluster.flatMap((e) => [e.a, e.b]));
      let traded = 0;
      for (let id = 0; id < row.length; id++) {
        if (row[id] !== before[id] && side.has(row[id]) && side.has(before[id])) traded++;
      }
      push({
        kind: 'peace',
        title: `${nameOf(lead.a)} and ${nameOf(lead.b)} make peace`,
        detail: traded ? `${plural(traded, 'province changes', 'provinces change')} hands` : 'The borders hold',
        focus: lead.b,
        weight: Math.sqrt(size(lead.a) * size(lead.b)) + traded * 3,
      }, [...side]);
    }
  }

  // Yıl başına tavan: büyük savaş yılları sessiz on yılları tablodan silmesin.
  const perYear = new Map();
  const kept = [];
  for (const entry of [...out].sort((x, y) => y.weight - x.weight || x.frame - y.frame)) {
    const year = Math.floor((decoded.start + entry.frame) / 12);
    const used = perYear.get(year) ?? 0;
    if (used >= HEADLINE_PER_YEAR || kept.length >= HEADLINE_LIMIT) continue;
    perYear.set(year, used + 1);
    kept.push(entry);
  }
  return kept.sort((x, y) => x.frame - y.frame || y.weight - x.weight);
}
