// SANAT KAPISI — Uluslar Çağı ekranlarının bütün resimli ikonları.
//
// Veride emoji glif durur (defs.js `glyph`, laws.js `icon`); ekran onu basmaz,
// buradan resim ister. Emoji "AI ile yapıştırılmış" görüntünün bir numaralı
// kaynağıydı: her işletim sisteminde başka çizilir, boyu metinle oynar.
//
// İki sanat ailesi var ve sunumları bilinçli olarak ayrı:
//   - Eşya (kaynak, teçhizat, bütçe kalemi, yasa, bina): çerçevesiz nesne ya da
//     diorama, arkasında CSS'in yumuşak ışığı (`art-item`). Disk + halka her
//     ikonu aynı daireye çevirip nesneyi küçültüyordu; küçük boyda ayırt
//     edilemiyordu. Koyu plaka da bina listesinde çerçevesiz satırla çelişti.
//   - Amblemler (teknoloji dalı, üst çubuk göstergesi, general özelliği):
//     çerçevesiz nesne + gölge (`art-emblem`). Metin satırının içinde de
//     durdukları için disk ya da plaka onları satırdan taşırırdı.
//
// Katman notu: yalnız HTML dizgisi üretir; oyun durumu okumaz.

import { sketch } from './glyphs.js';

const BASE = 'assets/icons';

/**
 * Kaynak ikonları gerçek fotoğraftan çizilen sette (Kerem, 2026-10-22;
 * assets/incoming/kaynak-foto-1.webp, saydam zeminli 4x2). Kaynak yeniden
 * tasarımında demir ÇELİK, kereste ALÜMİNYUM olur (Kerem): ikonlar şimdiden
 * o kimliği taşır — külçe çelik, profil alüminyum.
 */
const RESOURCE_FILE = {
  FOOD: 'resources-photo/food',
  COAL: 'resources-photo/coal',
  IRON: 'resources-photo/steel',
  // Kereste oyunda hâlâ kaynaktır; alüminyum (1920+) yeni setin planıydı ve
  // kereste yerine ona bağlanmıştı (Kerem: "timber iconu yanlış"). Fotoğraf
  // setinde kereste yok; AAA setin kütükleri aynı ışıkta duruyor.
  TIMBER: 'resources/timber',
  HORSES: 'resources-photo/horses',
  SALTPETER: 'resources-photo/nitrates',
  OIL: 'resources-photo/oil',
  RUBBER: 'resources-photo/rubber',
};

/**
 * Teçhizat da fotoğraftan çizilen sette (assets/incoming/techizat-foto-1.webp).
 * Eski setin savaş gemisi YELKENLİ klipperdi (1900-1945'te); artık dretnot —
 * eski zırhlı da aynı gövdeyi taşır. Setin teçhizat OLMAYAN üç resmi
 * (denizaltı, milis, ikmal sandığı) KIT_FILE'da.
 */
const EQUIPMENT_FILE = {
  rifles: 'equipment-photo/rifles',
  guns: 'equipment-photo/guns',
  ships: 'equipment-photo/dreadnought',
  ironclads: 'equipment-photo/dreadnought',
  tanks: 'equipment-photo/tanks',
  aircraft: 'equipment-photo/aircraft',
};

/**
 * Aynı fotoğraf setinden, teçhizat hattı olmayan nesneler: denizaltı (donanma
 * panelinin Submarines satırı), milis (Call to Arms), ikmal sandığı (haftalık
 * ikmal faturası). Ordu amblemi ikmali "ordu" diye okutuyordu; sandık faturanın
 * kendisidir.
 */
const KIT_FILE = {
  submarine: 'equipment-photo/submarine',
  militia: 'equipment-photo/militia',
  supply: 'equipment-photo/supply',
};

/**
 * Defter satırları: bütçe madalyonları. Tek Çubuk'un fon defteri (treasury.js
 * LEDGER_LINES) ve çubuğun payları yeni kimliklerle gelir; eski kimlikler
 * (tax, maintenance, construction...) hâlâ okuyan ekran kalabilir diye durur.
 *
 * Fatura, halkın payı, kalkınma fonu ve okul fotoğraf setinden (Kerem,
 * 2026-10-22): mühürlü yasa defteri faturanın kendisidir, ekmek halkın
 * payıdır, planlı sandık fondur, kara tahta okul faturasıdır. Sıkıyönetim
 * faturası tarih setinin subayıyla gelir — tüfek ikonu onu "ordu" diye
 * okutuyordu; tazminat/haraç satırı barışın mühürlü antlaşmasıdır.
 */
const LEDGER_FILE = {
  investment: 'buildings/factory',
  development: 'economy-photo/development',
  grant: 'budget/upper_class_tax',
  schools: 'economy-photo/schools',
  martial: 'history-photo/martial_law',
  people: 'economy-photo/feeding',
  bills: 'economy-photo/bills',
  tax: 'budget/treasury',
  exports: 'budget/tariff',
  treaty: 'history-photo/treaty',
  army: 'budget/army',
  navy: 'resources/clipper_convoy',
  education: 'economy-photo/schools',
  imports: 'budget/tariff',
  maintenance: 'buildings/factory',
  construction: 'buildings/mine',
  recruitment: 'resources/small_arms',
  inflation: 'budget/treasury',
  interest: 'budget/lower_class_tax',
  unrest: 'budget/welfare',
  outlay: 'budget/middle_class_tax',
};

/**
 * Yasa kartları fotoğraf setinden: çalışma (çekiç + cep saati), askerlik
 * (trampet), ekonomi (terazi), vatandaşlık (mühürlü ferman), eğitim (okul
 * tahtası). Ticaret yasasının fotoğrafı yok; eski nesnesi kalır.
 */
const LAW_FILE = {
  labour: 'economy-photo/labour',
  conscription: 'economy-photo/conscription',
  economy: 'economy-photo/economy',
  citizenship: 'economy-photo/citizenship',
  education: 'economy-photo/schools',
};

/**
 * Üst çubuk göstergeleri ve aynı kavramın ekran kutuları (hud-photo).
 * Teknoloji dallarının amblemleri (emblems/industry…society) AYRI kalır:
 * Output'un dişlisi teknoloji ekranındaki Industry dalı değildir, ikisi aynı
 * dosyayı paylaşırsa birini değiştirmek öbürünü de değiştirirdi.
 */
const GAUGE_FILE = {
  output: 'hud-photo/output',
  power: 'hud-photo/power',
  stability: 'hud-photo/stability',
  war_support: 'hud-photo/war_support',
  infamy: 'hud-photo/infamy',
  exhaustion: 'hud-photo/exhaustion',
  population: 'hud-photo/population',
  manpower: 'hud-photo/manpower',
};

/**
 * Diplomasi eylemleri. `access` (askerî geçiş) çizildi ama oyunda böyle bir
 * anlaşma yok: kapı burada durur, bağlayan ekran yoktur.
 */
const DIPLOMACY_FILE = {
  alliance: 'diplomacy-photo/alliance',
  guarantee: 'diplomacy-photo/guarantee',
  pact: 'diplomacy-photo/pact',
  access: 'diplomacy-photo/access',
  demand: 'diplomacy-photo/demand',
  embargo: 'diplomacy-photo/embargo',
  vassal: 'diplomacy-photo/vassal',
  peace: 'diplomacy-photo/peace',
};

/** Donanma panelinin hâlleri ve bölümleri. */
const NAVY_FILE = {
  blockade: 'navy-photo/blockade',
  sea_control: 'navy-photo/sea_control',
  convoy: 'navy-photo/convoy',
  battle: 'navy-photo/battle',
  port: 'navy-photo/port',
  repair: 'navy-photo/repair',
  landing: 'navy-photo/landing',
  withdrawal: 'navy-photo/withdrawal',
};

/** Halkların merdiveni ve devletin büyük anları (history-photo). */
const EVENT_FILE = {
  home_rule: 'history-photo/home_rule',
  independence: 'history-photo/independence',
  martial_law: 'history-photo/martial_law',
  concession: 'history-photo/concession',
  revolution: 'history-photo/revolution',
  unification: 'history-photo/unification',
  collapse: 'history-photo/collapse',
  treaty: 'history-photo/treaty',
};

/**
 * YAŞAYAN TARİH türleri → fotoğraf. Yalnız dürüst eşleşme: uyan resim yoksa
 * '' (REVERSAL, CAPITAL, REGIME, COURSE, WORLD_EVENT, RANKING, DECISION).
 * Bir terazi ya da sütun "yakın" diye konursa oyuncu onu Ekonomi yasası ya
 * da İstikrar diye okur; boş yuva yanlış resimden iyidir.
 * Anahtar (kaydın `key`'i) türü inceltir: diplomasi satırı ittifak mı pakt
 * mı, kriz ikmal mi açlık mı yorgunluk mu (relations.noteDiplomacy,
 * navy.js ve Yaşayan Tarih şartnamesinin anahtarları).
 */
const HISTORY_FILE = {
  WAR: GAUGE_FILE.war_support,
  WORLD_WAR: GAUGE_FILE.war_support,
  // Müttefik çağrısı ya da koalisyon savaşı genişletir: el sıkışma.
  WAR_JOIN: DIPLOMACY_FILE.alliance,
  PEACE: DIPLOMACY_FILE.peace,
  // Fetih masada yazılır: el değiştiren topraklar antlaşmanın mührüyle.
  CONQUEST: EVENT_FILE.treaty,
  COLLAPSE: EVENT_FILE.collapse,
  INDEPENDENCE: EVENT_FILE.independence,
  RELEASE: EVENT_FILE.independence,
  UNIFICATION: EVENT_FILE.unification,
  REBELLION: EVENT_FILE.revolution,
  NAVAL: NAVY_FILE.battle,
  DIPLOMACY: '',
  CRISIS: '',
  RECOVERY: '',
};
const HISTORY_KEY = [
  [/^(alliance|call):/, DIPLOMACY_FILE.alliance],
  [/^guar:/, DIPLOMACY_FILE.guarantee],
  [/^nap:/, DIPLOMACY_FILE.pact],
  [/^demand/, DIPLOMACY_FILE.demand],
  [/^embargo/, DIPLOMACY_FILE.embargo],
  [/^autonomy:/, DIPLOMACY_FILE.vassal],
  [/^vassal-free:/, EVENT_FILE.independence],
  [/^blockade-/, NAVY_FILE.blockade],
  // Yeni gemi sınıfı (dretnot devrimi): gemiyi gösteren teçhizat fotoğrafı.
  [/^first-class-1$/, EQUIPMENT_FILE.ships],
  [/^world-war-end:/, DIPLOMACY_FILE.peace],
  // Krizin konusu: ikmal faturası, açlık, savaş yorgunluğu (iyileşme de aynı konuyu söyler).
  [/^crisis:supply/, 'economy-photo/bills'],
  [/^crisis:hunger/, 'economy-photo/feeding'],
  [/^crisis:exhaustion/, GAUGE_FILE.exhaustion],
];
/** Anahtarın inceltebileceği türler: savaş satırının anahtarı onu diplomasiye çevirmesin. */
const KEYED_KINDS = new Set(['DIPLOMACY', 'NAVAL', 'CRISIS', 'RECOVERY', 'WORLD_WAR']);

function img(file, alt, cls) {
  return `<span class="art ${cls}"><img src="${BASE}/${file}.png" alt="${alt}" draggable="false" loading="lazy"></span>`;
}

/** Kaynak madalyonu. `size`: xs 18 · sm 26 · md 40 · lg 64. */
export function resourceArt(id, size = 'sm') {
  const file = RESOURCE_FILE[id];
  if (!file) return '';
  return img(file, id.toLowerCase(), `art-${size} art-item`);
}

/** Bina dioraması. */
export function buildingArt(id, size = 'md') {
  return img(`buildings/${id}`, id, `art-${size} art-item`);
}

/** Yasa nesnesi (fotoğraf setinde olan yasa oradan). */
export function lawArt(id, size = 'md') {
  return img(LAW_FILE[id] ?? `laws/${id}`, id, `art-${size} art-item`);
}

/** Teçhizat madalyonu; zırhlı teknolojisiyle gemi buharlıya döner. */
export function equipmentArt(id, size = 'md', ironclad = false) {
  const file = EQUIPMENT_FILE[id === 'ships' && ironclad ? 'ironclads' : id];
  return file ? img(file, id, `art-${size} art-item`) : '';
}

/** Teçhizat setinin öbür nesneleri: 'submarine' | 'militia' | 'supply'. */
export function kitArt(id, size = 'xs') {
  const file = KIT_FILE[id];
  return file ? img(file, id, `art-${size} art-item`) : '';
}

/** Bütçe satırı madalyonu. */
export function ledgerArt(id, size = 'xs') {
  const file = LEDGER_FILE[id];
  if (!file) return '';
  return img(file, id, `art-${size} art-item`);
}

/** Amblem: teknoloji dalı (industry…society) ya da gösterge (power, stability, infamy). */
export function emblemArt(id, size = 'sm') {
  return img(`emblems/${id}`, id, `art-${size} art-emblem`);
}

/**
 * Teknoloji resimleri (assets/tech/<id>.webp): ChatGPT ile kol başına bir
 * sayfa üretilip dilimlenir (kaynak sayfalar assets/incoming/). Liste elle
 * tutulur: dosya gelmeden adı yazılsaydı tarayıcı her açılışta 56 kez 404
 * isterdi. Resmi olmayan teknoloji dalının amblemini gösterir; resimler
 * geldikçe yalnız bu küme büyür.
 */
const TECH_ART = new Set([
  // Sanayi (assets/incoming/tech/teknoloji-sanayi.webp)
  'electric_motors', 'assembly_line', 'mass_production', 'machine_tools', 'flow_production',
  'electric_steel', 'refined_petroleum', 'industrial_chemistry', 'light_alloys', 'synthetic_fuel',
  // Altyapı
  'trunk_lines', 'motor_lorries', 'paved_highways', 'electrified_railways', 'motorised_logistics',
  'steam_threshers', 'agricultural_colleges', 'tractors', 'hybrid_crops', 'mechanised_agriculture',
  // Ordu ve havacılık
  'fire_and_movement', 'trench_warfare', 'infiltration_tactics', 'combined_arms', 'mobile_warfare',
  'smokeless_powder', 'light_machine_guns', 'landships', 'light_tanks', 'medium_tanks',
  'observation_balloons', 'military_aviation', 'fighter_aircraft', 'metal_airframes',
  'close_air_support', 'monoplane_fighters',
  // Donanma
  'pre_dreadnoughts', 'dreadnoughts', 'submarines', 'aircraft_carriers', 'radar',
  'blue_water_doctrine', 'fire_control', 'convoy_system', 'naval_aviation', 'carrier_task_forces',
  // Toplum
  'social_insurance', 'total_mobilisation', 'propaganda_ministry', 'planned_economy', 'welfare_state',
  'wireless_telegraphy', 'research_laboratories', 'mass_higher_education', 'electronics', 'nuclear_physics',
]);

/**
 * Gösterge kartlarının arka plan görselleri (assets/kpi/<anahtar>.webp).
 * Anahtar kartın etiketinden türer (kpiKey): "Full citizens" → full-citizens;
 * iki ekranda aynı ad aynı görseli kullanır. Liste elle tutulur (TECH_ART
 * gibi): dosya gelmeden ad yazılsaydı her ekran açılışı 404 isterdi. Görseli
 * olmayan kart ekranın kendi fotoğrafını panorama olarak taşır.
 */
const KPI_ART = new Set([
  // Kaynak sayfalar assets/incoming/kpi/ (Kerem'in ChatGPT seti, 2026-11-15,
  // 2×3 macenta ayraçlı; Kalkınma iki çeşitten seçildi).
  'exports', 'imports', 'trade-balance', 'shortages', 'blockade', 'automation',
  'output', 'industry', 'army-draws', 'consumer-goods', 'shipyards', 'bills',
  'invested', 'next-level', 'development-cap', 'fund-floor', 'develop-focus', 'development-fund',
  'standing-army', 'manpower', 'officers', 'in-training', 'wars', 'supply',
  'population', 'literacy', 'full-citizens', 'peoples', 'unrest', 'movements',
  'political-power', 'stability', 'war-support', 'government', 'legitimacy', 'empty-land',
  'researching', 'per-week', 'technologies', 'year', 'rank', 'score',
  'infamy', 'allies', 'envoys', 'commitments', 'rival', 'entries',
]);

/** Kartın etiketinden görsel anahtarı. */
export function kpiKey(label) {
  return String(label ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Kartın arka plan katmanı. Görseli varsa kendi resmi; yoksa `is-pano`:
 * ekranın fotoğrafı bütün şerit boyunca tek sahne gibi akar (screens
 * .mountKpiPanorama kartın şeritteki yerini yazar).
 */
export function kpiArt(key) {
  return KPI_ART.has(key)
    ? `<i class="k-kpi-art" style="background-image:url('assets/kpi/${key}.webp')" aria-hidden="true"></i>`
    : '<i class="k-kpi-art is-pano" aria-hidden="true"></i>';
}

/** Teknolojinin resmi var mı (inceleme panelinin büyük plakası buna göre kurulur). */
export function hasTechArt(techId) {
  return TECH_ART.has(techId);
}

/**
 * Resmi gelmemiş teknolojinin yedeği: satırının (folder) teknik çizimi.
 * Eskiden dalın parlak 3B amblemiydi; aynı amblem satır satır tekrar ediyor
 * ve mavi kopya masada mobil oyun ikonu gibi okunuyordu (oyuncu).
 */
const FOLDER_SKETCH = {
  Production: 'factory', Materials: 'flask', Transport: 'rail', Agriculture: 'wheat',
  Doctrine: 'flag', Arms: 'swords', Aviation: 'plane',
  Shipbuilding: 'ship', 'Naval Doctrine': 'compass',
  Politics: 'ballot', Science: 'cap',
};
const CATEGORY_SKETCH = { industry: 'gear', infrastructure: 'rail', army: 'swords', navy: 'anchor', society: 'scroll' };

/** Teknoloji dalının teknik çizimi (bant başlığı, kuyruk satırı). */
export function categorySketch(categoryId, cls = '') {
  return sketch(CATEGORY_SKETCH[categoryId] ?? 'gear', cls);
}

/** Teknoloji resmi; yoksa satırının teknik çizimi. Boyutu çağıranın kabı belirler. */
export function techArt(techId, categoryId, folder = null) {
  if (!TECH_ART.has(techId)) return sketch(FOLDER_SKETCH[folder] ?? CATEGORY_SKETCH[categoryId] ?? 'gear');
  // 2026-11-20 seti (assets/tech-flat; dökme pirinç, scripts/art/emboss-icons.py). Eski resimler
  // assets/tech'te duruyor: alçı figürlü sahneler "AI gibi" okunuyordu (Kerem).
  return `<img class="tech-art" src="assets/tech-flat/${techId}.webp" alt="" draggable="false" loading="lazy">`;
}

/**
 * Gösterge: Output, Power, Stability, War support, Infamy, Exhaustion,
 * Population, Manpower. Amblem sınıfı: üst çubuğun amblem yuvası ölçüsünü
 * (`.tb-ico .art-emblem`) ve çift gölgesini aynen alsın.
 */
/**
 * ULTRA GERÇEKÇİ GÖSTERGE MADALYONLARI (assets/icons/kpi-real; kaynak assets/incoming/arayuz/
 * gosterge-gercek-1..3, dilim scripts/art/slice-sheets.py gosterge-gercek). Kerem 2026-11-20:
 * "buradaki ikonların ultrarealistik versiyonları gerekli". Kart etiketinin anahtarı (kpiKey)
 * → dosya. Eski alçı/boya setleri yerinde duruyor; burada yoksa kartın kendi ikonu kalır.
 */
const REAL_KPI = {
  output: 'output', 'political-power': 'power', power: 'power', stability: 'stability',
  'war-support': 'war_support', infamy: 'infamy', exhaustion: 'exhaustion', population: 'population',
  manpower: 'manpower', invested: 'invested', industry: 'industry', 'consumer-goods': 'consumer_goods',
  exports: 'exports', bills: 'bills', 'development-fund': 'development_fund', supply: 'supply',
  literacy: 'literacy', 'standing-army': 'standing_army', peoples: 'peoples',
  'full-citizens': 'full_citizens', unrest: 'unrest', researching: 'researching', allies: 'allies',
  'army-draws': 'army_draws', officers: 'officers',
};

/** Gerçek madalyon; anahtarın resmi yoksa ''. */
export function realArt(key, size = 'md') {
  const file = REAL_KPI[key];
  return file ? `<span class="art art-${size} art-real"><img src="assets/icons/kpi-real/${file}.webp" alt="" draggable="false" loading="lazy"></span>` : '';
}

export function gaugeArt(id, size = 'sm') {
  const file = GAUGE_FILE[id];
  return file ? img(file, id, `art-${size} art-emblem`) : '';
}

// Diplomasi, donanma ve tarih ikonları düğmenin, başlığın ya da satırın
// İÇİNDE durur: amblem gibi çerçevesiz (ışık halkası metin satırını taşırırdı).

/** Diplomasi: alliance, guarantee, pact, access, demand, embargo, vassal, peace. */
export function diplomacyArt(id, size = 'xs') {
  const file = DIPLOMACY_FILE[id];
  return file ? img(file, id, `art-${size} art-emblem`) : '';
}

/** Donanma: blockade, sea_control, convoy, battle, port, repair, landing, withdrawal. */
export function navyArt(id, size = 'xs') {
  const file = NAVY_FILE[id];
  return file ? img(file, id, `art-${size} art-emblem`) : '';
}

/** Halklar ve devlet: home_rule, independence, martial_law, concession, revolution, unification, collapse, treaty. */
export function eventArt(id, size = 'xs') {
  const file = EVENT_FILE[id];
  return file ? img(file, id, `art-${size} art-emblem`) : '';
}

/**
 * Ulusal hareketin merdivendeki yeri (movements.movementView `track`):
 * tebaa ayaklanır (meşale), vatandaş Home Rule ister (bayrak kaldıran el),
 * Home Rule halkı kendi devletini ister (kırık zincir). Aşama adı
 * (Agitation, Separatism…) NE KADAR ilerlediğini söyler; resim NE
 * istediğini — ikisi ayrı sorudur.
 */
const MOVEMENT_ART = { subject: 'revolution', citizen: 'home_rule', homeRule: 'independence' };
export function movementArt(track, size = 'xs') {
  return eventArt(MOVEMENT_ART[track] ?? 'revolution', size);
}

/**
 * Yaşayan Tarih satırının resmi (`kind` HISTORY_KIND, `key` kaydın anahtarı).
 * Uyan resim yoksa '' döner: satır resimsiz kalır, yanlış resim almaz.
 */
export function historyArt(kind, size = 'sm', key = '') {
  let file = HISTORY_FILE[kind] ?? '';
  if (key && KEYED_KINDS.has(kind)) {
    const hit = HISTORY_KEY.find(([pattern]) => pattern.test(String(key)));
    if (hit) file = hit[1];
  }
  return file ? img(file, String(kind).toLowerCase(), `art-${size} art-emblem`) : '';
}

/** General özelliği; `size` 'inline' metin satırına oturur. */
export function traitArt(id, size = 'inline') {
  return id ? img(`traits/${String(id).toLowerCase()}`, id, `art-${size} art-emblem`) : '';
}

/** Birim simgesi (assets/icons/units). */
export function unitArt(typeId, size = 'sm') {
  return img(`units/${String(typeId).toLowerCase()}`, typeId, `art-${size} art-unit`);
}
