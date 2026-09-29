// Core regex generation for GTNH ore processing filters.
// Route codes describe the machine chain an ore takes, tracked as item-form
// transitions (ore -> crushed -> crushedPurified -> ... -> dust). Each machine
// card collects (form -> material set) segments; "common" segments use a
// negative lookahead over everything routed elsewhere, "special" segments use
// a positive alternation. Material names are abbreviated to the shortest
// prefix unique within the full GTNH ore-material namespace; names that are a
// strict prefix of another name are emitted as exact alternatives instead.

export const FORMS = {
  oreRaw: { re: "(?:ore|rawOre)", label: "Ore / Raw Ore" },
  crushed: { re: "crushed", label: "Crushed Ore", guard: "(?!Purified|Centrifuged)" },
  crushedPurified: { re: "crushedPurified", label: "Purified Ore" },
  crushedCentrifuged: { re: "crushedCentrifuged", label: "Centrifuged Ore" },
  dustImpure: { re: "dustImpure", label: "Impure Dust" },
  dustPure: { re: "dustPure", label: "Purified Dust" },
  dust: { re: "dust", label: "Dust", guard: "(?!Impure|Pure|Small|Tiny)" },
};

export const MACHINES = {
  macerator: { label: "Macerator", multi: "Industrial Maceration Stack", icon: "machine_macerator.png" },
  washer: { label: "Ore Washing Plant", multi: "Industrial Ore Washing Plant", icon: "machine_washer.png" },
  chembath: { label: "Chemical Bath", multi: "Industrial ChemBath", icon: "machine_chembath.png" },
  thermal: { label: "Thermal Centrifuge", multi: "Industrial Thermal Centrifuge", icon: "machine_thermal.png" },
  sifter: { label: "Sifter", multi: "Industrial Sifter", icon: "machine_sifter.png" },
  centrifuge: { label: "Centrifuge", multi: "Industrial Centrifuge", icon: "machine_centrifuge.png" },
  hammer: { label: "Forge Hammer", multi: "Forge Hammer", icon: "machine_macerator.png" },
  simplewasher: { label: "Simple Washer", multi: "Simple Washer", icon: "machine_washer.png" },
  electrolyzer: { label: "Electrolyzer", multi: "Compound dust decomposition", icon: "machine_chembath.png" },
  centrifuge_decomp: { label: "Centrifuge (decomposition)", multi: "Compound dust decomposition", icon: "machine_centrifuge.png" },
};

// Route code -> ordered (machine, input form) steps. Derived by tracking the
// current item form through each machine letter:
//   M macerate: ore->crushed, crushed->dustImpure, crushedPurified->dustPure,
//               crushedCentrifuged->dust
//   P wash:     crushed->crushedPurified          B bathe: crushed->crushedPurified
//   T thermal:  crushed|crushedPurified->crushedCentrifuged
//   C centrifuge: dustImpure|dustPure->dust       S sift: crushedPurified->gems
//   H hammer:   ore->crushed, crushed->dustImpure W simple-wash: dustImpure->dust
export const ROUTES = {
  MPTM: { note: "Full line: washer + thermal byproducts · slowest" },
  MPMC: { note: "Most byproducts · slow" },
  MMC: { note: "Moderate byproducts · moderate speed" },
  MHW: { note: "Fewest byproducts · fast" },
  HHW: { note: "Halved main output · no byproducts · fastest" },
  MPS: {}, MTM: {}, MBMC: {}, MBTM: {},
  M: {}, H: {}, MM: {}, MP: {}, None: {}, common: {},
};

const STEP_MACHINE = { M: "macerator", P: "washer", B: "chembath", T: "thermal", C: "centrifuge", S: "sifter", H: "hammer", W: "simplewasher" };

export function routeSteps(code) {
  if (code === "None" || code === "common") return [];
  let form = "oreRaw";
  const steps = [];
  for (const ch of code) {
    const machine = STEP_MACHINE[ch];
    steps.push({ machine, form });
    switch (ch) {
      case "M":
        form = form === "oreRaw" ? "crushed"
          : form === "crushed" ? "dustImpure"
          : form === "crushedPurified" ? "dustPure"
          : "dust";
        break;
      case "H":
        form = form === "oreRaw" ? "crushed" : "dustImpure";
        break;
      case "P": case "B": form = "crushedPurified"; break;
      case "T": form = "crushedCentrifuged"; break;
      case "C": case "W": case "S": form = "done"; break;
    }
  }
  return steps;
}

export function routeLabel(code) {
  if (code === "None") return "Do not process";
  if (code === "common") return "Follow common logic";
  return routeSteps(code).map(s => MACHINES[s.machine].label).join(" → ");
}

// Item forms a route brings into existence: the entry form (ores exist in the
// world) plus each step's input form. A form an ore never reaches needs no
// exclusion downstream.
export function producedForms(code) {
  const forms = new Set(["oreRaw"]);
  for (const s of routeSteps(code)) forms.add(s.form);
  if (code !== "None" && code !== "common") {
    // The last step's output also exists (e.g. route "M" leaves crushed ore).
    const steps = routeSteps(code);
    if (steps.length) {
      let form = "oreRaw";
      for (const ch of code) {
        switch (ch) {
          case "M":
            form = form === "oreRaw" ? "crushed"
              : form === "crushed" ? "dustImpure"
              : form === "crushedPurified" ? "dustPure"
              : "dust";
            break;
          case "H": form = form === "oreRaw" ? "crushed" : "dustImpure"; break;
          case "P": case "B": form = "crushedPurified"; break;
          case "T": form = "crushedCentrifuged"; break;
          case "C": case "W": case "S": form = "done"; break;
        }
        if (form !== "done" && form !== "dust") forms.add(form);
      }
    }
  }
  return forms;
}

// GTNH 2.9 registers every ore block under its stone type's own oredict prefix
// (GTBlockOre -> StoneType.getPrefix()): oreMoonIlmenite, oreNetherrackGold,
// oreDeepslateCopper, ... The ore/rawOre form must therefore treat the stone
// name as an optional infix between the form and the material — otherwise
// stone-variant ores bypass both exclusions ("Do not process" ores still get
// pulled) and special routes (stone variants fall through to common logic).
export const STONE_INFIXES = [
  "AlphaCentauri", "AnubisAndMaahes", "Asteroid", "BarnardaE", "BarnardaF",
  "Basalt", "Blackgranite", "BlueIce", "Callisto", "Ceres", "Deepslate",
  "Deimos", "Enceladus", "Endstone", "Europa", "Ganymede", "Haumea", "Horus",
  "Io", "Makemake", "Marble", "Mars", "Mercury", "Miranda", "Moon",
  "Netherrack", "Oberon", "PackedIce", "Phobos", "Pluto", "Proteus",
  "Redgranite", "SethClay", "SethIce", "TCetiE", "Titan", "Triton", "Tuff",
  "VegaB", "Venus",
];
const STONE_OPT = `(?:${STONE_INFIXES.join("|")})?`;
// Exclusions additionally veto the "Small" quantity variant; it is never
// positively routed (small ores macerate straight to dust, not crushed).
const VETO_OPT = `(?:Small|${STONE_INFIXES.join("|")})?`;

// Abbreviation namespace for the ore/rawOre form: the plain namespace plus
// every stone-prefixed material name. Without this, a material's shortest
// unique prefix can alias an entire stone family (DeepIron -> "Deep" would
// swallow every Deepslate ore; Moonstone -> "Moo" every Moon ore).
const EXT_CACHE = new WeakMap();
function stoneExtendedNamespace(namespace) {
  let ext = EXT_CACHE.get(namespace);
  if (!ext) {
    ext = [...namespace];
    for (const stone of STONE_INFIXES) {
      for (const n of namespace) ext.push(stone + n);
    }
    // A material name that itself BEGINS with a stone name decomposes under
    // the optional stone infix: oreCallistoIce can be parsed as ore +
    // Callisto (stone) + "Ice", so a token like "Ic" (Ichorium) would claim
    // CallistoIce for its own route. The stripped remainders join the
    // domain so no token can silently match one.
    for (const n of namespace) {
      for (const stone of STONE_INFIXES) {
        if (n.length > stone.length && n.startsWith(stone)) ext.push(n.slice(stone.length));
      }
    }
    EXT_CACHE.set(namespace, ext);
  }
  return ext;
}

// Shortest prefix of `name` that no other namespace entry starts with.
// Returns {prefix} or {exact:true} when another name extends this one.
export function abbreviate(name, namespace) {
  if (namespace.some(o => o !== name && o.startsWith(name))) return { name, exact: true };
  for (let len = 1; len <= name.length; len++) {
    const p = name.slice(0, len);
    if (!namespace.some(o => o !== name && o.startsWith(p))) return { name, prefix: p };
  }
  return { name, prefix: name };
}

const byName = (a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0;

// names -> "(?:(?:p1|p2).*|Exact1|Exact2)"; group order preserved for the
// grouped (common-exclusion) case, alphabetical within each group.
//
// Abbreviation here is group-aware: the alternation as a whole only has to
// match exactly the listed names, so a prefix is valid as soon as everything
// it matches in the namespace is itself part of the list. Related materials
// then share one token (all four Agardites -> "Agar"; Chrome, Chromite and
// Chromo-Alumino-Povondraite -> "Chrom") instead of one each, which is what
// keeps wiki-scale ore lists inside the 1024-character filter limit. A name
// that is a strict prefix of an out-of-list name still has to be emitted as
// an exact alternative, as before.
function alternation(groups, namespace, fullList) {
  const inList = fullList ?? new Set(groups.flat());
  const prefixes = [];
  const seen = new Set();
  const exacts = [];
  for (const group of groups) {
    const sorted = [...group].sort(byName);
    for (const n of sorted) {
      let chosen;
      for (let len = 1; len <= n.length; len++) {
        const p = n.slice(0, len);
        if (namespace.every(o => !o.startsWith(p) || inList.has(o))) { chosen = p; break; }
      }
      if (chosen === undefined) exacts.push(n);
      else if (!seen.has(chosen)) { seen.add(chosen); prefixes.push(chosen); }
    }
  }
  const parts = [];
  if (prefixes.length) parts.push(`(?:${prefixes.join("|")}).*`);
  parts.push(...exacts);
  return `(?:${parts.join("|")})`;
}

// A segment: one input form on one machine card.
//   common: ^form[guard](?!EXCL$)[A-Z].*$   special: ^form(?:...)$
// For the ore/rawOre form, exclusions veto through an optional stone/Small
// infix (inside the lookahead, where alternation cannot be defeated by
// backtracking), and special segments accept an optional stone infix so
// stone-variant ores follow their material's route.
function segmentRegex(seg, namespace) {
  const form = FORMS[seg.form];
  const isOre = seg.form === "oreRaw";
  const ns = isOre ? stoneExtendedNamespace(namespace) : namespace;
  if (seg.common) {
    const guard = form.guard || "";
    const excl = seg.exclGroups.some(g => g.length)
      ? `(?!${isOre ? VETO_OPT : ""}${alternation(seg.exclGroups.filter(g => g.length), ns)}$)`
      : "";
    return `^${form.re}${guard}${excl}[A-Z].*$`;
  }
  // seg.fullSet (when set) holds the complete member list this segment is a
  // slice of, so a chunk of a split segment still abbreviates against the
  // whole list — a prefix reaching into a sibling chunk routes those names
  // to the same machine either way.
  // A composite segment (seg.forms) covers several intermediate forms with
  // one shared member alternation: the forms all route to the same machine,
  // so one token list serves them all. Never used for the ore form.
  if (seg.forms) {
    const alt = seg.forms.map(f => FORMS[f].re + (FORMS[f].guard || "")).join("|");
    return `^(?:${alt})${alternation([seg.only], ns, seg.fullSet)}$`;
  }
  return `^${form.re}${isOre ? STONE_OPT : ""}${alternation([seg.only], ns, seg.fullSet)}$`;
}

const FORM_ORDER = ["oreRaw", "crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"];

// GT-semantics continuation for intermediate forms the common route does not
// itself produce (bee products, manual inserts): macerate any crushed form,
// centrifuge any dust form.
const STRAY_CONTINUATION = {
  crushed: "macerator",
  crushedPurified: "macerator",
  crushedCentrifuged: "macerator",
  dustImpure: "centrifuge",
  dustPure: "centrifuge",
};

// config: { commonRoute, ores: [{en, route}, ...] }  (route may be "common")
// opts.strayIntermediates: also route stray intermediate forms via common logic.
// Returns [{machine, segments:[{form, common, only?, exclGroups?, regex}], regex, length}]
export function generate(config, namespace, opts = {}) {
  const { commonRoute, ores } = config;
  const resolved = ores.map(o => ({ en: o.en, route: o.route === "common" ? commonRoute : o.route, explicit: o.route }));

  // Group order = first appearance in the ore list (drives exclusion ordering).
  const groupOrder = [];
  for (const o of ores) {
    if (!groupOrder.includes(o.route)) groupOrder.push(o.route);
  }

  const machines = new Map(); // machine -> Map(form -> {commonHere, specials:Set})
  const touch = (machine, form) => {
    if (!machines.has(machine)) machines.set(machine, new Map());
    const forms = machines.get(machine);
    if (!forms.has(form)) forms.set(form, { commonHere: false, specials: [] });
    return forms.get(form);
  };

  const commonSteps = routeSteps(commonRoute);
  for (const s of commonSteps) touch(s.machine, s.form).commonHere = true;

  if (opts.strayIntermediates) {
    // Only add a continuation for forms the common route leaves unconsumed;
    // where the route already eats a form, its own machine keeps authority.
    for (const [form, machine] of Object.entries(STRAY_CONTINUATION)) {
      const consumed = commonSteps.some((s) => s.form === form);
      if (!consumed) touch(machine, form).commonHere = true;
    }
  }

  for (const ore of resolved) {
    if (ore.explicit === "common" || ore.explicit === "None") continue;
    for (const s of routeSteps(ore.route)) {
      const slot = touch(s.machine, s.form);
      if (!slot.specials.includes(ore.en)) slot.specials.push(ore.en);
    }
  }

  const cards = [];
  for (const [machine, forms] of machines) {
    const segments = [];
    for (const form of FORM_ORDER) {
      if (!forms.has(form)) continue;
      const slot = forms.get(form);
      if (slot.commonHere) {
        // Exclude, in group order: specials whose route produces this form
        // but does not feed it to this machine. (None-routed ores only ever
        // produce the entry form, so they are only excluded there.)
        const exclGroups = groupOrder.map(route => resolved
          .filter(o => o.explicit === route && o.explicit !== "common")
          .filter(o => producedForms(o.route).has(form)
            && !routeSteps(o.route).some(s => s.machine === machine && s.form === form))
          .map(o => o.en));
        segments.push({ form, common: true, exclGroups });
      } else if (slot.specials.length) {
        segments.push({ form, common: false, only: slot.specials });
      }
    }
    if (!segments.length) continue;
    for (const seg of segments) seg.regex = segmentRegex(seg, namespace);
    cards.push(...packCards(machine, segments, namespace, opts.limit ?? 1024));
  }
  return cards;
}

// Segments on one machine OR together, so a card whose joined regex exceeds
// the filter length limit can split into several cards with the same total
// meaning — each part is a complete filter for its share of the forms. An
// oversized SPECIAL segment additionally splits by members (each chunk still
// abbreviated against the full list, see segmentRegex). An oversized COMMON
// segment cannot split — a negative lookahead only works whole — so it stays
// as-is and the UI flags it.
function splitSpecialSegment(seg, namespace, limit) {
  const fullSet = seg.fullSet ?? new Set(seg.only);
  const build = (names) => {
    const part = { ...seg, only: names, fullSet };
    part.regex = segmentRegex(part, namespace);
    return part;
  };
  const chunks = [];
  let batch = [];
  for (const n of [...seg.only].sort(byName)) {
    const trial = build([...batch, n]);
    if (trial.regex.length > limit && batch.length > 0) {
      chunks.push(build(batch));
      batch = [n];
    } else {
      batch = [...batch, n];
    }
  }
  if (batch.length) chunks.push(build(batch));
  return chunks;
}

function packCards(machine, segments, namespace, limit) {
  const units = [];
  for (const seg of segments) {
    if (!seg.common && seg.regex.length > limit) units.push(...splitSpecialSegment(seg, namespace, limit));
    else units.push(seg);
  }
  const groups = [];
  let cur = [];
  const lenOf = segs => segs.reduce((n, s) => n + s.regex.length + 1, -1);
  for (const u of units) {
    if (cur.length && lenOf([...cur, u]) > limit) { groups.push(cur); cur = [u]; }
    else cur.push(u);
  }
  if (cur.length) groups.push(cur);
  return groups.map((segs, i) => {
    const regex = segs.map(s => s.regex).join("|");
    return {
      machine, segments: segs, regex, length: regex.length,
      part: groups.length > 1 ? `${i + 1}/${groups.length}` : undefined,
    };
  });
}

// ---- Integrated Ore Factory mode ----
// One card per distinct route that maps to an IOF processing mode; the IOF
// ingests ore/raw ore and runs the whole chain internally.
export const IOF_MODES = {
  MPTM: 0, MPMC: 1, MMC: 2, MPS: 3, MBMC: 4, MBTM: 5, HHW: 6,
};

// The machine accepts every intermediate form and each mode's step chain
// picks up whatever arrives mid-chain (MTEIntegratedOreFactory.isValidOreInput
// plus the per-mode step switch). A form listed here entering that mode is
// finished; one not listed passes through unprocessed — MPS has no centrifuge
// so dusts idle through it, MPMC has no thermal step so centrifuged ore does.
const IOF_MODE_FORMS = {
  MPTM: ["oreRaw", "crushed", "crushedPurified", "crushedCentrifuged"],
  MPMC: ["oreRaw", "crushed", "crushedPurified", "dustImpure", "dustPure"],
  MMC: ["oreRaw", "crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"],
  MPS: ["oreRaw", "crushed", "crushedPurified"],
  MBMC: ["oreRaw", "crushed", "crushedPurified", "dustImpure", "dustPure"],
  MBTM: ["oreRaw", "crushed", "crushedPurified", "crushedCentrifuged"],
  HHW: ["oreRaw", "crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"],
};

export function generateIOF(config, namespace, opts = {}) {
  const { commonRoute, ores } = config;
  const limit = opts.limit ?? 1024;
  const groupOrder = [];
  for (const o of ores) {
    if (!groupOrder.includes(o.route)) groupOrder.push(o.route);
  }
  const cards = [];
  const unsupported = [];

  // A mode's card matches its members' ore/rawOre forms and — with stray
  // intermediates on — every intermediate form that mode's chain consumes,
  // so bee products and manual inserts ride the same filter to the same
  // machine. Splitting across the length limit works as in regular mode.
  const pushMemberCard = (mode, route, members) => {
    const segments = [];
    const oreSeg = { form: "oreRaw", common: false, only: members };
    oreSeg.regex = segmentRegex(oreSeg, namespace);
    segments.push(oreSeg);
    if (opts.strayIntermediates) {
      const forms = IOF_MODE_FORMS[route].filter(f => f !== "oreRaw");
      const seg = { form: forms[0], forms, common: false, only: members };
      seg.regex = segmentRegex(seg, namespace);
      segments.push(seg);
    }
    packCards("iof", segments, namespace, limit).forEach(card => {
      cards.push({ ...card, mode, route });
    });
  };
  if (IOF_MODES[commonRoute] === undefined) unsupported.push({ route: commonRoute, ores: ["(common logic)"] });
  else {
    // Every ore not routed elsewhere belongs to the common mode, listed or
    // not — so its ore/rawOre filter is a catch-all excluding the ores
    // routed to other modes, Do-not-process, or IOF-unsupported chains.
    const excluded = ores
      .filter(o => o.route !== commonRoute && o.route !== "common")
      .map(o => o.en);
    for (const seg of letterSplitCatchAll(excluded, namespace, limit)) {
      cards.push({ machine: "iof", mode: IOF_MODES[commonRoute], route: commonRoute,
        segments: [seg], regex: seg.regex, length: seg.regex.length });
    }
    // Intermediates have no catch-all: listed common-mode ores keep a
    // member card for them so bee products still find their machine.
    if (opts.strayIntermediates) {
      const members = ores
        .filter(o => o.route === commonRoute || o.route === "common")
        .map(o => o.en);
      if (members.length) {
        const forms = IOF_MODE_FORMS[commonRoute].filter(f => f !== "oreRaw");
        const seg = { form: forms[0], forms, common: false, only: members };
        seg.regex = segmentRegex(seg, namespace);
        packCards("iof", [seg], namespace, limit).forEach(card => {
          cards.push({ ...card, mode: IOF_MODES[commonRoute], route: commonRoute });
        });
      }
    }
  }

  for (const route of groupOrder) {
    if (route === "common" || route === "None" || route === commonRoute) continue;
    const members = ores.filter(o => o.route === route).map(o => o.en);
    if (!members.length) continue;
    if (IOF_MODES[route] === undefined) { unsupported.push({ route, ores: members }); continue; }
    pushMemberCard(IOF_MODES[route], route, members);
  }
  const perMode = new Map();
  for (const c of cards) perMode.set(c.mode, (perMode.get(c.mode) || 0) + 1);
  const seen = new Map();
  for (const c of cards) {
    const i = (seen.get(c.mode) || 0) + 1;
    seen.set(c.mode, i);
    c.part = perMode.get(c.mode) > 1 ? `${i}/${perMode.get(c.mode)}` : undefined;
  }
  return { cards, unsupported };
}

// ---- IOF common-mode catch-all, split by material initial ----
// A negative-lookahead catch-all cannot be split by members (each half would
// admit the other half's exclusions), so it splits by the material's first
// letter instead: card k matches only materials starting in its letter range
// and so only needs that range's exclusions.
//
// Stone variants make "the material's first letter" ambiguous — in
// oreMoonIlmenite an optional stone infix could be skipped and "Moon" read as
// the material. The stone is therefore consumed atomically, via a capture
// inside a lookahead plus a backreference: (?=(STONE(?=[A-Z])|))\1. Lookaheads
// never backtrack, and the empty alternative keeps group 1 participating (a
// Java backreference to a non-participating group fails). Identical in Java
// (the in-game filters) and JavaScript (this site and its tests).
//
// A material that itself begins with a stone name followed by a capital
// (CallistoIce) parses as the remainder ("Ice"), so an excluded one is listed
// under both readings.
function stoneParse(name) {
  for (const stone of ["Small", ...STONE_INFIXES]) {
    if (name.length > stone.length && name.startsWith(stone) && /[A-Z]/.test(name[stone.length])) {
      return name.slice(stone.length);
    }
  }
  return name;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CONSUME_STONE = `(?=((?:Small|${STONE_INFIXES.join("|")})(?=[A-Z])|))\\1`;

function letterSplitCatchAll(excluded, namespace, limit) {
  // Strings that can follow the consumed stone: every material as written,
  // plus the remainder reading of stone-prefixed ones.
  const parsedNs = [...new Set([...namespace, ...namespace.map(stoneParse)])];
  const entries = [];
  for (const en of excluded) {
    entries.push({ en, key: en });
    const parsed = stoneParse(en);
    if (parsed !== en) entries.push({ en, key: parsed });
  }
  const fullSet = new Set(entries.map(e => e.key));

  const build = (lo, hi) => {
    const range = lo === hi ? LETTERS[lo] : `${LETTERS[lo]}-${LETTERS[hi]}`;
    const inRange = entries.filter(e => {
      const i = LETTERS.indexOf(e.key[0].toUpperCase());
      return i >= lo && i <= hi;
    });
    const keys = [...new Set(inRange.map(e => e.key))];
    const veto = keys.length ? `(?!${alternation([keys], parsedNs, fullSet)}$)` : "";
    const regex = `^${FORMS.oreRaw.re}${CONSUME_STONE}${veto}[${range}].*$`;
    return {
      form: "oreRaw", common: true, letterRange: range.replace("-", "\u2013"),
      exclGroups: [[...new Set(inRange.map(e => e.en))]], regex,
    };
  };

  // Fewest contiguous letter ranges whose cards all fit; among splits of that
  // count, the one with the shortest longest card.
  const n = LETTERS.length;
  const splitsOf = (parts) => {
    if (parts === 1) return [[]];
    const out = [];
    const rec = (start, left, acc) => {
      if (left === 0) { out.push(acc); return; }
      for (let c = start; c <= n - left; c++) rec(c + 1, left - 1, [...acc, c]);
    };
    rec(1, parts - 1, []);
    return out;
  };
  for (let parts = 1; parts <= n; parts++) {
    let best = null;
    for (const cuts of splitsOf(parts)) {
      const bounds = [0, ...cuts, n];
      const segs = [];
      for (let i = 0; i < parts; i++) segs.push(build(bounds[i], bounds[i + 1] - 1));
      const worst = Math.max(...segs.map(s => s.regex.length));
      if (worst <= limit && (!best || worst < best.worst)) best = { segs, worst };
    }
    if (best) return best.segs;
  }
  return [build(0, n - 1)];
}

// ---- Compound-dust decomposition cards ----
// One card per decomposition machine matching final dusts of compound ore
// materials. Splits into multiple regexes when over the filter length limit.
//
// `host` is an optional ore-processing card for the same physical machine (the
// centrifuge runs both jobs). Given one, its segments lead the first card and
// take their share of that card's budget, so a single filter drives both; any
// dusts that no longer fit spill into decomposition-only cards as usual. The
// dust form's guard — (?!Impure|Pure|Small|Tiny) — is what keeps the merged
// alternation from stealing the host's dustImpure/dustPure inputs.
export function generateDecomposition(materials, machine, dustNamespace, limit = 1024, host = null) {
  const sorted = [...materials].sort(byName);
  const cards = [];
  let batch = [];
  const build = (names) => {
    const seg = { form: "dust", common: false, only: names };
    seg.regex = segmentRegex(seg, dustNamespace);
    return seg;
  };
  const emit = (seg) => {
    const merged = host && cards.length === 0;
    const segments = merged ? [...host.segments, seg] : [seg];
    const regex = segments.map(s => s.regex).join("|");
    cards.push({ machine: merged ? host.machine : machine, merged: !!merged, segments, regex, length: regex.length });
  };
  for (const name of sorted) {
    // Only the first card pays for the host, plus the "|" that joins them.
    const budget = host && cards.length === 0 ? limit - host.regex.length - 1 : limit;
    const trial = build([...batch, name]);
    if (trial.regex.length > budget && batch.length > 0) {
      emit(build(batch));
      batch = [name];
    } else {
      batch = [...batch, name];
    }
  }
  if (batch.length) emit(build(batch));
  else if (host) cards.push({ ...host, merged: true });
  return cards;
}

// ---- URL fragment (de)serialization, compatible with the huijiwiki tool ----
// #common=MMC;special=MPS:[A+B+C],MTM:[D],...
export function encodeFragment(config) {
  const groups = new Map();
  for (const o of config.ores) {
    if (!groups.has(o.route)) groups.set(o.route, []);
    groups.get(o.route).push(o.en);
  }
  const special = [...groups.entries()].map(([r, names]) => `${r}:[${names.join("+")}]`).join(",");
  return `common=${config.commonRoute};special=${special}`;
}

export function decodeFragment(fragment) {
  const frag = decodeURIComponent(fragment.replace(/^#/, ""));
  const m = frag.match(/common=([^;]+);special=(.*)$/);
  if (!m) return null;
  const ores = [];
  for (const part of m[2].matchAll(/([\w-]+):\[([^\]]*)\]/g)) {
    for (const en of part[2].split("+").filter(Boolean)) ores.push({ en, route: part[1] });
  }
  return { commonRoute: m[1], ores };
}
