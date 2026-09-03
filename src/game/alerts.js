// Harita uyarıları: "şu an neyin yanlış gittiği ve NEDEN".
//
// HOI4/EU4'teki ikon şeridinin karşılığı. Amaç süsleme değil: bu oyunda
// oyuncunun en sık kaybettiği şey, kötü giden bir şeyin SEBEBİNİ ekranlar
// arasında aramak. Uyarı o sebebi kendisi getirir.
//
// KURAL — hiçbir sayı uydurulmaz. Her uyarının başlığı, sebebi ve çaresi
// simülasyonun kendi alanlarından türer; tıpkı vergi eşiklerinde olduğu gibi
// (bkz. economy.classTaxThresholds). Uyarı metni bir yorum değil, okunmuş bir
// ölçümdür. Böylece ekran simülasyondan sapamaz.
//
// Katman notu: DOM'a dokunmaz, `world`/`nation` okur. Çizimi ui/alerts.js yapar.

import {
  CLASS_INFO, GOOD_IDS, GOODS, budgetBreakdown, classTaxThresholds, priceOf,
} from './economy.js';
import { rulingParty } from './politics.js';

/**
 * Uyarı türleri. `tone` sunum içindir, `tier` sıralama: 2 varoluşsal,
 * 1 ciddi, 0 bilgilendirici.
 */
export const ALERT_KINDS = {
  STARVATION: { id: 'STARVATION', label: 'Subsistence', tone: 'bad', tier: 2 },
  DEFICIT: { id: 'DEFICIT', label: 'Treasury', tone: 'bad', tier: 2 },
  IMPORT_DRAIN: { id: 'IMPORT_DRAIN', label: 'Trade', tone: 'warn', tier: 1 },
  SHORTAGE: { id: 'SHORTAGE', label: 'Supply', tone: 'warn', tier: 1 },
  IDEOLOGY: { id: 'IDEOLOGY', label: 'Politics', tone: 'info', tier: 1 },
  DEMOTION: { id: 'DEMOTION', label: 'Society', tone: 'bad', tier: 2 },
};

const round = (value, digits = 1) => Number(value.toFixed(digits));

/**
 * GEÇİM ALTINDA SINIF. Doğrudan `canAffordNeeds` bayrağını okur — aynı bayrak
 * sınıf düşüşünü ve memnuniyet çöküşünü tetikleyen şeydir, yani uyarı
 * mekaniğin kendi eşiğiyle konuşur.
 */
function starvation(world, nation) {
  const classes = nation.economy?.classes ?? {};
  const hit = Object.keys(CLASS_INFO)
    .map((id) => ({ id, data: classes[id] }))
    .filter((entry) => entry.data && entry.data.canAffordNeeds === false)
    .sort((a, b) => (b.data.population ?? 0) - (a.data.population ?? 0))[0];
  if (!hit) return null;

  const { id, data } = hit;
  const name = CLASS_INFO[id]?.name ?? id;
  const rate = nation.economy?.tax?.[id] ?? 0;
  const thresholds = classTaxThresholds(nation, id);
  // Çare ancak vergi GERÇEKTEN sebepse önerilir. İki koşul birden: eşik
  // ULAŞILABİLİR olmalı (vergiyi sıfırlamak yetiyor olmalı) ve bugünkü oranın
  // altında kalmalı. Ölçüldü: erken oyunda orta sınıfın bütçesi sepetinin
  // %45'i — orada vergi kaldıraç değildir ve "vergiyi %0'a indir" demek
  // oyuncuyu boş bir düğmeye yollar.
  const taxHelps = thresholds && thresholds.survivalReachable && thresholds.survival < rate;
  return {
    id: `STARVATION:${id}`,
    kind: ALERT_KINDS.STARVATION,
    title: `${name} below subsistence`,
    cause: `Their basket costs £${round(data.needsCost ?? 0)} a week but they can only`
      + ` field £${round(data.needsBudget ?? 0)} after ${rate}% tax.`
      + ` They are meeting ${Math.round((data.needsMet ?? 0) * 100)}% of it.`,
    remedy: taxHelps
      ? `Cut ${name.toLowerCase()} tax to ${thresholds.survival}% — that is the last rate`
        + ' at which they still clear the subsistence floor.'
      : 'Tax is not the binding constraint: the basket itself is too expensive.'
        + ' Cheaper food and clothes, or welfare, are the only levers left.',
  };
}

/**
 * SINIF DÜŞÜŞÜ — ekonominin en pahalı olayı, ve en sessizi.
 *
 * `runPopulationMobility` bir sınıfı dört hafta geçim altında kalınca bir alt
 * sınıfa indirir. Geri dönüşü YAVAŞTIR: yükselme, kaynak sınıfın sepetinin
 * %35'i kadar artık bırakıp sekiz hafta böyle kalmasını ister. Yani bu olay
 * kalıcı bir kayıptır ve hiçbir yerde duyurulmuyordu.
 *
 * Ölçüldü: tam vergiyle 400 haftada üst sınıf 45.6K'dan 9.0K'ya iniyor —
 * oyuncu bunu ancak nüfus ekranına bakıp fark edebiliyordu.
 */
function demotion(world, nation) {
  const mobility = nation.economy?.mobility;
  if (!mobility) return null;
  const lost = (mobility.demotedUpper ?? 0) > 0 ? 'upper'
    : (mobility.demotedMiddle ?? 0) > 0 ? 'middle' : null;
  if (!lost) return null;
  const name = CLASS_INFO[lost]?.name ?? lost;
  const moved = lost === 'upper' ? mobility.demotedUpper : mobility.demotedMiddle;
  const data = nation.economy.classes?.[lost] ?? {};
  const rate = nation.economy?.tax?.[lost] ?? 0;
  const thresholds = classTaxThresholds(nation, lost);
  const overEdge = thresholds?.survivalReachable && rate > thresholds.survival;
  return {
    id: `DEMOTION:${lost}`,
    kind: ALERT_KINDS.DEMOTION,
    title: `${name} is shrinking`,
    cause: `${Math.round(moved)} people dropped out of the ${name.toLowerCase()} this month:`
      + ` they went four weeks without covering their basket`
      + ` (£${round(data.needsBudget ?? 0)} against £${round(data.needsCost ?? 0)}).`,
    remedy: overEdge
      ? `Your ${lost} tax is ${rate}%, above the ${thresholds.survival}% they can survive.`
        + ' Cut it — climbing back takes far longer than falling did.'
      : 'Climbing back is slow: a class only rises after eight straight weeks with real'
        + ' surplus. Cheaper goods, lower tax or welfare are the only ways up.',
  };
}

/** HAZİNE AÇIĞI. Sebep, defterin EN BÜYÜK gider satırıdır — tahmin değil. */
function deficit(world, nation) {
  const view = budgetBreakdown(world, nation);
  if (!view || (view.balance ?? 0) >= 0) return null;
  const worst = [...view.expenseRows].sort((a, b) => a.amount - b.amount)[0];
  return {
    id: 'DEFICIT',
    kind: ALERT_KINDS.DEFICIT,
    title: `Treasury losing £${round(Math.abs(view.balance))} a week`,
    cause: worst
      ? `Income is £${round(view.income)} against £${round(view.expenses)} of spending.`
        + ` The largest single line is ${worst.label} at £${round(Math.abs(worst.amount))}.`
      : `Income is £${round(view.income)} against £${round(view.expenses)} of spending.`,
    remedy: `At this rate the treasury (£${round(view.treasury, 0)}) runs dry in`
      + ` ${Math.max(1, Math.round(view.treasury / Math.abs(view.balance)))} weeks.`,
  };
}

/** En çok para götüren ithal mal. Kullanıcının "fish açık veriyor" örneği. */
function importDrain(world, nation) {
  const flows = nation.economy?.goodsFlow;
  if (!flows) return null;
  let worst = null;
  for (const id of GOOD_IDS) {
    const flow = flows[id];
    if (!flow?.imports) continue;
    const value = flow.imports * priceOf(world, id);
    if (!worst || value > worst.value) worst = { id, flow, value };
  }
  // Gürültü tabanı: haftalık ithalatın beşte birinden küçük kalem uyarı değildir.
  const total = nation.economy?.trade?.importValue ?? 0;
  if (!worst || worst.value < 1 || worst.value < total * 0.2) return null;
  const name = GOODS[worst.id]?.name ?? worst.id;
  return {
    id: `IMPORT_DRAIN:${worst.id}`,
    kind: ALERT_KINDS.IMPORT_DRAIN,
    title: `${name} is your biggest import bill`,
    cause: `£${round(worst.value)} a week leaves for ${name.toLowerCase()};`
      + ` imports cover ${Math.round((worst.flow.importShare ?? 0) * 100)}% of what the`
      + ' country demands.',
    remedy: 'Produce it at home or raise the tariff — the tariff earns, but every'
      + ' household and factory that buys it abroad then pays more.',
  };
}

/** Karşılanamayan talep: parası olsa da mal yok. */
function shortage(world, nation) {
  const flows = nation.economy?.goodsFlow;
  if (!flows) return null;
  let worst = null;
  for (const id of GOOD_IDS) {
    const flow = flows[id];
    if (!flow?.demand || !flow.shortage) continue;
    const share = flow.shortage / flow.demand;
    if (!worst || share > worst.share) worst = { id, flow, share };
  }
  if (!worst || worst.share < 0.25) return null;
  const name = GOODS[worst.id]?.name ?? worst.id;
  return {
    id: `SHORTAGE:${worst.id}`,
    kind: ALERT_KINDS.SHORTAGE,
    title: `${name} shortage`,
    cause: `${Math.round(worst.share * 100)}% of ${name.toLowerCase()} demand goes unmet.`
      + ' Households and factories that need it are running short whatever they pay.',
    remedy: 'World supply cannot reach this demand. Building the industry at home is'
      + ' the only way out; the price will stay pinned at the ceiling until it exists.',
  };
}

/**
 * SİYASİ KAYMA. İktidar partisi artık en çok desteklenen parti değilse haber
 * verilir. Sebep, `supportScore`'un GERÇEK sürücüsüdür: sınıf memnuniyeti
 * 0.40'ın altına düşünce radikal partiler, 0.58'in üstüne çıkınca liberal ve
 * muhafazakâr partiler kazanır.
 */
function ideology(world, nation) {
  const parties = nation.politics?.parties;
  const ruling = rulingParty(nation);
  if (!parties?.length || !ruling) return null;
  const leader = [...parties].sort((a, b) => b.support - a.support)[0];
  if (!leader || leader.id === ruling.id || leader.support - ruling.support < 3) return null;

  const classes = nation.economy?.classes ?? {};
  const radical = ['socialist', 'communist', 'fascist'].includes(leader.ideology);
  const driver = Object.keys(CLASS_INFO)
    .map((id) => ({ id, data: classes[id] }))
    .filter((entry) => entry.data)
    .sort((a, b) => (radical
      ? (a.data.satisfaction ?? 1) - (b.data.satisfaction ?? 1)
      : (b.data.satisfaction ?? 0) - (a.data.satisfaction ?? 0)))[0];
  const driverName = CLASS_INFO[driver?.id]?.name ?? 'The population';
  const satisfaction = driver ? round(driver.data.satisfaction ?? 0, 2) : null;
  return {
    id: 'IDEOLOGY',
    kind: ALERT_KINDS.IDEOLOGY,
    title: `${leader.name} now leads support`,
    cause: radical
      ? `${driverName} satisfaction is ${satisfaction}. Below 0.40 the socialist,`
        + ` communist and fascist parties gain ground — ${leader.name} is at`
        + ` ${Math.round(leader.support)}% against your ${Math.round(ruling.support)}%.`
      : `${driverName} satisfaction is ${satisfaction}. Above 0.58 the liberal and`
        + ` conservative parties gain ground — ${leader.name} is at`
        + ` ${Math.round(leader.support)}% against your ${Math.round(ruling.support)}%.`,
    remedy: radical
      ? 'Satisfaction rises when the basket gets cheaper, tax falls, welfare rises or'
        + ' unemployment falls. Any of those four turns the drift around.'
      : 'Your government keeps its seat until the next election, but the direction of'
        + ' travel is set. Reform now or hand the chamber over at the vote.',
  };
}

const CHECKS = [starvation, demotion, deficit, importDrain, shortage, ideology];

/**
 * Ulusun şu anki uyarıları, ağırdan hafife.
 *
 * SAF FONKSİYON: durum yazmaz, sayaç tutmaz. "Kapatıldı mı" bilgisi sunum
 * katmanının işidir — uyarının kendisi her hafta baştan ölçülür, böylece
 * kapatılan bir uyarı sorun geçtiğinde sessizce ölür, geri geldiğinde de
 * yeniden doğar.
 */
export function activeAlerts(world, nation) {
  if (!nation?.alive || !nation.economy) return [];
  const out = [];
  for (const check of CHECKS) {
    let hit = null;
    try {
      hit = check(world, nation);
    } catch {
      // Tek bir uyarının hatası şeridin tamamını düşürmez.
      hit = null;
    }
    if (hit) out.push(hit);
  }
  return out.sort((a, b) => b.kind.tier - a.kind.tier);
}
