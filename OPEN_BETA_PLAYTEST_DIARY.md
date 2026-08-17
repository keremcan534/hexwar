# Imperial Eye — Open Beta Playtest Diary

Player: experienced grand-strategy player (Vic2/EU4/HOI4 background), first time with Imperial Eye.
Build: v0.1.0 · save 13. Played in-browser at 1600×1000.

Format per entry: **DATE — what I wanted / what happened / my reaction / what I did next.**

---

## Session 0 — Before the campaign

### Boot

The browser tab is titled **"HexWar"** but the game calls itself **Imperial Eye**. Tiny thing,
but it's the first text I saw and it made me briefly think I'd opened the wrong page.

The main menu is genuinely the best-looking part of the game so far. A full-bleed period photo
(a battleship firing over a harbour the first time; a rain-soaked marshalling yard the second),
desaturated and scrimmed, with a gold engraved eye sigil floating over it and the title in a
wide serif. Under it a rotating tagline:

- "A coastline under the guns, an empire behind them."
- "Timetables move armies. Generals only sign for them."

**Reaction: EXCITING.** That second tagline told me more about the game's intended tone than any
feature list would. The menu has confidence. I wanted to play before I knew anything about it.

**Small snag:** the left menu rail is six icons with no visible labels. They *do* expand into a
labelled flyout on hover, which is elegant once you find it — but nothing tells you it's
hoverable, so my first instinct was "six mystery buttons."

### New Campaign — and the thing that surprised me most

New Campaign is: seed, map size, continentality, land ratio, great powers. Then **Generate World**.

**There is no country selection.** The world generated in about a second and I was simply *given*
a nation — Vasheim. I was not asked, not shown a shortlist, not given a "playable countries"
screen. For a grand-strategy game this is a genuinely strange omission: picking who you are is
half the fantasy, and it's the decision players spend the longest on before a campaign.

I also noticed "Land ratio: 0.00" on the slider, which reads like "generate a world with no land."
It apparently means "auto", but a first-timer will read it as a broken default.

**Reaction: SURPRISING, then slightly deflated.** I got a country I had no relationship with yet.

---

## 1836 — Opening

### 1 JAN 1836 — Who am I?

**Vasheim Kingdom.** Sirnmbo founding culture, maritime access. Capital Grandfield.
33 provinces / 306 hexes, 967K people, 2 divisions, ¤50 in the bank.
Stability 62%. Internal cohesion 63% — *37% of my population is foreign culture.*
**Rank 1 of 65. Hegemony 372/372. "You lead the world."**

Being handed the #1 slot on turn one is an odd feeling. In Vic2 terms I'm Great Britain, except
I have fifty pounds and two brigades. It made the ranking feel unearned rather than exciting —
I hadn't done anything, and the game was already telling me I'd won the leaderboard.

The Nation Overview screen also contradicted itself in three places at once (see BUG-003/005/006),
and every economic figure on it read ¤0 because the game starts paused and nothing has ticked.
**So the "plan your opening" screen shows you an economy that does not appear to exist.** I had to
unpause and burn a week before I could make a single informed decision. That's a bad first ten
minutes.

### 7 FEB 1836 — The Trade screen, and the moment the campaign clicked

**Reaction: this is the best screen in the game and it is not close.**

Every good in the world, grouped by category, each with price, trend arrow, and a one-line status
("EXPORT SURPLUS sells 8.8/wk", "SEVERE SHORTAGE 0% met · short 6.7/wk", "INACTIVE"). Click one
and you get a full dossier: balance sheet, producers, consumers, demand by source, tariff maths at
the border, world supply/demand, **your rank among 65 nations and the top 5 producers by name.**

And then this, under a heading literally called **WHY THE PRICE MOVES**:

> World demand outruns supply by 48%.
> Domestic output covers 18% of national need.
> Up 55% over the charted weeks.

That is the single best piece of design in this build. Grand-strategy economies normally give you
a number and let you guess at the causality. This one just *tells you*, in a sentence, in
plain language. I understood the world market in ninety seconds.

What it told me:

- The 1836 world is **pre-industrial and starving for everything.** 16 critical shortages. Paper,
  Cement, Fuel, Fertilizer, Ammunition, Wine, Liquor, Furniture, Luxury Clothes, Luxury Furniture
  are all "SEVERE SHORTAGE — 0% met". Furniture is ¤28. Luxury Furniture is ¤80. Base price ¤6-8.
- Steel, Machine Parts, Electric Gear, Telephone, Radio, Automobile, Tanks, Aeroplanes are
  **INACTIVE** — they don't exist in the world yet. Good: there *is* an era progression.
- **My economy is a colony.** Top exports: Timber ¤16.8, Coal ¤3.3, Fish ¤2.7 — all raw.
  Top imports: manufactured goods. Military goods 38% imported (it was 74% a month earlier).

So the world's "leading power" is a lumber camp that buys its rifles abroad.

**THAT is my campaign.**

---

## MY GOALS

**PRIMARY AMBITION — Vasheim will stop selling logs and start selling finished goods.**
I want to be the world's first real industrial economy, and I want the other 64 nations to be
buying from me rather than the reverse. Concretely: turn my raw timber/coal/iron exports into
manufactures, and end the century as the top producer of the goods everyone needs.

**Secondary goals:**
1. **Kill the arms dependency.** 38% of my military goods are imported. If I ever fight a war
   that matters, someone else holds the tap. Build an Arms Industry even though it's one of the
   *least* profitable buildings available (+7.1/level vs +53.8 for Luxury Clothes) — I want to see
   whether the game rewards strategic industry over profitable industry.
2. **Corner one commodity completely.** The trade screen shows me my world rank per good. I want
   to be #1 in something and find out whether that actually gives me leverage over anyone.
3. **Fix the 37% foreign population** before it becomes a revolt, or find out the hard way that
   it doesn't matter.
4. Stay at Rank 1 — since the game handed it to me, I want to see if I can lose it.

---

### 2 MAY 1836 — The build menu

Good screen. Every factory shows cost, input goods, output good, and **profit per level** up front.
That's a real decision tool — I could see instantly that a Lumber Mill is **-1.9/level** (why would
I ever) while a Furniture Manufactory is **+38.7/level**.

The vertical-integration play jumped straight out at me: I export raw Timber at ¤1.91. Furniture
sells at ¤28.41 and the world is 0% supplied. I already own the trees.

**Reaction: CLEVER — this is the good kind of obvious.** The game didn't tell me to do it; I read
two screens and worked it out. That's exactly what an economy layer should produce.

**Two complaints, both about causality:**

1. Five buildings are greyed out with the single word **"unavailable"** and no reason.
   Steel Mill, Machine Parts, Electric Gear, Oil Refinery, Synthetic Oil. I have iron. I have coal.
   Why can't I build a steel mill? The game will not say. Compare this with the *other* greyed-out
   buildings, which say **"treasury short by ¤23"** — perfectly clear. One tooltip does the job
   properly and the other doesn't.
   Frustrating because the Oil Refinery is the most profitable building on the entire list
   (+61.3/level) and I have no idea what I'd need to do to unlock it.
2. The profit-per-level figures **move a lot**, because they're derived from live market prices.
   Explosives Factory showed a healthy profit one minute and **-12.4/level** the next. The number
   is presented like a spec sheet but behaves like a stock ticker. I'm going to get burned by this.

### 2 MAY 1836 — Fighting the construction queue

My freshly-paid-for Furniture Manufactory was queued at **#7 of 7**, ETA 50 weeks, behind six
private-investor projects that were all unfunded ("¤254 short"). Build power is 5/week and shared
across the whole queue, so position is everything.

Promoting one item to the top took me roughly **twenty clicks and two failed attempts.** There is
no drag-and-drop and no "move to top" — only a one-step ▲ per row. Worse:

- the rows renumber under the cursor after every click, so a rehearsed sequence of clicks lands on
  the wrong rows;
- the panel's scroll position shifts between renders, so the row you were aiming at moves;
- with 8 items the bottom row sits **below the viewport entirely** and can't be clicked at all
  until you scroll the panel.

I got it wrong twice — at one point I demoted the very item I was trying to promote.

**Reaction: FRUSTRATING, and squarely BAD FRICTION.** The decision itself ("what should my country
build first?") is a great decision. The *execution* of it is a fight with a list widget. ETA went
from 50 weeks to 9 the moment I won that fight, so the stakes are high and the tool is bad.

### 2 MAY 1836 — Politics, and one reform per year

The Politics screen is a full Victoria-style spread: upper house pie, ruling party and its four
policy stances, voter vs. people ideology splits, an "important issues" table, and the reform
ladders. It's a lot, but it's legible.

The reform gate is clean and I understood it immediately: each ladder's next rung shows
`support% / threshold%`, and hovering gives a proper tooltip:

> Basic School System — normal reform
> Support 100.0% of 50.0% required
> Conservative 100.0%
> Pressure: unrest 41.2% · movement 93.1%
> **Ready to enact**

My upper house is 100% Conservative, so conservative reforms sit at 100% support and liberal ones
are locked at 29–34% against a 50–60% threshold. **That's a genuinely good constraint** — my
reform path is shaped by who holds the chamber, not by a cooldown alone.

I enacted **Basic School System** (literacy → qualified industrial workers → my whole strategy) and
immediately learned the second gate: *every other reform in the game* switched to "about 12
months". **The cooldown is national, one reform per year.** That's sensible pacing, but it also
means the ~10 reforms sitting at 100% support are a decade-long queue rather than a decision.

**One serious UI bug here:** the enact button is a **hit target 11 pixels wide** inside a row that
renders 280px wide. I clicked the visible text three times and nothing happened; I only enacted the
reform by measuring the button's box and aiming at the sliver. On the primary interaction of the
politics screen, that's brutal. (See BUG-008.)

---

## 1837–1839 — The accidental coal empire

### 14 MAR 1837 — Stability is falling and the game won't tell me why

Stability slid **62% → 48%** over my first year. I went looking for the cause.

The Population screen is a proper Vic2 pop table — 200 cohorts, size/type/estate/nationality/
religion/location/tax/budget/living standard/needs/ideology/issues/unemployment/militancy/literacy.
From it I could *infer* the answer: **155K unemployed out of 967K**, needs met 69%, literacy 24%,
and my factory-worker cohorts showing **80% unemployment** and rising militancy.

But I had to infer it. I hovered the STABILITY readout hoping for a breakdown and the tooltip says,
in full: **"national stability."** That's the label again, not an explanation.

**Reaction: FRUSTRATING — and specifically frustrating because this game already knows how to do
better.** The trade screen has "WHY THE PRICE MOVES" and it is superb. There is no "why stability
moves", no "why unrest is rising", no "why my needs aren't met". The single best idea in the build
has been applied to exactly one system.

### 7 JUL 1839 — I look up and I'm rich

I left the game at Fastest while reading a screen and lost two years without noticing. When I
looked back:

- Treasury **¤50 → ¤5,719**
- Factories 5 → 29 levels, 54K workers, **+¤934/week**
- Build power 5 → 10/week (my Construction Sector landed)
- Economic policy had silently changed from **State Capitalism to Interventionism** — presumably
  the Dec 1836 election. I never saw it happen and nothing asked me.

Then I opened Trade and found the actual story:

**Coal: ¤2.41 → ¤32.00.** Eight times base price. And the explanation line reads:

> **Price is pinned at the ceiling — world supply cannot reach this demand.**
> World demand outruns supply by 49%. Up 147% over the charted weeks.

World supply 50.6 against world demand 149. **My rank: 1 / 16. My share: 19.5%.**

Coal alone is **¤232 of my ¤313 weekly exports.** My "industrial strategy" is a rounding error next
to the fact that I happened to be sitting on coal when the world started burning it.

**Reaction: EXCITING, then suspicious.**

Exciting because the causality is *legible* — I can see the world industrialising in the price of
my dirt, and that's a great feeling. This is the economy working exactly as it should.

Suspicious because the price is **pinned at a ceiling** and nobody is fixing the shortage. If the AI
never builds coal capacity, this isn't a boom, it's an annuity. I'm going to keep pulling this lever
and see whether the world ever corrects.

**Goal #1 quietly completed without me:** military-goods import dependency went 74% → 38% → **8%**,
and Arms now shows "EXPORT SURPLUS". The private sector built the Arms Industry expansions I'd
planned to build myself. I'm pleased and slightly cheated — the interesting strategic problem I set
myself was solved by an AI I don't control.

---

## 1839–1847 — The Draesh War

### 22 NOV 1839 — Someone declares war on me and I nearly miss it

I opened the Factories screen and noticed a button labelled **"Open peace talks with Draesh"**.
That was how I found out I was at war. There was a toast — "Draesh declared war on us!" — but it
sat in a stack with "Clothing Factory reached level 6" and looked exactly the same as it.

**Reaction: this should stop the game.** A declaration of war is the single most consequential
event that can happen to me, and it was styled identically to a factory levelling up. Every other
grand-strategy game I've played pauses and throws a modal. Here it's a notification I scrolled past.

State of my nation: **¤6,797 in the treasury and two divisions.** I had built a magnificent economy
and no army at all, because nothing had ever asked me to.

### The mobilisation problem — money is not power

This is the most interesting thing the military system does, and I want to be clear that I think
it's *deliberate and good*:

- **Training capacity: 2 units at once.** Queue up to 24, but only two train in parallel.
- Infantry: 8–10 weeks each.
- **Reinforcement rate: 13 men/week** against a manpower pool of 292,000.

So I sat on ¤14,000 — enough to buy five hundred regiments at ¤25 each — and could physically
field about **two divisions per ten weeks.** My treasury was completely irrelevant to my security.

**Reaction: GOOD FRICTION, genuinely.** "I am rich and I cannot buy my way out of this" is a real
strategic situation, and it's rare. A game where gold converts straight into armies has no tension.
This one made me feel the difference between wealth and power.

The flip side: because I could do nothing, the first two years of the war were **pure waiting**.
No decision was available to me. That's the bad half of the same design.

### Commanding the war

The command interface is better than I expected. Selecting a general gives you:

> **FRONT — HOLDING AGAINST ALL ACTIVE BORDERS · 16 PROVINCES · 5 DIVISIONS · PLANNING 100%**
> [Start Offensive]

and there's an inline explainer on the diplomacy screen that actually taught me the system:

> "Select divisions and order a destination. Friendly divisions share provinces without merging.
> Entering an enemy army starts a weekly battle; low organization forces retreat and the winner
> occupies the province. Only a division with no connected retreat route surrenders."

The best detail: **starting an offensive dropped PLANNING from 100% to 40%.** A visible, immediate
price for attacking. I understood the hold-vs-advance tradeoff instantly. **CLEVER.**

**But the front abstraction did all the work and I never felt in command.** I pressed "Start
Offensive" on three generals and then watched. I never chose where to attack, never concentrated
force, never exploited a weak sector. Battles were reported to me as:

> "Draesh won the battle at 125, 52."
> "Vasheim won the battle at 123, 53."

**Raw hex coordinates.** I have no idea where "125, 52" is. There is a province name system — the
map is covered in them — and the battle log doesn't use it. So for seven years of war I received a
stream of results about places I could not locate. (BUG-011.)

**One UI bug that actively confused me:** clicking a general in the bottom dock updated the
"N DIVISIONS SELECTED" list at the top of the panel, but the commander card *below* it kept showing
the **previous** general. So the panel showed "4 DIVISIONS SELECTED · Tancred Holt" and
"COMMANDER — VALEN FALKNER · 5 DIVISIONS" simultaneously. I twice nearly halted the wrong army's
offensive. (BUG-012.)

### 2 DEC 1846 — I lose the war, and it costs me nothing

Seven years. Draesh occupied a large western wedge of my country, took two of my cities, and my
counter-offensive retook nothing. War score: **−25.** A clean, deserved defeat.

I opened peace talks expecting to hand over Keshstead (that had been their demand in 1841).

The screen said, with 0 demanded and 0 budget:

> **They will sign this treaty.** [Sign white peace]

I clicked it. **Peace signed. Every occupied province returned. No territory lost, no reparations,
no infamy, no war exhaustion I could see.** Header flipped straight back to "At peace".

**Reaction: this is the biggest problem I found in the whole campaign.**

Losing was interesting — I overextended into a war I hadn't prepared for and got beaten by a
neighbour who had. That's a *good* loss. But the moment I discovered that a total defeat can be
erased for free by clicking one button, the entire military layer stopped mattering to me.
There is no reason to ever accept a punitive peace, no reason to fear a war, and no reason for me
to respect an AI declaration. Draesh spent seven years and a lot of soldiers to achieve exactly
nothing.

Classified SEVERE in the balance report.

### The scoreboard while I wasn't looking

The thing that actually alarmed me in 1847 was not the war. It was this:

| Year | My rank | Leader |
|---|---|---|
| 1836 | **1 / 65** | me (372) |
| 1839 | 2 / 65 | Zenorya 490 |
| 1840 | 8 / 65 | Yarstan 718 |
| 1844 | 12 / 65 | Yarstan 997 |
| 1847 | 10 / 65 | **Yarstan 1237** |

I went from first in the world to tenth in eleven years, while my treasury went from ¤50 to
¤17,000 and my industry from 5 factories to 30+. **My economy is winning and my country is losing.**

The AI nations are eating each other — the dispatch feed is a constant stream of "Elinia imposed
terms on Elegard", "Quengrad imposed terms on Draesh", "Elgrad imposed terms on Ulador" — and
territory is how you climb. I'm static at 33 provinces and getting outgrown.

**Reaction: TENSE, and this is the game working.** I have a real strategic problem now that I
arrived at honestly: my chosen strategy (build industry, stay peaceful) is measurably losing. I
either need to convert money into conquest or accept irrelevance.

**New goal: I need land.** Not because I want it — because the scoreboard says economics alone
doesn't win here.

---

## 1848–1872 — The war treadmill, and my one good war

### The pattern

From 1848 onward I was essentially never at peace. The sequence, over and over:

1. A neighbour declares war on me (Draesh 1839, Draesh again 1848, Quengrad 1849,
   Halanov ~1866, Belurstan 1872, Belurstan again 1887…).
2. Fighting grinds on for years with no input from me.
3. Someone proposes peace.
4. I click a button.

By 1868 I was in **three simultaneous wars** and winning all of them (+40 / +68 / +38) without
having given a single order since 1845.

**Reaction: TEDIOUS, then MEANINGLESS.** War stopped being an event and became weather.

### 1859 — the one moment the AI impressed me

Quengrad had been losing to me for years. I opened the peace screen expecting the usual white
peace, and instead read:

> **QUENGRAD PROPOSES PEACE** — their war score −61 · costs you −139
> **They cede to us: Asterthal ★ (78) · Brammoor ★ (61)**

The AI had *escalated its own offer* as its position worsened. In 1858 it offered white peace at
−31; by 1859 at −61 it was offering me two starred provinces. I accepted and went from
**33 provinces / 1 city to 35 provinces / 3 cities**, and crossed 1 million population.

**Reaction: SATISFYING.** This is the best thing the AI did all game. An opponent whose terms
degrade as they lose is an opponent with a model of its own position, and it made the peace screen
worth opening. In 1866 Halanov did the same thing and ceded Jorgarde. In 1878 Draesh and Belurstan
offered **War Reparations** and **Industrial Rights** as non-territorial terms — there's more
texture in that system than I expected.

**DO NOT redesign this.** Escalating peace terms is the single best AI behaviour in the build.

### The problem sitting underneath it

I only ever *received* offers. Every time I opened peace talks myself, the interface gave me
"DEMAND — click their red provinces on the map — at most 3 provinces per treaty", and I could never
get a demand to stick. So my entire conquest record for the campaign is **three provinces the AI
volunteered.** I never once successfully took something I chose.

---

## 1878–1887 — The decade where nothing happened

By 1878 almost the whole of Vasheim was covered in occupation hatching. Three enemies were inside
my borders. My army had decayed from 13,000 to 5,000 and my manpower pool from 315K to 132K.
GDP halved from ¤4.4K to ¤2.2K.

I checked back in 1887, nine years later. Here is everything that changed:

| | 1878 | 1887 |
|---|---|---|
| Provinces | 36 | 36 |
| Army | 5.0K | 5.0K |
| Manpower | 139K | 132K |
| Stability | 44% | 44% |
| GDP | ¤2.2K | ¤2.4K |
| Wars | 3 | 3 (same enemies) |
| **Treasury** | **¤119,709** | **¤171,336** |

**Nine years. Nothing moved except the money.** Same three wars, same frozen fronts, same
stability to the percentage point. The only "event" feed was factories levelling up and dispatches
about other nations' wars.

**Reaction: BORING, in the specific way that matters.** I wasn't waiting for a plan to mature —
I had no plan available. My army couldn't grow (13 men/week reinforcement), my land was occupied so
I couldn't build, my reforms were on a 12-month national cooldown, and my wars couldn't be won or
lost. There was **no decision available to me for nine years.**

### 1887 — and then I looked at the trade screen

This is the moment the economy stopped making sense.

| | 1839 | 1887 |
|---|---|---|
| Exports | ¤313.1 | **¤53.0** |
| Imports | ¤125.9 | **¤1,241.3** |
| Trade balance | **+¤187.2** | **−¤1,188.3** |
| Top export | Coal ¤232 | Small Arms ¤51 |
| Food imported | 6% | **36%** |
| Critical shortages | 18 | 25 |
| **Treasury** | ¤5,719 | **¤171,336, +146/wk** |

My coal empire is gone — occupied provinces don't produce, so my RGO exports evaporated. I now
import my own food. I am running a **trade deficit of ¤1,188 per week**, roughly *eight times* my
entire weekly budget surplus.

**And my treasury went up every single week regardless.**

**Reaction: this breaks the game for me.** The trade balance is not connected to the treasury.
I noticed the seam back in 1836 — the Tariffs block shows Imports/Exports/Net, and those numbers
never enter "Total income" or "Projected weekly balance" — and here it is at full scale. A
catastrophic import dependency has no fiscal consequence whatsoever.

It also means the answer to "did wealth become trivial?" is **yes, comprehensively.** By 1887 I
had ¤171,000 and there was nothing money could fix: it couldn't buy soldiers (training caps),
couldn't buy back my occupied land, couldn't pass a reform, couldn't move my rank. Money became a
score that only went up.

Also worth noting: **53 factories and 223 levels producing +¤290/week — down from +¤555/week at
30 levels in 1849.** Scaling my industry 7× halved its income. I could not find any screen that
explained why.

---

## 1899–1905 — Endgame

The campaign ended at **29 DEC 1905** rather than the 1936 final date (see the note at the top of
the report — real-time cost, not a game failure).

### The wars ended on their own

Somewhere around 1900 the header quietly flipped to **"At peace"** and stayed there. I did nothing.
Manpower recovered 132K → 368K, GDP ¤2.4K → ¤4.6K, occupied territory returned. After sixty years
of continuous war, peace arrived without any event, announcement, or explanation.

### The world *did* industrialise — properly

This surprised me and it's to the game's credit. Opening the trade screen in 1904:

Steel ¤35, **Machine Parts ¤144, Electric Gear ¤160, Telephone ¤308, Radio ¤192, Automobile ¤220** —
every good that read "INACTIVE" in 1836 now exists and trades. Private investors in Grandfield
started an **Automobile Factory**. My own workforce transformed underneath me:

| | 1837 | 1899 |
|---|---|---|
| Farmers | 40.1% | 14.5% |
| Factory workers | 7.8% | **47.2%** |
| Dominant religion | Orthodox 70.8% | **Reformed 73.6%** |
| Ideology | Conservative-led | **Socialist 37.6%** |

An agrarian Orthodox conservative monarchy became an industrial Reformed socialist-leaning state
over sixty years. **Nobody told me any of that was happening**, but it happened, and when I finally
looked at the population screen it was a genuinely satisfying thing to discover.

### But two things never moved

**Literacy: 24% in 1837 → 23% in 1899.** I funded Education at 40% of budget (¤20.9/week) from
1836 to the end of the campaign, and enacted a School System reform in my first year. Sixty-two
years and roughly ¤60,000 of education spending produced **negative one percentage point.**

**Reaction: this is the clearest "invisible consequence" in the game.** I made an early strategic
decision, paid for it every week for six decades, and it did nothing I could measure. If education
does work, it needs to say so; if it doesn't, it shouldn't be a budget line.

**Shortages: 16 in 1836 → 26 in 1904.** The world market never converges. Seventy years in, most
goods are still pinned at the 8× base-price ceiling with "world supply cannot reach this demand."
Cotton in 1904: **5% met, short 28.4/wk.** The industrial revolution happened and the world is
hungrier than when it started.

### 29 DEC 1905 — The last screen I looked at

The Budget screen, which settles the argument:

```
Total income          ¤286.2
Total expenses        ¤102.2
TARIFFS
  Imports            −¤986.1
  Exports            +¤162.3
  Net                −¤823.8      ← shown right here
Projected weekly balance  +¤184.0  ← and not counted
```

**Treasury: ¤280,023.** A net trade position of minus eight hundred and twenty-four gold per week
is printed on the same panel as a positive balance, and the treasury has never once gone down.

That is my campaign in one screenshot: a country that lost sixty years of wars, had two thirds of
its population under occupation, produced no coal, imported its own food, and finished with a
quarter of a million gold and nothing whatsoever to spend it on.

