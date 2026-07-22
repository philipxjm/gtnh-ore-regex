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

Material names are abbreviated to the **shortest prefix unique within the full GTNH ore-material namespace**;
a name that is a strict prefix of another (Quartz, Tin, Platinum, Iridium, Cassiterite, ...) is emitted as an exact
alternative instead of a prefix wildcard.

The **Integrated Ore Factory** mode emits one regex per IOF processing mode instead (matching `ore`/`rawOre` only,
since the IOF runs the whole chain internally), with mode numbers matching the machine's screwdriver cycle.

## Data provenance

- The material namespace (355 names) is extracted from the GT5-Unofficial `5.09.52.594` sources: GregTech
  `MaterialsInit` (`.addOreItems()`), BartWorks werkstoffs (default generation includes ores), GT++
  `MaterialsOres`/`MaterialMisc` (`MaterialState.ORE`, oredict-sanitized), and GTNH-Lanthanides werkstoff pools,
  plus the handful of modded ores the original tool tracks (HEE, Ancient Debris, Oilsands, vanilla Quartz).
- The default special-ore set and the generation algorithm were reverse-engineered from the original tool's
  rendered output and validated against it: `node test/validate.mjs` regenerates a reference configuration and
  asserts **semantic equality** with the original's six regexes over the full synthetic item universe.
- Known deliberate divergence: five namespace entries the original omits (Blutonium, Mercassium, Meteorite,
  Osmonium, Yttrium — all real GT ore materials) force a few abbreviations one or two characters longer here.
  The resulting filters are strictly safer; everything else is byte-identical.

## Development

No build step. `python3 -m http.server` (or any static server) in the repo root, then open `index.html`.
Run the validation with `node test/validate.mjs`.

Ore and machine icons belong to their respective mods (GregTech, BartWorks, GT++, HardcoreEnderExpansion,
Et Futurum Requiem, Minecraft); this is a non-commercial fan tool, not affiliated with the GTNH team or huijiwiki.
