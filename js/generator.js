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
function alternation(groups, namespace) {
  const prefixes = [];
  const exacts = [];
  for (const group of groups) {
    const sorted = [...group].sort(byName);
    for (const n of sorted) {
      const a = abbreviate(n, namespace);
      if (a.exact) exacts.push(n);
      else prefixes.push(a.prefix);
    }
  }
  const parts = [];
  if (prefixes.length) parts.push(`(?:${prefixes.join("|")}).*`);
  parts.push(...exacts);
  return `(?:${parts.join("|")})`;
}

// A segment: one input form on one machine card.
//   common: ^form[guard](?!EXCL$)[A-Z].*$   special: ^form(?:...)$
function segmentRegex(seg, namespace) {
  const form = FORMS[seg.form];
  if (seg.common) {
    const guard = form.guard || "";
    const excl = seg.exclGroups.some(g => g.length)
      ? `(?!${alternation(seg.exclGroups.filter(g => g.length), namespace)}$)`
      : "";
    return `^${form.re}${guard}${excl}[A-Z].*$`;
  }
  return `^${form.re}${alternation([seg.only], namespace)}$`;
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
    const regex = segments.map(s => s.regex).join("|");
    cards.push({ machine, segments, regex, length: regex.length });
  }
  return cards;
}

// ---- Integrated Ore Factory mode ----
// One card per distinct route that maps to an IOF processing mode; the IOF
// ingests ore/raw ore and runs the whole chain internally.
export const IOF_MODES = {
  MPTM: 0, MPMC: 1, MMC: 2, MPS: 3, MBMC: 4, MBTM: 5, HHW: 6,
};

export function generateIOF(config, namespace) {
  const { commonRoute, ores } = config;
  const groupOrder = [];
  for (const o of ores) {
    if (!groupOrder.includes(o.route)) groupOrder.push(o.route);
  }
  const cards = [];
  const unsupported = [];

  if (IOF_MODES[commonRoute] === undefined) unsupported.push({ route: commonRoute, ores: ["(common logic)"] });
  else {
    const exclGroups = groupOrder.map(route => route === "common"
      ? []
      : ores.filter(o => o.route === route && o.route !== commonRoute).map(o => o.en));
    const seg = { form: "oreRaw", common: true, exclGroups };
    seg.regex = segmentRegex(seg, namespace);
    cards.push({ machine: "iof", mode: IOF_MODES[commonRoute], route: commonRoute, segments: [seg], regex: seg.regex, length: seg.regex.length });
  }

  for (const route of groupOrder) {
    if (route === "common" || route === "None" || route === commonRoute) continue;
    const members = ores.filter(o => o.route === route).map(o => o.en);
    if (!members.length) continue;
    if (IOF_MODES[route] === undefined) { unsupported.push({ route, ores: members }); continue; }
    const seg = { form: "oreRaw", common: false, only: members };
    seg.regex = segmentRegex(seg, namespace);
    cards.push({ machine: "iof", mode: IOF_MODES[route], route, segments: [seg], regex: seg.regex, length: seg.regex.length });
  }
  return { cards, unsupported };
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
