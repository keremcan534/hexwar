// ALTI YASA — veri ve okuyucular. Değiştirme kuralları (SG bedeli, kilit,
// parti aralığı, savaş desteği şartı) politics.js'tedir; burası yalnız "bu
// ulusta bu yasa hangi seçenekte, seçenek neyi değiştiriyor" sorusunu
// yanıtlar. Ekonomi, kültür ve ordu bu dosyadan okur: politics.js'e bağlansalar
// modül döngüsü doğardı.
//
// Seçenek alanları bir yerde OKUNMUYORSA o alan burada yazılmaz (ilke 1).
// `warSupport` yasayı ÇIKARMA eşiğidir; savaşta yasa barışa kadar durur
// (politics.js enforceLawRequirements). `needsTotalWar`: yalnız toplam savaşta
// çıkarılır (politics.js totalWarState).
// Okuyucular: labour → econ/output.js çıktı, politics istikrar, provinces
// büyüme; conscription → recruitment insan gücü, çıktı cezası; economy →
// sanayinin askerî payı (econ/output.js); trade → trade.js, yatırım verimi;
// citizenship → culture/provinces/recruitment; education → okuryazarlık +
// okul faturası (econ/bills.js).

export const LAWS = {
  // Vergi yasasının yerine (2026-10-15, altın kalktı): aynı üç kademe, aynı
  // istikrar ve büyüme bedeli; çarptığı şey artık vergi değil ÇIKTI.
  labour: {
    id: 'labour', name: 'Labour', icon: '⚖',
    options: [
      { id: 'short', name: 'Ten-Hour Day', output: 0.92, stability: 0.05, growth: 0.15, desc: 'Output ×0.92, stability +5, growth +15%' },
      { id: 'standard', name: 'Standard Week', output: 1.0, desc: 'Output ×1.0' },
      { id: 'long', name: 'Long Hours', output: 1.12, stability: -0.07, growth: -0.15, desc: 'Output ×1.12, stability −7, growth −15%' },
    ],
    default: 1,
  },
  conscription: {
    id: 'conscription', name: 'Conscription', icon: '⚔',
    options: [
      { id: 'volunteer', name: 'Volunteer Army', rate: 0.03, desc: 'Manpower 3% of population' },
      { id: 'limited', name: 'Limited Conscription', rate: 0.06, ic: -0.03, desc: 'Manpower 6%, industry −3%' },
      { id: 'extensive', name: 'Extensive Conscription', rate: 0.10, ic: -0.08, warSupport: 0.5, desc: 'Manpower 10%, industry −8% · needs war support 50%; held until the peace' },
      // 3. KADEME (redesign D5): 0.8 saldıranın her savaş haftasındaki p90'ının
      // üstündeydi; ~39 bin ulus-savaş-haftasının hiçbirinde kullanılmadı (u5).
      // 0.65 + toplam savaş şartı: eşik ulaşılabilir, ama yalnız toprağı
      // işgal edilen, bir yıldır savaşan ya da büyük savaşa giren ülkeye.
      { id: 'total', name: 'Total Mobilisation', rate: 0.16, ic: -0.2, stability: -0.05, warSupport: 0.65, needsTotalWar: true, desc: 'Manpower 16%, industry −20%, stability −5 · only in a total war, needs war support 65%' },
    ],
    default: 1,
  },
  economy: {
    id: 'economy', name: 'Economy', icon: '🏭',
    options: [
      { id: 'civilian', name: 'Civilian Economy', military: 0.10, desc: 'Army draws up to 10% of industry' },
      { id: 'partial', name: 'Partial Mobilisation', military: 0.25, desc: 'Army draws up to 25% of industry' },
      { id: 'war', name: 'War Economy', military: 0.5, warSupport: 0.5, atWarOr: true, desc: 'Army draws up to 50% · needs war or war support 50%' },
      { id: 'total', name: 'Total War Economy', military: 0.8, warSupport: 0.6, needsWar: true, needsTotalWar: true, stability: -0.05, desc: 'Army draws up to 80%, stability −5 · only in a total war, needs war support 60%' },
    ],
    default: 0,
  },
  trade: {
    id: 'trade', name: 'Trade', icon: '⚓',
    options: [
      { id: 'closed', name: 'Closed Economy', export: 0, importCost: 1.5, stability: 0.03, desc: 'No exports, imports +50% dearer, stability +3' },
      { id: 'limited', name: 'Limited Exports', export: 0.25, importCost: 1.0, desc: 'Export up to 25% of output' },
      { id: 'export', name: 'Export Focus', export: 0.5, importCost: 1.0, exportIncome: 1.15, desc: 'Export up to 50%; buyers favour your goods (+15% export appeal)' },
      { id: 'free', name: 'Free Trade', export: 0.8, importCost: 0.9, investment: 0.1, desc: 'Export up to 80%, imports −10%, investment +10%' },
    ],
    default: 1,
  },
  citizenship: {
    id: 'citizenship', name: 'Citizenship', icon: '👥',
    options: [
      // unrest: kabul edilmemiş halkın huzursuzluk çarpanı (culture.js).
      // manpower: yabancı halkın insan gücüne katılım payı (recruitment.js).
      // control: uyumun haftalık kazanım çarpanı; assimilation: erime hızı.
      { id: 'residency', name: 'Residency', unrest: 1.0, manpower: 0.15, control: 0.6, assimilation: 0.6, ceiling: 0.7, desc: 'Minorities have no rights: high unrest, few recruits' },
      { id: 'limited', name: 'Limited Citizenship', unrest: 0.7, manpower: 0.3, control: 0.85, assimilation: 1.0, ceiling: 0.85, desc: 'Partial rights for minorities' },
      // Bedelsizken Limited'e her ölçüde baskındı; istikrar −5 onu seçim yapar.
      { id: 'full', name: 'Full Citizenship', unrest: 0.45, manpower: 0.5, control: 1.25, assimilation: 1.4, ceiling: 1.0, stability: -0.05, desc: 'Equal rights: calm minorities, more recruits · stability −5' },
    ],
    default: 1,
  },
  education: {
    id: 'education', name: 'Education', icon: '🎓',
    options: [
      { id: 'none', name: 'No Public Schools', literacy: 0.12, cost: 0, desc: 'Literacy drifts to 12%' },
      { id: 'basic', name: 'Primary Schools', literacy: 0.4, cost: 0.075, desc: 'Literacy target 40%; schools cost 0.075 IC per 100k a week' },
      { id: 'universal', name: 'Universal Education', literacy: 0.75, cost: 0.18, desc: 'Literacy target 75%; schools cost 0.18 IC per 100k a week' },
    ],
    default: 0,
  },
};
export const LAW_IDS = Object.keys(LAWS);

/** Yasanın seçili kademesi (0'dan). Kaydı olmayan ulus varsayılanı okur. */
export function lawIndex(nation, lawId) {
  const law = LAWS[lawId];
  const raw = nation?.politics?.laws?.[lawId];
  const index = Number.isInteger(raw) ? raw : law.default;
  return Math.max(0, Math.min(law.options.length - 1, index));
}

/** Yasanın seçili seçeneği (etki alanlarıyla). */
export function lawOption(nation, lawId) {
  return LAWS[lawId].options[lawIndex(nation, lawId)];
}

/** Yasa seçeneklerinin toplanan alanı (ör. istikrar katkısı). */
export function lawSum(nation, field) {
  let total = 0;
  for (const id of LAW_IDS) total += lawOption(nation, id)[field] ?? 0;
  return total;
}
