# IMPERIAL EYE — OPEN BETA PLAYTEST REPORT

**Tester:** experienced grand-strategy player (Victoria / EU / HOI / Total War background).
First time playing Imperial Eye. No prior knowledge of the systems.
**Build:** v0.1.0 · save 13
**Campaign:** seed `BETA1836`, standard world (160×96, 36% land, 65 nations), played as **Vasheim**.
**Played:** 1 JAN 1836 → 29 DEC 1905.

### Scope note, stated up front

I did **not** reach the 1936 end date. The campaign ran ~70 of 100 years.

This was a real-time cost, not a game failure. The simulation runs at roughly 2.9 in-game weeks per
real second in 1836 and about 1.15 by 1850 — so a century is well over an hour of continuous
wall-clock running, and my session couldn't hold the browser in the foreground long enough. Every
finding below is from play I actually did. Where I'm extrapolating (e.g. "the last decades are
probably more of the same") I say so.

The one thing this costs the report is a true end-date snapshot. It does **not** cost the late-game
health verdict — I have seventeen consecutive documented years of late-game play (1878–1895) plus
the 1899–1905 endgame, which is more than enough.

Companion documents: [`OPEN_BETA_PLAYTEST_DIARY.md`](OPEN_BETA_PLAYTEST_DIARY.md) (as-it-happened),
[`OPEN_BETA_BUGS.md`](OPEN_BETA_BUGS.md) (26 logged defects).

---

## 1. FIRST IMPRESSION

**The main menu is the best-presented thing in this build and it is not close.**

A full-bleed period photograph — a battleship firing across a harbour, a rain-soaked marshalling
yard, an imperial hall — desaturated, scrimmed, with drifting fog layers and a gold engraved eye
sigil floating over it. The title in a wide serif. A rotating tagline underneath:

> *"A coastline under the guns, an empire behind them."*
> *"Timetables move armies. Generals only sign for them."*

That second line told me more about the game's intended register than a feature list would. It has
a point of view. There are eight scenes and a music track (Imperia · Faded Rose) and a "next scene"
button, and the whole thing is confident in a way small projects usually aren't.

**Did it make me want to play? Yes, immediately, before I knew anything about the game.**

Then the first thirty minutes undercut it:

- The **browser tab says "HexWar"** — the working title leaking into the shipped build.
- **There is no country selection.** New Campaign is seed / map size / continentality / land ratio /
  great powers → Generate World → you *are* a country. I was handed Vasheim without being asked.
  For a grand-strategy game this is a startling omission: choosing who you are is half the fantasy
  and the decision players spend longest on. I had no relationship with my nation for an hour.
- The game **starts paused and tells you to plan**, but every economic figure on the Nation Overview
  reads ¤0 until a week ticks. GDP ¤0, tax revenue ¤0.0, weekly balance +¤0.0 — while the HUD
  header simultaneously says "+19". You cannot plan an opening until you've spent one.
- That same first screen contradicts itself three ways: `33 provinces` in the header vs
  `TERRITORY 306 provinces` in the body (306 is *hexes*), `1 cities`, and an unrounded float
  (`power 14.06111111111111`).
- **I was ranked 1st of 65 on turn one.** "You lead the world." I hadn't done anything. It made the
  ranking feel like set dressing rather than something to defend — which was ironic, because I then
  spent the campaign losing it.

**Verdict:** superb front door, rough first room.

---

## 2. MY CAMPAIGN STORY

I was given **Vasheim** — a maritime kingdom of 33 provinces and 967,000 people, 37% of them
foreign-culture, ruled by a Conservative Union under a constitutional monarchy. Fifty gold in the
treasury and two divisions. Ranked first in the world, which meant nothing.

I found my campaign on the **Trade screen**, and it's the best thing that happened all game. The
1836 world is pre-industrial and starving: sixteen critical shortages, "SEVERE SHORTAGE — 0% met"
on paper, cement, fuel, fertiliser, ammunition, wine, furniture. Steel and machine parts don't exist
yet. And my own economy was a colony — top exports **Timber, Coal, Fish**, all raw; top import
**Small Arms**, 74% of my military goods bought abroad.

So the world's leading power was a lumber camp that bought its rifles from strangers.

**I decided Vasheim would stop selling logs and start selling finished goods.** I built a Furniture
Manufactory — turning ¤1.91 timber into ¤28 furniture, using trees I already owned — fought the
construction queue for twenty clicks to get it built first, funded schools, and waited.

**It worked, and then it worked for the wrong reason.** By 1839 I had ¤5,719, thirty factory levels,
and an arms industry the private sector had built for me. But the actual engine of my wealth was an
accident: **coal went from ¤2.41 to ¤32.00**, pinned at its price ceiling, because the world had
started burning it and nobody could supply it. I was #1 of 16 producers with 19.5% of world supply.
Coal alone was ¤232 of my ¤313 weekly exports. My clever industrial strategy was a rounding error
next to sitting on the right dirt.

**Then Draesh declared war and I nearly missed it** — the notification looked exactly like
"Clothing Factory reached level 6". I had ¤6,797 and two divisions, and discovered that money buys
nothing here: two training slots, ten weeks per regiment, thirteen reinforcements a week. I fought
for seven years, lost 25–0, had two cities taken — and then signed a **white peace that returned
every occupied province for free**. That was the moment the military layer stopped mattering.

**My best moment came in 1859.** Quengrad had been losing to me for years and kept improving its
own offer as its position worsened: white peace at −31, and at −61 it volunteered *two starred
provinces*. I took Asterthal and Brammoor and crossed a million people. Halanov did the same in
1866 and gave me Jorgarde. Three provinces, all of them handed to me by an opponent that understood
it was beaten.

**My worst mistake was believing the economy would win the game.** While I built factories, the AI
world ate itself and grew. I went **1st → 2nd → 8th → 12th → 6th**, my hegemony 372 against a leader
on 2,692. By 1878 three neighbours were inside my borders, two thirds of my population was under
occupation, my coal production was **zero**, and I was importing my own food at a **−¤1,188/week**
trade deficit.

**And my treasury went up every single week of it.** I finished 1905 with **¤280,023**, at peace,
35 provinces, and absolutely nothing money could buy.

The country did transform, though — and I only noticed at the end. Farmers 40% → 14.5%. Factory
workers 7.8% → **47.2%**. Orthodox 71% → **Reformed 74%**. Conservative-dominant → **Socialist
37.6%**. An agrarian Orthodox monarchy quietly became an industrial Reformed society over sixty
years, and discovering that on the population screen was the last genuinely good feeling I had.

---

## 3. THE BEST MOMENTS

**1. Reading "WHY THE PRICE MOVES" for the first time (Feb 1836).**
> *"World demand outruns supply by 48%. Domestic output covers 18% of national need. Up 55% over
> the charted weeks."*

Grand-strategy economies hand you a number and let you guess at causality. This one just explains
itself in plain English, in three lines, on every good. **I understood the entire world market in
ninety seconds.** This is the single best design decision in the build.

**2. Working out the timber→furniture play myself (May 1836).**
Nothing told me to do it. I read the trade screen (raw timber ¤1.91, my biggest export), read the
build menu (Furniture Manufactory, +38.7/level, world 0% supplied at ¤28), and connected them. That
is exactly what an economy layer is *for* — the game supplied legible facts and I supplied the plan.

**3. Watching coal go to ¤32 and understanding why (1839).**
Seeing the industrial revolution arrive as a price change in my own dirt, with `Your rank: 1/16 ·
Your share: 19.5%` and the top five producers named, was a genuine thrill. The world market's
per-good ranking table is a great tool.

**4. Discovering money couldn't save me (Nov 1839).**
Two divisions, ¤6,797, and a hard cap of two training slots and ten weeks. "I am rich and I cannot
buy my way out of this" is a rare and excellent strategic feeling. Most games let gold become
armies. This one made me feel the difference between wealth and power.

**5. Planning dropping 100% → 40% the instant I attacked.**
One number, immediately visible, taught me the entire hold-versus-advance tradeoff. No tutorial
needed. Clean, legible cost for an aggressive choice.

**6. Quengrad escalating its peace offer as it lost (1859).**
White peace at −31; two starred provinces at −61. **The AI has a model of its own position and
prices accordingly.** This made the peace screen worth opening and it's the best AI behaviour in
the game.

**7. Peace terms that weren't just land (1878).**
Draesh offering *Industrial Rights*, Belurstan demanding *War Reparations* — and reparations
actually appearing later as a "Treaty obligations" line in my budget. There's more texture in the
peace system than I expected from the first war.

**8. The reform tooltip.**
> *Basic School System — normal reform · Support 100.0% of 50.0% required · Conservative 100.0% ·
> Pressure: unrest 41.2% · movement 93.1% · **Ready to enact***

Everything I needed in five lines. And the gate itself — my 100%-Conservative upper house making
conservative reforms free and liberal ones impossible — is a genuinely good constraint.

**9. Finding out in 1899 what my country had become.**
Farmers 40%→14.5%, factory workers 7.8%→47.2%, religion flipped, ideology flipped. Nobody announced
it. Discovering sixty years of social transformation by reading a pop table was a real payoff.

**10. The main menu.** Covered above. It sets a tone the rest of the game should aspire to.

---

## 4. THE WORST MOMENTS

**1. Signing away a lost war for free (Dec 1846). — DESIGN / BALANCE**
Seven years, −25 war score, two cities occupied, a large western wedge of my country under enemy
control. The peace screen said *"They will sign this treaty"* for a white peace with 0 demanded.
One click and everything came back. **Losing was interesting; the loss being erasable was not.**
After this, no war in the game could threaten me, and I stopped respecting AI declarations.

**2. The trade deficit that doesn't exist (whole campaign, proven 1905). — BUG (critical)**
The Budget screen shows `Net −¤823.8` and `Projected weekly balance +¤184.0` **on the same panel**.
Trade never touches the treasury. My economy could fail completely — zero coal, importing food,
−¤1,188/week — and I still got richer every week, forever. This hollows out the best system in the
game.

**3. Nine years where no decision existed (1878–1887). — DESIGN**
Provinces 36→36. Army 5.0K→5.0K. Stability 44%→44%. Same three wars, same frozen fronts. My army
couldn't grow (13 men/week), my land was occupied so I couldn't build, reforms were on a national
12-month cooldown, and the wars couldn't be won or lost. Only the treasury moved. Then I checked
again in 1895 and **nothing had changed for a further eight years.**

**4. Fighting the construction queue. — UI**
Promoting one item to the top of an 8-item queue took ~20 clicks and two failed attempts, during
which I accidentally *demoted* the thing I was promoting. No drag-and-drop, no "move to top", rows
renumber under the cursor, the panel's scroll shifts between renders, and the 8th row sits below
the viewport entirely. The decision is great; the tool is a fight. ETA went 50 weeks → 9 when I
finally won it, so the stakes are high.

**5. The 11-pixel reform button. — BUG**
The primary verb of the Politics screen. The row renders 280px wide; the actual `<button>` measures
**11px × 55px**. I clicked the visible label three times, got no response and no feedback, and
concluded reforms were broken. I only enacted it by measuring the element and aiming at the sliver.

**6. Not noticing I was at war (Nov 1839). — DESIGN**
"Draesh declared war on us!" rendered identically to "Clothing Factory reached level 6" in the same
toast stack. I found out minutes later because a button reading *"Open peace talks with Draesh"*
appeared on the Factories screen.

**7. Seven years of battle reports I couldn't locate. — UI**
`Draesh won the battle at 125, 52.` Raw hex coordinates, in a game whose map is covered in province
names. I never knew where I was winning or losing.

**8. Sixty years of education spending doing nothing visible. — BALANCE / CLARITY**
Education at 40% (¤20.9/week) from 1836, School System reform in year one. **Literacy 24% (1837) →
23% (1899).** The budget line promises "schools qualify workers; universities amplify it" and I have
no evidence it ever did.

**9. "unavailable". — UI**
Five buildings greyed out with that one word and no reason — including the Oil Refinery, the most
profitable building in the game (+61.3/level). The *other* greyed buildings in the same menu say
"treasury short by ¤23", which is perfect. And private investors queued a **Steel Mill** in 1836
while the same building was "unavailable" to me.

**10. Two commanders in one panel. — BUG**
Clicking a general updated the "N DIVISIONS SELECTED" list but left the commander card below
showing the *previous* general, along with his front state and his Start/Halt Offensive button.
I twice nearly halted the wrong army.

---

## 5. MECHANIC-BY-MECHANIC VERDICT

Scored 1–5. "Micro burden" is *lower is better*.

| System | Fun | Depth | Clarity | Micro burden | Strategic value |
|---|---|---|---|---|---|
| **Trade / world market** | **5** | **5** | **5** | 1 | 4 |
| Production & factories | 3 | 4 | 3 | 4 | 3 |
| Budget | 3 | 3 | 4 | 1 | **1** |
| Population / pops | 3 | 4 | 3 | 1 | 2 |
| Politics & reforms | 3 | 4 | **4** | 2 | 2 |
| Construction | 3 | 3 | 4 | **5** | 4 |
| Military — raising | 3 | 3 | 3 | 4 | 4 |
| Military — commanding | 2 | 2 | 2 | 2 | 2 |
| Diplomacy / peace | 3 | 3 | 3 | 1 | 3 |
| AI / world evolution | 3 | 3 | 2 | — | 4 |
| Culture | 1 | ? | 1 | — | **1** |
| Logistics | — | — | — | — | — |
| Colonisation | — | — | — | — | — |
| Navy | — | — | — | — | — |

**Trade / world market — the standout.** Every good, categorised, with price, trend, and a status
line; click one for a full dossier — balance sheet, named producers and consumers, demand by source,
tariff maths at the border, world supply/demand, your rank among 65 nations and the top five
producers by name. Plus "WHY THE PRICE MOVES". **Ship this. Do not touch it.** Its only sin is that
the treasury ignores it.

**Factories.** The build menu is strong: cost, input goods, output good, and **profit per level**
up front. Real decision support. Three problems: the profit figure is a live market snapshot
presented like a spec sheet (Explosives read healthy one minute and −12.4/level the next); the
"unavailable" gate is unexplained; and the state table re-sorts unpredictably so you can't reliably
click the same state twice. The **private investor queue** — capitalists proposing plants they can't
afford, with a "¤ support" button and a lovely tooltip ("Click to contribute a quarter of what is
missing. Shift+click to pay as much of it as the treasury allows") — is a genuinely good idea I
wish I'd had more reason to use.

**Budget.** Well laid out, and every line has a plain-language explanation of its effect. Strategic
value is **1** because the treasury only ever grows: I never faced a fiscal decision after 1840.
I never took a loan. Credit was ¤7,440 against a treasury of ¤280,023.

**Population.** A proper Victoria-grade pop table — 227 cohorts with size/type/estate/nationality/
religion/location/tax/budget/living standard/needs/ideology/issues/unemployment/militancy/literacy,
plus workforce, nationality, religion and ideology breakdowns. **The simulation underneath is
clearly real** — my workforce genuinely transformed. But it's a read-only wall of data: I never once
took an action because of it, and it never explained anything to me.

**Politics & reforms.** Structurally excellent. The support/threshold gate is instantly legible, the
tooltips are good, and having your upper-house composition determine which *direction* of reform is
even possible is the right constraint. Undermined by: the 11px button; a **national** one-reform-per-
year cooldown that turns ten available reforms into a decade-long queue with no decisions in
between; and the fact that I could not detect the effect of the one reform I passed.

**Construction.** The queue with per-item ETAs and reorder controls is the right design and
build power (5/week, +5 per Construction Sector) is the correct bottleneck — it made "what should
my country build first?" a genuinely tense question. The *widget* is the worst in the game.

**Military.** Raising an army is good and deliberate: two training slots, 8–12 weeks per regiment,
13 reinforcements/week against a 300K manpower pool. Money genuinely cannot buy security, which I
liked a lot. Commanding is thin — I selected generals, pressed "Start Offensive", and watched.
I never chose a sector, concentrated force, or exploited a weakness. Auto-assign-leaders is good
automation. Officers gaining skill from battles and **retiring after 34 years** is nice texture.

**Culture.** I have a Culture map mode and my nation is 26% foreign. It never produced an event, a
decision, a penalty I could feel, or a reason to open the screen. Internal Cohesion sat at 63% in
1836 and I never learned what it did.

**Logistics / Colonisation / Navy — never used.** See §6.

---

## 6. MECHANICS THAT FAILED TO MATTER

**Logistics.** A top-level nav button I opened once, in 1836, and never again in seventy years.
Nothing in the game ever gave me a reason: no supply failure was ever attributed to it, no
notification pointed at it, no war I fought made it relevant.

**The Navy.** Warships were **BLOCKED** all game — *"Steamer Convoys short: 6 needed, 2.6 in
stock"* — and I never found what would fix that. I'm a **maritime** nation ("Maritime access" is
the second line of my nation card) and I finished the campaign with zero ships and zero admirals.

**Colonisation.** Never surfaced. I don't know whether it exists.

**Culture.** 26% foreign population, a dedicated map mode, an "Internal Cohesion 63%" stat — and no
consequence I could detect across seventy years.

**Per-good trade policy.** Four prominent buttons (AUTO / IMPORT PRIORITY / EXPORT PRIORITY /
STRATEGIC RESERVE) above the caption *"Per-good policy is a reserved shell — not wired yet."*
Honest, and I appreciate the honesty — but this is precisely the control I needed for my "corner a
commodity, squeeze a rival" ambition, and its absence killed that whole plan.

**Infamy and coalitions.** Infamy climbed to **33 against a stated coalition threshold of 22** and
nothing happened. No coalition formed. Then it decayed back to 0. A threat that never fires.

**Forts, Administration, Universities.** I built one Construction Sector and never had a reason to
build any of the other three building types. Nothing in the game ever said "you need a fort here".

**Stability.** It fell 62% → 44% in the first decade and then sat at 44% for **sixty years**,
through occupation, three simultaneous wars, and 65% of my population living under enemy control.
I could not find any screen that explained what moved it or what it did.

**Loans / national debt.** Never took one. Never could have needed one.

---

## 7. MECHANICS THAT CREATED TOO MUCH MICRO

Ranked by how much they annoyed me.

**1. Construction queue reordering — SEVERE.**
*How often:* every time the private sector queued something ahead of my plans, so continuously.
*Was the decision different each time?* The decision (what matters most?) yes. The **execution**
never: click ▲, six times, while the rows move.
*Automate?* No — automate the *interaction*: drag-and-drop, a "move to top" button, and stable row
positions. Keep the decision manual; it's one of the best in the game.

**2. Ordering regiments one click at a time — HIGH.**
*How often:* every mobilisation. Twelve regiments = twelve clicks on a button that re-renders
between them.
*Different each time?* No. Identical.
*Automate?* Add quantity ("Order ×5"), shift-click for 5, or a standing order. Keep the training-slot
cap — that cap is good design and shouldn't be automated away.

**3. Dismissing notifications to reach panel controls — HIGH.**
*How often:* constantly. Four clicks to reach a tab, several times.
*Automate?* Don't overlay panels. Auto-expire routine toasts. Give war declarations their own
treatment (see §19).

**4. Re-finding a state in the factory table — MEDIUM.**
*How often:* every build.
*Automate?* Just make the sort stable. This is a bug, not a design choice.

**5. Re-selecting generals to check a front — MEDIUM.**
*How often:* every war.
*Automate?* Fix the two-commanders bug and this mostly goes away.

**Things I wished were automated and would have lost nothing:** nothing. **Things automated well:**
"Auto-create leaders" and "Auto-assign leaders" (*"Every division without a commander is handed to
the least burdened officer each week"*) are exactly right — they removed pure bookkeeping and left
me the interesting choice of which general leads which front. The private investor economy is also
good automation: the AI builds sensible things and I get to accelerate or ignore it.

---

## 8. UI PAIN POINTS — TOP 10

1. **The treasury shows a positive balance beside a negative net trade figure.** The most important
   number in the game is wrong and the evidence is on the same panel.
2. **Nothing explains stability, unrest, or literacy.** The stability tooltip reads, in full,
   *"national stability."* Meanwhile prices get a three-line causal explanation. The game already
   knows how to do this and has done it once.
3. **Construction queue reordering** — no drag, no move-to-top, rows renumber under the cursor,
   bottom row off-screen.
4. **11-pixel reform button** with no failure feedback when you miss.
5. **Battle reports use hex coordinates**, not the province names already on the map.
6. **"unavailable"** with no reason, next to a sibling tooltip that says "treasury short by ¤23".
7. **Terminology collision:** hexes are called "provinces" on two screens, states are called
   "regions" on a third, and the HUD's "33 provinces" matches nothing else in the game.
8. **Notifications overlay panel tabs**, and a declaration of war looks like a factory upgrade.
9. **Unstable table sort** on the Factories/Construction state lists while unpaused.
10. **Two commanders shown at once** in the army panel; **Escape doesn't close anything**;
    "power ratio" on the war-declaration screen is unreadable in either direction.

**One thing the UI does very well:** the responsive layout. At a narrow viewport the HUD wraps to
two rows and the panels reflow, and it was genuinely *more* readable than the wide layout. Someone
did real work there.

---

## 9. PACING

**1836–1840 — the strongest stretch by a distance.** Real scarcity (¤50 in the bank), legible
opportunity (a world with sixteen shortages), a clear plan I formed myself, and visible reward.
Every click mattered because build power was 5/week and the treasury couldn't cover two factories.
**This is the game working.**

**1840–1848 — good tension, badly delivered.** The economy compounds beautifully (¤50 → ¤5,719 in
three years; coal ¤2.41 → ¤32.00) and simultaneously a war arrives that I cannot fight. The
strategic *situation* is excellent. The problem is that for the first two years of it, **no action
was available to me** — two training slots, ten weeks each. Correct constraint, no interim decisions.

**1848–1872 — the treadmill.** Continuous war as ambient weather. Someone declares, years pass,
someone proposes peace, I click a button. Punctuated by two genuinely good moments (Quengrad 1859,
Halanov 1866) where the AI ceded provinces. Wealth stops being a constraint entirely around 1850
and the game loses its main source of tension.

**1872–1899 — flat.** 1878–1895 is seventeen documented years with essentially no change to any
statistic except the treasury. Not "waiting for a plan to mature" — there was **no plan available**.
Occupied land can't be built on, armies can't grow, reforms are on a national annual cooldown,
fronts don't move.

**1899–1905 — a strange little revival.** The wars ended without explanation, my land came back,
manpower doubled, and the trade screen revealed that the whole world had industrialised while I
wasn't looking: Steel, Machine Parts ¤144, Telephones ¤308, Radios, Automobiles. That was
interesting again — but it arrived by itself, not because of anything I did.

**Too fast:** treasury accumulation (¤50 → ¤5,719 in three years; money stops mattering by 1850).
Raw commodity prices (coal 13× in three years).
**Too slow:** reform (one per year, nationally, so a full social programme is a 15-year queue with
no decisions in between). Army reinforcement (13 men/week against 300K manpower). Literacy
(unmeasurable in 62 years).
**Too stable:** stability itself, frozen at 44% for six decades through invasion and occupation.
Front lines, frozen for years.
**The arc:** a strong opening act, a compelling second act built on a constraint I respected, and
then a third act with no decisions in it.

---

## 10. DIFFICULTY

**Was it challenging? Yes, once — and for the right reason.**

The 1839 Draesh war was a real crisis produced by a real mistake: I had built an economy and no
army because nothing in the game had ever asked me to, and I couldn't buy my way out. The
constraint that produced that (training slots, reinforcement rate) is **systemic and intelligent** —
not obscure UI, not randomness, not micro. That's good difficulty.

**Then it evaporated, in one click.** The moment I discovered a losing war can be white-peaced away
for free with everything returned, difficulty ceased to exist. From 1846 onward I could not lose
anything permanently. I was invaded by three nations at once with 65% of my population under
occupation, and the actual consequence was that I got slightly less rich per week.

Where difficulty came from **bad** sources: the reform button I couldn't hit, the queue that fought
me, battles reported in coordinates, "unavailable" with no reason. That's friction, not challenge.

**The optimal strategy I found and used:** be attacked, do nothing, accept whatever the AI
eventually volunteers. It cost me no attention and gained me three provinces.

---

## 11. ECONOMY VERDICT

**Did it feel alive?** Yes — *more* alive than most games in this genre. Coal at 8× base with
`Price is pinned at the ceiling — world supply cannot reach this demand`, the world market ranking
table, prices genuinely responding to seventy years of industrialisation. The **modelling is
excellent**.

**Could I meaningfully manipulate it?** Only by building. The one tool designed for market
manipulation — per-good trade policy — is an unwired shell.

**Did world markets matter?** To *prices*, hugely. To *me*, not at all, because of the treasury bug.

**Did shortages matter?** They created opportunity (that's how I found my strategy) but never pain.
I never once suffered from a shortage. In 1904 I was importing 16% of my food with 26 critical
shortages worldwide and it had no effect on anything I could see.

**Could economic strategy hurt a rival?** I never found a way to try. This was my stated goal #2
and the game gave me no lever.

**Did industrialisation feel earned?** In the first decade, absolutely — I chose it, paid for it,
waited for it, watched it pay off. Later it became autopilot: the private sector built most of my
53 factories.

**Did wealth become trivial?** **Completely.** By 1850 money was a score that only went up. I
finished with ¤280,023, no debt, ¤7,440 of unused credit, and nothing to buy: money couldn't raise
troops faster, retake my land, pass a reform, or change my rank.

**Dominant strategy discovered?** Yes: **own an RGO that's pinned at the price ceiling and export
it.** Coal made me rich with zero decisions. Not an exploit exactly — but the price ceiling means
world supply *never* catches demand, so it's a permanent annuity rather than a boom that ends.

**Enjoyable after 50 years?** No. It stopped presenting decisions around 1850. Scaling from 30 to
223 factory levels *halved* my weekly factory income (+¤555 → +¤290) and no screen explained why.

---

## 12. POLITICS VERDICT

**Did I care about political groups?** Somewhat. The 100%-Conservative upper house was a real,
legible constraint — conservative reforms free, liberal ones locked at 29–34% against a 50–60%
threshold. Watching my people drift Socialist (37.6% by 1899) while my chamber stayed Conservative
felt like the beginning of something. It never became anything.

**Did reforms feel earned?** The *gate* did. The **cooldown** didn't — it's a national timer, so
after passing one reform every other reform in the game reads "about 12 months". Ten reforms sat at
100% support: that's not a decision, it's a decade-long queue.

**Could I transform society too quickly?** No — the opposite. And the deep social change that *did*
happen (Orthodox → Reformed, agrarian → industrial, Conservative → Socialist) happened entirely
without my involvement and without notification.

**Did pressure create interesting decisions?** No. I passed exactly one reform in seventy years,
felt no consequence, and never returned to the screen except to look.

**Did cultural diversity matter?** Not that I could detect. 26% foreign, cohesion 63%, no event.

**Was unrest understandable?** No. Stability fell 62% → 44% and I could only *infer* the cause
(175K unemployed, needs met 69%) from a pop table. The tooltip says "national stability."

**Did political history emerge?** My economic policy changed from State Capitalism to
**Interventionism** at some point via an election I never saw. My government's religion flipped.
Those are the seeds of political history — they just aren't *narrated*, so they're archaeology
rather than story.

---

## 13. MILITARY / FRONTLINE VERDICT

**Was preparing for war fun? Yes — genuinely, and this is the system's best idea.**
Two training slots. Ten weeks per infantry regiment. Thirteen reinforcements per week against a
300,000-man pool. Stockpiles of small arms that deplete as you order. Artillery **BLOCKED** because
*"Artillery Equipment short: 4 needed, 3.0 in stock"* — a direct, legible link between my industry
and my army. Sitting on ¤14,000 unable to field more than two divisions per ten weeks is a rare and
excellent feeling. **Keep this.**

**Was commanding war fun? No.** I selected a general, read
`FRONT — HOLDING AGAINST ALL ACTIVE BORDERS · 16 PROVINCES · 5 DIVISIONS · PLANNING 100%`, pressed
**Start Offensive**, and watched for seven years. I never chose a sector, never concentrated force,
never exploited a weak flank. The front abstraction did everything.

The one moment of real tactical teaching was **planning dropping 100% → 40%** when I attacked. That
single number communicated the whole hold/advance tradeoff. More of that, please.

**Could I understand front behaviour? Barely.** The inline explainer is good:
> *"Entering an enemy army starts a weekly battle; low organization forces retreat and the winner
> occupies the province. Only a division with no connected retreat route surrenders."*

But the reporting undoes it. Seven years of `Draesh won the battle at 125, 52.` I could not locate
a single battle I fought. And the one battle panel I caught read
`round 0/20 · losses: 0 attacker / 0 defender` with both sides at 100% strength and organisation,
which told me nothing about whether it was resolving.

**Could I recover from mistakes?** Yes — for free, which is the problem.

**Did logistics matter understandably?** I never used the Logistics screen and nothing ever pointed
me at it. Supply appeared as `supply index 52% · procurement 75%` on the military screen, and
Military Procurement at **100% budget** delivered **41% army supply** — I never understood that
relationship.

**How much babysitting?** Almost none, which sounds good but meant almost no agency.

**The moment I got genuinely frustrated — precisely:**
December 1846. Seven years of war. I open peace talks expecting to lose Keshstead, which had been
Draesh's demand since 1841. The screen reads **"They will sign this treaty"** with zero demanded.
I click, and every occupied province comes back, with no reparations and no infamy. **My anger
wasn't at losing — losing was the interesting part. It was that the game refused to let the loss
mean anything.** Draesh spent seven years and an army to achieve precisely nothing, and I learned
that no war in this game can ever hurt me.

---

## 14. AI VERDICT

**Which AI felt intelligent:** **Quengrad and Halanov, at the peace table.** Escalating concessions
as their position deteriorated — white peace at −31, two starred provinces at −61 — is real
strategic behaviour and it's the best thing the AI does. Draesh and Belurstan offering *Industrial
Rights* and *War Reparations* rather than only land shows range.

**The private-investor AI is also good.** It queued a sensible spread — Steel Mill, Arms Industry
expansions, Luxury Furniture, Paper Mill, Automobile Factory in 1903 — and built most of my
industrial base while I wasn't looking. It solved my arms-dependency problem (74% → 8% imported)
before I got round to it.

**Does the world feel alive?** In the dispatch feed, yes — a constant stream of *"Elinia imposed
terms on Elegard"*, *"Quengrad imposed terms on Draesh"*, *"Ravathesh imposed terms on Noresh"*.
Nations conquer each other, powers rise. **The leaderboard is the proof: I went from 1st to 12th
while doing nothing wrong.** Yarstan and Zenorya grew from 372 hegemony to 2,692. That's a world
with its own history.

**Which behaved absurdly:**
- **Draesh re-declared war on me roughly one year after signing peace**, repeatedly. Combined with
  free white peace, war became meaningless churn.
- The AI **declared war on me constantly** and then couldn't finish. Three nations occupied most of
  my country for over a decade and never converted it into a peace deal.
- **No coalition ever formed** despite my infamy hitting 33 against a stated threshold of 22.

**Does it understand economics?** As an investor, clearly yes. As a state — I saw no evidence anyone
built coal capacity to exploit a good sitting at its price ceiling for seventy years.

**War?** It wins fights and takes ground, but doesn't know how to close.

**Did I ever feel another country had a plan?** Once: Quengrad at the peace table in 1859. That was
the only time an AI felt like it was pursuing an objective rather than reacting.

---

## 15. BALANCE / EXPLOIT REPORT

| # | Issue | Severity |
|---|---|---|
| **B-01** | **Free white peace after total defeat.** Losing 25–0 with cities occupied costs nothing; all territory returns. Removes every stake from war. | **SEVERE** |
| **B-02** | **Trade balance excluded from the treasury.** −¤823.8/week net imports shown on the Budget screen; balance still +¤184.0. Economic failure has no fiscal consequence. | **SEVERE** |
| **B-03** | **Infinite treasury growth.** ¤50 → ¤280,023 with no sink. No debt, credit unused, nothing to buy. Money stops being a constraint around 1850. | **SEVERE** |
| **B-04** | **Price-ceiling RGO annuity.** Coal pinned at 8× base for 70 years because world supply never catches demand. Own the right dirt, export, win. Zero decisions. | **HIGH** |
| **B-05** | **Be-attacked-and-wait is the best expansion strategy.** All three provinces I gained were volunteered by AI peace offers. My own demands never worked. | **HIGH** |
| **B-06** | **Infamy/coalition threat never fires.** Infamy 33 vs threshold 22, no coalition, then decays to 0. | **MEDIUM** |
| **B-07** | **Education spending appears inert.** 62 years at 40% funding; literacy 24% → 23%. | **MEDIUM** |
| **B-08** | **Industry scaling has negative returns.** 30 levels → +¤555/wk; 223 levels → +¤290/wk. Unexplained anywhere in the UI. | **MEDIUM** |
| **B-09** | **Stability is inert.** 44% for 60 years through invasion, occupation and three wars. | **MEDIUM** |
| **B-10** | **Reform cooldown is national, not per-reform.** Ten reforms at 100% support = a 10-year queue with no decisions between. | **LOW** |
| **B-11** | **Navy unreachable.** Warships permanently blocked on Steamer Convoys with no discoverable path to unblock, for a nation flagged "Maritime access". | **LOW** |

I did **not** artificially restrain myself from any of these. B-01, B-04 and B-05 were my actual
campaign strategy once I found them, exactly as a real player would do.

---

## 16. REALISM / BELIEVABILITY

**Believable:**
- **Coal going 13× as the world industrialises.** The single most convincing thing in the game.
- **My workforce shifting 40% farmers → 47% factory workers over sixty years.** Right shape, right
  pace.
- **The tech arc.** Steel, machine parts, telephones, radios, automobiles appearing over decades,
  in a plausible order, with an Automobile Factory in 1903.
- **Occupation crushing production.** My coal output going to literally zero while my provinces were
  occupied is exactly right, and it's the game's best consequence chain.
- **Officers retiring after 34 years** and being replaced by rookies.
- **Great-power turnover.** Zenorya, Yarstan and Lorovya growing past me while I stagnated.

**Absurd / too gamey:**
- **A quarter of a million gold** in a state whose economy has collapsed and whose territory is
  occupied.
- **Population essentially flat for 70 years** (967K → 1.06M, +10%) while the same nation industrialised
  completely. Real industrialising populations doubled or tripled. Public Health sat at 0% all game
  and I never saw a reason to change it.
- **A nation winning a war 25–0 signing a status-quo-ante peace for nothing.**
- **Seventeen years in which no statistic in my country changed.**
- **Sixty-two years of schooling producing −1% literacy.**
- **26 critical worldwide shortages after seventy years of industrialisation** — more than in 1836.
  A world market that never converges.
- **Two divisions per ten weeks** for a nation of a million people with 300,000 available manpower.
  Directionally right (money ≠ power), numerically extreme.

---

## 17. LATE GAME HEALTH *(mandatory)*

Assessed over 1878–1905.

**Performance — degraded, and it's simulation-bound.** Measured with the tab foregrounded:
**2.9 in-game weeks/second in 1836 → 1.15 by 1850–53.** A ~2.5× slowdown in seventeen years. I
tested whether this was rendering by zooming in until only 1,850 hexes were drawn instead of ~15,000
— **an 8× reduction in draw load produced no change in tick rate at all.** So the cost is in the
simulation, not the renderer. (I could not get a clean reading past 1899 because my browser pane was
backgrounded; I'm not reporting those numbers.) Extrapolating the measured trend, a 1936 endgame
would be slow enough to be unpleasant.

**Economy — structurally broken by the late game.** Trade balance +¤187 (1839) → **−¤1,188** (1887)
→ −¤824 (1905), with the treasury rising every week throughout. 26 critical shortages, prices pinned
at ceilings across most of the goods table. Industry showing negative returns to scale.

**AI — still active but not converging.** Dispatches never stopped; nations kept conquering each
other. But nobody could finish a war against me, and nobody built capacity into the permanent
shortages.

**Political diversity — healthy on paper.** By 1899 my population was Socialist 37.6% / Conservative
30.1% / Liberal 23.8% / Reactionary 8.4% — a real spread that had genuinely evolved. It just never
translated into pressure or events.

**World balance — the AI ran away and never stopped.** Leader hegemony 372 (1836) → 2,692 (1904).
Mine 372 → 1,173. The gap widened continuously.

**Military scale — collapsed.** My army decayed 13,000 → 5,000 and stayed there, because
reinforcement (13/week) can't replace attrition. Late-game armies are *smaller* than mid-game ones.

**Micromanagement — low, because there was nothing to do.** Not a compliment.

**UI density — actually fine.** The screens held up at 227 pop cohorts and 53 factories; the
responsive layout coped well. Table sorting instability got more annoying with more rows.

**Is the simulation healthier or more broken than at game start?**

**More broken.** At the start, every system pushed on me: money was scarce, build power was scarce,
the market was full of opportunity, decisions had weight. By 1890 money was infinite and useless,
build power was irrelevant because my land was occupied, the market couldn't touch me, reforms were
on a timer, my army couldn't grow, and the fronts didn't move. **The game's constraints all
dissolved, and constraints were what made it good.**

---

## 18. WOULD I KEEP PLAYING?

**After 2 hours: YES.** The trade screen alone would have kept me. The opening — real scarcity, a
world full of shortages, a strategy I worked out myself — is genuinely strong, and the presentation
promises a game with a point of view.

**After midgame: MAYBE.** Around 1860 I was still engaged: I'd been beaten in a war, taken provinces
at a peace table, and had a real strategic problem (falling down the rankings while getting richer).
That's a good place to be. What would have decided it is whether the game gave me a way to *act* on
that problem. It didn't.

**After reaching the late game: NO.** I would have stopped somewhere around 1880. Not because I was
losing — I'd have happily kept playing a losing campaign — but because I checked back after nine
years and then after another eight and **nothing had changed**, and I'd worked out that nothing
could.

**Would I immediately start another campaign?** Not this build. I'd come back for the next one.

**Would I recommend the beta to another grand-strategy player?** **Yes, with a caveat** — "play the
first fifteen years and look hard at the trade screen; it's doing something most games in this genre
don't." I'd tell them to stop before 1880.

**What would stop me recommending it more broadly:** the free white peace and the disconnected
treasury. Between them they mean *nothing you do can go badly wrong*, and a strategy game where you
can't lose is a spreadsheet with a map.

---

## 19. THE 10 MOST IMPORTANT CHANGES BEFORE RELEASE

**1. Make trade actually hit the treasury.** *(Severity: CRITICAL — bug)*
The Budget screen already renders `Net −¤823.8` and then excludes it from `Projected weekly balance
+¤184.0`. **Why it matters:** it is the difference between having an economy and having a scoreboard.
Fix it and every other economic system — tariffs, autarky, shortages, blockade, my whole "corner a
commodity" ambition — acquires meaning for free. **Direction:** include net trade in the balance;
if that's deliberately abstracted, delete the number from the panel rather than showing it.

**2. Make losing a war cost something.** *(SEVERE — balance)*
**Why:** a defeat you can erase with one click removes every stake from the military layer, and
makes the AI's declarations noise. **Direction:** gate white peace on war score — a nation winning
by 25 should refuse. Let the *loser* be forced to accept terms, or bleed war exhaustion, prestige
and stability until they do. The escalating-offer logic you already have for AI concessions is
exactly the machinery needed, just pointed the other way.

**3. Give money something to do.** *(SEVERE — balance)*
**Why:** ¤280,023 and nothing to buy is the clearest symptom of a game that ran out of decisions.
**Direction:** let gold buy *throughput*, not units — pay to add a training slot, crash-fund a
construction project, subsidise reinforcement rate, bribe a peace term. The private-investor
"¤ support" button is already the right idea; extend that pattern everywhere.

**4. Apply "WHY THE PRICE MOVES" to stability, unrest and literacy.** *(HIGH — clarity)*
**Why:** you have already solved this problem once, beautifully, and only used it in one place.
The stability tooltip currently reads "national stability."
**Direction:** a three-line causal breakdown on every headline stat. `Stability 44% — unemployment
175K (−9%) · needs met 69% (−6%) · occupied provinces 21 (−12%)`. This is probably the highest
value-per-hour change on the list.

**5. Fix the construction queue widget.** *(HIGH — UI)*
**Why:** the queue is one of the best *decisions* in the game and the worst *interaction*. Twenty
clicks and two mistakes to promote one item.
**Direction:** drag-and-drop, a "move to top" button, stable row positions, and don't let rows fall
below the viewport.

**6. Make a declaration of war stop the game.** *(HIGH — UX)*
**Why:** I did not notice I was at war, because it looked like a factory upgrade.
**Direction:** force-pause and a modal for war declarations, peace offers, and coalitions. Separate
the "consequential" feed from the "ambient" one.

**7. Name the places in battle reports.** *(HIGH — UI)*
**Why:** seven years of `battle at 125, 52` made an entire war illegible. The names already exist.
**Direction:** use the province name, and make the notification click through to that hex.

**8. Fix the reform button hit target and always explain a lockout.** *(HIGH — UI/clarity)*
**Why:** an 11px button on the politics screen's primary verb reads as "reforms are broken", and
`unavailable` with no reason on five factories left me never learning what unlocks the game's most
profitable building.
**Direction:** make the whole row clickable; every disabled state gets a reason string — you already
do this correctly with "treasury short by ¤23".

**9. Add a country selection screen.** *(MEDIUM — design)*
**Why:** being handed a nation is the strangest omission in the build. Choosing who you are is the
first act of attachment in this genre, and I didn't care about Vasheim for an hour.
**Direction:** after world generation, show a shortlist — great powers, a rising regional power, an
interesting economy, a nation in trouble — with the two or three stats that make each a different
game. The world generator already produces the variety; just surface it.

**10. Give the player a lever on the late game.** *(MEDIUM — design)*
**Why:** 1878–1895 contained no available decision. That's the single biggest reason I'd stop
playing.
**Direction:** occupied provinces should be *recoverable* by player action; armies should be able to
grow late (see #3); reform cooldown should be per-reform or shortenable; and give the mid-late game
some source of pressure — coalitions that actually form, unrest that actually threatens, market
shocks. The systems mostly exist; they just stop firing.

---

## 20. DO NOT CHANGE THESE

**1. "WHY THE PRICE MOVES."** The best design decision in the build. Plain-language causality on
every good. Extend the *pattern* elsewhere, but don't touch this.

**2. The Trade screen's good dossier.** Balance sheet, named producers and consumers, demand by
source, tariff maths at the border, world supply/demand, **your rank among 65 nations with the top
five producers named**. I made every strategic decision of my campaign from this screen.

**3. The mobilisation constraint.** Two training slots, weeks per regiment, low reinforcement rate,
equipment stockpiles that block orders (`Artillery Equipment short: 4 needed, 3.0 in stock`).
"I am rich and I cannot buy my way out of this" is a rare and excellent feeling. **Do not let gold
become armies.**

**4. AI peace offers that escalate as the AI loses.** White peace at −31, two provinces at −61.
The only time an opponent felt like it had a model of its own position.

**5. Build power as the real bottleneck**, with Construction Sectors as the compounding investment.
It made "what should my country build first?" genuinely tense. Fix the widget, keep the design.

**6. Profit-per-level on the factory build menu.** Real decision support. (Just mark it as a live
market estimate, because it moves.)

**7. Upper-house composition gating which *direction* of reform is possible.** Structurally right.

**8. The private-investor economy.** Capitalists proposing plants they can't afford, with a
"¤ support" button and a tooltip that explains click vs shift-click precisely.

**9. Auto-create and auto-assign leaders.** Removed pure bookkeeping, kept the interesting choice.

**10. The main menu, its rotating scenes and its taglines.** And the responsive layout, which was
better at a narrow viewport than a wide one.

---

## 21. FEATURES I WISHED EXISTED

Each of these comes from a specific moment where I thought *"I wish the game let me do X."*

**1. Demand provinces at a peace table and have it work.**
*Situation:* 1859 and 1868, winning wars by 48 and 68 points. The DEMAND tab says "click their red
provinces on the map — at most 3 per treaty" and I could never make a demand stick. **Every province
I gained in seventy years was volunteered by the AI.** I never once took something I chose.

**2. Deny a rival a good.** *Situation:* 1839, discovering I was #1 in coal with 19.5% of world
supply while the world was 49% short. I immediately wanted to embargo, price-gouge, or cut off a
specific nation. The four buttons for this exist (IMPORT PRIORITY / EXPORT PRIORITY / STRATEGIC
RESERVE) above a caption saying they're not wired. This was my stated goal #2 and I could not
attempt it.

**3. A "why is this number what it is" breakdown for stability.** *Situation:* March 1837, stability
down 62%→48%, hovering the readout and getting the word "stability" back.

**4. Bulk-order regiments.** *Situation:* every mobilisation. "Order ×5", or shift-click for five.
Twelve clicks for twelve regiments on a button that re-renders between them.

**5. Tell me what my education spending bought.** *Situation:* 1899, discovering literacy had gone
24% → 23% after sixty-two years of funding. A simple "literacy +0.1%/year from schools" line on the
budget slider would have let me course-correct in 1840 instead of finding out in 1899.

**6. Pick my country.** *Situation:* the New Campaign screen, which asked me about continentality
but not about who I wanted to be.

**7. See a front's actual shape and order a concentration.** *Situation:* the whole Draesh war.
I could set a stance and toggle an offensive, but I could never say "push *here*". "Start Offensive"
against "ALL ACTIVE BORDERS" was the entirety of my tactical vocabulary.

**8. A ledger / comparison screen.** *Situation:* 1847, watching myself fall from 1st to 10th and
wanting to know *why* Yarstan was at 1,237 hegemony and I was at 504. Provinces? Industry? Army?
The diplomacy list gives "178 provinces · power ratio 0.44" and I couldn't even tell which way the
ratio pointed.

**9. Unblock my navy, or tell me how.** *Situation:* the entire campaign. Warships permanently
BLOCKED on "Steamer Convoys short: 6 needed, 2.6 in stock", for a nation whose card says
"Maritime access". I never found the path and eventually stopped looking.

**10. A pause-worthy event log I can scroll.** *Situation:* returning after a fast-forward to find
four toasts covering my panel tabs, knowing several had already expired. My economic policy changed
from State Capitalism to Interventionism at some point and I never saw it happen.

---

## 22. FINAL PLAYER VERDICT

**Imperial Eye is a genuinely good economic simulation wearing a grand-strategy game that hasn't
finished being built.**

The thing it does better than games ten times its size is **explain itself**. "WHY THE PRICE MOVES"
is three lines of plain English that tell you exactly why a good costs what it costs, and it made me
understand a 65-nation world economy in about ninety seconds. The world-market screen — with your
rank per good and the top five producers named — is a better strategic instrument than most shipped
titles manage. And the underlying model is real: I watched coal go from ¤2.41 to ¤32.00 because the
world started industrialising, watched my own workforce go from 40% farmers to 47% factory workers
over sixty years, and watched telephones and automobiles appear on the market in the 1900s. Nobody
narrated any of it. It just happened, correctly.

It also has a genuinely interesting idea about power: **money is not an army.** Sitting on ¤14,000
during an invasion and being physically unable to field more than two divisions per ten weeks is one
of the best strategic feelings I've had in this genre. Most games let gold become soldiers. This one
made me feel the difference between being rich and being strong.

**What hurts it most is that nothing I did could go badly wrong.** Two defects do almost all of
the damage. A lost war can be erased with one click — I was beaten 25–0, had two cities taken, and
paid nothing. And the treasury simply ignores the trade balance — the Budget screen prints
`Net −¤823.8` next to `Projected weekly balance +¤184.0`, so I finished the campaign with a quarter
of a million gold while producing no coal, importing my own food, and with two thirds of my
population living under enemy occupation. Between them, those two things mean the excellent economy
you've built has no teeth and the war system has no stakes.

The consequence shows up as a **late game with no decisions in it**. I checked my country in 1878,
again in 1887, and again in 1895: thirty-six provinces, five thousand men, 44% stability, three
frozen wars, seventeen years, and the only number that moved was the money. That's not a difficulty
problem — I was happy losing. It's that the game stopped asking me anything.

**Is the underlying game fun? For about fifteen years, very.** The 1836–1850 stretch is legitimately
good: real scarcity, a world full of shortages you can read and exploit, a plan you work out
yourself, and a war that arrives to punish you for building an economy and no army. I'd recommend
the beta to another grand-strategy player on the strength of that alone.

**What would make it great** is not more systems — it already has more systems than it uses. It's
consequences. Make trade hit the treasury. Make defeat cost land. Give money something to buy.
Take the one thing you already do brilliantly — explaining causality in plain language — and point
it at stability, unrest and literacy too. Do those four things and the last fifty years of the
campaign would have the same weight as the first fifteen.

**Right now: a superb economy demo, a promising war game, and a hundred-year campaign that stops
being a game somewhere around year forty.** But the good part is *really* good, and it's the part
that's hardest to build.

**7/10 — and the 3 I'm withholding are four bugs and a missing sink, not a missing vision.**

---

*Campaign: seed `BETA1836`, Vasheim, 1 JAN 1836 – 29 DEC 1905. 35 provinces, 3 cities,
1.06M population, ¤280,023 treasury, rank 6/65. At peace.*
