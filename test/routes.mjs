// Simple Washer routes, the Ore Washer -> Simple Washer switch, and skipping
// the sift step for materials with no Sifter recipe.
import { NAMESPACE, SIFTABLE } from "../js/data.js";
import { generate, generateIOF } from "../js/generator.js";

let fail = 0;
const check = (label, cond) => {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
  if (!cond) fail++;
};
const takes = (cards, machine, name) =>
  cards.filter(c => c.machine === machine).some(c => new RegExp(c.regex).test(name));
const anyTakes = (cards, name) => cards.some(c => new RegExp(c.regex).test(name));
const siftable = new Set(SIFTABLE);

// --- Simple Washer routes: W washes crushed ore to purified crushed ore ---
{
  const cfg = { commonRoute: "MMC", ores: [
    { en: "Copper", route: "MW" }, { en: "Diamond", route: "MWS" },
    { en: "Nickel", route: "MWTM" }, { en: "Tin", route: "MWMC" },
    { en: "Iron", route: "HHW" } ] };
  const cards = generate(cfg, NAMESPACE, { siftable });
  check("MW: macerator takes oreCopper", takes(cards, "macerator", "oreCopper"));
  check("MW: simple washer takes crushedCopper", takes(cards, "simplewasher", "crushedCopper"));
  check("MW: crushedPurifiedCopper left in storage", !anyTakes(cards, "crushedPurifiedCopper"));
  check("MWS: sifter takes crushedPurifiedDiamond", takes(cards, "sifter", "crushedPurifiedDiamond"));
  check("MWTM: thermal takes crushedPurifiedNickel", takes(cards, "thermal", "crushedPurifiedNickel"));
  check("MWTM: macerator takes crushedCentrifugedNickel", takes(cards, "macerator", "crushedCentrifugedNickel"));
  check("MWMC: macerator takes crushedPurifiedTin", takes(cards, "macerator", "crushedPurifiedTin"));
  check("MWMC: centrifuge takes dustPureTin", takes(cards, "centrifuge", "dustPureTin"));
  check("MW routes use no Ore Washer", !cards.some(c => c.machine === "washer" && c.segments.some(s => !s.common)));
  check("HHW unchanged: simple washer takes dustImpureIron", takes(cards, "simplewasher", "dustImpureIron"));
  check("HHW unchanged: simple washer does not take crushedIron", !takes(cards, "simplewasher", "crushedIron"));
}

// --- Switch: every Ore Washer step becomes a Simple Washer step ---
{
  const cfg = { commonRoute: "MPMC", ores: [
    { en: "Chalcopyrite", route: "MPTM" }, { en: "Diamond", route: "MPS" } ] };
  const cards = generate(cfg, NAMESPACE, { simpleWasher: true, siftable });
  check("switch: no Ore Washer card at all", !cards.some(c => c.machine === "washer"));
  check("switch: simple washer takes crushedChalcopyrite", takes(cards, "simplewasher", "crushedChalcopyrite"));
  check("switch: thermal still takes crushedPurifiedChalcopyrite", takes(cards, "thermal", "crushedPurifiedChalcopyrite"));
  check("switch: common MPMC -> MWMC (simple washer takes crushedCopper)", takes(cards, "simplewasher", "crushedCopper"));
  check("switch: sifter still takes crushedPurifiedDiamond", takes(cards, "sifter", "crushedPurifiedDiamond"));
  const off = generate(cfg, NAMESPACE, { siftable });
  check("switch off: Ore Washer takes crushedChalcopyrite", takes(off, "washer", "crushedChalcopyrite"));
}

// --- Sift step skipped where there is no Sifter recipe ---
{
  check("data: Sphalerite has no sifter recipe", !siftable.has("Sphalerite"));
  check("data: Diamond has a sifter recipe", siftable.has("Diamond"));
  const cfg = { commonRoute: "MMC", ores: [
    { en: "Sphalerite", route: "MPS" }, { en: "Diamond", route: "MPS" } ] };
  const cards = generate(cfg, NAMESPACE, { siftable });
  check("MPS Sphalerite: washer still takes crushedSphalerite", takes(cards, "washer", "crushedSphalerite"));
  check("MPS Sphalerite: sifter does not take crushedPurifiedSphalerite", !takes(cards, "sifter", "crushedPurifiedSphalerite"));
  check("MPS Sphalerite: purified crushed left in storage", !anyTakes(cards, "crushedPurifiedSphalerite"));
  check("MPS Diamond: sifter takes crushedPurifiedDiamond", takes(cards, "sifter", "crushedPurifiedDiamond"));
  const legacy = generate(cfg, NAMESPACE);
  check("no siftable set: legacy behaviour (sifter takes Sphalerite)", takes(legacy, "sifter", "crushedPurifiedSphalerite"));
}

// --- IOF: Simple Washer chains have no IOF mode ---
{
  const { unsupported } = generateIOF({ commonRoute: "MMC", ores: [{ en: "Copper", route: "MWMC" }] }, NAMESPACE);
  check("IOF: MWMC reported as unsupported", unsupported.some(u => u.route === "MWMC"));
}

process.exit(fail ? 1 : 0);
