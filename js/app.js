import { NAMESPACE, DEFAULT_ORES } from "./data.js";
import {
  MACHINES, ROUTES, routeLabel, generate, generateIOF,
  encodeFragment, decodeFragment,
} from "./generator.js";

const CHAR_LIMIT = 1024;
const COMMON_CHOICES = ["MPTM", "MPMC", "MMC", "MHW", "HHW"];
const ROUTE_OPTIONS = ["common", "MPTM", "MPMC", "MMC", "MHW", "HHW", "MPS", "MTM", "MBMC", "MBTM", "M", "H", "MM", "MP", "None"];
const MACHINE_ORDER = ["macerator", "washer", "chembath", "thermal", "sifter", "centrifuge", "hammer", "simplewasher"];

const oreMeta = new Map(DEFAULT_ORES.map(o => [o.en, o]));

// Human-readable names where GT's display name differs from a plain
// camelCase split of the oredict name.
const DISPLAY_OVERRIDES = {
  GarnetRed: "Red Garnet",
  GarnetYellow: "Yellow Garnet",
  Cooperite: "Sheldonite",
  LanthaniteLa: "Lanthanite (La)",
  HeeEndium: "Endium (HEE)",
  HeeEndPowder: "End Powder (HEE)",
  HeeIgneousRock: "Igneous Rock (HEE)",
  HeeStardust: "Stardust (HEE)",
  HeeInstabilityOrb: "Instability Orb (HEE)",
  Debris: "Ancient Debris",
  Oilsands: "Oil Sands",
  BArTiMaEuSNeK: "",
  TricalciumPhosphate: "Tricalcium Phosphate (Apatite)",
};

function displayName(en) {
  if (en in DISPLAY_OVERRIDES) return DISPLAY_OVERRIDES[en];
  const spaced = en.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced === en ? "" : spaced;
}

const state = {
  commonRoute: "MMC",
  ores: DEFAULT_ORES.map(o => ({ en: o.en, route: o.route })),
  mode: "regular",
  sort: "route",
  strayIntermediates: true,
};

// ---------- fragment sync ----------

function loadFromFragment() {
  if (!location.hash) return;
  const config = decodeFragment(location.hash);
  if (config && ROUTES[config.commonRoute]) {
    state.commonRoute = config.commonRoute;
    state.ores = config.ores.filter(o => ROUTES[o.route]);
  }
}

function syncFragment() {
  history.replaceState(null, "", "#" + encodeFragment(state));
}

// ---------- rendering ----------

const $ = sel => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function renderRoutePicker() {
  const picker = $("#route-picker");
  picker.replaceChildren(...COMMON_CHOICES.map(code =>
    el("button", {
      class: "route-card" + (state.commonRoute === code ? " is-active" : ""),
      onclick: () => { state.commonRoute = code; update(); },
    },
      el("div", { class: "route-chain" }, routeLabel(code)),
      el("div", { class: "route-note" }, ROUTES[code].note || ""),
    )));
}

function sortedOres() {
  const ores = [...state.ores];
  if (state.sort === "name") {
    ores.sort((a, b) => a.en.toLowerCase().localeCompare(b.en.toLowerCase()));
  } else {
    const order = [];
    for (const o of state.ores) if (!order.includes(o.route)) order.push(o.route);
    ores.sort((a, b) => order.indexOf(a.route) - order.indexOf(b.route)
      || a.en.toLowerCase().localeCompare(b.en.toLowerCase()));
  }
  return ores;
}

function renderOreGrid() {
  const grid = $("#ore-grid");
  grid.replaceChildren(...sortedOres().map(ore => {
    const meta = oreMeta.get(ore.en);
    const select = el("select", {
      class: "ore-route",
      onchange: e => { ore.route = e.target.value; update(); },
    }, ...ROUTE_OPTIONS.map(code => {
      const opt = el("option", { value: code }, routeLabel(code));
      if (code === ore.route) opt.selected = true;
      return opt;
    }));
    return el("div", { class: "ore-card" + (ore.route === "None" ? " is-none" : "") },
      meta?.icon
        ? el("img", { class: "ore-icon", src: "icons/" + meta.icon, alt: "" })
        : el("div", { class: "ore-icon" }),
      el("div", { class: "ore-names" },
        el("div", { class: "ore-en", title: ore.en }, ore.en),
        el("div", { class: "ore-sub" }, displayName(ore.en) || " "),
      ),
      el("button", {
        class: "ore-remove", title: "Remove " + ore.en,
        onclick: () => { state.ores = state.ores.filter(o => o !== ore); update(); },
      }, "×"),
      select,
    );
  }));
}

function formatOreList(names) {
  return names.join(", ");
}

function segmentDescription(seg, config) {
  const wrap = el("div", { class: "segment" });
  wrap.append(el("span", { class: "form-tag" }, seg.formLabel));
  if (seg.common) {
    wrap.append(el("span", { class: "logic-tag" }, "common logic"));
    const excluded = seg.exclGroups.flat();
    wrap.append(document.createTextNode(excluded.length
      ? " every ore except: "
      : " every ore"));
    if (excluded.length) wrap.append(el("span", { class: "ore-list" }, formatOreList(excluded)));
  } else {
    wrap.append(el("span", { class: "logic-tag" }, "special logic"));
    wrap.append(document.createTextNode(" only: "));
    wrap.append(el("span", { class: "ore-list" }, formatOreList(seg.only)));
  }
  return wrap;
}

function machineCard({ title, sub, icon, regex, segments, modeTag }, config) {
  const over = regex.length > CHAR_LIMIT;
  const box = el("textarea", { class: "regex-box" + (over ? " is-over" : ""), readonly: "" });
  box.value = regex;
  const copyBtn = el("button", {
    class: "copy-btn",
    onclick: async e => {
      await navigator.clipboard.writeText(regex);
      e.target.classList.add("is-copied");
      e.target.textContent = "Copied";
      setTimeout(() => { e.target.classList.remove("is-copied"); e.target.textContent = "Copy"; }, 1200);
    },
  }, "Copy");
  const head = el("div", { class: "machine-head" },
    el("img", { src: "icons/" + icon, alt: "" }),
    el("div", { class: "machine-title" },
      el("h3", {}, title),
      el("div", { class: "multi" }, sub),
    ),
    el("div", { class: "machine-meta" },
      ...(modeTag ? [el("span", { class: "iof-mode-tag" }, modeTag)] : []),
      el("span", { class: "char-count" + (over ? " is-over" : "") }, `${regex.length}/${CHAR_LIMIT}`),
      copyBtn,
    ));
  const body = el("div", { class: "machine-body" }, box,
    el("div", { class: "segments" }, ...segments.map(s => segmentDescription(s, config))));
  return el("div", { class: "machine-card" }, head, body);
}

const FORM_LABELS = {
  oreRaw: "ore / rawOre", crushed: "crushed", crushedPurified: "crushedPurified",
  crushedCentrifuged: "crushedCentrifuged", dustImpure: "dustImpure", dustPure: "dustPure",
};

function renderOutputs() {
  const col = $("#output-col");
  const config = { commonRoute: state.commonRoute, ores: state.ores };
  const cards = [];

  if (state.mode === "regular") {
    const generated = generate(config, NAMESPACE, { strayIntermediates: state.strayIntermediates });
    generated.sort((a, b) => MACHINE_ORDER.indexOf(a.machine) - MACHINE_ORDER.indexOf(b.machine));
    for (const card of generated) {
      const m = MACHINES[card.machine];
      cards.push(machineCard({
        title: m.label, sub: m.multi, icon: m.icon, regex: card.regex,
        segments: card.segments.map(s => ({ ...s, formLabel: FORM_LABELS[s.form] })),
      }, config));
    }
  } else {
    const { cards: iofCards, unsupported } = generateIOF(config, NAMESPACE);
    iofCards.sort((a, b) => a.mode - b.mode);
    for (const card of iofCards) {
      cards.push(machineCard({
        title: "Integrated Ore Factory",
        sub: routeLabel(card.route),
        icon: "machine_macerator.png",
        regex: card.regex,
        modeTag: "mode " + (card.mode + 1),
        segments: card.segments.map(s => ({ ...s, formLabel: FORM_LABELS[s.form] })),
      }, config));
    }
    for (const u of unsupported) {
      cards.push(el("div", { class: "warn-card" },
        `No Integrated Ore Factory mode runs the "${routeLabel(u.route)}" chain — handle these with individual machines: ${u.ores.join(", ")}.`));
    }
  }
  col.replaceChildren(...cards);
}

function renderAddControls() {
  const present = new Set(state.ores.map(o => o.en));
  $("#ore-names").replaceChildren(
    ...NAMESPACE.filter(n => !present.has(n)).map(n => el("option", { value: n })));
  const routeSel = $("#add-route");
  if (!routeSel.options.length) {
    routeSel.replaceChildren(...ROUTE_OPTIONS.filter(r => r !== "common").map(code =>
      el("option", { value: code }, routeLabel(code))));
  }
}

function update() {
  syncFragment();
  renderRoutePicker();
  renderOreGrid();
  renderAddControls();
  renderOutputs();
}

// ---------- toast ----------

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-show"), 1800);
}

// ---------- wire up ----------

$("#mode-regular").addEventListener("click", () => {
  state.mode = "regular";
  $("#mode-regular").classList.add("is-active");
  $("#mode-iof").classList.remove("is-active");
  renderOutputs();
});
$("#mode-iof").addEventListener("click", () => {
  state.mode = "iof";
  $("#mode-iof").classList.add("is-active");
  $("#mode-regular").classList.remove("is-active");
  renderOutputs();
});

$("#share-btn").addEventListener("click", async () => {
  syncFragment();
  await navigator.clipboard.writeText(location.href);
  toast("Config link copied");
});

$("#add-btn").addEventListener("click", () => {
  const input = $("#add-input");
  const name = input.value.trim();
  if (!name) return;
  if (state.ores.some(o => o.en === name)) { toast(name + " is already listed"); return; }
  state.ores.push({ en: name, route: $("#add-route").value });
  input.value = "";
  update();
  toast(name + " added");
});
$("#add-input").addEventListener("keydown", e => {
  if (e.key === "Enter") $("#add-btn").click();
});

for (const btn of document.querySelectorAll(".sort-btn")) {
  btn.addEventListener("click", () => {
    state.sort = btn.dataset.sort;
    for (const b of document.querySelectorAll(".sort-btn")) b.classList.toggle("is-active", b === btn);
    renderOreGrid();
  });
}

$("#stray-toggle").addEventListener("change", (e) => {
  state.strayIntermediates = e.target.checked;
  renderOutputs();
});

$("#defaults-btn").addEventListener("click", () => {
  state.commonRoute = "MMC";
  state.ores = DEFAULT_ORES.map(o => ({ en: o.en, route: o.route }));
  update();
  toast("Defaults restored");
});

$("#clear-btn").addEventListener("click", () => {
  state.ores = [];
  update();
});

loadFromFragment();
update();
