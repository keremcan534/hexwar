// GAZETENİN DİLİ — olgudan metne saf çeviri.
//
// Yazı işleri (press.js) dünyadan OLGU toplar; burası olguyu cümleye çevirir.
// Bu dosya dünyayı görmez: yalnız sayıdaki olguyu ve o sayının basıldığı anın
// sesini okur. Bu yüzden eski sayı yıllar sonra da aynı metinle okunur ve
// kayda metin değil yalnız olgu yazılır (bir sayının metni olgusunun iki katı).
//
// DİL. Dünyanın dokuz dil ailesi kurmacadır ama halkların adları gerçek dil
// kuşaklarını andırır; gazetenin adı, tarih satırı, ay adları ve bölüm başlıkları
// o kuşağın diliyle basılır. Haber gövdesi oyunun diliyle kalır: oyuncu kendi
// gazetesini okuyabilmeli.
//
// SES. Aynı olgu rejime göre başka cümle olur: saray gazetesi yenilgiyi "hat
// kısaltıldı" diye yazar, milliyetçi organ küçültür, işçi organı faturayı sorar,
// serbest basın rakamı olduğu gibi verir. Propaganda olayı UYDURMAZ, seçer ve
// susar: sansürlü seste kendi kaybımızın yerinde boşluk kalır ([[cut]]).

import { dateOfTurn } from './calendar.js';

const ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Dil paketleri. `papers` sese göre ad havuzudur: {city} basıldığı şehir,
 * {nation} ulusun adı. `house` meclisin yerel adıdır ve haber gövdesine girer.
 */
export const LEX = {
  Valdic: {
    no: 'No.', months: ENGLISH_MONTHS, house: 'Parliament',
    sec: { extra: 'Extra Edition', home: 'At Home', abroad: 'Abroad', front: 'From the Front', brief: 'In Brief', markets: 'The Markets' },
    papers: {
      court: ['The {nation} Gazette', 'The Court Circular'],
      sober: ['The {city} Times', 'The {nation} Standard'],
      free: ['The {city} Courier', 'The {city} Herald', 'The Morning Dispatch'],
      jingo: ['The {nation} Banner', 'The Patriot'],
      labour: ['The Clarion', 'The Workers\' Voice'],
    },
  },
  Norric: {
    no: 'Nr.', house: 'the Thing',
    months: ['Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'December'],
    sec: { extra: 'Ekstrablad', home: 'Indland', abroad: 'Udland', front: 'Fra Fronten', brief: 'Kort Nyt', markets: 'Børsen' },
    papers: {
      court: ['Statstidende', 'Rigets Tidende'],
      sober: ['{city} Avis', 'Dagbladet'],
      free: ['{city} Tidende', 'Morgenbladet', 'Aftenbladet'],
      jingo: ['Fædrelandet', 'Rigsbanneret'],
      labour: ['Arbejderbladet', 'Folkets Røst'],
    },
  },
  Torvic: {
    no: '№', house: 'the Duma',
    months: ['Yanvarya', 'Fevralya', 'Marta', 'Aprelya', 'Maya', 'Iyunya', 'Iyulya', 'Avgusta', 'Sentyabrya', 'Oktyabrya', 'Noyabrya', 'Dekabrya'],
    sec: { extra: 'Ekstrenny Vypusk', home: 'Vnutri Strany', abroad: 'Za Rubezhom', front: 'S Fronta', brief: 'Korotko', markets: 'Birzha' },
    papers: {
      court: ['Pravitelstvenny Vestnik', 'Gosudarstvenny Vestnik'],
      sober: ['Vedomosti', 'Vestnik {city}'],
      free: ['Novoe Slovo', 'Utro {city}', 'Golos'],
      jingo: ['Znamya Naroda', 'Rodina'],
      labour: ['Rabochaya Gazeta', 'Golos Truda'],
    },
  },
  Sarnic: {
    no: 'Aded', house: 'the Majlis',
    months: ['Kânunusani', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Teşrinievvel', 'Teşrinisani', 'Kânunuevvel'],
    sec: { extra: 'Fevkalâde Nüsha', home: 'Dahilî Haberler', abroad: 'Haricî Haberler', front: 'Cepheden', brief: 'Kısa Havadis', markets: 'Borsa' },
    papers: {
      court: ['Takvim-i Vekâyi', 'Ceride-i Resmiye'],
      sober: ['Vakit', 'İkdam'],
      free: ['Tasvir-i {city}', 'Sabah', 'Hürriyet'],
      jingo: ['Vatan', 'Bayrak'],
      labour: ['Amele Gazetesi', 'Sadâ-yı Amele'],
    },
  },
  Eshan: {
    no: 'Dai', house: 'the Diet',
    months: ['Ichigatsu', 'Nigatsu', 'Sangatsu', 'Shigatsu', 'Gogatsu', 'Rokugatsu', 'Shichigatsu', 'Hachigatsu', 'Kugatsu', 'Jūgatsu', 'Jūichigatsu', 'Jūnigatsu'],
    sec: { extra: 'Gōgai', home: 'Kokunai', abroad: 'Kaigai', front: 'Senkyō', brief: 'Tanshin', markets: 'Shikyō' },
    papers: {
      court: ['Kanpō', 'Teikoku Kanpō'],
      sober: ['{city} Nippō', 'Jiji Shinpō'],
      free: ['{city} Shinbun', '{city} Nichinichi', 'Asa Shinbun'],
      jingo: ['Kokumin Shinbun', 'Kokuryū'],
      labour: ['Heimin Shinbun', 'Rōdō Shinbun'],
    },
  },
  Meridic: {
    no: 'N.', house: 'the Chamber',
    months: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
    sec: { extra: 'Edizione Straordinaria', home: 'Interno', abroad: 'Estero', front: 'Dal Fronte', brief: 'In Breve', markets: 'La Borsa' },
    papers: {
      court: ['Gazzetta Ufficiale', 'Il Monitore'],
      sober: ['La Gazzetta di {city}', 'La Tribuna'],
      free: ['Il Corriere di {city}', 'Il Messaggero', 'La Voce di {city}'],
      jingo: ['La Patria', 'Il Popolo di {city}'],
      labour: ['Avanti', 'Il Lavoratore'],
    },
  },
  Aurenic: {
    no: 'N°', house: 'the Assembly',
    months: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    sec: { extra: 'Édition Spéciale', home: 'Intérieur', abroad: 'Étranger', front: 'Du Front', brief: 'En Bref', markets: 'La Bourse' },
    papers: {
      court: ['Le Moniteur Officiel', 'Journal Officiel'],
      sober: ['Le Temps', 'Le Journal de {city}'],
      free: ['Le Courrier de {city}', 'Le Petit Journal', 'La Dépêche de {city}'],
      jingo: ['La Patrie', 'Le Drapeau'],
      labour: ['Le Cri du Peuple', 'Le Travailleur'],
    },
  },
  Zanhari: {
    no: 'Na.', house: 'the Baraza',
    months: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
    sec: { extra: 'Toleo Maalum', home: 'Habari za Nchini', abroad: 'Ughaibuni', front: 'Kutoka Vitani', brief: 'Kwa Ufupi', markets: 'Soko' },
    papers: {
      court: ['Gazeti Rasmi', 'Gazeti la Serikali'],
      sober: ['Taifa', 'Mambo Leo'],
      free: ['Habari za {city}', 'Mwangaza', 'Kiongozi'],
      jingo: ['Sauti ya Taifa', 'Bendera'],
      labour: ['Mfanyakazi', 'Sauti ya Wafanyakazi'],
    },
  },
  Kelani: {
    no: 'Bil.', house: 'the Dewan',
    months: ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'],
    sec: { extra: 'Edisi Khas', home: 'Dalam Negeri', abroad: 'Luar Negeri', front: 'Dari Medan Perang', brief: 'Berita Ringkas', markets: 'Pasaran' },
    papers: {
      court: ['Warta Kerajaan', 'Warta Rasmi'],
      sober: ['Berita Harian', 'Utusan {city}'],
      free: ['Warta {city}', 'Pemandangan', 'Suara {city}'],
      jingo: ['Panji Bangsa', 'Suara Bangsa'],
      labour: ['Suara Buruh', 'Kaum Buruh'],
    },
  },
};

export const lexOf = (family) => LEX[family] ?? LEX.Valdic;

/** Gazetenin adı: ulusa bağlı sabit seçim, sesi değişince gazete de değişir. */
export function paperName(family, voice, city, nation, hash) {
  const list = lexOf(family).papers[voice] ?? lexOf(family).papers.sober;
  return list[Math.abs(hash) % list.length].replace('{city}', city).replace('{nation}', nation);
}

// ------------------------------------------------------------ BİÇİMLER ---

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const num = (n) => (n >= 0 && n <= 12 ? WORDS[n] : Number(n).toLocaleString('en-US'));
const of = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const ordinal = (n) => ORDINALS[n] ?? `${n}th`;
const pick = (list, v) => list[Math.abs(v) % list.length];
const an = (word) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

/** Asker sayısı: gazete adamı adam saymaz, yuvarlar. */
function men(n) {
  const v = Math.max(0, Math.round(n ?? 0));
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} million`;
  if (v >= 10000) return (Math.round(v / 1000) * 1000).toLocaleString('en-US');
  if (v >= 1000) return (Math.round(v / 100) * 100).toLocaleString('en-US');
  return (Math.round(v / 10) * 10).toLocaleString('en-US');
}
function millions(n) {
  const v = (n ?? 0) / 1e6;
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} million`;
}
/** Süre: 60 haftadan sonra gazete ayla, iki yıldan sonra yılla sayar. */
function span(weeks) {
  if (weeks < 9) return of(Math.max(1, weeks), 'week');
  if (weeks < 104) return of(Math.round(weeks / 4.35), 'month');
  return of(Math.round(weeks / 52), 'year');
}

/** Sansürlü ses kendi kaybını yazmaz; yerinde boş bir sütun parçası kalır. */
const censors = (c) => c.voice === 'court' || c.voice === 'jingo';
const CUT = '[[cut]]';
const V = (c, table) => table[c.voice] ?? table.sober;

// -------------------------------------------------------------- MASALAR ---
// Her masa bir olgu türünü çevirir: `heads` manşet seçenekleri, `deck` alt
// başlık, `body` gövde cümleleri, `sec` bölüm. Seçeneği sayının `v` alanı seçer.

const DESK = {
  war(f, c) {
    const { a, b, us, wk = 0 } = f;
    const R = cap(c.ruler);
    const our = c.our;
    const open = f.ph === 'open';
    const more = f.n ? ` ${cap(of(f.n, 'other state'))} entered the fighting the same week.` : '';
    if (us === 'b' && !open) {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`${a} Breaks the Peace; ${R} Calls the Realm to Arms`, `Insolent Ultimatum From ${a}`, `The Realm Is Threatened: ${R} Summons the Army`],
          jingo: [`${a} Has Chosen War and Will Regret It`, `To Arms! ${a} Threatens ${our}`, `${our} Will Not Bow to ${a}`],
          labour: [`War Threat From ${a}: The Workers Will Pay Again`, `The Rulers of ${a} Send an Ultimatum`, `${a} Demands War; Who Will Fight It?`],
          free: [`${a} Declares War on ${our}`, `Ultimatum From ${a}: ${cap(of(wk, 'Week'))} to the Frontier`, `${our} Faces War With ${a}`],
          sober: [`State of War With ${a}`, `${a} Delivers Its Declaration of War`, `Ministers Confirm the Ultimatum From ${a}`],
        }),
        deck: [`The ultimatum runs ${of(wk, 'week')}; the frontier opens when it expires.`],
        body: [V(c, {
          court: `${R} has commanded that the forces of the realm stand ready. Subjects are enjoined to calm and to obedience.`,
          jingo: `The nation has been insulted before the world. Every able man knows where his duty lies.`,
          labour: `Once more the young men of the mill towns are told to prepare. Nobody has asked them what the quarrel is.`,
          free: `The government has until the ultimatum expires to prepare the country. ${cap(c.house)} is expected to debate the war credits.`,
          sober: `The reserve is expected to be called before the term of the ultimatum runs out.`,
        })],
      };
    }
    if (us === 'a' && !open) {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`By Command of ${R}, War Is Declared on ${b}`, `${b} Refuses Satisfaction; the Sword Is Drawn`, `${R} Proclaims War Upon ${b}`],
          jingo: [`Forward Against ${b}!`, `The Hour of ${our} Has Come: War on ${b}`, `${b} Will Answer for Its Insolence`],
          labour: [`Government Takes ${our} to War With ${b}`, `War on ${b}: Who Asked the People?`, `Ministers Choose War With ${b}`],
          free: [`${our} Declares War on ${b}`, `Cabinet Chooses War With ${b}`, `Ultimatum Sent to ${b}`],
          sober: [`War Declared on ${b}`, `${our} Delivers Ultimatum to ${b}`, `Ministers Announce War With ${b}`],
        }),
        deck: [`The army marches when the ultimatum of ${of(wk, 'week')} expires.`],
        body: [V(c, {
          court: 'The will of the throne has been made known to the army and to the people.',
          jingo: 'The nation stands behind its soldiers to the last man.',
          labour: 'The declaration was made without a vote of those who will do the fighting.',
          free: `Ministers will answer for the decision in ${c.house}.`,
          sober: 'Both sides may now mobilise until the term expires.',
        })],
      };
    }
    if (us === 'b') {
      return {
        sec: 'front',
        heads: V(c, {
          court: ['The Enemy Crosses Our Frontier; the Army Stands Firm', `${a} Invades; ${R} Commands Resistance`],
          jingo: [`${a} Marches Into a Graveyard`, `The Invader Sets Foot on Sacred Soil`],
          labour: [`The Armies of ${a} Are Across the Border`, 'The War Has Come to the Frontier Towns'],
          free: [`${a} Invades ${our}`, `Armies of ${a} Cross the Frontier`],
          sober: [`Hostilities Open on the ${a} Frontier`, `${a} Crosses the Border as Ultimatum Expires`],
        }),
        deck: ['The ultimatum has expired and fighting has begun along the frontier.'],
        body: [`The state of war with ${a} is now in force.${more}`],
      };
    }
    if (us === 'a') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`The Army of ${R} Enters ${b}`, `Our Columns Advance Into ${b}`],
          jingo: [`Our Soldiers Are on ${b} Soil!`, `The Advance Into ${b} Begins`],
          labour: [`The Army Crosses Into ${b}`, `The Fighting With ${b} Begins`],
          free: [`${our} Invades ${b}`, `Our Army Crosses Into ${b}`],
          sober: [`Hostilities Open on the ${b} Frontier`, `Ultimatum Expires; Army Enters ${b}`],
        }),
        deck: ['The ultimatum has expired and the army is across the frontier.'],
        body: [`The state of war with ${b} is now in force.${more}`],
      };
    }
    if (f.why === 'independence') {
      return { sec: 'abroad', heads: [`${a} Takes Up Arms Against ${b}`, `Rising Against ${b}: ${a} Fights for Its Freedom`, `${b} Faces Rebellion in Arms From ${a}`], deck: [`The new state has raised its regiments without an ultimatum.${more}`], body: [`Fighting has begun between ${a} and ${b}.`] };
    }
    if (f.why === 'alliance') {
      return { sec: 'abroad', heads: [`${a} Is Drawn Into the War With ${b}`, `The Alliances Bring ${a} Against ${b}`, `${a} Honours Its Treaty and Fights ${b}`], deck: [`The treaty obligation has widened the conflict.${more}`], body: [`${a} and ${b} are now at war.`] };
    }
    if (!open) {
      return { sec: 'abroad', heads: [`${a} Sends Ultimatum to ${b}`, `War Clouds Over ${b}`, `${a} Declares War on ${b}`, `${b} Given ${cap(of(wk, 'Week'))} by ${a}`], deck: [`The term of the ultimatum is ${of(wk, 'week')}.${more}`], body: [`Unless the term is met, the armies of ${a} will cross into ${b}.`] };
    }
    return { sec: 'abroad', heads: [`${a} and ${b} at War`, `${a} Invades ${b}`, `War Breaks Out Between ${a} and ${b}`, `${a} Marches on ${b}`, `Fighting Along the ${b} Frontier`], deck: [`The armies of ${a} have crossed into ${b}.${more}`], body: [`Correspondents report the frontier closed between ${a} and ${b}.`] };
  },

  peace(f, c) {
    const { a, b, us, n = 0, wk = 0, vas } = f;
    const our = c.our;
    const decisive = n > 0 || vas;
    const other = us === 'a' ? b : a;
    const span_ = span(wk);
    if (us && !decisive) {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`${cap(c.ruler)} Grants Peace to ${other}`, `Peace Restored With ${other}`],
          jingo: [`${other} Abandons the Field: Peace on the Old Frontier`, `Not One Province Yielded to ${other}`],
          labour: [`The War With ${other} Is Over. What Was It For?`, `Peace With ${other}; the Borders Stand Where They Stood`],
          free: [`White Peace With ${other}`, `War With ${other} Ends Without a Victor`],
          sober: [`Peace With ${other} on the Old Borders`, `Treaty Ends the War With ${other}`],
        }),
        deck: [`The war lasted ${span_}; the frontier stands as it was.`],
        body: [V(c, { labour: `After ${span_} of fighting, not a mile of ground has changed hands.`, court: 'The forces of the realm return to their garrisons.', jingo: 'The enemy has learned the price of attacking this nation.', free: `After ${span_} of fighting, neither side has anything to show for it.`, sober: 'The regiments will return to their peacetime stations.' })],
      };
    }
    if (us === 'a') {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`Victory: ${b} Sues for Peace`, `${b} Submits to the Terms of ${cap(c.ruler)}`],
          jingo: [`${b} Is Beaten! The War Is Won`, `Triumph: ${b} Accepts Our Terms`],
          labour: [`The Guns Fall Silent on the ${b} Front`, `Peace With ${b}; the Soldiers Can Come Home`],
          free: [`Peace With ${b}: ${cap(of(n, 'Province'))} Annexed`, `${b} Signs; ${our} Gains ${cap(of(n, 'Province'))}`],
          sober: [`Treaty Concluded With ${b}`, `${b} Accepts Terms After ${cap(span_)} of War`],
        }),
        deck: [n ? `${cap(of(n, 'province'))} of ${b} pass${n === 1 ? 'es' : ''} to ${our} under the treaty.` : `${b} has accepted the terms of ${our}.`],
        body: [`The war lasted ${span_}.${vas ? ` ${b} becomes a vassal of ${our}.` : ''}`],
      };
    }
    if (us === 'b') {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`An Honourable Peace Is Concluded With ${a}`, `${cap(c.ruler)} Accepts Peace for the Good of the Realm`],
          jingo: [`Armistice With ${a}: The Nation Stands Unbroken`, `Our Army Was Never Beaten in the Field`],
          labour: [`The War Is Over, and the Bill Has Come`, `${a} Dictates; the People Will Pay`],
          free: [`${our} Cedes ${cap(of(n, 'Province'))} to ${a}`, `Defeat: Peace Signed on the Terms of ${a}`],
          sober: [`Peace Signed: ${cap(of(n, 'Province'))} Pass to ${a}`, `${our} Accepts the Terms of ${a}`],
        }),
        deck: [censors(c) ? 'The treaty has been signed; its clauses are in the hands of the commissioners.' : `${cap(of(n, 'province'))} pass${n === 1 ? 'es' : ''} to ${a} under the treaty.`],
        body: [censors(c) ? `Territorial clauses: ${CUT}. The army returns with its colours.` : `The war lasted ${span_}.${vas ? ` ${our} is to be a vassal of ${a}.` : ''}`],
      };
    }
    if (decisive) {
      return { sec: 'abroad', heads: [`${a} Dictates Peace to ${b}`, `${b} Yields ${cap(of(n, 'Province'))} to ${a}`, `${b} Signs Under Duress`, `Treaty Ends the War Between ${a} and ${b}`], deck: [`After ${span_} of war, ${of(n, 'province')} change${n === 1 ? 's' : ''} hands.`], body: [vas ? `${b} becomes a vassal of ${a}.` : `${a} emerges the stronger from ${span_} of war.`] };
    }
    return { sec: 'abroad', heads: [`${a} and ${b} Sign Peace`, `Guns Fall Silent Between ${a} and ${b}`, `War Between ${a} and ${b} Ends in Stalemate`], deck: [`The war lasted ${span_} and the frontier is unchanged.`], body: [`Neither ${a} nor ${b} gains ground by the treaty.`] };
  },

  capital_fell(f, c) {
    const { city, a, by, us } = f;
    const our = c.our;
    if (us === 'a') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`Government Removes From ${city} to Continue the Struggle`, `The Court Leaves ${city} for a Safer Seat`],
          jingo: [`${city} Bleeds but Does Not Kneel`, `The Enemy Holds Stones; the Nation Holds Its Honour`],
          labour: [`${city} Falls; the People Are Left to ${by}`, `The Ministers Are Gone and ${by} Is in ${city}`],
          free: [`${city} Has Fallen`, `${by} Takes the Capital`],
          sober: [`${by} Enters ${city}`, `The Capital Is Occupied`],
        }),
        deck: [censors(c) ? 'The seat of government has been transferred. The struggle continues.' : `Troops of ${by} now hold the capital of ${our}.`],
        body: [censors(c) ? `Losses in the defence of the city: ${CUT}.` : `The fate of ${city} will be decided at the peace table unless the army can retake it.`],
      };
    }
    if (us === 'by') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`${city} Lies at the Feet of ${cap(c.ruler)}`, `The Standard of ${our} Flies Over ${city}`],
          jingo: [`${city} Is Ours!`, `Our Flag Over ${city}! ${a} Is Broken`],
          labour: [`Our Army Is in ${city}. Now End the War`, `${city} Is Taken; the Soldiers Ask When They Go Home`],
          free: [`${our} Captures ${city}`, `The Capital of ${a} Falls to Our Army`],
          sober: [`Our Forces Enter ${city}`, `${city} Occupied by the Army of ${our}`],
        }),
        deck: [`The capital of ${a} is in our hands.`],
        body: ['The occupation strengthens the hand of our negotiators at any peace table.'],
      };
    }
    return { sec: 'abroad', heads: [`${city} Falls to ${by}`, `${by} Takes the Capital of ${a}`, `${a} Loses Its Capital`, `The Flag of ${by} Over ${city}`], deck: [`The capital of ${a} is under occupation.`], body: [`Troops of ${by} entered ${city} this week.`] };
  },

  capital_freed(f, c) {
    const { city, a, us } = f;
    if (us) {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`${city} Restored to the Crown`, `${cap(c.ruler)} Returns to ${city}`],
          jingo: [`${city} Is Free! The Invader Flees`, `${city} Rises Again`],
          labour: [`${city} Is Ours Again. At What Price?`, `The Occupation of ${city} Is Over`],
          free: [`${city} Recaptured`, `The Capital Is Free`],
          sober: [`Our Forces Reenter ${city}`, `${city} Back Under National Control`],
        }),
        deck: ['The capital is once more under national control.'],
        body: ['The enemy has been driven from the city.'],
      };
    }
    return { sec: 'abroad', heads: [`${a} Retakes ${city}`, `${city} Liberated`, `Occupation of ${city} Ends`], deck: [`The capital of ${a} is free again.`], body: [`The occupying troops have left ${city}.`] };
  },

  state_ended(f) {
    const { a, by } = f;
    return { sec: 'abroad', heads: [`${a} Ceases to Exist`, `The Last of ${a}`, `${a} Erased From the Map`, `${by ? `${by} Absorbs ${a}` : `The End of ${a}`}`], deck: [by ? `What remained of ${a} passes to ${by}.` : `${a} has disappeared as a state.`], body: [`Maps of the region will have to be redrawn.`] };
  },

  born(f, c) {
    const { a, from, people, us } = f;
    const folk = people ? `the ${people}` : 'the rebels';
    if (us) {
      return {
        sec: 'home',
        heads: V(c, {
          court: [`Rebels in the Provinces Proclaim a Sham State`, `Disorder Among ${cap(folk)}; Order Will Be Restored`],
          jingo: [`Traitors Raise a Flag Over ${a}`, `The Nation Will Not Forgive ${a}`],
          labour: [`${cap(folk)} Go Their Own Way`, `${a} Proclaimed: The Empire Pays for Its Neglect`],
          free: [`${a} Breaks Away From ${c.our}`, `${cap(folk)} Declare Independence`],
          sober: [`Provinces Secede; ${a} Proclaimed`, `Independence of ${a} Declared`],
        }),
        deck: [`${cap(folk)} have proclaimed ${a} on land held by ${c.our}.`],
        body: [censors(c) ? 'The authorities describe the disturbance as local.' : 'The government must now decide between reconquest and recognition.'],
      };
    }
    return { sec: 'abroad', heads: [`${cap(folk)} Proclaim ${a}`, `${a} Declares Independence${from ? ` From ${from}` : ''}`, `A New Flag: ${a}`, `${from ? `${from} Loses Provinces to` : 'New State of'} ${a}`], deck: [from ? `${cap(folk)} have broken from ${from}.` : `${cap(folk)} have a state of their own.`], body: [`The new state of ${a} has been proclaimed.`] };
  },

  regime(f, c) {
    const { a, to, us } = f;
    const republic = to === 'Republic';
    const crown = to === 'Absolute Monarchy';
    if (us) {
      return {
        sec: 'home',
        heads: republic
          ? ['The Republic Is Proclaimed', 'End of the Monarchy in ' + c.our, 'A Republic in ' + c.our]
          : crown
            ? ['Royal Authority Restored', 'The Throne Resumes Its Full Powers', 'The Constitution Is Set Aside']
            : ['A Constitution Is Granted', 'The Crown Accepts a Constitution', `${cap(c.house)} Receives Its Charter`],
        deck: [`${c.our} is from today ${an(to.toLowerCase())}.`],
        body: [republic ? 'The new order takes up the affairs of state at once.' : crown ? 'Decrees will henceforth issue from the throne.' : `${cap(c.house)} will sit under the new constitution.`],
      };
    }
    return {
      sec: 'abroad',
      heads: republic ? [`Revolution in ${a}: Republic Proclaimed`, `${a} Overthrows Its Crown`, `The Throne Falls in ${a}`]
        : crown ? [`Crown Reclaims Full Power in ${a}`, `${a} Returns to Absolute Rule`] : [`${a} Receives a Constitution`, `Reform in ${a}: A Charter Is Granted`],
      deck: [`${a} is now ${an(to.toLowerCase())}.`], body: [`The change of government in ${a} is being watched in every chancellery.`],
    };
  },

  cabinet(f, c) {
    const { a, party, us } = f;
    if (us) {
      return { sec: 'home', heads: [`${party} Take Office`, `New Government: ${party} in Power`, `${party} Form the Cabinet`], deck: [`The ${party} now lead the government of ${c.our}.`], body: [`Ministers will present their programme to ${c.house}.`] };
    }
    return { sec: 'abroad', heads: [`${party} Take Power in ${a}`, `Change of Government in ${a}`, `${a} Turns to the ${party}`], deck: [`The ${party} now govern ${a}.`], body: [`Observers expect a new course in ${a}.`] };
  },

  election(f, c) {
    const { party, pct } = f;
    return {
      sec: 'home',
      heads: V(c, {
        labour: [`The Vote Is In: ${party} ${pct}%`, `${party} Lead the Poll With ${pct}%`],
        jingo: [`The Nation Has Spoken: ${party} ${pct}%`, `${party} Take ${pct}% of the Vote`],
        court: [`Result of the Elections Announced`, `${party} Returned With ${pct}%`],
        sober: [`${party} Win the Election With ${pct}%`, `Poll Closes: ${party} First With ${pct}%`, `${party} Carry the Country`],
      }),
      deck: [`The ${party} took ${pct}% of the vote.`],
      body: [`The new ${c.house === 'Parliament' ? 'Parliament' : `session of ${c.house}`} will meet shortly.`],
    };
  },

  supply(f, c) {
    const { pct, a, us } = f;
    if (!us) return { sec: 'abroad', heads: [`${a} Cannot Meet Its Bills`, `Supply Crisis in ${a}`, `The Treasury of ${a} Runs Short`], deck: [`${a} is paying only part of what its state owes.`], body: [`The army of ${a} is reported short of supply.`] };
    return {
      sec: 'home',
      heads: V(c, {
        court: ['Temporary Adjustments in the Supply of the Forces', 'Prudent Economies Ordered in the State Accounts'],
        jingo: ['The Nation Asked for Fresh Sacrifice', 'Belts Tighten for Final Victory'],
        labour: ['The State Cannot Pay Its Bills', `Only ${pct} Parts in a Hundred Paid`],
        free: [`State Can Meet Only ${pct}% of Its Bills`, 'Supply Crisis: The Army Goes Short'],
        sober: ['State Bills Outrun the Nation\'s Means', `Supply Payments Fall to ${pct}%`],
      }),
      deck: [censors(c) ? 'The authorities ask for patience.' : `Only ${pct}% of the bills of state are being paid.`],
      body: [censors(c) ? `Share of bills met this week: ${CUT}.` : 'The army reinforces, trains and recovers more slowly until the accounts are balanced.'],
    };
  },

  supply_ok(f, c) {
    return { sec: 'home', heads: ['State Pays Its Bills in Full Again', 'Supply Crisis Ends', 'The Accounts of State Are Balanced'], deck: ['The bills of state are once more paid in full.'], body: [`The army returns to full supply, ministers told ${c.house}.`] };
  },

  hunger(f, c) {
    const { pct } = f;
    return {
      sec: 'home',
      heads: V(c, {
        court: ['Measures Announced for the Provisioning of the Towns', 'The Crown Attends to the Bread Supply'],
        jingo: ['The Nation Tightens Its Belt and Stands Firm', 'Hoarders Warned as Rations Shrink'],
        labour: [`Bread! ${pct}% of the Need Reaches the Table`, 'The Towns Are Going Hungry'],
        free: [`Hunger: Only ${pct}% of the Food Need Is Met`, 'Food Shortage Spreads Through the Country'],
        sober: ['Food Shortage Grows Grave', `Food Supply Falls to ${pct}% of Need`],
      }),
      deck: [censors(c) ? 'Citizens are asked to report hoarding.' : `Only ${pct}% of the food the country needs is reaching its people.`],
      body: [f.blockade ? `An enemy fleet is blockading ${f.blockade}% of the coast.` : 'Prices are rising in every market town.'],
    };
  },

  hunger_end(f) {
    const { wk, worst } = f;
    return { sec: 'home', heads: [`The Hunger Ends After ${cap(span(wk))}`, 'Bread Returns to the Towns', 'Food Supply Recovers'], deck: [`In the worst week only ${worst}% of the need was met.`], body: ['Markets report normal supply again.'] };
  },

  battle(f, c) {
    const { w, l, place, gen, lw, ll, us } = f;
    if (us === 'w') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`Victory at ${place}`, `The Arms of ${cap(c.ruler)} Prevail at ${place}`],
          jingo: [`Glorious Day at ${place}!`, `${l} Smashed at ${place}`, gen ? `${gen} Breaks the Enemy at ${place}` : `The Enemy Breaks at ${place}`],
          labour: [`${place} Is Won; ${men(lw)} of Ours Are Down`, `Victory at ${place}, and the Lists of the Fallen`],
          free: [`${l} Driven Back at ${place}`, gen ? `${gen} Wins at ${place}` : `Battle of ${place} Won`],
          sober: [`Our Forces Prevail at ${place}`, `Enemy Withdraws From ${place}`],
        }),
        deck: [`The army of ${l} lost some ${men(ll)} men.`],
        body: [`${gen ? `General ${gen} commanded. ` : ''}${censors(c) ? `Our own losses are given as ${CUT}.` : `Our own losses are put at ${men(lw)}.`}`],
      };
    }
    if (us === 'l') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`Positions Near ${place} Shortened in Good Order`, `Regrouping Completed Behind ${place}`],
          jingo: [`${place}: Our Men Sell Every Yard Dearly`, `${w} Pays a Terrible Price at ${place}`],
          labour: [`${place}: Another Field, Another List of the Dead`, `${men(ll)} Lost at ${place}`],
          free: [`Defeat at ${place}`, `${w} Forces Our Army From ${place}`],
          sober: [`Our Forces Withdraw From ${place}`, `Reverse at ${place}`],
        }),
        deck: [censors(c) ? `The enemy lost some ${men(lw)} men in the attack.` : `The army lost some ${men(ll)} men before retiring.`],
        body: [`${gen ? `The enemy was led by ${gen}. ` : ''}${censors(c) ? `Our own losses: ${CUT}.` : `The enemy's losses are put at ${men(lw)}.`}`],
      };
    }
    return { sec: 'abroad', heads: [`${w} Wins the Battle of ${place}`, `${l} Routed at ${place}`, `Heavy Fighting at ${place}`, gen ? `${gen} Victorious at ${place}` : `${w} Holds ${place}`], deck: [`Some ${men(lw + ll)} men fell in the battle between ${w} and ${l}.`], body: [`${gen ? `${gen} led the army of ${w}. ` : ''}${l} lost about ${men(ll)}; ${w} about ${men(lw)}.`] };
  },

  pocket(f, c) {
    const { a, place, n, m, us } = f;
    if (us) {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`Forces Near ${place} Hold Their Positions`, `Determined Defence Around ${place}`],
          jingo: [`The Heroes of ${place} Will Never Surrender`, `${place} Stands Alone and Unbowed`],
          labour: [`${men(m)} of Our Men Trapped at ${place}`, `Cut Off at ${place}`],
          free: [`${cap(of(n, 'Division'))} Encircled at ${place}`, `Army Trapped at ${place}`],
          sober: [`Forces Cut Off at ${place}`, `Encirclement Reported at ${place}`],
        }),
        deck: [censors(c) ? 'Relief is expected.' : `Some ${men(m)} men have no line of retreat.`],
        body: [censors(c) ? `Strength of the garrison: ${CUT}.` : 'Unless the line is broken from outside they must surrender.'],
      };
    }
    return { sec: 'front', heads: [`${a} Encircled at ${place}`, `The Trap Closes at ${place}`, `${cap(of(n, 'Enemy Division'))} Cut Off at ${place}`], deck: [`Some ${men(m)} men of ${a} have no way out.`], body: ['Their surrender is expected if the ring holds.'] };
  },

  weary(f, c) {
    const { a, us, wk } = f;
    if (us) {
      return {
        sec: 'home',
        heads: V(c, {
          court: ['The Realm Bears Its Burden With Dignity', 'Appeal to the Loyalty of All Subjects'],
          jingo: ['Defeatists Will Be Dealt With', 'No Peace Without Victory'],
          labour: [`${cap(span(wk))} of War: The Country Has Had Enough`, 'Mothers March for Peace'],
          free: [`War Weariness Grows After ${cap(span(wk))}`, 'The Country Tires of the War'],
          sober: ['Strain of the War Tells on the Country', 'Public Patience Wears Thin'],
        }),
        deck: [`The war has now lasted ${span(wk)}.`],
        body: [censors(c) ? 'Rumours of discontent are the work of enemy agents.' : 'Ministers are under growing pressure to seek terms.'],
      };
    }
    return { sec: 'front', heads: [`${a} Wavers`, `Reports of Exhaustion in ${a}`, `${a} Can Bear Little More`], deck: [`Travellers describe a country worn down by war.`], body: [`The will of ${a} to continue is said to be failing.`] };
  },

  mobilise(f, c) {
    const { a, us } = f;
    if (us) return { sec: 'home', heads: ['The Reserves Are Called Up', 'General Mobilisation Ordered', 'The Nation Mobilises'], deck: ['The reserve regiments are arming.'], body: [`The order went out from the capital this week; ${c.house} has been informed.`] };
    return { sec: 'abroad', heads: [`${a} Mobilises`, `Reserves Called Up in ${a}`, `${a} Arms in Haste`], deck: [`${a} has called its reserve to the colours.`], body: ['Neighbouring chancelleries are watching closely.'] };
  },

  alliance(f, c) {
    const { a, b, us } = f;
    if (us) {
      const other = us === 'a' ? b : a;
      return { sec: 'home', heads: [`Alliance With ${other}`, `${c.our} and ${other} Sign a Treaty of Alliance`, `${other} Joins Hands With ${c.our}`], deck: ['An attack on one is now a call to the other.'], body: [`The treaty with ${other} is in force from this week.`] };
    }
    return { sec: 'abroad', heads: [`${a} and ${b} Conclude an Alliance`, `New Alliance: ${a} and ${b}`, `${a} Binds Itself to ${b}`], deck: ['An attack on one is now a call to the other.'], body: [`The treaty between ${a} and ${b} alters the balance of the region.`] };
  },

  vassal(f, c) {
    const { a, b, us } = f;
    if (us === 'a') return { sec: 'home', heads: [`${b} Becomes a Vassal of ${c.our}`, `${b} Bows to ${c.our}`], deck: [`${b} will pay tribute to ${c.our}.`], body: [`Its foreign policy now answers to ${c.our}.`] };
    if (us === 'b') return { sec: 'home', heads: V(c, { court: [`Protective Treaty Concluded With ${a}`], jingo: [`A Temporary Arrangement With ${a}`], labour: [`${a} Makes a Vassal of ${c.our}`], free: [`${c.our} Reduced to Vassalage by ${a}`], sober: [`${c.our} Accepts the Suzerainty of ${a}`] }), deck: [`Tribute will be paid to ${a}.`], body: ['The terms bind the foreign policy of the state.'] };
    return { sec: 'abroad', heads: [`${b} Falls Under the Rule of ${a}`, `${a} Makes a Vassal of ${b}`, `${b} Loses Its Independence to ${a}`], deck: [`${b} will pay tribute to ${a}.`], body: [`${a} extends its reach.`] };
  },

  world(f) {
    return WORLD_DESK[f.id] ?? { sec: 'abroad', heads: [f.title], deck: [f.log], body: [''] };
  },

  world_end(f) {
    const ends = {
      influenza: ['The Influenza Abates', 'The Great Influenza Passes', 'Hospitals Empty as Influenza Retreats'],
      depression: ['Signs of Recovery After the Great Depression', 'The Exchanges Steady at Last', 'The Long Slump Eases'],
      red_years: ['The Red Years Subside', 'Strike Wave Ebbs', 'Calm Returns to the Factory Towns'],
    };
    return { sec: 'abroad', heads: ends[f.id] ?? [`The End of ${f.title}`], deck: [`${f.title} has run its course.`], body: ['The world counts what it has cost.'] };
  },

  card(f, c) {
    const table = CARD_DESK(c)[f.id];
    // Kart beş yılda bir dönebilir: sesin kendi başlıkları bitince ortak liste devreye girer.
    const heads = table ? [...new Set([...(table[c.voice] ?? []), ...table.sober])] : [f.title];
    return { sec: 'home', heads, deck: [f.text ?? ''], body: [''] };
  },

  rank(f, c) {
    const { from, to, lead } = f;
    const up = to < from;
    return {
      sec: 'home',
      heads: up ? [`${c.our} Rises to ${cap(ordinal(to))} Among the Powers`, `${c.our} Now ${cap(ordinal(to))} in the World`, `From ${cap(ordinal(from))} to ${cap(ordinal(to))}: ${c.our} Gains Ground in ${f.yr}`]
        : [...V(c, { court: [`The Standing of the Realm in ${f.yr}`], jingo: [`Rivals Gain in ${f.yr}, but the Nation Will Answer`], labour: [`${c.our} Slips to ${cap(ordinal(to))}`], free: [`${c.our} Falls to ${cap(ordinal(to))} Among the Powers`], sober: [`${c.our} Slips to ${cap(ordinal(to))} Place`] }), `From ${cap(ordinal(from))} to ${cap(ordinal(to))}: ${c.our} Loses Ground in ${f.yr}`, `${lead} Pulls Away as ${c.our} Falls to ${cap(ordinal(to))}`],
      deck: [lead && lead !== c.our ? `${lead} remains the first power of the world.` : `${c.our} is first among the powers.`],
      body: [`The table of the powers counts industry, population, land and prestige.`],
    };
  },

  powers(f) {
    const { a, up } = f;
    return up
      ? { sec: 'abroad', heads: [`${a} Enters the Ranks of the Great Powers`, `${a} Now a Great Power`, `The Rise of ${a}`], deck: [`${a} now stands among the three greatest powers.`], body: [''] }
      : { sec: 'abroad', heads: [`${a} Slips From the Great Powers`, `The Decline of ${a}`, `${a} No Longer Among the First Three`], deck: [`${a} has lost its place among the three greatest powers.`], body: [''] };
  },

  industry(f, c) {
    const { a, us } = f;
    return { sec: 'markets', heads: us ? [`${c.our} Is the Workshop of the World`, `${c.our} Now First in Industry`] : [`${a} Is the World's First Industrial Power`, `${a} Takes the Lead in Industry`, `The Mills of ${a} Lead the World`], deck: [`No country now produces more than ${a}.`], body: [''] };
  },

  market(f) {
    const { good, pct, up } = f;
    return up
      ? { sec: 'markets', heads: [`${good} Up ${pct}% on the Month`, `${good} Climbs ${pct}%`, `Buyers Pay ${pct}% More for ${good}`], deck: [`The world price of ${good.toLowerCase()} rose ${pct}% in a month.`], body: [''] }
      : { sec: 'markets', heads: [`${good} Falls ${pct}%`, `${good} Down ${pct}% on the Month`, `Sellers of ${good} Accept ${pct}% Less`], deck: [`The world price of ${good.toLowerCase()} fell ${pct}% in a month.`], body: [''] };
  },

  front(f, c) {
    const { foe, wk, hold, held, lo, lt, gen, mood } = f;
    const lead = gen ? `General ${gen} holds the principal command. ` : '';
    const counts = lo + lt <= 0 ? 'No serious engagement has yet been reported.'
      : censors(c) ? `The enemy has lost some ${men(lt)} men; our own figure is ${CUT}.` : `Losses so far: ${men(lo)} of ours, ${men(lt)} of theirs.`;
    if (mood === 'win') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`The Arms of ${cap(c.ruler)} Advance in ${foe}`, `Further Success Against ${foe}`],
          jingo: [`${foe} Reels Before Our Advance`, `Onward Through ${foe}!`, `${cap(of(hold, 'Province'))} of ${foe} Under Our Flag`],
          labour: [`${cap(of(hold, 'Province'))} Taken; ${men(lo)} Men Lost`, `Week ${wk} of the War With ${foe}`],
          free: [`Our Army Holds ${cap(of(hold, 'Province'))} of ${foe}`, `Advance Continues in ${foe}`],
          sober: [`Steady Progress Against ${foe}`, `${cap(of(hold, 'Province'))} of ${foe} Occupied`],
        }),
        deck: [`After ${span(wk)} of war, ${of(hold, 'province')} of ${foe} ${hold === 1 ? 'is' : 'are'} in our hands.`],
        body: [`${lead}${counts}`],
      };
    }
    if (mood === 'lose') {
      return {
        sec: 'front',
        heads: V(c, {
          court: [`The Line Holds Against ${foe}`, `The Army Stands Between ${foe} and the Capital`],
          jingo: [`${foe} Pays Dearly for Every Yard`, 'Not One Step Back!'],
          labour: [`${cap(of(held, 'Province'))} Under ${foe}: How Much Longer?`, `${men(lo)} Lost, and ${foe} Still Advances`],
          free: [`${foe} Now Holds ${cap(of(held, 'Province'))} of Ours`, `The War With ${foe} Goes Badly`],
          sober: [`Grave Situation on the ${foe} Front`, `${foe} Presses Its Advance`],
        }),
        deck: [censors(c) ? `Our soldiers continue to resist after ${span(wk)} of war.` : `After ${span(wk)} of war, ${of(held, 'province')} of ours ${held === 1 ? 'is' : 'are'} occupied.`],
        body: [`${lead}${counts}`],
      };
    }
    return {
      sec: 'front',
      heads: V(c, {
        court: [`The Front Against ${foe} Is Quiet and Secure`, `No Change on the ${foe} Front`],
        jingo: [`Our Line Against ${foe} Is Unbreakable`, `${foe} Cannot Pass`],
        labour: [`Week ${wk} of the War With ${foe}: Nothing Gained`, `Deadlock on the ${foe} Front, and the Lists Grow`],
        free: [`Deadlock After ${cap(span(wk))} of War With ${foe}`, `Neither Side Breaks Through on the ${foe} Front`],
        sober: [`Little Change on the ${foe} Front`, `No Decision Yet in the War With ${foe}`],
      }),
      deck: [`The war with ${foe} has lasted ${span(wk)}.`],
      body: [`${lead}${counts}`],
    };
  },

  abroad(f) {
    const { a, b, wk, hold, la, lb } = f;
    const dead = men(la + lb);
    return hold > 0
      ? { sec: 'abroad', heads: [`${a} Holds ${cap(of(hold, 'Province'))} of ${b}`, `${a} Presses Deeper Into ${b}`, `${b} Gives Ground After ${cap(span(wk))} of War`, `${dead} Fallen as ${a} Advances in ${b}`], deck: [`The war is ${span(wk)} old.`], body: [`Losses are put at ${men(la)} for ${a} and ${men(lb)} for ${b}.`] }
      : { sec: 'abroad', heads: [`${dead} Fallen in the War of ${a} and ${b}`, `${cap(span(wk))} of War: ${a} and ${b} Fight On`, `No End in Sight After ${cap(span(wk))} Between ${a} and ${b}`, `Stalemate Between ${a} and ${b}`], deck: [`The war is ${span(wk)} old.`], body: [`Losses are put at ${men(la)} for ${a} and ${men(lb)} for ${b}.`] };
  },

  people(f, c) {
    const { people, stage, a, us } = f;
    if (us) {
      const table = stage === 'Insurgency'
        ? { court: [`Bandit Activity Among the ${people}`, `Order Being Restored Among the ${people}`], jingo: [`Agitators Among the ${people} Will Be Crushed`, `No Mercy for the ${people} Bands`], labour: [`The ${people} Take Up Arms`, `The ${people} Have Had Enough`], free: [`Insurgency Among the ${people}`, `Open Revolt Feared Among the ${people}`], sober: [`Armed Unrest Among the ${people}`, `Troops Sent to the ${people} Districts`] }
        : stage === 'Resistance'
          ? { court: [`Minor Disturbances Among the ${people}`, `Calm Urged in the ${people} Districts`], jingo: [`The ${people} Must Remember Their Duty`, `Firm Hand Needed With the ${people}`], labour: [`The ${people} Resist`, `The ${people} Refuse to Be Ruled`], free: [`Resistance Spreads Among the ${people}`, `The ${people} Defy the Governors`], sober: [`The ${people} Refuse the Authorities`, `Tax Collectors Turned Back by the ${people}`] }
          : { court: [`A Petition From the ${people}`, `The ${people} Address the Throne`], jingo: [`Foreign Agitators Stir the ${people}`, `Who Is Paying the ${people} Agitators?`], labour: [`The ${people} Demand Their Rights`, `The ${people} Organise`], free: [`The ${people} Grow Restless`, `Meetings Among the ${people}`], sober: [`Agitation Among the ${people}`, `The ${people} Press Their Demands`] };
      return { sec: 'home', heads: V(c, table), deck: [censors(c) ? 'The authorities have the situation in hand.' : `The movement among the ${people} has reached the stage of ${stage.toLowerCase()}.`], body: [''] };
    }
    return { sec: 'abroad', heads: [`Unrest Among the ${people} of ${a}`, `The ${people} Challenge ${a}`, `${a} Troubled by the ${people}`], deck: [`The movement has reached the stage of ${stage.toLowerCase()}.`], body: [''] };
  },

  research(f, c) {
    return { sec: 'home', heads: [`New Advance: ${f.tech}`, `${c.our} Masters ${f.tech}`, `${f.tech} Comes to ${c.our}`], deck: [`Work on ${f.tech.toLowerCase()} has been completed.`], body: [''] };
  },

  milestone(f, c) {
    if (f.what === 'pop') return { sec: 'home', heads: [`Census Counts ${millions(f.n).replace('million', 'Million')}`, `${c.our} Passes ${millions(f.n).replace('million', 'Million')} People`, `Population Reaches ${millions(f.n).replace('million', 'Million')}`], deck: [`The population of ${c.our} now stands at ${millions(f.n)}.`], body: [''] };
    return { sec: 'home', heads: [`${f.n}% of the Nation Can Now Read`, `Literacy Reaches ${f.n}%`, `Schools Report ${f.n}% Literacy`], deck: [`${f.n} in every hundred can now read and write.`], body: [''] };
  },

  annual(f, c) {
    const { yr, out, pop, lit, rank } = f;
    const dir = out > 0 ? `up ${out}%` : out < 0 ? `down ${-out}%` : 'unchanged';
    return { sec: 'home', heads: [`The Year ${yr} in Review`, `${c.our} at the Close of ${yr}`, `A Balance Sheet for ${yr}`], deck: [`Output ${dir} on the year; population ${millions(pop)}.`], body: [`Literacy stands at ${lit}% and ${c.our} ranks ${ordinal(rank)} among the powers.`] };
  },

  // Barış aylarının sayfası: başka ülkelerden mektup, silah yarışı, hasat, sanayi.
  profile(f, c) {
    const { a, capital, pop, gov, party, lit, regs, war } = f;
    return {
      sec: 'abroad',
      heads: [`Letter From ${capital}`, `${a}: ${cap(millions(pop)).replace('million', 'Million')} People Under the ${party}`, `From Our Correspondent in ${capital}`, `A Traveller's Notes on ${a}`, `${a} Seen From ${c.city}`],
      deck: [`${a} is ${an(gov.toLowerCase())} of ${millions(pop)} people, governed by the ${party}.`],
      body: [`${lit}% of its people can read; its army numbers ${of(regs, 'regiment')}${war ? ' and is at war' : ''}.`],
    };
  },

  arms(f, c) {
    const { regs, rival, rregs, ships, rships } = f;
    const ahead = regs >= rregs;
    return {
      sec: 'home',
      heads: ahead
        ? [`The Army Stands at ${regs} Regiments`, `${c.our} Outnumbers ${rival} in the Field`, `${regs} Regiments Against the ${rregs} of ${rival}`]
        : V(c, {
          court: [`The Army Stands Ready`], jingo: [`${rival} Arms: We Must Arm Faster`, `${rregs} Regiments Across the Frontier!`],
          labour: [`The Generals Ask for More`, `${rival} Fields ${rregs} Regiments to Our ${regs}`],
          sober: [`${rival} Fields ${rregs} Regiments to Our ${regs}`, `The Military Balance With ${rival}`],
        }),
      deck: [`${c.our} keeps ${of(regs, 'regiment')} under arms, ${rival} ${of(rregs, 'regiment')}.`],
      body: [ships || rships ? `At sea, ${of(ships, 'warship')} against ${of(rships, 'warship')}.` : ''],
    };
  },

  harvest(f) {
    const { pct, yr } = f;
    return pct >= 100
      ? { sec: 'markets', heads: [`The Harvest of ${yr} Meets ${pct}% of Need`, `${yr}: A Good Year on the Land`, `Granaries Full After the Harvest of ${yr}`], deck: [`The land yielded ${pct}% of what the country eats.`], body: ['Merchants expect grain to spare for export.'] }
      : { sec: 'markets', heads: [`Harvest of ${yr} Falls Short at ${pct}%`, `${yr}: Grain Must Be Bought Abroad`, `The Land Yields ${pct}% of Need in ${yr}`], deck: [`The land yielded only ${pct}% of what the country eats.`], body: ['The balance must come from foreign markets.'] };
  },

  output(f, c) {
    const { pct } = f;
    return pct > 0
      ? { sec: 'markets', heads: [`Output Up ${pct}% Over the ${cap(f.half)} of ${f.yr}`, `${f.yr}: The Mills Report Growth of ${pct}%`, `${c.our} Produces ${pct}% More Than Six Months Ago`], deck: [`National output has grown ${pct}% in half a year.`], body: [''] }
      : { sec: 'markets', heads: [`Output Down ${-pct}% Over the ${cap(f.half)} of ${f.yr}`, `${f.yr}: The Mills Slow by ${-pct}%`, `A Thin ${cap(f.half)} for Industry in ${c.our}`], deck: [`National output has fallen ${-pct}% in half a year.`], body: [''] };
  },

  league(f) {
    const { a, b, third, sa, sb, yr } = f;
    return { sec: 'abroad', heads: [`${yr}: ${a} Leads the Powers, Ahead of ${b} and ${third}`, `The Table of the Powers for ${yr}: ${a} First`, `${b} Trails ${a} by ${sa - sb} Points`], deck: [`${a} holds ${sa} points, ${b} ${sb}; ${third} is third.`], body: ['The table counts industry, population, land and prestige.'] };
  },

  law(f, c) {
    return { sec: 'home', heads: [`New Law: ${f.name}`, `${f.name} Becomes Law`, `${cap(c.house)} Enacts ${f.name}`], deck: [`The measure takes effect from this week.`], body: [''] };
  },

  general(f) {
    return { sec: 'home', heads: [`General ${f.name} Advanced in Rank`, `Promotion for General ${f.name}`, `General ${f.name} Recognised for Service`], deck: [`The staff has raised ${f.name} to grade ${f.skill}.`], body: [''] };
  },

  // Olgunun cümlesi simülasyonun kendi kaydıdır (deniz raporu, diplomasi satırı).
  wire(f) {
    return { sec: f.sec ?? 'abroad', heads: [f.title], deck: [f.detail ?? ''], body: [''] };
  },

  notice(f) {
    return { sec: f.sec ?? 'home', heads: [f.title], deck: [''], body: [''] };
  },

  quiet(f, c) {
    return { sec: 'home', heads: [`A Quiet Month in ${c.our}`, `Nothing to Disturb the Peace of ${c.city}`, `Calm Across ${c.our}`], deck: [`Population ${millions(f.pop)}; ${c.our} ranks ${ordinal(f.rank)} among the powers.`], body: [''] };
  },
};

const WORLD_DESK = {
  powder_keg: { sec: 'abroad', heads: ['The Age of Arsenals: Every Frontier a Fuse', 'The Great Powers Arm', 'The Powder Keg'], deck: ['The great powers arm, and every frontier is a fuse.'], body: ['Chancelleries speak of peace while the shipyards work through the night.'] },
  great_war: { sec: 'abroad', heads: ['The Great War', 'The Great Powers Go to War', 'The World at War'], deck: ['The alliances drag the world in after them.'], body: ['No government can now say where this war will end.'] },
  red_years: { sec: 'abroad', heads: ['The Red Years', 'Strikes and Soldiers\' Councils Spread', 'Red Flags Over the Factory Towns'], deck: ['Strikes and soldiers\' councils spread from city to city.'], body: ['Governments everywhere watch their own garrisons.'] },
  influenza: { sec: 'abroad', heads: ['The Great Influenza', 'A New Influenza Sweeps the World', 'Influenza Kills the Young'], deck: ['A new influenza sweeps the world and kills the young.'], body: ['Doctors have no answer and the hospitals are full.'] },
  depression: { sec: 'markets', heads: ['The Exchanges Crash', 'The Great Depression', 'Panic on Every Exchange'], deck: ['Trade collapses and the unemployed queue for bread.'], body: ['Banks close their doors in one capital after another.'] },
  rearmament: { sec: 'abroad', heads: ['The Road to War', 'The Arsenals Reopen', 'The Treaties Are Torn Up'], deck: ['The treaties of the last war are torn up and the arsenals reopen.'], body: ['The factories have orders for years ahead.'] },
  second_great_war: { sec: 'abroad', heads: ['The World Goes to War Again', 'The Second Great War', 'War Once More'], deck: ['This time the factories will decide it.'], body: ['A generation that remembers the last war is called up for the next.'] },
};

const CARD_DESK = (c) => ({
  famine: { sober: ['Famine in the Provinces', 'The Harvest Fails', `Hunger in the Countryside of ${c.our}`, `Grain Carts Stop Coming to ${c.city}`], court: ['Scarcity in Certain Districts'], jingo: ['Hoarders Blamed for Shortage in the Provinces'], labour: ['Famine: The Provinces Starve'], free: ['Famine in the Provinces', 'Bread Riots as the Harvest Fails'] },
  strike: { sober: ['General Strike', 'Mill Towns Stop Work', `Strike Spreads Across ${c.our}`, `${c.city} Without Trams or Bread`], court: ['Disorderly Elements Halt the Mills'], jingo: ['Strikers Betray the Nation'], labour: ['The Workers Down Tools!', 'General Strike: The Mills Stand Still'], free: ['General Strike Paralyses the Mill Towns'] },
  war_weariness: { sober: ['The Nation Tires of War', `Crowds at the Ministries of ${c.city}`, `How Much Longer, Ask the People of ${c.our}`], court: ['Loyal Subjects Are Reminded of Their Duty'], jingo: ['Defeatists March on the Ministry'], labour: ['Mothers March on the Ministry'], free: ['Casualty Lists Bring Mothers to the Ministry'] },
  motor_boom: { sober: ['The Motor Boom', 'Motor Works Cannot Meet Their Orders', `New Factories Rise Around ${c.city}`, `${c.our} Takes to the Motor Car`] },
  revolution: { sober: ['Revolution in the Streets', 'The Capital Rises', `Barricades in ${c.city}`, `${c.city} in the Hands of the Crowd`], court: ['Riotous Assembly in the Capital'], jingo: ['Mob Rule Threatens the Capital'], labour: ['The People Are in the Streets!'], free: ['Revolution in the Capital'] },
  strongman: { sober: ['A Strong Man Comes Forward', 'Calls for Firm Government', `${c.our} Looks for a Firm Hand`], labour: ['A Would-Be Dictator Steps Forward'], free: ['A Strong Man Bids for Power'], jingo: ['The Nation Finds Its Leader'] },
  cholera: { sober: ['Cholera in the Towns', 'Cholera Spreads', `Cholera Reaches ${c.city}`, `Doctors Fight Cholera Across ${c.our}`], court: ['Sanitary Measures Ordered in the Towns'], labour: ['Cholera in the Tenements'] },
  liberal_agitation: { sober: ['Liberal Agitation Grows', 'Reformers Fill the Squares', `Reform Meetings in ${c.city}`], court: ['Seditious Pamphlets Seized'], free: ['The Country Demands Reform'] },
  great_inventor: { sober: ['A Great Inventor', 'An Invention Astonishes the Capital', `A Workshop in ${c.city} Changes the Age`, `${c.our} Honours Its Inventor`, `The Patent Office of ${c.city} Is Besieged`] },
  border_incident: { sober: ['Incident on the Frontier', 'Shots Exchanged at the Border', `Frontier Patrols of ${c.our} Under Fire`], jingo: ['Frontier Outrage!'] },
  bumper_harvest: { sober: ['A Bumper Harvest', 'The Granaries Are Full', `Full Barns Across ${c.our}`, `Record Yields Reach the Markets of ${c.city}`, 'The Best Harvest in Living Memory'] },
  emigration: { sober: ['Emigrants Crowd the Quays', 'The Young Leave for Distant Shores', `Ships Leave ${c.our} Full`], court: ['Unlicensed Departures From the Ports'], labour: ['No Work, So They Sail'] },
  court_scandal: { sober: ['Scandal at Court', 'The Palace Answers Its Critics', `The Talk of ${c.city}`], court: ['Malicious Rumours Are Denied'], labour: ['Scandal in High Places'], free: ['Scandal at Court Shakes the Government'] },
  veterans: { sober: ['The Veterans Come Home', 'Old Soldiers Ask What They Are Owed', `Veterans March Through ${c.city}`], labour: ['The Veterans Demand Their Due'] },
  mobilisation: { sober: ['The Powder Keg Reaches Our Frontier', 'The General Staff Asks for More', `${c.our} Weighs Its Readiness`], jingo: ['The Nation Must Be Ready!'] },
  rearmament: { sober: ['The Question of Rearmament', 'The Arsenals Ask for Orders', `${c.our} Debates the Arms Estimates`], labour: ['Guns or Bread?'], jingo: ['Rearm!'] },
  influenza: { sober: ['Influenza Reaches the Capital', 'The Influenza Is Among Us', `Influenza Closes the Schools of ${c.city}`], court: ['Public Gatherings Restricted'], labour: ['Influenza in the Tenements'] },
  depression: { sober: ['The Slump Reaches Our Shores', 'Mills Close as Orders Vanish', `Banks Shut Their Doors in ${c.city}`], labour: ['Bread Queues in the Mill Towns'], court: ['Measures to Steady the Exchange'] },
});

// ------------------------------------------------------------ FOTOĞRAFLAR ---
// Dosyalar assets/ altındadır. Haber fotoğrafları geldikçe (assets/news,
// incoming/URETIM-LISTESI.md §4) her listenin başına eklenir.

const PHOTOS = {
  war: ['kpi/war-support.webp', 'kpi/standing-army.webp', 'kpi/manpower.webp', 'menu/field-road.jpg'],
  peace: ['kpi/commitments.webp', 'kpi/rank.webp', 'kpi/allies.webp'],
  capital_fell: ['menu/burning-street.jpg', 'kpi/infamy.webp'],
  capital_freed: ['kpi/score.webp', 'kpi/war-support.webp'],
  state_ended: ['kpi/infamy.webp', 'menu/palace-hall.jpg'],
  born: ['kpi/legitimacy.webp', 'kpi/movements.webp', 'menu/palace-square.jpg'],
  regime: ['kpi/unrest.webp', 'menu/palace-square.jpg', 'kpi/legitimacy.webp'],
  cabinet: ['kpi/political-power.webp', 'kpi/government.webp'],
  election: ['kpi/full-citizens.webp', 'kpi/political-power.webp'],
  supply: ['kpi/supply.webp', 'kpi/bills.webp'],
  supply_ok: ['kpi/supply.webp', 'menu/rail-yard.jpg'],
  hunger: ['kpi/peoples.webp', 'kpi/consumer-goods.webp'],
  hunger_end: ['kpi/consumer-goods.webp', 'menu/valley-town.jpg'],
  battle: ['kpi/wars.webp', 'menu/burning-street.jpg', 'kpi/standing-army.webp'],
  pocket: ['kpi/officers.webp', 'kpi/wars.webp'],
  weary: ['kpi/population.webp', 'kpi/peoples.webp'],
  mobilise: ['kpi/in-training.webp', 'kpi/manpower.webp', 'menu/rail-yard.jpg'],
  alliance: ['kpi/allies.webp', 'kpi/envoys.webp'],
  vassal: ['kpi/envoys.webp', 'kpi/commitments.webp'],
  rank: ['kpi/rank.webp', 'kpi/score.webp'],
  powers: ['kpi/rank.webp', 'kpi/envoys.webp'],
  industry: ['kpi/industry.webp', 'kpi/output.webp'],
  market: ['kpi/development-fund.webp', 'kpi/fund-floor.webp', 'menu/harbour-dawn.jpg'],
  front: ['kpi/wars.webp', 'kpi/officers.webp', 'kpi/supply.webp', 'kpi/standing-army.webp'],
  abroad: ['kpi/envoys.webp', 'kpi/wars.webp', 'menu/coast-fort.jpg'],
  people: ['kpi/movements.webp', 'kpi/peoples.webp'],
  research: ['kpi/researching.webp', 'kpi/technologies.webp'],
  milestone: ['kpi/literacy.webp', 'kpi/population.webp'],
  annual: ['kpi/output.webp', 'kpi/year.webp', 'menu/valley-town.jpg'],
  general: ['kpi/officers.webp', 'kpi/legitimacy.webp'],
  profile: ['kpi/envoys.webp', 'menu/harbour-dawn.jpg', 'menu/palace-square.jpg', 'kpi/stability.webp', 'kpi/peoples.webp'],
  arms: ['kpi/standing-army.webp', 'kpi/shipyards.webp', 'kpi/in-training.webp'],
  harvest: ['menu/valley-town.jpg', 'menu/field-road.jpg', 'kpi/empty-land.webp'],
  output: ['kpi/output.webp', 'kpi/industry.webp'],
  league: ['kpi/rank.webp', 'kpi/score.webp'],
  law: ['kpi/political-power.webp', 'kpi/legitimacy.webp'],
  wire: ['kpi/envoys.webp', 'kpi/rival.webp'],
  notice: ['kpi/government.webp', 'menu/palace-square.jpg'],
  quiet: ['menu/valley-town.jpg', 'kpi/stability.webp', 'menu/harbour-dawn.jpg'],
  world: ['menu/burning-street.jpg'],
  world_end: ['menu/valley-town.jpg'],
  card: ['kpi/government.webp'],
};

const WORLD_PHOTOS = {
  powder_keg: ['kpi/war-support.webp'], great_war: ['menu/burning-street.jpg'], red_years: ['kpi/unrest.webp'],
  influenza: ['kpi/population.webp'], depression: ['kpi/fund-floor.webp'], rearmament: ['kpi/shipyards.webp'],
  second_great_war: ['menu/main-menu.jpg'],
};
const CARD_PHOTOS = {
  famine: ['kpi/peoples.webp'], strike: ['kpi/movements.webp'], war_weariness: ['kpi/population.webp'],
  motor_boom: ['kpi/technologies.webp'], revolution: ['kpi/unrest.webp'], strongman: ['kpi/legitimacy.webp'],
  cholera: ['menu/tulip-night.jpg'], liberal_agitation: ['kpi/movements.webp'], great_inventor: ['kpi/researching.webp'],
  border_incident: ['menu/coast-fort.jpg'], bumper_harvest: ['menu/valley-town.jpg'], emigration: ['menu/harbour-dawn.jpg'],
  court_scandal: ['menu/palace-hall.jpg'], veterans: ['kpi/score.webp'], mobilisation: ['kpi/manpower.webp'],
  rearmament: ['kpi/shipyards.webp'], influenza: ['kpi/population.webp'], depression: ['menu/rail-yard.jpg'],
};

/** Olgunun fotoğraf adayları; yazı işleri son kullanılanı atlar. */
export function photosFor(fact) {
  if (fact.k === 'world') return WORLD_PHOTOS[fact.id] ?? PHOTOS.world;
  if (fact.k === 'card') return CARD_PHOTOS[fact.id] ?? PHOTOS.card;
  return PHOTOS[fact.k] ?? PHOTOS.quiet;
}

// ---------------------------------------------------------------- ÇEVİRİ ---

/** Sayının başlığından türeyen ses: masalar yalnız bunu görür. */
export function contextOf(issue) {
  return {
    voice: issue.vo, our: issue.na, ruler: issue.ru, city: issue.ci,
    house: lexOf(issue.fam).house, lex: lexOf(issue.fam),
  };
}

function translate(fact, ctx) {
  const table = (DESK[fact.k] ?? DESK.notice)(fact, ctx);
  const v = fact.v ?? 0;
  return {
    sec: table.sec ?? 'home',
    head: pick(table.heads, v),
    deck: pick(table.deck ?? [''], v),
    body: pick(table.body ?? [''], v),
  };
}

/** Bu olgunun kaç manşet seçeneği var (yazı işleri tekrar saymak için sorar). */
export function headOptions(fact, ctx) {
  return (DESK[fact.k] ?? DESK.notice)(fact, ctx).heads.length;
}

/** Tek seçeneğin manşeti: yazı işleri aynı başlığı ikinci kez basmamak için okur. */
export function headText(fact, ctx, v) {
  return pick((DESK[fact.k] ?? DESK.notice)(fact, ctx).heads, v);
}

/** Tarih satırı: gün, yerel ay, yıl. */
export function dateLine(issue) {
  const date = dateOfTurn(issue.t);
  return `${date.getUTCDate()} ${lexOf(issue.fam).months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Ekranın okuduğu tam sayı: metin burada kurulur, ekran yalnız basar. */
export function composeIssue(issue) {
  const ctx = contextOf(issue);
  const label = (sec) => ctx.lex.sec[sec] ?? ctx.lex.sec.home;
  const dress = (fact) => {
    const text = translate(fact, ctx);
    return { ...text, section: label(text.sec), kind: fact.k };
  };
  return {
    no: issue.n,
    numberLabel: `${ctx.lex.no} ${issue.n}`,
    turn: issue.t,
    extra: Boolean(issue.x),
    extraLabel: ctx.lex.sec.extra,
    paper: issue.pa,
    city: issue.ci,
    date: dateLine(issue),
    voice: issue.vo,
    family: issue.fam,
    photo: issue.ph ?? null,
    lead: dress(issue.lead),
    subs: issue.subs.map(dress),
    briefs: issue.briefs.map(dress),
    briefLabel: ctx.lex.sec.brief,
  };
}
