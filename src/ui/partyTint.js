// PARTİ TONU (Kerem 2026-11-23: "partiye göre arayüzün renk teması hafiften değişebilir").
// İktidar partisinin rengi masanın camına ince bir ışık olarak düşer: üst çubuk, sekme
// şeridi, ekran başlık teli ve üst çubuğun arma elması. Hükümet değişince oyuncu bunu
// bildirimden önce gözünün ucuyla görür. Malzeme (pirinç, emaye, doku) aynı kalır;
// yalnız üstüne yarı saydam bir katman biner, bu yüzden açık temada da çevrilmeden işler.
// Renkler satır içi özel değişkendir (theme.js yalnız kural metnini tarar, bunlara
// dokunmaz). Yalnız görünüştür: simülasyon okumaz, zar çekmez.

import { rulingParty } from '../game/politics.js';

const root = () => document.documentElement;
let enabled = true;
let shown = null;

/** '#4a6fa5' → [74, 111, 165] */
function rgbOf(hex) {
  const h = String(hex ?? '').replace('#', '');
  if (h.length !== 6) return null;
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}

function paint(partyId, color) {
  const rgb = rgbOf(color);
  const style = root().style;
  if (!enabled || !rgb) {
    for (const name of ['--party-wash', '--party-floor', '--party-line', '--party-soft', '--party-gem']) style.removeProperty(name);
    delete root().dataset.party;
    return;
  }
  const [r, g, b] = rgb;
  const c = (a) => `rgba(${r}, ${g}, ${b}, ${a})`;
  root().dataset.party = partyId;
  // Tepeden inen ışık: çubuğun üst yarısı renk alır, sayıların durduğu alt kısım
  // koyu kalır (okunurluk). 0.2'nin üstü sınanınca dokunun dokusunu boğuyordu.
  style.setProperty('--party-wash', `linear-gradient(180deg, ${c(0.2)} 0%, ${c(0.08)} 48%, ${c(0)} 100%)`);
  // Sekme şeridi alttan aydınlanır: çubukla birlikte tek bir cam gibi okunur.
  style.setProperty('--party-floor', `linear-gradient(0deg, ${c(0.16)} 0%, ${c(0.04)} 60%, ${c(0)} 100%)`);
  style.setProperty('--party-line', c(0.75));
  style.setProperty('--party-soft', c(0.14));
  style.setProperty('--party-gem', `linear-gradient(135deg, ${c(1)}, rgba(${r >> 1}, ${g >> 1}, ${b >> 1}, 1) 60%, #050708)`);
}

/** Haftalık üst çubuk tazelemesinden çağrılır; parti değişmediyse iş yapmaz. */
export function syncPartyTint(nation) {
  const party = nation ? rulingParty(nation) : null;
  const key = enabled && party ? `${party.id}:${party.color}` : 'off';
  if (key === shown) return;
  shown = key;
  paint(party?.id, party?.color);
}

/** Ayarlar → Display → Party colour. */
export function setPartyTint(on, nation = null) {
  enabled = Boolean(on);
  shown = null;
  if (nation || !enabled) syncPartyTint(nation);
}

export function partyTintOn() { return enabled; }
