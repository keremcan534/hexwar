// Egemenlik ve askeri kontrol iki ayri gercektir.
// `owner` baris antlasmasina kadar hukuki sahibi, `controller` ise haritada
// province'i fiilen tutan ulkedir. Eski kayitlarda controller yoktur.

export function controllerOf(tile) {
  if (!tile) return -1;
  return Number.isInteger(tile.controller) ? tile.controller : tile.owner;
}

export function isOccupied(tile) {
  const controller = controllerOf(tile);
  return tile?.owner >= 0 && controller >= 0 && controller !== tile.owner;
}

export function setController(tile, nationId, turn = 0) {
  if (!tile) return false;
  const previous = controllerOf(tile);
  if (previous === nationId) return false;
  tile.controller = nationId;
  tile.heldSince = turn;
  return true;
}
