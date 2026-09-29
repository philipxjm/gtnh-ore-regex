// Exhaustive IOF ownership check: every ore-form oredict name (plain, rawOre,
// small, and all 40 stone variants of every namespace material, plus
// materials the config has never heard of) must be claimed by exactly the
// IOF card its route says — the common mode for listed-common AND unlisted
// ores, nobody for Do-not-process / unsupported chains — and no filter may
// exceed the length limit. With stray intermediates on, the same holds for
// every crushed/purified/centrifuged/impure/pure form of every material.
import { NAMESPACE, DEFAULT_ORES } from "../js/data.js";
import { generateIOF, IOF_MODES, STONE_INFIXES } from "../js/generator.js";

// Intermediate forms each IOF mode's chain consumes (MTEIntegratedOreFactory).
const MODE_FORMS = {
  MPTM: ["crushed", "crushedPurified", "crushedCentrifuged"],
  MPMC: ["crushed", "crushedPurified", "dustImpure", "dustPure"],
  MMC: ["crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"],
  MPS: ["crushed", "crushedPurified"],
  MBMC: ["crushed", "crushedPurified", "dustImpure", "dustPure"],
  MBTM: ["crushed", "crushedPurified", "crushedCentrifuged"],
  HHW: ["crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"],
};
const INTERMEDIATES = ["crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"];

let fail = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${cond || !detail ? "" : "\n     " + detail}`);
  if (!cond) fail++;
};

// Materials outside the namespace, as a pack update would add them.
const UNKNOWN = ["Aafakeite", "Mooncakeium", "Zyzzyvite", "Unobtainium"];

function expectedModes(config, material, small) {
  const o = config.ores.find(x => x.en === material);
  const route = o ? (o.route === "common" ? config.commonRoute : o.route) : config.commonRoute;
  if (route === "None" || IOF_MODES[route] === undefined) return [];
  // Small ores are never positively routed; only the catch-all takes them.
  if (small && route !== config.commonRoute) return [];
  return [IOF_MODES[route]];
}

// Who should take an intermediate form of a material (stray intermediates on).
// perForm: whether the common catch-all withholds an ore only from the forms
// its own mode takes (else it withholds routed ores from every form).
function expectedIntermediate(config, material, form, perForm) {
  const o = config.ores.find(x => x.en === material);
  const route = o ? (o.route === "common" ? config.commonRoute : o.route) : config.commonRoute;
  const common = IOF_MODES[config.commonRoute];
  const commonTakes = MODE_FORMS[config.commonRoute].includes(form);
  if (route === "None") return commonTakes ? [common] : [];
  if (IOF_MODES[route] === undefined) return [];
  if (route === config.commonRoute) return commonTakes ? [common] : [];
  if (MODE_FORMS[route].includes(form)) return [IOF_MODES[route]];
  return perForm && commonTakes ? [common] : [];
}

function auditIntermediates(label, config) {
  const { cards } = generateIOF(config, NAMESPACE, { strayIntermediates: true });
  const compiled = cards.map(c => ({ mode: c.mode, re: new RegExp(c.regex) }));
  const inter = cards.find(c => c.segments.some(s => s.common && s.forms));
  const perForm = inter ? inter.segments.length > 1 : false;
  check(`${label}: intermediate catch-all present (${perForm ? "per-form" : "simple"}, ${inter?.length} chars)`, !!inter);
  const wrong = [];
  let names = 0;
  for (const m of [...NAMESPACE, ...UNKNOWN]) {
    for (const f of INTERMEDIATES) {
      names++;
      const name = f + m;
      const got = compiled.filter(c => c.re.test(name)).map(c => c.mode).sort();
      const want = expectedIntermediate(config, m, f, perForm);
      if (got.join() !== want.join()) wrong.push(`${name}: got [${got}] want [${want}]`);
    }
  }
  check(`${label}: ${names} intermediate names owned correctly (wrong: ${wrong.length})`, wrong.length === 0,
    wrong.slice(0, 8).join("\n     "));
  const mode3 = cards.filter(c => c.route === config.commonRoute).length;
  check(`${label}: common mode in <= 3 filters (${mode3})`, mode3 <= 3);
}

function audit(label, config, opts = {}) {
  const { cards } = generateIOF(config, NAMESPACE, opts);
  const compiled = cards.map(c => ({ mode: c.mode, re: new RegExp(c.regex) }));
  const over = cards.filter(c => c.length > 1024);
  check(`${label}: every filter <= 1024 (max ${Math.max(...cards.map(c => c.length))})`, over.length === 0);
  const catchAll = cards.filter(c => c.segments.some(s => s.letterRange));
  check(`${label}: common catch-all in 1-3 filters (${catchAll.length})`, catchAll.length >= 1 && catchAll.length <= 3);

  let names = 0;
  const wrong = [];
  for (const m of [...NAMESPACE, ...UNKNOWN]) {
    const forms = [
      [`ore${m}`, false], [`rawOre${m}`, false], [`oreSmall${m}`, true],
      ...STONE_INFIXES.map(s => [`ore${s}${m}`, false]),
    ];
    for (const [name, small] of forms) {
      names++;
      const got = compiled.filter(c => c.re.test(name)).map(c => c.mode).sort();
      const want = expectedModes(config, m, small);
      if (got.join() !== want.join()) wrong.push(`${name}: got [${got}] want [${want}]`);
    }
  }
  check(`${label}: ${names} ore names owned correctly (wrong: ${wrong.length})`, wrong.length === 0,
    wrong.slice(0, 8).join("\n     "));
}

const base = { commonRoute: "MMC", ores: DEFAULT_ORES.map(o => ({ en: o.en, route: o.route })) };
audit("defaults", base);
audit("defaults + intermediates", base, { strayIntermediates: true });

// Drop some ores from the list — they must fall to the common mode.
const dropped = ["Ilmenite", "Copper", "CallistoIce", "Galena", "Iridium", "Diamond"];
audit("defaults minus 6", { ...base, ores: base.ores.filter(o => !dropped.includes(o.en)) });

// An IOF-unsupported chain: its ores go nowhere, everything else unchanged.
audit("with MTM ores", { ...base, ores: base.ores.map(o =>
  ["Chalcopyrite", "Pyrochlore"].includes(o.en) ? { ...o, route: "MTM" } : o) });

// Old-style link: nothing listed on the common route.
audit("sparse config", { commonRoute: "MMC", ores: [
  { en: "Ilmenite", route: "None" }, { en: "Galena", route: "MPMC" },
  { en: "CallistoIce", route: "MPMC" }, { en: "Diamond", route: "MPS" } ] });

auditIntermediates("defaults", base);
auditIntermediates("defaults minus 6", { ...base, ores: base.ores.filter(o => !dropped.includes(o.en)) });
auditIntermediates("with MTM ores", { ...base, ores: base.ores.map(o =>
  ["Chalcopyrite", "Pyrochlore"].includes(o.en) ? { ...o, route: "MTM" } : o) });
auditIntermediates("sparse config", { commonRoute: "MMC", ores: [
  { en: "Ilmenite", route: "None" }, { en: "Galena", route: "MPMC" },
  { en: "CallistoIce", route: "MPMC" }, { en: "Diamond", route: "MPS" } ] });

process.exit(fail ? 1 : 0);
