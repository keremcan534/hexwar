// BİRİM KÜNYESİ: haritada bir yığının üstüne gelince küçük kart — tümenler,
// güç/örgütlenme çubukları, komutan ve durum (siper, kuşatma, geri çekilme,
// muharebe). Düşmanın yığını da okunur: saldırıyı tartan oyuncu "orada ne
// var" sorusunu sağ tıklamadan önce cevaplar.
//
// Kart imleci izler ama olay değişmedikçe yeniden yazılmaz; imleç kartın
// altına girmesin diye sağ-alta kayar ve ekran kenarında içeri döner.

import { formatPopulation } from '../game/economy.js';
import { generalOfArmy } from '../game/command.js';
import { menUnderArms, organizationOf, strengthRatio, unitsOn } from '../game/units.js';
import { esc } from './kit.js';

export class UnitHover {
  constructor(game) {
    this.game = game;
    this.tile = null;
    this.root = document.createElement('div');
    this.root.className = 'unit-hover';
    this.root.hidden = true;
    this.root.setAttribute('role', 'tooltip');
    document.body.appendChild(this.root);

    game.on('hover', (hit) => this.show(hit));
    game.on('turn', () => { if (this.tile) this.render(); });
    game.on('world', () => this.show(null));
    // Kart imleci izler (yalnız konum; içerik olay değişince yazılır).
    window.addEventListener('pointermove', (event) => {
      if (this.root.hidden) return;
      this.place(event.clientX, event.clientY);
    }, { passive: true });
    window.addEventListener('pointerdown', () => this.show(null), { passive: true });
  }

  show(hit) {
    this.tile = hit?.tile ?? null;
    if (!this.tile) { this.root.hidden = true; return; }
    this.render();
    if (this.root.hidden) return;
    const rect = this.game.renderer?.canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    this.place(rect.left + hit.x, rect.top + hit.y);
  }

  place(x, y) {
    const w = this.root.offsetWidth || 260;
    const h = this.root.offsetHeight || 120;
    let left = x + 18;
    let top = y + 18;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  render() {
    const world = this.game.world;
    const stack = this.tile ? unitsOn(this.tile) : [];
    if (!stack.length) { this.root.hidden = true; return; }
    const turn = world.turn ?? 0;
    const me = this.game.turns.playerNation;
    const nation = world.nations[stack[0].nationId];
    const rows = stack.slice(0, 6).map((unit) => {
      const general = generalOfArmy(world.nations[unit.nationId], unit);
      const state = [];
      if (unit.battleId) state.push('<em class="bad">in battle</em>');
      if (unit.encircled) state.push('<em class="bad">encircled −25%</em>');
      if ((unit.retreatUntil ?? 0) > turn) state.push('<em class="warn">retreating</em>');
      else if ((unit.attackReadyAt ?? 0) > turn && !unit.battleId) state.push('<em>reorganising</em>');
      if ((unit.entrenchment ?? 0) >= 0.01) state.push(`<em class="good">dug in +${Math.round(unit.entrenchment * 100)}%</em>`);
      return `<div class="uh-row">
        <span class="uh-name"><b>${esc(unit.type.name)}</b><small>${formatPopulation(menUnderArms(unit))}${general ? ` · ${esc(general.name)}` : ''}</small></span>
        <span class="uh-bars"><i class="org" style="width:${Math.max(0, Math.min(100, organizationOf(unit))).toFixed(0)}%"></i><i class="str" style="width:${(strengthRatio(unit) * 100).toFixed(0)}%"></i></span>
        ${state.length ? `<span class="uh-state">${state.join('')}</span>` : ''}
      </div>`;
    }).join('');
    const more = stack.length > 6 ? `<p class="uh-more">+${stack.length - 6} more</p>` : '';
    // Taraf haritayla AYNI kaynaktan (renderer.sideOf): kart eskiden yalnız
    // "benim / diğer" biliyordu, savaştığımız ordu tarafsız garnizonla aynı
    // başlıkla açılıyordu.
    const side = nation ? this.game.renderer.sideOf(world, nation.id, me) : 'other';
    const tag = { hostile: 'Enemy', ally: 'Ally' }[side];
    this.root.innerHTML = `<header class="uh-head ${side}"><i style="background:${esc(nation?.color ?? '#888')}"></i><b>${esc(nation?.name ?? '?')}</b>${tag ? `<em class="uh-side">${tag}</em>` : ''}<small>${stack.length} ${stack.length === 1 ? 'division' : 'divisions'}</small></header>${rows}${more}`;
    this.root.hidden = false;
  }
}
