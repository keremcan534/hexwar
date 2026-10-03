// TOPLUM EKSENLERI — ulkenin ne oldugu, devletin ne karar verdiginden ayri.
//
// Kerem: "EU5 tarzi, 12 ekseni aylik ittirerek saga sola goturelim; partisi,
// yaptiklarimiz bunlari oynatsin — cok savas pasifist vs; nelerin etkiledigini
// de gorelim." Ilk adim uc eksendir; din ve teknoloji eksenlerinin oyunda
// baglanacagi bir sey yok (olu eksen olurlardi), ekonomi ekseni zaten partinin
// programinda.
//
// AYRIM. Yasalar ve butce DEVLETIN kararidir (hizli, oyuncunun). Eksenler
// TOPLUMUN egilimidir (yavas, kendiliginden): savaslar, yasalar, okul,
// katliam, kabul ve iktidar partisi onlari her ay biraz iter. Oyuncu ekseni
// elle ittirmez — her ay ayni tik ev odevi olurdu (VICTORIA_LITE). Tek kaldirac
// KAMPANYA: devlet bir ekseni bir yone yurutur, haftalik parasi vardir.
//
// BEDEL yeni bir bonus yigini degildir; mevcut sayilari degistirir:
//   Militarist ↔ Pacifist        savas yuku, insan gucu, ordu butcesine bakan memnuniyet
//   Assimilationist ↔ Multicult. azinlik huzursuzlugu, asimilasyon hizi
//   Progressive ↔ Traditional    arastirma, istikrar
// ve hepsinden once PARTI DESTEGI: halk, programi kendine yakin partiyi tutar
// (politics.supportScore). Mesruiyet zaten "halk ile iktidar arasindaki fark"
// oldugu icin toplumdan uzak hukumet istikrar oder.
//
// Katman: game. DOM yok; politics.js'i IMPORT ETMEZ (politics bunu okur).
// Ekonomi/kultur/teknoloji/askerlik da societyModifiers'i dogrudan okur.

import { settle } from './treasury.js';
import { makeRng } from '../core/rng.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Deger -100 (sol kutup) .. +100 (sag kutup). */
export const SOCIETY_AXES = [
  {
    id: 'militarism', name: 'War and peace', left: 'Militarist', right: 'Pacifist',
    leftNote: 'war is glory; the army is the nation',
    rightNote: 'war is a disaster; the army is a cost',
  },
  {
    id: 'integration', name: 'Peoples', left: 'Assimilationist', right: 'Multicultural',
    leftNote: 'one people, one tongue',
    rightNote: 'many peoples, one state',
  },
  {
    id: 'progress', name: 'Change', left: 'Progressive', right: 'Traditional',
    leftNote: 'science, schools and reform',
    rightNote: 'throne, altar and custom',
  },
];
export const SOCIETY_AXIS_IDS = SOCIETY_AXES.map((axis) => axis.id);
const AXIS_BY_ID = Object.fromEntries(SOCIETY_AXES.map((axis) => [axis.id, axis]));

/**
 * PARTILERIN EKSEN KONUMU = programlarinin toplum karsiligi. politics.PARTIES
 * ile ayni hikaye: muhafazakar ordu ve gelenek, liberal bariş ve reform,
 * sosyalist pasifist ve ilerici, milliyetci savas ve tek halk.
 */
export const PARTY_POSITIONS = {
  conservative: { militarism: -35, integration: -30, progress: 60 },
  liberal: { militarism: 30, integration: 45, progress: -45 },
  socialist: { militarism: 60, integration: 35, progress: -70 },
  nationalist: { militarism: -85, integration: -85, progress: 25 },
};

/** 1836'nin toplumu: savasi kutsar, tek halki ister, gelenege bagli. */
const OPENING = { militarism: -15, integration: -25, progress: 35 };

/**
 * Iktidar toplumu her ay programina dogru bu payla ceker (4 yilda ~%38).
 * 0.015 olculdu ve fazlaydi: iktidar toplumu kendine cekiyor, yakinlik da ona
 * destek veriyordu — kendini besleyen bir iktidar avantaji; 20 yilda hukumet
 * degisimi 130 -> 65 ve 107 -> 70'e indi (2 tohum, 160x96).
 */
const GOVERNMENT_PULL = 0.01;
/**
 * Kampanyanin aylik itisi ve haftalik bedeli (nufus 10.000 basina). 1.2/ay ve
 * 0.002 olculdu: dort yilda ekseni ancak ~50 puan oynatiyordu, arastirmaya
 * yansiyan etkisi gurultunun 0.64 katiydi — oyuncunun tek kaldiraci olarak
 * hissedilmiyordu. Daha guclu, daha pahali.
 */
export const CAMPAIGN_PUSH = 2;
const CAMPAIGN_RATE = 0.004;
const CAMPAIGN_MIN_COST = 0.5;

/**
 * MILLIYETCILIK CAGI (tek yer). 1836'da imparatorluk bir hanedandir, 1900'de
 * bir ulus olmak zorundadir: ayni yabanci pay yuzyilin sonunda 1.8 kat
 * huzursuzluk uretir, toplum da cag ilerledikce tek halka kayar. Takvime bagli,
 * teknolojiye degil — herkes ayni cagi yasar. culture.js buradan okur.
 */
export function nationalismEra(turn) {
  const progress = clamp((turn ?? 0) / 3330, 0, 1);
  return 1 + progress * 0.8;
}

/* --------------------------------------------------------------------------
   DURUM — nation.politics.society (kayda siyasetle birlikte girer)
   -------------------------------------------------------------------------- */

export function societyOf(nation) {
  return nation?.politics?.society ?? null;
}

export function societyValue(nation, axisId) {
  return clamp(societyOf(nation)?.[axisId] ?? 0, -100, 100);
}

/**
 * Ilk deger: 1836 toplumu + halkin parti egilimlerinin eksen izdusumu + ulkeye
 * sabit kucuk bir sapma. `mix` = politics.peopleMix (sinif agirlikli ideoloji
 * paylari). Ayri zar akisi: siyasetin mevcut zarini tuketmez.
 */
function openingValues(world, nation, mix) {
  const rng = makeRng(`${world.seed}-society-${nation.id}`);
  const out = {};
  for (const axis of SOCIETY_AXES) {
    let lean = 0;
    for (const row of mix ?? []) lean += (row.share ?? 0) * (PARTY_POSITIONS[row.id]?.[axis.id] ?? 0);
    out[axis.id] = Math.round(clamp(OPENING[axis.id] + lean * 0.5 + (rng() - 0.5) * 24, -100, 100));
  }
  return out;
}

/** Eksik toplum kaydini kurar (yeni dunya ya da eski kayit). */
export function ensureSociety(world, nation, mix) {
  const politics = nation?.politics;
  if (!politics) return;
  if (!politics.society || SOCIETY_AXIS_IDS.some((id) => !Number.isFinite(politics.society[id]))) {
    const opening = openingValues(world, nation, mix);
    politics.society = { ...opening, ...Object.fromEntries(
      SOCIETY_AXIS_IDS.filter((id) => Number.isFinite(politics.society?.[id]))
        .map((id) => [id, politics.society[id]]),
    ) };
  }
  politics.societyLog ??= null;
  politics.societyPending = Array.isArray(politics.societyPending) ? politics.societyPending : [];
  if (politics.campaign && !AXIS_BY_ID[politics.campaign.axis]) politics.campaign = null;
  politics.campaign ??= null;
}

/* --------------------------------------------------------------------------
   ETKILER — sicak yol yalniz bu nesneyi okur
   -------------------------------------------------------------------------- */

const NEUTRAL = Object.freeze({
  warStrain: 1, manpower: 1, armyMood: 0, minorityUnrest: 0, assimilation: 1, research: 0, stability: 0,
});

/**
 * Eksenlerden turetilen carpanlar. Ucuz bir hesap; yine de haftada yuzlerce
 * kume okudugu icin degerler degismedikce ayni nesne doner.
 */
const cache = new WeakMap();
export function societyModifiers(nation) {
  const society = societyOf(nation);
  if (!society) return NEUTRAL;
  const hit = cache.get(society);
  if (hit && hit.m === society.militarism && hit.i === society.integration
    && hit.p === society.progress) return hit.mods;
  const m = clamp(society.militarism ?? 0, -100, 100) / 100;
  const i = clamp(society.integration ?? 0, -100, 100) / 100;
  const p = clamp(society.progress ?? 0, -100, 100) / 100;
  const mods = {
    // Pasifist halk savasi daha agir yasar; militarist halk daha uzun dayanir.
    warStrain: 1 + 0.35 * m,
    // Militarist halk silaha daha istekli gelir (seferberlik ve takviye havuzu).
    manpower: 1 - 0.12 * m,
    // BARISTA DA HISSEDILIR: ordu butcesi halkin ruh haline isler. Pasifist
    // halk tam fonlu orduya kizar, militarist halk onunla ovunur. Ordu fonu
    // (economy.armyFunding) ile CARPILIR: pasifist toplumda orduyu kismak
    // hem para hem huzur kazandirir. Yalniz savas etkisiyle eksen barista
    // gurultunun 0.22 katiydi (audit:mechanics). 0.08 ile istikrar iki kutup
    // arasinda 0.13 oynuyordu (tam fonlu ordu); 0.06 yeterince sert.
    armyMood: -0.06 * m,
    // Asimilasyoncu toplum azinligi iter (huzursuzluk), ama eritir de.
    minorityUnrest: -0.8 * i,
    assimilation: 1 - 0.4 * i,
    // Ilerici toplum daha cok arastirir; geleneksel toplum daha sakin durur.
    research: -0.15 * p,
    stability: 0.04 * p,
  };
  cache.set(society, { m: society.militarism, i: society.integration, p: society.progress, mods });
  return mods;
}

/**
 * Partinin halka yakinligi: 0.6 (tam karsi kutup) .. 1.4 (tam ortusme).
 * politics.supportScore bununla carpar.
 */
export function partyCloseness(nation, ideology) {
  const society = societyOf(nation);
  const position = PARTY_POSITIONS[ideology];
  if (!society || !position) return 1;
  let distance = 0;
  for (const id of SOCIETY_AXIS_IDS) distance += Math.abs((position[id] ?? 0) - (society[id] ?? 0));
  return 1.4 - 0.8 * (distance / (SOCIETY_AXIS_IDS.length * 200));
}

/* --------------------------------------------------------------------------
   ITISLER — aylik
   -------------------------------------------------------------------------- */

/**
 * Bir olayin tek seferlik itisi: bir sonraki aylik guncellemede uygulanir ve
 * dokumde adiyla gorunur (zafer, katliam, kultur kabulu...).
 */
export function pushSociety(nation, axisId, amount, label) {
  const politics = nation?.politics;
  if (!politics || !AXIS_BY_ID[axisId] || !Number.isFinite(amount) || !amount) return;
  politics.societyPending ??= [];
  politics.societyPending.push({ axis: axisId, amount, label });
}

/** Kutba yaklastikca ayni itis daha az yol alir: toplum uca dogru direnir. */
function step(value, delta) {
  const outward = Math.sign(delta) === Math.sign(value);
  const scale = outward ? Math.max(0.1, 1 - Math.abs(value) / 110) : 1;
  return clamp(value + delta * scale, -100, 100);
}

/**
 * Bir ayin itisleri, eksen eksen. `ctx` politics.js'ten gelir (iktidar
 * ideolojisi, yasa kademeleri, tur) — bu dosya siyaseti import etmez.
 */
export function societyPushes(nation, ctx) {
  const economy = nation.economy ?? {};
  const society = societyOf(nation) ?? {};
  const pushes = { militarism: [], integration: [], progress: [] };
  const add = (axis, amount, label) => {
    if (Number.isFinite(amount) && Math.abs(amount) >= 0.005) pushes[axis].push({ label, amount });
  };

  // --- Savas ve baris ---
  const fronts = economy.warFronts ?? 0;
  const strain = clamp(economy.warStrainRaw ?? economy.warStrain ?? 0, 0, 1);
  if (fronts > 0) {
    add('militarism', -1.4 + 2.8 * strain, strain < 0.5 ? 'War fervour' : 'War weariness');
  } else if (nation.mobilization?.active) {
    add('militarism', -0.3, 'The reserve under arms');
  } else {
    add('militarism', 0.4, 'Years of peace');
  }
  const funding = economy.armyFunding ?? 100;
  add('militarism', -((funding - 60) / 40) * 0.5, `Army budget ${Math.round(funding)}%`);
  const draft = ctx.laws?.conscription ?? 1;
  add('militarism', [0.3, 0, -0.4][draft] ?? 0, ['Volunteer army', 'Limited draft', 'Mass conscription'][draft]);

  // --- Halklar ---
  const citizenship = ctx.laws?.citizenship ?? 0;
  add('integration', [-0.6, 0, 0.6][citizenship] ?? 0,
    ['Residency law', 'Limited citizenship', 'Full citizenship'][citizenship]);
  const accepted = Math.max(0, (nation.accepted?.length ?? 1) - 1);
  add('integration', Math.min(0.75, accepted * 0.25), `${accepted} accepted culture${accepted === 1 ? '' : 's'}`);
  add('integration', -(nationalismEra(ctx.turn) - 1), 'Age of nationalism');
  const insurgent = Object.values(nation.movements ?? {})
    .filter((movement) => (movement.progress ?? 0) >= 75).length;
  add('integration', -Math.min(1.2, insurgent * 0.4), 'Separatist insurgency');

  // --- Degisim ---
  const literacy = clamp(economy.literacy ?? 0, 0, 1);
  add('progress', -(literacy - 0.25) * 2, `Literacy ${Math.round(literacy * 100)}%`);
  const schools = clamp(economy.social?.education ?? 0, 0, 100);
  add('progress', -(schools / 100) * 0.4, `Schools ${Math.round(schools)}%`);
  const constitution = ctx.laws?.constitution ?? 0;
  add('progress', [0.4, 0, -0.4][constitution] ?? 0, ['Absolute rule', 'Constitutional rule', 'Democracy'][constitution]);
  const population = Math.max(1, economy.population ?? 1);
  const middle = clamp((economy.classes?.middle?.population ?? 0) / population, 0, 1);
  add('progress', clamp(-(middle - 0.1) * 3, -0.6, 0.6), `Middle class ${Math.round(middle * 100)}%`);

  // --- Iktidar ve kampanya ---
  const programme = PARTY_POSITIONS[ctx.rulingIdeology];
  if (programme) {
    for (const id of SOCIETY_AXIS_IDS) {
      add(id, ((programme[id] ?? 0) - (society[id] ?? 0)) * GOVERNMENT_PULL, `Government: ${ctx.rulingName}`);
    }
  }
  const campaign = nation.politics?.campaign;
  if (campaign) add(campaign.axis, campaign.dir * CAMPAIGN_PUSH, 'State campaign');

  // --- Olaylar ---
  for (const event of nation.politics?.societyPending ?? []) add(event.axis, event.amount, event.label);
  return pushes;
}

/**
 * Aylik guncelleme. Itisler uygulanir, dokum `societyLog`a yazilir (ekran
 * "bu ay ne itti" sorusunu buradan cevaplar), bekleyen olaylar bosaltilir.
 */
export function runSociety(world, nation, ctx) {
  const politics = nation?.politics;
  if (!politics?.society) return null;
  const pushes = societyPushes(nation, ctx);
  const log = {};
  for (const id of SOCIETY_AXIS_IDS) {
    const rows = pushes[id].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    const before = politics.society[id];
    politics.society[id] = Math.round(step(before, total) * 100) / 100;
    log[id] = { rows, total, moved: politics.society[id] - before };
  }
  politics.societyPending = [];
  politics.societyLog = { turn: ctx.turn, ...log };
  return log;
}

/* --------------------------------------------------------------------------
   KAMPANYA — tek kaldirac
   -------------------------------------------------------------------------- */

export function campaignCost(nation) {
  const units = Math.max(0, nation?.economy?.population ?? 0) / 10000;
  return Math.max(CAMPAIGN_MIN_COST, units * CAMPAIGN_RATE);
}

export function campaignBlockers(nation, axisId, dir) {
  if (!AXIS_BY_ID[axisId] || (dir !== 1 && dir !== -1)) return ['No such campaign.'];
  const campaign = nation?.politics?.campaign;
  if (campaign && campaign.axis === axisId && campaign.dir === dir) return [];
  const value = societyValue(nation, axisId);
  if ((dir < 0 && value <= -100) || (dir > 0 && value >= 100)) return ['Society cannot be pushed further this way.'];
  if ((nation?.gold ?? 0) < campaignCost(nation) * 4) {
    return [`Treasury short: a campaign needs four weeks of funding (£${(campaignCost(nation) * 4).toFixed(1)}).`];
  }
  return [];
}

/**
 * Kampanyayi ac / kapat. Ayni eksen ve yon ikinci kez secilirse kapanir; tek
 * kampanya: yenisi eskisinin yerini alir.
 */
export function setCampaign(nation, axisId, dir) {
  const politics = nation?.politics;
  if (!politics) return false;
  const current = politics.campaign;
  if (current && current.axis === axisId && current.dir === dir) {
    politics.campaign = null;
    return true;
  }
  if (axisId == null) {
    politics.campaign = null;
    return true;
  }
  if (campaignBlockers(nation, axisId, dir).length) return false;
  politics.campaign = { axis: axisId, dir };
  return true;
}

/**
 * Haftalik bedel. Hazine odeyemiyorsa kampanya durur (borca girerek
 * propaganda yapilmaz); durdugunu cagiran duyurur.
 * @returns {boolean} kampanya bu hafta durdu mu
 */
export function settleCampaign(nation) {
  const campaign = nation?.politics?.campaign;
  if (!campaign) return false;
  const cost = campaignCost(nation);
  if ((nation.gold ?? 0) < cost) {
    nation.politics.campaign = null;
    return true;
  }
  settle(nation, 'campaign', -cost);
  return false;
}

/**
 * YZ (ve devredilmis kabine): iktidarin programindan EN UZAK eksende,
 * hazine rahatsa kampanya. Hazine daralinca kapatir. Oyuncuyla ayni kapi.
 */
export function chooseCampaign(nation, rulingIdeology) {
  const programme = PARTY_POSITIONS[rulingIdeology];
  if (!programme || !nation?.politics?.society) return null;
  const cost = campaignCost(nation);
  const weekly = nation.economy?.ledger?.net ?? 0;
  const campaign = nation.politics.campaign;
  if ((nation.gold ?? 0) < cost * 8 || weekly < 0) {
    if (campaign) nation.politics.campaign = null;
    return campaign ? { stopped: true } : null;
  }
  let best = null;
  for (const id of SOCIETY_AXIS_IDS) {
    const gap = (programme[id] ?? 0) - societyValue(nation, id);
    if (Math.abs(gap) < 25) continue;
    if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { axis: id, gap };
  }
  if (!best) {
    if (campaign) nation.politics.campaign = null;
    return campaign ? { stopped: true } : null;
  }
  const dir = Math.sign(best.gap);
  if (campaign && campaign.axis === best.axis && campaign.dir === dir) return null;
  if (!setCampaign(nation, best.axis, dir)) return null;
  return { axis: best.axis, dir };
}

/* --------------------------------------------------------------------------
   EKRANIN TEK KAYNAGI
   -------------------------------------------------------------------------- */

/**
 * Siyaset ekraninin toplum bolumu. `parties` politics.js'ten gelir
 * ({ideology, name, color, ruling}); burada her sey hazirlanir, ekran cizer.
 */
export function societyView(nation, parties = []) {
  const society = societyOf(nation);
  if (!society) return null;
  const mods = societyModifiers(nation);
  // Memnuniyet formulundeki gercek terim (economy.populationDemand): egilim x fon.
  const armyMood = mods.armyMood * ((nation.economy?.armyFunding ?? 100) / 100);
  const log = nation.politics.societyLog ?? null;
  const campaign = nation.politics.campaign ?? null;
  const pct = (factor) => `${factor >= 1 ? '+' : '−'}${Math.abs((factor - 1) * 100).toFixed(0)}%`;
  const effects = {
    militarism: [
      { label: 'War weariness', value: pct(mods.warStrain), good: mods.warStrain <= 1 },
      { label: 'Manpower', value: pct(mods.manpower), good: mods.manpower >= 1 },
      {
        label: 'Mood from the army budget',
        value: `${armyMood >= 0 ? '+' : '−'}${Math.abs(armyMood * 100).toFixed(1)}`,
        good: armyMood >= 0,
      },
    ],
    integration: [
      { label: 'Minority unrest', value: `${mods.minorityUnrest >= 0 ? '+' : '−'}${Math.abs(mods.minorityUnrest).toFixed(2)}`, good: mods.minorityUnrest <= 0 },
      { label: 'Assimilation', value: pct(mods.assimilation), good: mods.assimilation >= 1 },
    ],
    progress: [
      { label: 'Research', value: pct(1 + mods.research), good: mods.research >= 0 },
      { label: 'Stability', value: `${mods.stability >= 0 ? '+' : '−'}${Math.abs(mods.stability * 100).toFixed(1)}`, good: mods.stability >= 0 },
    ],
  };
  return {
    cost: campaignCost(nation),
    campaign,
    axes: SOCIETY_AXES.map((axis) => ({
      ...axis,
      value: society[axis.id],
      lean: society[axis.id] < -10 ? axis.left : society[axis.id] > 10 ? axis.right : 'Divided',
      monthly: log?.[axis.id]?.total ?? 0,
      pushes: (log?.[axis.id]?.rows ?? []).slice(0, 5),
      effects: effects[axis.id],
      parties: parties.map((party) => ({
        ...party, position: PARTY_POSITIONS[party.ideology]?.[axis.id] ?? 0,
      })),
      campaignLeft: campaignBlockers(nation, axis.id, -1),
      campaignRight: campaignBlockers(nation, axis.id, 1),
      active: campaign?.axis === axis.id ? campaign.dir : 0,
    })),
  };
}
