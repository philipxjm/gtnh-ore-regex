// Stone-variant oredict coverage: GTNH 2.9 registers ore blocks under their
// stone type's own prefix (oreMoonIlmenite, oreDeepslateCopper, ...). Verifies
// that per-ore routes apply to every stone variant, in both directions:
// exclusions ("Do not process") veto stone variants, and special routes
// capture them. Also guards against prefix aliasing (DeepIron must not swallow
// Deepslate ores, Moonstone must not swallow Moon ores).
import { NAMESPACE } from "../js/data.js";
import { generate, generateIOF, STONE_INFIXES } from "../js/generator.js";

let fail = 0;
const check = (label, cond) => {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
  if (!cond) fail++;
};
const cardFor = (cards, machine) => cards.find(c => c.machine === machine);

// --- 1. "Do not process" must exclude every stone variant ---
{
  const config = { commonRoute: "MMC", ores: [{ en: "Ilmenite", route: "None" }] };
  const mac = new RegExp(cardFor(generate(config, NAMESPACE), "macerator").regex);
  check("None: oreIlmenite excluded", !mac.test("oreIlmenite"));
  check("None: rawOreIlmenite excluded", !mac.test("rawOreIlmenite"));
  for (const stone of ["Moon", "Mars", "Netherrack", "Deepslate", "Blackgranite", "TCetiE"]) {
    check(`None: ore${stone}Ilmenite excluded`, !mac.test(`ore${stone}Ilmenite`));
  }
  check("None: oreSmallIlmenite excluded", !mac.test("oreSmallIlmenite"));
  check("None: oreCopper still matches", mac.test("oreCopper"));
  check("None: oreMoonCopper still matches", mac.test("oreMoonCopper"));
  check("None: oreDeepslateGold still matches", mac.test("oreDeepslateGold"));
}

// --- 2. Special routes must capture stone variants ---
{
  const config = { commonRoute: "MMC", ores: [{ en: "Ilmenite", route: "MPS" }] };
  const cards = generate(config, NAMESPACE);
  const mac = new RegExp(cardFor(cards, "macerator").regex);
  const washer = new RegExp(cardFor(cards, "washer").regex);
  check("MPS: macerator takes oreMoonIlmenite (crush step)", mac.test("oreMoonIlmenite"));
  check("MPS: washer takes crushedIlmenite", washer.test("crushedIlmenite"));
  // The common-route exclusion inside the macerator ore segment applies to the
  // crushed form, not ore (MPS shares the macerate-ore step) — key assertion is
  // that no card loses the stone variants at the ore stage.
}

// --- 3. Prefix aliasing: excluding a material must not veto a stone family ---
{
  const config = { commonRoute: "MMC", ores: [{ en: "DeepIron", route: "None" }, { en: "Moonstone", route: "None" }] };
  const mac = new RegExp(cardFor(generate(config, NAMESPACE), "macerator").regex);
  check("alias: oreDeepIron excluded", !mac.test("oreDeepIron"));
  check("alias: oreMoonstone excluded", !mac.test("oreMoonstone"));
  check("alias: oreDeepslateGold NOT vetoed by DeepIron", mac.test("oreDeepslateGold"));
  check("alias: oreMoonCopper NOT vetoed by Moonstone", mac.test("oreMoonCopper"));
  check("alias: oreMoonDeepIron (stone variant) excluded", !mac.test("oreMoonDeepIron"));
}

// --- 4. IOF mode gets the same treatment ---
{
  const config = { commonRoute: "MMC", ores: [{ en: "Ilmenite", route: "None" }, { en: "Galena", route: "MPMC" }] };
  const { cards } = generateIOF(config, NAMESPACE);
  // The common mode may span several filters (split by material initial).
  const anyOf = route => {
    const res = cards.filter(c => c.route === route).map(c => new RegExp(c.regex));
    return { test: name => res.some(r => r.test(name)) };
  };
  const rc = anyOf("MMC");
  const rs = anyOf("MPMC");
  check("IOF: oreMoonIlmenite excluded from common card", !rc.test("oreMoonIlmenite"));
  check("IOF: oreGalena on special card", rs.test("oreGalena"));
  check("IOF: oreMarsGalena on special card", rs.test("oreMarsGalena"));
  check("IOF: oreMarsGalena excluded from common card", !rc.test("oreMarsGalena"));
  check("IOF: oreMoonCopper on common card", rc.test("oreMoonCopper"));
}

// --- 5. Every stone infix round-trips through exclusion and capture ---
{
  const config = { commonRoute: "MMC", ores: [{ en: "Ilmenite", route: "None" }] };
  const mac = new RegExp(cardFor(generate(config, NAMESPACE), "macerator").regex);
  const leaks = STONE_INFIXES.filter(s => mac.test(`ore${s}Ilmenite`));
  check(`all ${STONE_INFIXES.length} stone infixes veto (leaks: ${leaks.join(",") || "none"})`, leaks.length === 0);
}

// --- 6. Stone-decomposable material names must not alias through the infix ---
// CallistoIce parses as ore + Callisto (stone) + "Ice": a token for Ichorium
// like "Ic" would claim it after the optional infix consumed "Callisto".
{
  const config = {
    commonRoute: "MMC",
    ores: [{ en: "Ichorium", route: "MMC" }, { en: "CallistoIce", route: "MPMC" }],
  };
  const { cards } = generateIOF(config, NAMESPACE);
  const anyOf = route => {
    const res = cards.filter(c => c.route === route).map(c => new RegExp(c.regex));
    return { test: name => res.some(r => r.test(name)) };
  };
  const common = anyOf("MMC");
  const special = anyOf("MPMC");
  check("decompose: oreIchorium on common card", common.test("oreIchorium"));
  check("decompose: oreMoonIchorium on common card", common.test("oreMoonIchorium"));
  check("decompose: oreCallistoIce NOT claimed by Ichorium's card", !common.test("oreCallistoIce"));
  check("decompose: oreCallistoIce on its own card", special.test("oreCallistoIce"));
}
{
  const config = { commonRoute: "MMC", ores: [{ en: "Ichorium", route: "None" }] };
  const mac = new RegExp(cardFor(generate(config, NAMESPACE), "macerator").regex);
  check("decompose: excluding Ichorium keeps oreCallistoIce on common", mac.test("oreCallistoIce"));
  check("decompose: oreIchorium excluded", !mac.test("oreIchorium"));
}

// --- 7. IOF intermediates: bee/manual inputs ride their ore's mode card ---
// The machine accepts every intermediate form; each mode finishes only the
// forms its chain consumes (MPS has no centrifuge, MPMC no thermal step).
{
  const config = {
    commonRoute: "MMC",
    ores: [
      { en: "Copper", route: "MMC" },
      { en: "Galena", route: "MPMC" },
      { en: "Ilmenite", route: "MPS" },
    ],
  };
  const { cards } = generateIOF(config, NAMESPACE, { strayIntermediates: true });
  const match = (route, name) => cards.filter(c => c.route === route).some(c => new RegExp(c.regex).test(name));
  check("IOF stray: crushedPurifiedGalena on its MPMC card", match("MPMC", "crushedPurifiedGalena"));
  check("IOF stray: crushedPurifiedGalena NOT on MMC card", !match("MMC", "crushedPurifiedGalena"));
  check("IOF stray: dustPureGalena on MPMC card", match("MPMC", "dustPureGalena"));
  check("IOF stray: crushedCentrifugedGalena NOT on MPMC (no thermal step)", !match("MPMC", "crushedCentrifugedGalena"));
  check("IOF stray: crushedPurifiedIlmenite on MPS card", match("MPS", "crushedPurifiedIlmenite"));
  check("IOF stray: dustImpureIlmenite NOT on MPS (no centrifuge step)", !match("MPS", "dustImpureIlmenite"));
  check("IOF stray: crushedCentrifugedCopper on MMC card", match("MMC", "crushedCentrifugedCopper"));
  check("IOF stray: oreGalena still on MPMC card", match("MPMC", "oreGalena"));
  const off = generateIOF(config, NAMESPACE);
  const offMatch = (route, name) => off.cards.filter(c => c.route === route).some(c => new RegExp(c.regex).test(name));
  check("IOF stray off: ore-only cards (crushedGalena unmatched)", !offMatch("MPMC", "crushedGalena"));
}

process.exit(fail ? 1 : 0);
