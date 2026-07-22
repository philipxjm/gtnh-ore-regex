// Validates the generator against the six regexes produced by the original
// huijiwiki tool for the reference config (see README). Byte differences are
// reported; semantic differences (different match sets over the synthetic
// item universe) are failures unless they stem from the five documented
// namespace divergences where our source-derived namespace is stricter.
import { NAMESPACE } from "../js/data.js";
import { generate, decodeFragment } from "../js/generator.js";

const FRAGMENT = "common=MMC;special=MPS:[Amber+Amethyst+BlueTopaz+Cassiterite+CertusQuartz+ChargedCertusQuartz+Cinnabar+Diamond+Dilithium+Forcicium+Forcillium+GarnetRed+GarnetYellow+GreenSapphire+InfusedAir+InfusedEarth+InfusedEntropy+InfusedFire+InfusedOrder+InfusedWater+NetherQuartz+NetherStar+Opal+Prasiolite+Quartz+QuartzSand+Quartzite+RedZircon+Tanzanite+Tin+Topaz+TricalciumPhosphate],MPTM:[BArTiMaEuSNeK+Pollucite],MTM:[Chalcopyrite+Pyrochlore],MPMC:[Chromo-Alumino-Povondraite+Fluor-Buergerite+Irarsite+Kashinite+LanthaniteLa+Olenite+Vanadio-Oxy-Dravite+Yttrialite],MBTM:[Cooperite+Iridium+MeteoricIron+Nickel+Osmium+Platinum],None:[Debris+Oilsands],MMC:[DeepIron+Honeaite+Lafossaite],M:[HeeEndium+HeeEndPowder+HeeIgneousRock+HeeStardust],common:[HeeInstabilityOrb],MBMC:[Mithril+PlatinumMetallicPowder]";

const HUIJI = {
  macerator: String.raw`^(?:ore|rawOre)(?!(?:(?:Deb|Oi).*)$)[A-Z].*$|^crushed(?!Purified|Centrifuged)(?!(?:(?:Amb|Amet|Blu|Cert|Char|Ci|Diam|Dil|Forcic|Forcil|GarnetR|GarnetY|GreenS|InfusedA|InfusedEa|InfusedEn|InfusedF|InfusedO|InfusedW|NetherQ|NetherS|Op|Prasi|QuartzS|Quartzi|RedZ|Tanz|To|Tric|BA|Poll|Chal|Pyroc|Chromo|Fluor-|Ira|Kas|LanthaniteL|Ole|Vanadio|Yttrial|Coo|Me|Nick|Os|HeeEndi|HeeEndP|HeeIg|HeeS|Mit|PlatinumM).*|Cassiterite|Quartz|Tin|Iridium|Platinum)$)[A-Z].*$|^crushedPurified(?:(?:Chromo|Fluor-|Ira|Kas|LanthaniteL|Mit|Ole|PlatinumM|Vanadio|Yttrial).*)$|^crushedCentrifuged(?:(?:BA|Chal|Coo|Me|Nick|Os|Poll|Pyroc).*|Iridium|Platinum)$`,
  washer: String.raw`^crushed(?:(?:Amb|Amet|BA|Blu|Cert|Char|Chromo|Ci|Diam|Dil|Fluor-|Forcic|Forcil|GarnetR|GarnetY|GreenS|InfusedA|InfusedEa|InfusedEn|InfusedF|InfusedO|InfusedW|Ira|Kas|LanthaniteL|NetherQ|NetherS|Ole|Op|Poll|Prasi|QuartzS|Quartzi|RedZ|Tanz|To|Tric|Vanadio|Yttrial).*|Cassiterite|Quartz|Tin)$`,
  chembath: String.raw`^crushed(?:(?:Coo|Me|Mit|Nick|Os|PlatinumM).*|Iridium|Platinum)$`,
  centrifuge: String.raw`^dustImpure[A-Z].*$|^dustPure(?:(?:Chromo|Fluor-|Ira|Kas|LanthaniteL|Mit|Ole|PlatinumM|Vanadio|Yttrial).*)$`,
  thermal: String.raw`^crushed(?:(?:Chal|Pyroc).*)$|^crushedPurified(?:(?:BA|Coo|Me|Nick|Os|Poll).*|Iridium|Platinum)$`,
  sifter: String.raw`^crushedPurified(?:(?:Amb|Amet|Blu|Cert|Char|Ci|Diam|Dil|Forcic|Forcil|GarnetR|GarnetY|GreenS|InfusedA|InfusedEa|InfusedEn|InfusedF|InfusedO|InfusedW|NetherQ|NetherS|Op|Prasi|QuartzS|Quartzi|RedZ|Tanz|To|Tric).*|Cassiterite|Quartz|Tin)$`,
};

// Namespace entries the huiji tool lacks; they force longer (stricter)
// prefixes on our side: Blutonium->Blu(e), Mercassium/Meteorite->Me(teoricI),
// Osmonium->Os(mi), Yttrium->Yttrial(i). Semantic diffs on these names only
// are accepted.
const KNOWN_STRICTER = new Set(["Blutonium", "Mercassium", "Meteorite", "Osmonium", "Yttrium"]);

const config = decodeFragment(FRAGMENT);
const cards = generate(config, NAMESPACE);
const mine = Object.fromEntries(cards.map(c => [c.machine, c.regex]));

const FORMS = ["ore", "rawOre", "crushed", "crushedPurified", "crushedCentrifuged", "dustImpure", "dustPure"];
const universe = NAMESPACE.flatMap(n => FORMS.map(f => f + n));

let fail = 0;
for (const machine of Object.keys(HUIJI)) {
  const a = HUIJI[machine];
  const b = mine[machine];
  if (!b) { console.log(`FAIL ${machine}: no card generated`); fail++; continue; }
  const byteEq = a === b;
  const ra = new RegExp(a);
  const rb = new RegExp(b);
  const diffs = universe.filter(item => ra.test(item) !== rb.test(item));
  const unexplained = diffs.filter(d => ![...KNOWN_STRICTER].some(k => d.endsWith(k)));
  const status = unexplained.length ? "FAIL" : byteEq ? "OK (byte-identical)" : "OK (semantically equal, stricter prefixes)";
  if (unexplained.length) fail++;
  console.log(`${status}  ${machine}  len ${b.length}/${a.length}`);
  if (!byteEq && !unexplained.length) {
    const explained = diffs.length ? ` — stricter on: ${diffs.join(", ")}` : "";
    console.log(`   cosmetic byte diff${explained}`);
  }
  for (const d of unexplained.slice(0, 10)) {
    console.log(`   DIFF ${d}: huiji=${ra.test(d)} mine=${rb.test(d)}`);
  }
}
if (Object.keys(mine).length !== Object.keys(HUIJI).length) {
  console.log(`NOTE: generated ${Object.keys(mine).length} cards, huiji had ${Object.keys(HUIJI).length}: [${Object.keys(mine)}]`);
}
process.exit(fail ? 1 : 0);
