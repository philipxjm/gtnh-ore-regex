# GTNH Ore Processing Regex Generator

Generate ore dictionary filter regexes for a [GregTech: New Horizons](https://www.gtnewhorizons.com/) ore
processing line. Pick a **common route** for ordinary ores, override the **special ores** that want their own
chain (gems to the sifter, platinum-group through the chemical bath, ...), and copy one regex per machine into
the filter feeding it — a GregTech **Ore Dictionary Filter** cover or an ME storage bus / interface oredict
filter. The character counter tracks the filter cover's 1024-character limit.

**Live tool:** https://philipxjm.github.io/gtnh-ore-regex/

This is a faithful English reimplementation of the
[矿物处理正则表达式生成器](https://gtnh.huijiwiki.com/wiki/%E7%9F%BF%E7%89%A9%E5%A4%84%E7%90%86%E6%AD%A3%E5%88%99%E8%A1%A8%E8%BE%BE%E5%BC%8F%E7%94%9F%E6%88%90%E5%99%A8)
from the GTNH Chinese wiki (灰机wiki). Config links are **compatible in both directions** — the `#common=...;special=...`
URL fragment format is identical, so links saved from the original tool open here unchanged.

## How it works

Each route code is a chain of machine letters — **M**acerate, **P** ore-wash, **B** chemical-bath, **T** thermal-centrifuge,
**S**ift, **C**entrifuge, **H** forge-hammer, **W** simple-washer. The generator tracks the GregTech item form through the
chain (`ore → crushed → crushedPurified / crushedCentrifuged → dustImpure / dustPure → dust`) and collects, for every
machine, which forms of which materials it should accept:

- **Common logic** segments match everything by default and *exclude* ores that produce that form but route it
  elsewhere (`^crushed(?!Purified|Centrifuged)(?!(?:...)$)[A-Z].*$`).
- **Special logic** segments match only the listed ores (`^crushedPurified(?:(?:Chromo|Fluor-|...).*)$`).

Material names are abbreviated to the **shortest prefix that matches nothing outside the listed group** — an
alternation only has to match exactly its own list, so related materials share one token (all four Agardites
collapse to `Agar`; Chrome, Chromite and Chromo-Alumino-Povondraite to `Chrom`). A name that is a strict prefix
of an out-of-group name (Quartz, Tin, Platinum, ...) is emitted as an exact alternative instead of a prefix
wildcard. A card whose joined regex would not fit the 1024-character filter limit is split into several
complete filters (`filter 1/2`, ...) — form segments OR together, so the split changes nothing semantically.

**Stray intermediates**: by default the generator also routes intermediate forms
the common route would not itself produce — `crushedPurified`/`crushedCentrifuged`/
`dustPure` of common-logic ores, as made by bees or inserted by hand — continuing
them toward dust (macerate crushed forms, centrifuge dusts). Specials keep their
configured routes. Untick the option for byte-compatibility with the original
tool's output.

**Compound-dust decomposition**: optional extra cards matching the *final* dusts
that break down further, for the Electrolyzer and the Centrifuge. Conservative
mode lists only the dusts with no other recipe use anywhere; Everything lists all
84 with a decomposition recipe, including chain feedstocks like Bauxite and
Apatite you may well want to keep whole. Either list is editable per machine.

Decomposition is not a separate machine from the ore line's centrifuge step, so
by default the compound dusts are **merged into the Centrifuge card** rather than
given one of their own — one filter, both jobs. What makes that safe is the dust
form's guard: `^dust(?!Impure|Pure|Small|Tiny)(?:…)$` cannot swallow the
`dustImpure`/`dustPure` inputs sharing the regex with it. The merged card is
built against the same 1024-character budget as any other, minus what the ore
segments already spend; dusts that no longer fit spill into decomposition-only
cards. Untick the merge to drive a dedicated decomposition line instead. Routes
with no centrifuge step have nothing to merge into and always get their own card.

The **Integrated Ore Factory** mode emits one regex per IOF processing mode instead (matching `ore`/`rawOre` only,
since the IOF runs the whole chain internally), with mode numbers matching the machine's screwdriver cycle.
The common mode uses **common logic**: its ore filter is a catch-all taking every ore not routed to another
mode or to *Do not process* — including ores your list never mentions — so a new ore from a pack update
still gets processed. A catch-all works by exclusion and so can't be split by members; instead it splits by
the **material's first letter** (typically two filters, A–L and M–Z), each excluding only its own letters.
Stone variants are handled by consuming the stone name atomically with a lookahead-captured backreference,
`(?=((?:Small|Moon|…)(?=[A-Z])|))\1`, so `oreMoonIlmenite` is read as Ilmenite and can't be mistaken for a
material starting with M; the construct behaves identically in Java (the in-game filters) and JavaScript.
`node test/iof-coverage.mjs` checks all ~15,700 ore-form names per config land on exactly the right filter.
With stray intermediates on, each mode's filter also matches the intermediate forms that mode's step chain
actually consumes (verified against `MTEIntegratedOreFactory`'s mode switch) — a bee-produced purified ore
rides the same filter to the same machine. Forms a mode cannot finish are left out: the sifter mode takes no
dusts, the washer+centrifuge mode no centrifuged ore.

## Default configuration

The default ore sorting is the [Integrated Ore Factory wiki page](https://wiki.gtnewhorizons.com/wiki/Integrated_Ore_Factory)'s
recommended byproduct-optimized assignment for GTNH 2.9: its M1 (30s) column is the Macerator → Ore Washer →
Thermal Centrifuge → Macerator route, M2 (15s) the washer + centrifuge route, M3 (10s) the plain
macerate-twice-and-centrifuge route (the common chain), M4 (20s) the sifter route, and its "Other" column —
plus the HEE ores and Ancient Debris the wiki does not sort — defaults to *Do not process*. Opening the tool in
IOF mode therefore yields exactly the wiki's four modes as four filter cards.

## Data provenance

- The material namespace (362 names) is extracted from the GT5-Unofficial `5.09.54.133` (GTNH 2.9) sources:
  GregTech `MaterialsInit` (`.addOreItems()`), BartWorks werkstoffs (default generation includes ores), GT++
  `MaterialsOres`/`MaterialMisc` (`MaterialState.ORE`, oredict-sanitized), GTNH-Lanthanides and GoodGenerator
  werkstoff pools, plus AncientGranite/Koboldite/Runite (GT++ ores verified against the 2.9 runtime dataset)
  and the handful of modded ores the original tool tracks (HEE, Ancient Debris, Oilsands, vanilla Quartz).
- The default special-ore set and the generation algorithm were reverse-engineered from the original tool's
  rendered output and validated against it: `node test/validate.mjs` regenerates a reference configuration and
  asserts **semantic equality** with the original's six regexes over the full synthetic item universe.
- Known deliberate divergence: five namespace entries the original omits (Blutonium, Mercassium, Meteorite,
  Osmonium, Yttrium — all real GT ore materials) force a few abbreviations one or two characters longer here.
  The resulting filters are strictly safer; everything else is byte-identical.

## Development

No build step. `python3 -m http.server` (or any static server) in the repo root, then open `index.html`.
Run the checks with `node test/validate.mjs`, `node test/stone-variants.mjs` and `node test/iof-coverage.mjs`.

Ore and machine icons belong to their respective mods (GregTech, BartWorks, GT++, HardcoreEnderExpansion,
Et Futurum Requiem, Minecraft); this is a non-commercial fan tool, not affiliated with the GTNH team or huijiwiki.
