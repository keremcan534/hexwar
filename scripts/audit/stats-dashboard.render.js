// Pano metni ve grafik yerleşimi (önce / sonra). Sayılar D (sonra) ve
// D.before'dan okunur. Ekonomi bölümleri Tek Çubuk (2026-10-15) alanlarını
// okur; "önce" eski şemadaysa o seriler boştur ve yalnız "sonra" çizilir.
// Cümleler sayılardan kurulur; hükmün tonu (çözüldü/kısmen) da sayıya bağlıdır,
// yeni koşuda metin elle yeniden yazılmadan doğru kalsın.
const A = D;
const B = D.before ?? null;
const S = A.summary;
const SB = B?.summary ?? {};
const weeks = D.meta.campaignTurns;
const yearSec = (speed) => 52.18 * 7 / speed;
const sum = (s, from = 0, to = 1e9) => s.filter((p) => p[0] >= from && p[0] < to).reduce((a, p) => a + p[1], 0);
const last = (s) => s.at(-1)?.[1];
const shortageOf = (d) => d?.load.alertKinds.find((k) => k[0] === 'SHORTAGE')?.[1] ?? 0;
const crisisWeeksOf = (d) => d?.load.alertKinds.find((k) => k[0] === 'CRISIS')?.[1] ?? 0;
const alertShare = (d) => 100 * sum(d.load.alertWeeks, 1906, 1945) / (52 * 39);
const peak = (s) => (s.length ? Math.max(...s.map((p) => p[1])) : null);
const BEFORE = { name: 'Önce', color: '--before', dash: true, band: false };
const pair = (label, after, before, color = '--s1', extra = {}) => [
  { name: `${label} · sonra`, color, data: after, ...extra },
  ...(before ? [{ ...BEFORE, name: `${label} · önce`, data: before }] : []),
];
const pct = (v, d = 0) => (v == null ? '–' : `%${fmt(v, d)}`);

$('meta').innerHTML = `${D.meta.seeds.length} tohum × ${D.meta.startYear}–${D.meta.endYear} (${fmt(weeks)} hafta) · 160×96 · oyuncu: ${D.meta.players.join(', ')}<br>Renkli = şimdiki kod · gri kesik = değişiklikten önce · gölge = tohumların en düşük–en yüksek değeri`;

const out0 = A.bar.output[0]?.[1];
const dev0 = A.development.avg[0]?.[1];
const deficitOf = (d) => d?.load.alertKinds.find((k) => k[0] === 'DEFICIT')?.[1] ?? 0;
$('lede').innerHTML = `Ekonomi artık <b>Tek Çubuk</b>: her hafta tek bir çıktı (IC) üretilir. Faturalar (ordu ve donanma ikmali, okul, sıkıyönetim, tazminat) önden düşer, ordu yasanın payına kadar çeker, halk doyurma koluyla beslenir, kalanı kalkınma fonuna akar ve state'lere kademe alır. Altın, vergi, borç, enflasyon, iflas, bina ve inşaat kuyruğu yok. Bu koşuda oyuncunun haftalık çıktısı ${fmt(out0)} → ${fmt(S.outputEnd)} IC (×${fmt(S.outputEnd / out0, 1)}), ortalama kalkınma ${fmt(dev0, 1)} → ${fmt(S.devEnd, 1)}; hiç kademe alamayan aynı oyuncu 1945'te bu çıktının ×${fmt(S.noinvestOutput, 2)}'sinde kalıyor. Dünyada krizdeki ulus-hafta ${pct(S.worldCrisisAvg, 1)}. Önceki koşu altınlı şemada olduğu için ekonomi grafiklerinin çoğunda yalnız şimdiki kod çizilir.`;

const C = [
  ['Çubuğun paylaşımı (oyuncu, ortalama)', 'Faturalar · ordu · halk · kalkınma, haftalık çıktıya oranla.',
    `${pct(S.billsAvg)} · ${pct(S.armyAvg)} · ${pct(S.peopleAvg)} · <em>${pct(S.investAvg)}</em>`, 'fatura · ordu · halk · kalkınma'],
  ['İkmal krizi', 'Faturalar çıktının %60\'ını aşınca her fatura aynı oranda ödenir (s < 1).',
    `${pct(S.worldCrisisAvg, 1)} · 1935-45 <em>${pct(S.worldCrisisLate, 1)}</em>`, 'krizdeki ulus-hafta (dünya)'],
  ['Kalkınma (oyuncu, 1945)', 'Nüfus ağırlıklı ortalama kademe; tavan 3 + okuryazarlık × 8 + 1900 sonrası teknoloji.',
    `${fmt(S.devEnd, 2)} · tavan ${fmt(S.devCapEnd)} · donmuş <em>${fmt(S.devNoinvestEnd, 2)}</em>`, 'kademe'],
  ['Kıtlık uyarısı', 'Oyuncu haftalarının payı; demir ve kereste artık kalkınmayla büyüyor.',
    `${pct(shortageOf(B))} → <em>${pct(shortageOf(A))}</em>`, 'hafta'],
  ['Hazine uyarısı', 'Açık, borç ve iflas uyarısı (altınla birlikte kalktı).',
    `${pct(deficitOf(B), 1)} → <em>${pct(deficitOf(A), 1)}</em>`, 'hafta'],
  ['Kalkınmayan oyuncunun çıktısı', 'Aynı tohum, aynı oyuncu: kademe alamayan ÷ AUTO.',
    `<em>×${fmt(S.noinvestOutput, 2)}</em>`, 'çıktı oranı, 1945'],
  ['Yedek havuz', 'Barış ordusu havuzun yarısını geçmez; kalan yarı savaşta seferber olur.',
    `${fmt(SB.manpowerAvg, 1)} → <em>${fmt(S.manpowerAvg, 1)}</em>`, 'ort. alay'],
  ['Depo ÷ insanın kurabileceği alay', 'Teçhizat bağlıyor mu.',
    `${fmt(SB.stockVsManpowerMed, 1)}× → <em>${fmt(S.stockVsManpowerMed, 1)}×</em>`, 'ortanca'],
  ['Tüketim malı oranı (oyuncu)', 'Halkın payı artık bir politika: doyurma kolu × ihtiyaç.',
    `${fmt(SB.consumerAvg, 2)} → <em>${fmt(S.consumerAvg, 2)}</em>`, 'ortalama'],
  ['Geç oyun savaşı', 'Savaşan oyuncu (diplomasi de AUTO), 1925 sonrası savaş haftası.',
    `${fmt(SB.diploWarLate)} → <em>${fmt(S.diploWarLate)}</em>`, 'hafta'],
];
$('changes').innerHTML = `<table><tbody>${C.map(([t, why, ba, unit], i) => `<tr><td class="n">${i + 1}</td><td><b>${t}</b><span>${why}</span></td><td class="ba">${ba.includes('→') ? `<s>${ba.split('→')[0]}</s>→ ${ba.split('→')[1]}` : ba}<small>${unit}</small></td></tr>`).join('')}</tbody></table>`;

const V = [
  ['ok', 'Tek kol', `${pct(S.investAvg)} kalkınmaya`,
    `Oyuncunun kararı tek: halkı ne kadar doyuracağı. Çıktının ortalama ${pct(S.billsAvg)}'i faturalara (bunun ${pct(S.supplyAvg)}'i ordu ve donanma ikmali), ${pct(S.armyAvg)}'i hatlara, ${pct(S.peopleAvg)}'i halka, ${pct(S.investAvg)}'i kalkınmaya gidiyor. Dünyada faturalar ${pct(S.worldBillsAvg)}, kalkınma ${pct(S.worldInvestAvg)}.`],
  [S.worldCrisisAvg != null && S.worldCrisisAvg < 5 ? 'ok' : 'warn', 'İkmal krizi', `${pct(S.worldCrisisAvg, 1)} ulus-hafta`,
    `İflasın yerine: faturalar çıktının %60'ını aşınca her fatura aynı oranda ödenir, ordu yavaşlar, istikrar düşer; faturalar sığdığı hafta biter. Oyuncunun en düşük ödeme payı s = ${fmt(S.supplyPlayerMin, 2)}, kriz uyarısı haftalarının ${pct(crisisWeeksOf(A), 1)}'inde yandı; dünyanın 1935-45 kriz payı ${pct(S.worldCrisisLate, 1)}. YZ krizde önce alay terhis eder, okulu kısar, savaşta eski gemiyi limana çeker.`],
  [S.noinvestOutput != null && S.noinvestOutput < 0.8 ? 'ok' : 'warn', 'Kalkınmanın getirisi', `çıktı ×${fmt(S.noinvestOutput, 2)}`,
    `Kademe alamayan oyuncu 1945'te AUTO oyuncunun çıktısının ×${fmt(S.noinvestOutput, 2)}'si, sanayisinin ×${fmt(S.noinvestIC, 2)}'si, skorunun ×${fmt(S.noinvestScore, 2)}'si; payı halka döndüğü için tüketim malı oranı ${fmt(S.noinvestConsumer, 2)}. Doyurulan halk büyümeyen ülkeyi kurtarmıyor.`],
  ['info', 'Kalkınma fonu', `${fmt(S.fundEnd, 1)} haftalık çıktı`,
    `Fon bir sonraki kademenin bedeline biriktirir: büyük state'in tek kademesi aylarca yatırım ister, birikim kademenin iriliğidir, çürüyen para değil. 1945'te oyuncu ${fmt(S.fundEnd, 1)}, dünya ortancası ${fmt(S.worldFundEnd, 1)} haftalık çıktı; tabana yapışan ulus payı ortalama ${pct(S.worldPinnedAvg, 1)}.`],
  [shortageOf(A) < shortageOf(B) ? 'ok' : 'warn', 'Kıtlık uyarısı', `${pct(shortageOf(B))} → ${pct(shortageOf(A))}`,
    `Kıtlık uyarısının yandığı oyuncu haftası. Demir ve kereste kalkınmayla dik büyüyor: ortak eğriyle sanayi 4 kat büyürken madenler %20 büyüyordu ve 1940'ta ulusların %74'ü demir kıtlığındaydı. Hazine uyarısı (açık, borç, iflas) ${pct(deficitOf(B), 1)} → ${pct(deficitOf(A), 1)}; uyarı yanan oyuncu haftası 1906-45 ${pct(alertShare(B ?? A))} → ${pct(alertShare(A))}.`],
  [S.stockVsManpowerMed >= 0.75 ? 'ok' : 'warn', 'Depo ve insan', `${fmt(SB.stockVsManpowerMed, 2)}× → ${fmt(S.stockVsManpowerMed, 2)}×`,
    `Depodaki tüfek ÷ insan gücünün kurabileceği alay. Ordu hatları yasanın payına kadar çeker; çekilmeyen pay artık boşta kalmaz, halka ve kalkınmaya döner (eskiden askerî IC'nin %93'ü boştu, şimdi ${pct(S.idleAvg)}'i ordunun ihtiyacı olmadığı için halka gidiyor).`],
  ['info', 'Geç oyun', `${fmt(SB.diploWarLate)} → ${fmt(S.diploWarLate)} hafta`,
    `Savaşan oyuncunun (diplomasi de AUTO) 1925 sonrası savaş haftası. Dünyanın 1930-45 savaş payı ${pct(SB.worldWarLate, 1)} → ${pct(S.worldWarLate, 1)}.`],
];
$('verdicts').innerHTML = V.map(([tone, label, big, text]) => `
  <div class="verdict">
    <div class="top"><b>${label}</b><span class="chip ${tone}">${tone === 'ok' ? 'Çözüldü' : tone === 'warn' ? 'Kısmen' : tone === 'info' ? 'Ölçüm' : 'Açık'}</span></div>
    <div><span class="big">${big}</span></div>
    <p>${text}</p>
  </div>`).join('');

// ------------------------------------------------------------ SANAYİ ---
$('q-equip').textContent = 'Oyuncu ulusu, AUTO açık. Alay birimi: depodaki tüfek ÷ 30 (bir piyade kiti), havuz ÷ 30 bin kişi.';
lineChart($('c-ratio'), {
  title: 'Depo ÷ insan gücünün kurabileceği alay', sub: 'Oyuncu · 1 = depo tam yetiyor', digits: 1,
  series: pair('Oran', A.stockVsManpower, B?.stockVsManpower),
  refs: [{ y: 1, label: 'depo = insan' }],
  read: `Ortanca ${fmt(SB.stockVsManpowerMed, 1)}× → ${fmt(S.stockVsManpowerMed, 1)}×. 1'in altında yeni alay ve seferberlik deposu tüfek hattını bekler.`,
});
lineChart($('c-reserve'), {
  title: 'Yedek havuz ve barış ordusu', sub: 'Oyuncu · alay', digits: 1,
  series: [
    { name: 'Yedek havuz · sonra', color: '--s3', data: A.army.manpowerRegiments },
    { ...BEFORE, name: 'Yedek havuz · önce', data: B?.army.manpowerRegiments ?? [] },
    { name: 'Düzenli ordu · sonra', color: '--s1', data: A.army.regiments },
    { ...BEFORE, name: 'Düzenli ordu · önce', color: '--ink-3', data: B?.army.regiments ?? [] },
  ],
  read: `Barış ordusu 1945'te ${fmt(SB.regimentsEnd)} → ${fmt(S.regimentsEnd)} alay; yedek havuz ortalama ${fmt(S.manpowerAvg, 0)} alaylık.`,
});
lineChart($('c-draw'), {
  title: 'Sanayinin orduya giden payı', sub: 'Savaşan oyuncu (diplomasi de AUTO) · %', unit: '%', digits: 1,
  series: pair('Savaşan oyuncu', A.draw.diplo, B?.draw.diplo, '--s2'),
  read: `Hatların çektiği IC ÷ sanayi: ortalama ${pct(SB.drawDiploAvg, 1)} → ${pct(S.drawDiploAvg, 1)}. Ekonomi yasası tavandır; çekilmeyen pay halka ve kalkınmaya kalır.`,
});
lineChart($('c-consumer'), {
  title: 'Tüketim malı oranı', sub: 'Oyuncu · 1 = ihtiyaç karşılanıyor', digits: 2, yMin: 0.4, yMax: 2.2,
  series: pair('AUTO oyuncu', A.draw.consumer, B?.draw.consumer),
  refs: [{ y: 1.05, label: 'barış kolu 1.05' }, { y: 0.85, label: 'savaş kolu 0.85' }],
  read: `Oran doyurma koludur (ihtiyacın katı): AUTO barışta 0.95-1.10, savaşta 0.85. Kolun üstüne çıkması yatırılacak state kalmadığını, altına inmesi serbest çıktının yetmediğini gösterir. Ortalama ${fmt(SB.consumerAvg, 2)} → ${fmt(S.consumerAvg, 2)}.`,
});

// ------------------------------------------------------------- ÇUBUK ---
$('q-bar').textContent = 'Haftalık çıktı = faturalar + ordu + halk + kalkınma. Paylar 4 haftalık kovanın toplamından, çıktıya oranla.';
lineChart($('c-bar'), {
  title: 'Oyuncunun çıktısı nereye gidiyor', sub: 'Çıktının payı · %', unit: '%', digits: 1, yMax: 100,
  series: [
    { name: 'Faturalar', color: '--s2', data: A.bar.bills, band: false },
    { name: 'Ordu (hatlar)', color: '--s4', data: A.bar.army, band: false },
    { name: 'Halk', color: '--s3', data: A.bar.people, band: false },
    { name: 'Kalkınma', color: '--s1', data: A.bar.invest, band: false },
  ],
  read: `Ortalama: faturalar ${pct(S.billsAvg)}, ordu ${pct(S.armyAvg)}, halk ${pct(S.peopleAvg)}, kalkınma ${pct(S.investAvg)}.`,
});
lineChart($('c-worldbar'), {
  title: 'Dünyanın çıktısı nereye gidiyor', sub: 'Bütün canlı ulusların toplamı · %', unit: '%', digits: 1, yMax: 100,
  series: [
    { name: 'Faturalar', color: '--s2', data: A.worldBar.bills, band: false },
    { name: 'Ordu (hatlar)', color: '--s4', data: A.worldBar.army, band: false },
    { name: 'Halk', color: '--s3', data: A.worldBar.people, band: false },
    { name: 'Kalkınma', color: '--s1', data: A.worldBar.invest, band: false },
  ],
  read: `Dünyada faturalar ortalama ${pct(S.worldBillsAvg)}, kalkınma ${pct(S.worldInvestAvg)}.`,
});
lineChart($('c-supply'), {
  title: 'İkmal krizi', sub: 'Oyuncunun ödeme payı s (1 = kriz yok) · dünyada krizdeki ulus-hafta %', digits: 2, yMax: 1.05,
  series: [
    { name: 'AUTO oyuncu · s', color: '--s1', data: A.supply.player },
    { name: 'Savaşan oyuncu · s', color: '--s2', data: A.supply.diplo },
    { name: 'Dünya · krizdeki ulus (÷100)', color: '--s4', data: A.supply.worldCrisis.map((p) => [p[0], ...p.slice(1).map((v) => (v == null ? null : v / 100))]), band: false },
  ],
  refs: [{ y: 1, label: 's = 1' }],
  read: `Faturalar çıktının %60'ını aşınca her fatura aynı oranda ödenir; takviye, eğitim ve düzen 0.5 + 0.5·s ile yavaşlar. Dünyanın kriz payı ortalama ${pct(S.worldCrisisAvg, 1)}.`,
});
lineChart($('c-army-cost'), {
  title: 'Ordunun çıktıdaki payı', sub: 'Oyuncu · ödenen ikmal faturası (ordu + donanma) ve hatların çektiği · %', unit: '%', digits: 1,
  series: [
    { name: 'İkmal faturası', color: '--s2', data: A.bar.supply },
    { name: 'Hatlar', color: '--s4', data: A.bar.army },
  ],
  read: `İkmal ortalama ${pct(S.supplyAvg, 1)}, hatlar ${pct(S.armyAvg, 1)}. Savaşta ikmal ×1.4 ve seferber yedek ikisini birlikte büyütür.`,
});
lineChart($('c-fund'), {
  title: 'Kalkınma fonu kaç haftalık çıktı', sub: 'Fon ÷ ortalama haftalık çıktı · taban −4', digits: 1, yMin: -4,
  series: [
    { name: 'Oyuncu', color: '--s1', data: A.fund.player },
    { name: 'Dünya ortancası', color: '--s3', data: A.fund.worldMed, band: false },
    { name: 'Dünya en zengin %10', color: '--s4', data: A.fund.worldP90, band: false },
  ],
  refs: [{ y: 0, label: '' }],
  read: `Fon bir sonraki kademenin bedeline kadar birikir ve harcanır. 1945: oyuncu ${fmt(S.fundEnd, 1)}, dünya ortancası ${fmt(S.worldFundEnd, 1)} hafta. Tabana yapışan ulus payı ortalama ${pct(S.worldPinnedAvg, 1)}.`,
});
lineChart($('c-prices'), {
  title: 'Tabandan kalkmış fiyatlar', sub: 'Dünya pazarı · kaynakların %', unit: '%', yMax: 100,
  series: [{ name: 'Tabanın üstünde', color: '--s1', data: A.prices.offFloor, band: false }],
  read: `Fiyatı tabanın (×0.6) üstünde olan kaynak payı ortalama ${pct(S.offFloorAvg)}: tabandaki kaynak ticaret sinyali taşımaz.`,
});

// ---------------------------------------------------------- KALKINMA ---
$('q-dev').textContent = 'Kalkınma kademesi 1-10; 1\'in üstündeki her kademe sanayi ekler. Donmuş oyuncu (noinvest) hiç kademe alamaz, kalkınma payı halka döner.';
lineChart($('c-dev'), {
  title: 'Oyuncunun kalkınması', sub: 'Kademe · nüfus ağırlıklı ortalama, state p10/p50/p90, tavan', digits: 1, yMax: 10,
  series: [
    { name: 'Ortalama', color: '--s1', data: A.development.avg },
    { name: 'State p10', color: '--s3', data: A.development.p10, band: false },
    { name: 'State p50', color: '--ink-2', data: A.development.p50, band: false },
    { name: 'State p90', color: '--s2', data: A.development.p90, band: false },
    { name: 'Tavan', color: '--ink-3', data: A.development.cap, band: false, dash: true },
    { name: 'Dünya ortancası', color: '--s4', data: A.development.world, band: false },
    { name: 'Donmuş oyuncu', color: '--before', data: A.development.noinvest, dash: true },
  ],
  read: `1945: ortalama ${fmt(S.devEnd, 2)}, tavan ${fmt(S.devCapEnd)}; donmuş oyuncu ${fmt(S.devNoinvestEnd, 2)}.`,
});
columnChart($('c-levels'), {
  title: 'Oyuncunun yılda aldığı kademe', sub: 'Fetihle gelen state sayılmaz · AUTO', data: A.development.levelsYear, color: '--s1',
  read: `Kademe bedeli hedef kademenin karesiyle büyür; tempo düşüşü bir sınır değil, pahalanma.`,
});
lineChart($('c-noinvest'), {
  title: 'Kalkınmayan ÷ kalkınan oyuncu', sub: 'Aynı tohum · oran', digits: 2, yMax: 1.2,
  series: [
    { name: 'Çıktı', color: '--s1', data: A.noinvest.output },
    { name: 'Sanayi', color: '--s2', data: A.noinvest.ic },
    { name: 'Skor', color: '--s3', data: A.noinvest.score },
    { name: 'Nüfus', color: '--s4', data: A.noinvest.population, band: false },
  ],
  refs: [{ y: 1, label: 'fark yok' }],
  read: `1945: çıktı ×${fmt(S.noinvestOutput, 2)}, sanayi ×${fmt(S.noinvestIC, 2)}, skor ×${fmt(S.noinvestScore, 2)}, nüfus ×${fmt(S.noinvestPop, 2)}.`,
});
lineChart($('c-noinvest-pop'), {
  title: 'Halkın malı: kalkınan ve donmuş oyuncu', sub: 'Tüketim malı oranı', digits: 2, yMin: 0.4, yMax: 2.5,
  series: [
    { name: 'AUTO', color: '--s1', data: A.draw.consumer },
    { name: 'Donmuş', color: '--s2', data: A.noinvest.consumer },
  ],
  refs: [{ y: 1, label: 'ihtiyaç' }],
  read: `Kalkınamayan ülkenin payı halka döner: oranı koldan yüksek (1945: ${fmt(S.noinvestConsumer, 2)}); bedeli büyümeyen çıktı.`,
});

// -------------------------------------------------------------- UZUNLUK ---
$('q-length').textContent = `Takvim olayları: ~1935 "Savaşa Giden Yol" (silahlanma kartı, savaş gerilimi), ~1939 "İkinci Büyük Savaş" (iki kıvılcım).`;
lineChart($('c-worldwar'), {
  title: 'Dünyada savaştaki ulusların payı', sub: '%', unit: '%', yMax: 60,
  series: pair('Dünya', A.load.worldWar, B?.load.worldWar, '--s1', { band: false }),
  read: `1930-45 ortalaması ${pct(SB.worldWarLate, 1)} → ${pct(S.worldWarLate, 1)}.`,
});
lineChart($('c-diplowar'), {
  title: 'Savaşan oyuncunun yılda savaşta geçen haftası', sub: 'Diplomasi de AUTO · hafta', yMax: 53,
  series: pair('Oyuncu', A.diplo.warYear.map((p) => [p[0] + 0.5, ...p.slice(1)]), B?.diplo.warYear.map((p) => [p[0] + 0.5, ...p.slice(1)]), '--s2'),
  read: `1925 sonrası toplam savaş haftası ${fmt(SB.diploWarLate)} → ${fmt(S.diploWarLate)} (tohum ortancası).`,
});

// --------------------------------------------------------------- HIZ ---
$('q-load').textContent = 'Görünür bildirim = oyuncuya kart açan kayıt (sessiz günlük hariç). Ekran en çok 5 kart tutar, aynı tür tek kartta sayılır.';
lineChart($('c-notes'), {
  title: 'Savaşan oyuncuya yılda düşen bildirim', sub: 'Tohum ortancası',
  series: pair('Bildirim', A.diplo.notes.map((p) => [p[0] + 0.5, ...p.slice(1)]), B?.diplo.notes.map((p) => [p[0] + 0.5, ...p.slice(1)]), '--s2'),
  read: `Tepe yıl ${fmt(peak(B?.diplo.notes ?? A.diplo.notes))} → ${fmt(peak(A.diplo.notes))}. Kıtlık uyarısının yandığı hafta payı ${pct(shortageOf(B ?? A))} → ${pct(shortageOf(A))}; uyarı yanan oyuncu haftası 1906-45 ${pct(alertShare(B ?? A))} → ${pct(alertShare(A))}.`,
});
{
  const card = $('c-speed');
  const notesPeak = peak(A.diplo.notes) ?? 0;
  const body = head(card, 'Hız kademesine göre gerçek zaman', 'Gün = 1000 ms ÷ hız', `4×'te barış yılı ${fmt(yearSec(4))} sn, 8×'te savaş yılı saniyede ~${fmt(notesPeak / yearSec(8), 1)} kart. 6×'te yıl ${fmt(yearSec(6))} sn.`);
  const rows = [1, 2, 4, 6, 8].map((sp) => {
    const y = yearSec(sp);
    return `<tr><td>${sp}×</td><td>${y >= 120 ? fmt(y / 60, 1) + ' dk' : fmt(y) + ' sn'}</td><td>${fmt(weeks * 7 / sp / 3600, 1)} sa</td><td>${fmt(notesPeak / y * 60, 0)}</td></tr>`;
  }).join('');
  const wrap = document.createElement('div'); wrap.className = 'tablewrap';
  wrap.innerHTML = `<table><thead><tr><th>Hız</th><th>Bir yıl</th><th>Kampanya</th><th>Kart/dk, tepe savaş yılı</th></tr></thead><tbody>${rows}</tbody></table>`;
  body.appendChild(wrap);
}

$('method').innerHTML = [
  `Ölçüm: <code>scripts/audit/stats-dashboard.mjs SEED variant</code> (160×96, tam kampanya) → <code>stats-dashboard-html.mjs klasör çıktı önceki-klasör</code>. Hızlı döngü: <code>npm run audit:military-industry</code> (78×62, 3 tohum × 30 yıl).`,
  `Oyuncu oyundaki gibi seçildi (en büyük bitişik devlet), AUTO açık (diplomasi hariç); kartları YZ seçimiyle kapatır, barış tekliflerini kabul eder. Varyantlar: auto · noinvest (kalkınma donmuş) · diplo.`,
  `Ekonomi grafikleri Tek Çubuk alanlarını okur (çıktı, paylar, s, fon, kalkınma); Tek Çubuk'tan önceki koşularda bu alanlar yoktur ve o seriler boş kalır.`,
].map((t) => `<li>${t}</li>`).join('');
