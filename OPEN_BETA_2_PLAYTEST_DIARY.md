# OPEN BETA 2 — PLAYTEST DIARY

**Campaign:** seed `8V9X3W` · 160 × 96 · 36% land · 69 nations · start 1 JAN 1836
**Playing:** Ossria Emirate — Absolute Monarchy, Serlur founding culture, maritime access
**Starting position:** 27 named provinces (308 hexes), 2 cities, capital Highbridge,
768K people, army 2, manpower 152K, treasury ¤50 (+11/wk), stability 62%, infamy 0/22,
internal cohesion 64% (36% Girnsk minority, 13 provinces / 279K people),
Hegemony 393 — **rank 1 of 69**, Economy 240, Prestige 154.

Written as I played. No source code read, no console cheats, no save editing.

---

## PROLOGUE — the main menu

The menu is the best-looking thing in the build. "THE LONG CENTURY · 1836",
"IMPERIAL EYE", a rotating painted scene (Bombardment / Imperial Hall / Harbour /
Rainy Capital / Marshalling Yard / Coastal Fort / Crescent Night / Field Road) with
drifting fog, and a randomised epigraph — mine was *"A gun on a headland is an
argument the sea must answer."* Music, scene picker, language, reduced-motion
handling all present. Loading screen has its own flavour line: *"Fortunes were made
and ruined here, over flowers."*

**SATISFYING.** This sets a tone I wanted the rest of the game to live up to.

Then New Campaign: seed / map size / continentality / land ratio / great powers →
Generate World → and I am *already playing*, as a nation I was never asked about.
No country selection screen exists. (B2-006)

I got handed Ossria — and the panel told me *"You lead the world."* Rank 1 of 69
before I have made a single decision. As an opening beat that is deflating: the
strongest hook in any grand-strategy start is "here is your problem", and mine was
"you have already won the rankings."

---

## 1 JAN 1836 — reading the board

**WHAT I WANTED:** to find out what my problem actually is.

**WHAT I DID:** read every screen before unpausing.

**WHAT I FOUND — the three things that shaped my whole campaign:**

1. **Literacy 0%. Research 1.26 points/week. Every technology costs 260 RP.**
   The tech screen says, in plain numbers, *"At current rate: 208 wk"*. Four years
   for +10% construction power. Thirty industry techs at that rate is 120 years.
   That is a real, legible, screaming strategic problem, and I loved finding it.
   **EXCITING.**

2. **Four of five research categories are dead** — Army, Navy, Commerce, Culture
   all show 0/30 and do nothing. Only Industry exists. (B2-002) So whatever I do,
   my army can never get better through research. That reframed the campaign
   immediately: this is an economic game, not a military one.

3. **Unemployment 134K of 767K — 17.5% — on day one**, with "Needs met 100%".
   Employment 78%. I had no idea whether that was a crisis or the normal state of
   an 1836 agrarian society. The game did not tell me either.

Other first-read impressions:

- **Population screen** is genuinely Victoria-grade: 189 cohorts, workforce split
  (Farmers 40.2 / Laborers 19.6 / Factory Workers 18.1 / Clerks 7.6 / Artisans 5.9 /
  Officers 3.7 / Aristocrats 2.9), nationality, religion, ideology, dominant issues,
  electorate, and a sortable per-cohort table. Impressive at a glance.
  But: **Socialist 35.8% and Fascist 11.1% in 1836**, with a "Labour Union" party
  leading the electorate at 38%. That is not a 19th-century society. **SURPRISING**
  in the wrong way — it broke the period illusion on minute one.

- **Trade screen** is excellent: 27 goods, per-good balance sheet, producers,
  consumers, demand by source, tariff at border, and a literal "WHY THE PRICE
  MOVES" box. This is the clearest economic UI in the build.

- **Military screen** gives *reasons*: "Blocked — Treasury short: 55 needed, 50 on
  hand", "Blocked — Small Arms short: 10 needed, 6.0 in stock". This is exactly the
  GOOD friction the genre needs.

- **Budget screen** was a wall of ¤0.0 — every income line, every expense line, and
  "Projected weekly balance +¤0.0" — while the header said +11/wk. (B2-005) I could
  not plan my opening economy at all until after I had unpaused.

**HOW I FELT:** genuinely interested. The information architecture is far better
than I expected. I had a problem (literacy/research), a lever I could see
(Education budget at 0%, and a University building), and a minority question
(36% Girnsk) sitting in the background like a fuse.

---

## 1 JAN 1836 — my first decision, and the political lock

**WHAT I WANTED:** literacy. The obvious first move.

**WHAT I DID:** Politics → Reforms. Almost every "next step" reform showed
`100.0% / 50.0%` — support far above requirement. I enacted **Basic School System**.

**WHAT HAPPENED:** it passed instantly. And in the same instant the upper house
flipped to **"✕ Can't enact social reforms / ✕ Can't enact political reforms"**,
every other reform changed from a support percentage to *"about 12 months"*, and a
paragraph appeared:

> "No law can pass this upper house. The chamber is 100.0% conservative, and every
> remaining step falls short of a majority. Its seats follow the ruling party, so
> the chamber changes when the government does — win an election, or widen the
> house through the Upper House law once that becomes possible. **This is a
> political lock, not a bug.**"

**HOW I FELT:** two ways at once. The explanation is *outstanding* — it tells me the
cause, the consequence and the two exits. I have never seen a strategy game explain
a soft-lock that clearly. But it is also showing me two different reasons
simultaneously (a 12-month cooldown *and* a permanent chamber lock), and the phrase
"not a bug" is the developer talking to a bug reporter, not the game talking to me.
**CLEVER but CONFUSING.** (B2-011)

**WHAT I DID NEXT:** noted that my political route is "win an election" — and that
an *Absolute Monarchy* with **0 enrolled voters** has an election scheduled for
2 DEC 1836 and a "Hold Election" button. I did not understand how that could work.
Parked it.

Also checked the other Politics tabs:
- **Movements** — 8 listed with support/house numbers, and a note that they are
  "an indicator, not a simulated organisation". So they cannot act.
- **Decisions** — empty; "The event system is not built yet." (B2-003)
- **Release Nations** — Girnsk, 13 provinces, 279K. "Releasing them as client
  states is not implemented, so the buttons stay closed."

Three of four political tabs are declarative rather than playable.

---

## 1 JAN 1836 — the wall

**WHAT I WANTED:** Construction Sectors to raise my 5/wk build power, then
Universities to attack the literacy problem I had just identified.

**WHAT I DID:** Construction → selected Construction Sector. The screen switched the
map into a "State Construction" mode with my states shaded green and told me:
*"Click a state row or one of your states on the map to add it to the queue."*

I clicked the Highbridge row. Nothing. Pellwick. Nothing. Every row. Nothing. I
clicked my own green territory on the map. Nothing. Queue: "0 active".

**WHAT HAPPENED:** the state rows are *disabled precisely while a building is
selected*, and enabled only when none is. The two halves of the flow are never
available at the same time. (B2-001)

**HOW I FELT:** **FRUSTRATING**, and then resigned. This is not "the button gives no
explanation" — it is worse, the game gives an explicit instruction and then refuses
it. Construction Sector, Fort, Administration and **University** are all behind this
one door.

**WHAT I DID NEXT:** checked whether the campaign was dead. It was not — factories
build from a completely separate, working path (Factories → "+"), with excellent
disabled reasons ("treasury short by ¤88", "not yet invented — available from 1850").
So I decided to keep playing an honest campaign in which the player can never
construct a state building, and record it rather than patch it.

That decision shapes everything below. Universities were never available to me.

---

## MY CAMPAIGN AMBITION (formed 1 JAN 1836, before unpausing)

I am the world's leading power with an illiterate, 17%-unemployed, five-factory
economy and no military research. So the interesting question is not "can I
conquer" — it is **"can a hegemon actually modernise, or is rank 1 just a number?"**

**PRIMARY GOAL — Industrial modernisation.** Turn ¤50 and five level-1 plants into a
real industrial economy, and find out whether literacy and research can be made to
move at all.

**SECONDARY GOALS**
1. **Break the political lock.** Get past the 100% conservative upper house and pass
   a second reform. Find out what an election means in an absolute monarchy.
2. **Hold the Girnsk together.** 36% of my population is a foreign culture across 13
   provinces. See whether that ever becomes a real problem or stays a statistic.
3. **Stay rank 1 without fighting for it** — and if someone forces a war, find out
   whether the military half of the game has any consequences.
4. **Find out what money is for.** If I get rich, is there anything to spend it on?

---

## 8 JAN 1836 — stability falls off a cliff in week one

Unpaused at Normal speed. One week later stability had gone **62% → 43%**.

I had just passed a reform. I assumed I had caused it. Hovering the stability chip
showed the real answer:

> Household satisfaction +53.8 · Unemployment −11.0 (5,000 without work) = 42.8%

So the 62% I was shown at the start was never real — it was a placeholder, and week 1
simply replaced it with the computed value. **CONFUSING**, and it teaches a new player
the wrong lesson at the worst moment. (B2-012)

The tooltip itself is very good: two named terms and an arithmetic total.
But it said "5,000 without work" while the Population screen said 134K unemployed —
two unemployment numbers on the same afternoon. (B2-013)

---

## JUL 1836 — the world market splits in half

**WHAT I WANTED:** to run a surplus and buy factories.

**WHAT HAPPENED:** by the sixth month my treasury had gone from +21/week to **−10** and
GDP had halved. I opened Trade expecting a bug and found a *story* instead:

| | 1 JAN 1836 | 22 JUL 1836 |
|---|---|---|
| Grain | ¤2.00 | ¤0.67 |
| Cattle | ¤3.00 | ¤0.43 |
| Timber | ¤3.00 | ¤0.56 |
| Paper | ¤6.00 | **¤48.00** |
| Furniture | ¤12.00 | **¤96.00** |
| Luxury Furniture | ¤34.00 | **¤272.00** |

Fourteen shortages, most reading "0% met". Every raw material I sell had collapsed;
every manufactured good I buy had multiplied by exactly 8× base — a hard ceiling.

**HOW I FELT:** genuinely excited. This is a real economic situation with a real
answer — I export cheap, I import dear, therefore *I must industrialise*. The Trade
screen even told me why, with a producers/consumers breakdown per good.
**TENSE, CLEVER, the best moment of the campaign.**

**WHAT I DID:** raised taxes to 40/40/50 and tariffs to 30%. Income recovered to
+27/week. Stability dropped 46% → 39% as household satisfaction fell — **a genuine
tradeoff, clearly signposted.** SATISFYING.

Note: expense sliders preview their new cost instantly; **tax sliders do not** — you
move them and every income figure stays frozen until the next weekly tick. (B2-014)

---

## AUG 1838 — I went to war and did not notice

I fast-forwarded a while and looked up to find the nation badge reading **"At war"**.

**Maresh declared war on us.** It had been announced by a small toast in the corner
that does not pause the game, does not demand acknowledgement, and — I later found —
never goes away either: that same card was still sitting on my map in 1851. (B2-015)

A war declaration is the single most consequential thing that can happen to a country
and it arrived with less ceremony than a factory reaching level 5.

Also waiting for me, unannounced: treasury had grown to **¤5,087**, and literacy had
moved **7% → 11%** with research 1.26 → 1.73/wk. Education works. **SATISFYING** —
this was the first proof that my primary goal was real.

---

## 1838–1840 — the Maresh war, and what losing costs

I had 2 divisions. I ordered 6 more, assigned them (5 sat "without an officer" until I
found the manual "Take N loose units" button — **Auto-assign leaders is OFF by
default**, which is the wrong default for a mobile-first game), and toggled the
offensive.

Over 20 months: my general fought **28 battles**, earned 12 xp and a third star, and
the war score moved from −19 to −31. Maresh occupied 16% of my border region. Stability
sank to 19%.

Then: **"Maresh proposes terms of peace."** The Diplomacy screen laid it out plainly —
*their war score 31 · costs you 18 · Terms: ¤ War Reparations · [Accept terms] [Fight on]*.

**HOW I FELT:** impressed. A winning AI asking for money rather than my capital is a
rational demand, clearly presented, and it ended the war on its own initiative.
**SATISFYING.**

**WHAT HAPPENED WHEN I ACCEPTED:** nothing. No territory changed hands. No reparations
line ever appeared in my budget. Manpower jumped back from 85K to 133K and my treasury
sat untouched at ¤13,138. I lost a two-year war and could not find the bill. (B2-016)

Meanwhile the government had changed **without a word**: Absolute Monarchy →
Presidential Dictatorship, ruling party now **Labour Union (Socialist)**, upper house
flipped from 100% Conservative to 100% Socialist, citizenship Residency → Full
Citizenship, war policy Pro-Military → **Pacifism**, and economic policy State
Capitalism → **Interventionism**.

Six simultaneous constitutional changes, delivered as silent stat edits. I found them
by chance. (B2-017)

---

## JUN 1840 — the money becomes useless

Interventionism meant something concrete. I opened Factories with ¤11,010 and every
single industry read:

> Canned Food Factory · 122 · +68.2/level · **policy forbids state industry**
> Clothing Factory · 162 · +78.2/level · **policy forbids state industry**
> Cement Works · 162 · +72.6/level · **policy forbids state industry**

Margins of +68 to +82 per level, sitting right there, and my government forbids me to
build them. Combined with the broken construction queue (B2-001), **I now had no way
to spend money at all.**

**HOW I FELT:** FRUSTRATING — but the *interesting* kind, briefly. "My own government's
economic doctrine is blocking my industrial policy" is a great strategic problem. Then
I looked for the lever to change it and there wasn't one, and it stopped being
interesting.

Private capital does keep building on its own — my plants went from 5 levels to 23 to
38 without my involvement, earning +450/week at peak. So the industry *grows*; I just
don't participate.

---

## 1841 — welfare, and the one clean causal loop in the game

Population had been falling for five years: 768K → 750K → 729K → 714K. Population
screen: **Needs met 77%** (down from 100%), unemployment 93K.

I had ¤17,271 and nothing to buy, so I set **Public Health 100% and Welfare 100%** —
total cost ¤21.4/week against a ¤248/week income.

Nine months later: **stability 30% → 54%**, population turning back up 714K → 717K →
720K → 723K.

**HOW I FELT:** SATISFYING. Clear input, clear output, visible in two screens. This is
the loop the rest of the game needs.

It is also the loop that shows the money problem most brutally: **maxing every social
budget line in the game costs about ¤55/week.**

---

## 1844 — the political chain, and the best decision I made

Rank check: I had gone **1st → 3rd → 11th of 69**. The leader's hegemony climbed
393 → 474 → 1103 while mine crawled 393 → 519. The world was leaving me behind while I
did everything "right".

I wanted my economic policy back, which meant a different ruling party, which meant an
election. "Hold Election" was greyed with a perfect explanation:

> "There is no electorate: no election can be held under the current franchise."

…displayed directly underneath "Next election is due: 12 APR 1844 · 11 weeks". An
election that is both scheduled and impossible. (B2-018)

So I enacted **Only Landed** franchise. Instantly:
**Presidential Dictatorship → Constitutional Monarchy**, and 4% of the population
enfranchised — 28K voters where there had been none, and the Population screen's
"Voters" column filled in for the first time.

**HOW I FELT:** genuinely SATISFYING. A reform I chose, for a reason I worked out
myself, with a visible constitutional consequence. This is the game working.

**WHAT HAPPENED NEXT:** the April 1844 election returned Labour Union again, silently.
And every election after it. The ideology pie has read Socialist 35.6 / Conservative
29.4 / Liberal 23.9 / Fascist 11.1 since 1836 and has never moved, so the electorate
can never change and neither can the government. My chain ended in a wall.

---

## 1848–1853 — my war of aggression, and the moment I gave up on the military

**WHAT I WANTED:** territory. Rank 11, 26 divisions, ¤18,098 in the bank, nothing to
build. Elanria next door: rank #56, 42 hexes, "we are 1.9× their strength".

**WHAT I DID:** clicked their province → Open Dossier → **Declare War**. One click, no
confirmation, no war-goal selection, no "are you sure". (B2-019)

**WHAT HAPPENED — the two years I will remember:**

- Six months in: war score **+8**. Then it stopped.
- Every command read "holding the border". Order of battle: 26 divisions, **100%
  strength, 100% organization, 0 engaged, 0 on the march**. Diplomacy screen: *"No
  active province battles."*
- The command dock's **"Toggle the offensive"** button did nothing, and has no pressed
  state, no highlight, no aria-state — you cannot tell whether it is on. (B2-020)
- I eventually found the real control by selecting a single division and scrolling a
  panel: a per-commander **"Start Offensive"**. Pressing it flipped that command's
  front to "ADVANCING". I had to do it for each of my seven command slots individually.
- Within a year every command had **silently reverted to "holding the border"** while
  the front panel still claimed "ADVANCING AGAINST ALL ACTIVE BORDERS". Two screens,
  two contradictory answers. (B2-021)
- Left-clicking an enemy province with divisions selected **deselects them**.
  Right-click is the move order — never stated anywhere. (B2-022)

Score after 5½ years of total war against a nation half my size: **+10.**

**AND THEN THE PEACE SCREEN TOLD ME WHAT +10 IS WORTH:**

| What I could ask for | War score cost |
|---|---|
| Lundland (18 hexes) | **80** |
| Norrgau (16 hexes) | **85** |
| Industrial Rights (cheapest non-territorial term) | 14 |
| War Reparations | 18 |
| Vassalise | 65 |

*"They refuse: the demand exceeds your war score by 70."*

I could not afford the cheapest item on the menu. At my observed rate of roughly
+2 war score per year, one province costs **forty years of continuous war**.

**HOW I FELT:** this is the angriest I got. Not because I lost — because there was no
version of this war I could have won. **FRUSTRATING, MEANINGLESS, UNFAIR.**

**WHAT IT COST ME:** ¤18,098 of treasury spent to zero, then **¤4,323 of debt at 20.5%
interest with available credit at ¤0** — a real, visible, punishing bankruptcy spiral.
Weekly balance −¤494. Imports ¤424/week against exports ¤12/week.

Credit to the game: **the economic consequences of that war were excellent.** Debt
compounds, interest scales with debt, credit runs out, and I could read every step of
it on one screen. The war system is what failed, not the ledger.

**WHAT I DID NEXT:** signed a white peace. (My first attempt — clicking "Accept terms"
on the Diplomacy screen — produced *"We rejected Elanria's terms; the war goes on."*
The button did the opposite of its label. (B2-023) I had to route through Peace Talks →
"Sign white peace" instead.)

---

## 1854 — recovery, and what that says

Peace + tariffs to 100% + military procurement cut → **+93/week within six months**,
treasury climbing, stability back to 54%.

Five and a half years of ruinous war, erased in half a year of peace. War costs a lot
and returns nothing; peace costs nothing and returns everything. There is no reason to
ever fight.

---

## CHECKPOINT — FIRST 5 YEARS (1836–1841)

| | |
|---|---|
| Current goal | industrialise; find out if literacy can be moved |
| Strategic problem | raw exports collapsed, manufactures at an 8× price ceiling |
| Enjoy most | reading the Trade screen and watching a real economic situation form |
| Annoys most | Construction queue does not work at all |
| Use most | Budget |
| Ignore most | Logistics, Navy (I have never built a ship) |
| Economic concern | trade deficit |
| Political concern | 100% conservative upper house locking every reform |
| Military concern | 2 divisions and no military research forever |
| World still changing? | Yes — prices, government, my rank |
| Keep playing? | **YES** |

---

## CHECKPOINT — ~25% (JUN 1861)

Treasury ¤10,371 · stability 54% · pop 760K · literacy 52% · research 3.93/wk ·
9 factories, 56 levels · rank 11/69 · 17 shortages · at peace.

The workforce had begun to move: Clerks 7.6% → 14.6%, Farmers 40.2% → 34.0%.

| | |
|---|---|
| Current goal | wait for a government that lets me build factories again |
| Strategic problem | I am rich and forbidden to spend it |
| Enjoy most | seeing literacy climb from a decision I made in 1836 |
| Annoys most | one reform per 12 months and nothing else to do between them |
| Use most | Politics (once a year), Budget (never changes) |
| Ignore most | Military, Logistics, Trade, Navy |
| Economic concern | still importing everything |
| Political concern | ideology pie has not moved a single point since 1836 |
| Military concern | none — nobody threatens me |
| World still changing? | Prices yes. Borders no. |
| Keep playing? | **MAYBE** |

---

## 1869 — the government quietly hands me my economy back

Checked Factories on a whim and the header read **State Capitalism** instead of
Interventionism. The government had changed again, silently, some time in the previous
decade. Every industry was suddenly buildable, and I had **¤74,406**.

**WHAT I DID:** built 75 factories in one sitting — Oil Refineries (+117.4/level),
Distilleries (+47.6), Clothing (+32.8), Cement, Fabric, Fertilizer, Glassworks,
Ammunition, Dye Works — across all nine states.

**HOW I FELT:** genuinely great for about ninety seconds. This is the moment the
campaign had been building to since 1836 and it delivered.

Then: 75 projects, build power 5/wk, and **no way to build Construction Sectors**
(B2-001). Four years later 70 were still under construction. The one lever that would
have let me industrialise faster was the broken one.

---

## 1854–1881 — TWENTY-SEVEN YEARS IN WHICH NOTHING ASKED ANYTHING OF ME

This is the honest headline of the middle game.

Between the Elanria peace (Aug 1853) and 1881 the only inputs I made were:
**one reform per year** (chosen from a list where every option is permanently at
100.0% support, so the choice is cosmetic), and **one factory-building spree in 1869**.

No war was declared on me. No event fired — there is no event system (B2-003). No
diplomatic approach was made. No crisis, no rebellion, no succession, no economic
shock. My treasury went ¤10,371 → ¤215,298 → ¤405,621 while I pressed Fastest and
watched.

**BORING**, and specifically the bad kind: not "waiting for construction to finish" but
*"there is no action available to me that would change my situation."*

The one thing I could still feel was the workforce transforming underneath me, and that
genuinely is impressive — but it happened whether I watched or not.

---

## CHECKPOINT — ~50% (NOV 1874)

Treasury ¤132,220 · stability 55% · pop 827K · literacy 61% · 34 factories +70 building
· 15 shortages · at peace · rank 6/69, hegemony 959 vs leader 2626.

Workforce: Farmers 40.2% → **28.3%**, Factory Workers 18.1% → **24.4%**,
Clerks 7.6% → **16.9%**.

| | |
|---|---|
| Current goal | none that the game will let me act on |
| Strategic problem | ¤132,000 and a build power of 5/week |
| Enjoy most | the Population screen's occupation split actually moving |
| Annoys most | nothing ever happens |
| Use most | the Fastest button |
| Ignore most | Military, Logistics, Trade, Diplomacy, Navy, Technology |
| Economic concern | 15 permanent shortages I cannot address |
| Political concern | reforms are a 12-month timer, not a decision |
| Military concern | none |
| World still changing? | My society, yes. The map, not one hex in 38 years. |
| Keep playing? | **NO — I would have stopped here in a real session** |

---

## 1891 — I check whether the world exists

Fifty-five years in, I clicked Elanria's dossier and compared it to 1847:

| | 1847 | 1891 |
|---|---|---|
| Population | 77K | 88K |
| Provinces | 42 | **42** |
| Industry | 18 levels | 21 levels |

Forty-four years: +14% population, +17% industry, **zero border change**. Meanwhile I
had gone from 5 industry levels to 158.

And yet the hegemony leader, Halria, was at **3311** against my 1114 — so *some* AI is
compounding enormously while a typical one is frozen. The world has runaway winners and
statues, with nothing in between, and no borders ever move.

---

## 1896–1900 — the 100-division experiment

I wanted to know whether the 1848 war was a scale problem. So I spent four years
filling the training queue every few months — the only micro the late game offered —
and built the army from 26 to 105 divisions.

**Cost nobody warned me about:** my population fell **960K → 813K**, because every
division permanently consumes people. There is **no way to disband a division**, ever.
(B2-024)

---

## CHECKPOINT — ~75% (MAY 1900)

Treasury ¤524,807 · pop 813K · army 86 · literacy 68% · **112 factories, 204 levels**,
268K industrial workers = **52% of the lower class** · employment 97% · 26 shortages.

Workforce 1836 → 1900:

| | 1836 | 1900 |
|---|---|---|
| Farmers | 40.2% | **10.1%** |
| Factory Workers | 18.1% | **34.9%** |
| Clerks | 7.6% | **24.1%** |

**This is the single best thing in the game.** A believable, legible, sixty-four-year
industrial revolution that I caused and can read off one screen. Whatever else is
wrong, this part works.

Against it: **shortages went from 14 to 26** over the same period. The world market
never converged; it got worse while the world industrialised.

---

## 1900–1903 — the war I fought at 6.1× strength

Declared on Elanria again with 86 divisions. Started the offensive on every command,
aggressive stance.

- 6 months: war score **+19** (vs +8 with 26 divisions — scale does help)
- 2 years: **+26**, infamy appeared at 3.2 as I occupied
- 3 years: **+28**, and there it stopped

At +28 I could finally afford something. The terms menu, which is genuinely well
designed:

| Term | Cost |
|---|---|
| Industrial Rights | 14 |
| War Reparations | 18 |
| Resource Concession | 20 |
| Demilitarisation | 24 |
| Liberate Minorities | 35 |
| Vassalise | 65 |
| One province | 80–85 |

I took **Resource Concession** — a fifth of their raw production for six years — because
Coal had been my "highest pressure" shortage since 1844. A real decision, made for a
real reason, and it is the *only* thing I won in 67 years of playing.

Note: when the AI is *winning* it demands reparations; when it is *losing* by 28 it
offers only white peace and never concedes anything. The peace AI is one-directional.

---

## 2 OCT 1903 — the game stops

During the war I noticed the clock crawling. I measured it the way a player would —
how much game time passes per real second at Fastest:

| Date | Army | Weeks per real second | FPS |
|---|---|---|---|
| 1836 | 2 | **2.3** | — |
| 1863 | 26 | **1.17** | 142 |
| 1874 | 26 | ~1.2 | — |
| 1903 (at war) | 105 | **0.06** | **0.3** |
| 1903 (at peace) | 105 | **0.06–0.11** | **0.2–0.3** |

One in-game week now takes **ten to sixteen real seconds**, and the interface renders at
**a third of a frame per second**. Covering the map with a full-screen panel changes
nothing, so it is not the renderer — the simulation itself has stopped.

It did not recover at peace. It did not recover once the marching divisions arrived. It
is not a hitch; it is the end state.

**HOW I FELT:** this is where the campaign actually ended for me. Not at a defeat, not
at a climax — the game simply became too slow to play. Reaching 1936 from here would
take somewhere north of six hours of real time at 0.1 weeks per second.

---

## WHERE I STOPPED

**2 OCT 1903 — year 68 of a 100-year campaign (1836–1936).**

I did not fake the rest. I stopped because the simulation dropped to 0.06–0.11 in-game
weeks per real second and 0.2–0.3 fps and stayed there, at peace, with nothing marching.

The stop point is still a genuine late game in every sense except the calendar: a
fully industrialised society (10% farmers, 35% factory workers, 24% clerks), 112
factories at 204 levels, ¤475,000 in the treasury, 105 divisions, 68% literacy, and a
world market with 26 permanent shortages.

**Final state, 2 OCT 1903:** Ossria — 27 provinces, 2 cities, at peace, treasury
¤475,662 (+383/wk), stability 48%, population 762K, army 105, manpower 183K,
GDP ¤1.7K, infamy 0.0, rank 6 of 69, hegemony ~1114 against a leader at 3311.

Borders: **identical to 1 January 1836.**

