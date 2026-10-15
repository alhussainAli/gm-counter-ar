/* Radiation–Matter Interaction AR — transport engine (educational Monte Carlo).
 * Units: cm, MeV, g/cm³. One call to simulate() returns a complete history:
 * particle tracks (with times), ionization / excitation points, discrete
 * interactions with their atomic detail, an energy ledger and a depth-dose tally.
 * Browser: window.RP · Node: module.exports */
(function (root) {
'use strict';
const ME = 0.5109989, MP = 938.272, MA = 3727.379, MN = 939.565, NA = 6.02214076e23, RE2 = 7.9407877e-26, ALPHA = 1 / 137.036;

// ---------------------------------------------------------------- random numbers
let rng = Math.random;
function seed(s) { let a = s >>> 0; rng = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = () => rng();
function gauss() { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
function poisson(l) { if (l <= 0) return 0; if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss())); const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
function iso() { const c = 2 * R() - 1, s = Math.sqrt(1 - c * c), f = 2 * Math.PI * R(); return [s * Math.cos(f), s * Math.sin(f), c]; }
function rot(d, ct, phi) {
  const st = Math.sqrt(Math.max(0, 1 - ct * ct)), cp = Math.cos(phi), sp = Math.sin(phi), [u, v, w] = d;
  if (Math.abs(w) > 0.99999) return norm([st * cp, st * sp, ct * Math.sign(w)]);
  const s = Math.sqrt(1 - w * w);
  return norm([u * ct + st * (u * w * cp - v * sp) / s, v * ct + st * (v * w * cp + u * sp) / s, w * ct - s * st * cp]);
}
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
const add = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];

// ---------------------------------------------------------------- atomic data
// Binding energies (keV): X-ray Data Booklet Table 1-1 (LBNL). Outer-shell values = first ionization energy.
// x-ray lines (keV): X-ray Data Booklet Table 1-2. ωK: Krause, J. Phys. Chem. Ref. Data 8 (1979) 307.
const EL = {
  H:  { Z: 1, A: 1.008, shells: [['K', 0.0136, 1]], wK: 0, draw: [1] },
  C:  { Z: 6, A: 12.011, shells: [['K', 0.2842, 2], ['L', 0.01126, 4]], wK: 0.0028, Ka: 0.277, Kb: 0.277, Lout: 0.0113, draw: [2, 4] },
  N:  { Z: 7, A: 14.007, shells: [['K', 0.4099, 2], ['L1', 0.0373, 2], ['L23', 0.01453, 3]], wK: 0.0052, Ka: 0.3924, Kb: 0.3924, draw: [2, 5] },
  O:  { Z: 8, A: 15.999, shells: [['K', 0.5431, 2], ['L1', 0.0416, 2], ['L23', 0.01362, 4]], wK: 0.0083, Ka: 0.5249, Kb: 0.5249, draw: [2, 6] },
  Al: { Z: 13, A: 26.982, shells: [['K', 1.5596, 2], ['L1', 0.1178, 2], ['L23', 0.0727, 6], ['M', 0.00599, 3]], wK: 0.039, Ka: 1.4867, Kb: 1.5575, draw: [2, 8, 3] },
  Si: { Z: 14, A: 28.085, shells: [['K', 1.839, 2], ['L1', 0.1497, 2], ['L23', 0.0996, 6], ['M', 0.00815, 4]], wK: 0.050, Ka: 1.7400, Kb: 1.8359, draw: [2, 8, 4] },
  Ca: { Z: 20, A: 40.078, shells: [['K', 4.0385, 2], ['L1', 0.4384, 2], ['L23', 0.3484, 6], ['M', 0.0254, 8], ['N', 0.00611, 2]], wK: 0.163, Ka: 3.6917, Kb: 4.0127, draw: [2, 8, 8, 2] },
  Ar: { Z: 18, A: 39.948, shells: [['K', 3.2059, 2], ['L1', 0.3263, 2], ['L23', 0.2484, 6], ['M', 0.01576, 8]], wK: 0.118, Ka: 2.9577, Kb: 3.1905, draw: [2, 8, 8] },
  Pb: { Z: 82, A: 207.2, shells: [['K', 88.005, 2], ['L1', 15.861, 2], ['L2', 15.200, 2], ['L3', 13.035, 4], ['M', 3.066, 18], ['N', 0.6435, 32], ['O', 0.020, 18], ['P', 0.00742, 4]],
        wK: 0.963, wL: 0.32, Ka: 74.9694, Ka2: 72.8042, Kb: 84.936, La: 10.5515, Lb: 12.6137, draw: [2, 8, 18, 32, 18, 4] }
};
for (const e of Object.values(EL)) e.J = 125 / e.Z + 3.5; // approximate K-edge jump ratio (Pb ≈ 4.0 from NIST data)

// ---------------------------------------------------------------- materials
// Photon μ/ρ (cm²/g): NIST XCOM / Hubbell–Seltzer tables. ρ, ⟨Z/A⟩, I, composition: NIST Tables 1–2.
// X0 (g/cm²) and Sternheimer density-effect parameters: PDG atomic & nuclear properties.
const EG = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000].map(e => e / 1000);
const MAT = {
  air: { name: 'Air', color: '#8fd3ff', opacity: 0.07, rho: 1.205e-3, ZA: 0.49919, I: 85.7, X0: 36.62, Zb: 7.3, W: 33.97, ex: 0.55, n: 1.000293,
    st: [10.5961, 1.7418, 4.2759, 0.10914, 3.3994], comp: [['N', 0.7553], ['O', 0.2318], ['Ar', 0.0128]],
    mu: [3606, 1191, 527.9, 162.5, 77.88, 40.27, 23.41, 9.921, 5.12, 1.614, 0.7779, 0.3538, 0.2485, 0.208, 0.1875, 0.1662, 0.1541, 0.1356, 0.1233, 0.1067, 0.09549, 0.08712, 0.08055, 0.07074, 0.06358, 0.05687, 0.05175, 0.04447, 0.03581, 0.03079, 0.02751, 0.02522, 0.02225, 0.02045, 0.0181, 0.01705] },
  water: { name: 'Water', color: '#2f7dff', opacity: 0.26, rho: 1.0, ZA: 0.55508, I: 75.0, X0: 36.08, Zb: 7.4, W: 22, ex: 0.7, n: 1.333,
    st: [3.5017, 0.24, 2.8004, 0.09116, 3.4773], comp: [['H', 0.1119], ['O', 0.8881]],
    mu: [4078, 1376, 617.3, 192.9, 82.78, 42.58, 24.64, 10.37, 5.329, 1.673, 0.8096, 0.3756, 0.2683, 0.2269, 0.2059, 0.1837, 0.1707, 0.1505, 0.137, 0.1186, 0.1061, 0.09687, 0.08956, 0.07865, 0.07072, 0.06323, 0.05754, 0.04942, 0.03969, 0.03403, 0.03031, 0.0277, 0.02429, 0.02219, 0.01941, 0.01813] },
  pe: { name: 'Polyethylene', color: '#e9eef3', opacity: 0.3, rho: 0.93, ZA: 0.57033, I: 57.4, X0: 44.77, Zb: 5.4, W: 24, ex: 0.7, n: 1.51,
    st: [3.0016, 0.137, 2.5177, 0.12108, 3.4292], comp: [['H', 0.1437], ['C', 0.8563]],
    mu: [1894, 599.9, 259.3, 77.43, 32.42, 16.43, 9.432, 3.975, 2.088, 0.7452, 0.4315, 0.2706, 0.2275, 0.2084, 0.197, 0.1823, 0.1719, 0.1534, 0.1402, 0.1217, 0.1089, 0.09947, 0.09198, 0.08078, 0.07262, 0.06495, 0.0591, 0.05064, 0.04045, 0.03444, 0.03045, 0.0276, 0.02383, 0.02145, 0.01819, 0.01658] },
  al: { name: 'Aluminium', color: '#c3ccd6', opacity: 0.32, rho: 2.699, ZA: 0.48181, I: 166, X0: 24.01, Zb: 13, W: 22, ex: 0.6, n: null,
    st: [4.2395, 0.1708, 3.0127, 0.08024, 3.6345], comp: [['Al', 1]], edges: [[1.5596e-3, 362.1, 3957]],
    mu: [1185, 402.2, 2263, 788, 360.5, 193.4, 115.3, 50.33, 26.23, 7.955, 3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1378, 0.1223, 0.1042, 0.09276, 0.08445, 0.07802, 0.06841, 0.06146, 0.05496, 0.05006, 0.04324, 0.03541, 0.03106, 0.02836, 0.02655, 0.02437, 0.02318, 0.02195, 0.02168] },
  concrete: { name: 'Concrete', color: '#c2ac86', opacity: 0.38, rho: 2.3, ZA: 0.50932, I: 124.5, X0: 26.57, Zb: 11, W: 25, ex: 0.6, n: null,
    st: [3.9464, 0.1301, 3.0466, 0.07515, 3.5467], comp: [['H', 0.0221], ['C', 0.0025], ['O', 0.5749], ['Al', 0.0200], ['Si', 0.3211], ['Ca', 0.0594]],
    mu: [3466, 1227, 1368, 464.6, 218.8, 140.1, 84.01, 38.78, 20.45, 6.351, 2.806, 0.9601, 0.5058, 0.3412, 0.266, 0.2014, 0.1738, 0.1436, 0.1282, 0.1097, 0.09783, 0.08915, 0.08236, 0.07227, 0.06495, 0.05807, 0.05288, 0.04557, 0.03701, 0.03217, 0.02908, 0.02697, 0.02432, 0.02278, 0.02096, 0.0203] },
  pb: { name: 'Lead', color: '#6d7a96', opacity: 0.55, rho: 11.35, ZA: 0.39575, I: 823, X0: 6.37, Zb: 82, W: 20, ex: 0.6, n: null,
    st: [6.2018, 0.3776, 3.8073, 0.09359, 3.1608], comp: [['Pb', 1]], edges: [[0.0880045, 1.91, 7.683], [0.0158608, 134.4, 154.8], [0.0152, 107.8, 148.5], [0.0130352, 67.01, 162.1]],
    mu: [5210, 2356, 1285, 1965, 1251, 730.4, 467.2, 228.7, 130.6, 111.6, 86.36, 30.32, 14.36, 8.041, 5.021, 2.419, 5.549, 2.014, 0.9985, 0.4031, 0.2323, 0.1614, 0.1248, 0.0887, 0.07102, 0.05876, 0.05222, 0.04606, 0.04234, 0.04197, 0.04272, 0.04391, 0.04675, 0.04972, 0.05658, 0.06206] }
};
for (const m of Object.values(MAT)) {
  m.els = m.comp.map(([s, w]) => ({ s, w, e: EL[s], N: m.rho * w * NA / EL[s].A }));       // atoms/cm³
  m.Zeff = m.comp.reduce((a, [s, w]) => a + w * EL[s].Z * EL[s].Z / EL[s].A, 0) / m.comp.reduce((a, [s, w]) => a + w * EL[s].Z / EL[s].A, 0);
}

// ---------------------------------------------------------------- photon interaction coefficients
function muTot(m, E) { // log-log interpolation in the NIST table, respecting absorption edges
  if (m.edges) for (const [Ee, lo, hi] of m.edges) { const r = E / Ee; if (r > 0.97 && r < 1.0) return lo * Math.pow(r, -2.7); if (r >= 1.0 && r < 1.03) return hi * Math.pow(r, -2.7); }
  const g = EG, y = m.mu; if (E <= g[0]) return y[0] * Math.pow(E / g[0], -3);
  let i = 0; while (i < g.length - 2 && g[i + 1] < E) i++;
  let lo = y[i], hi = y[i + 1];
  if (m.edges) for (const [Ee, l, h] of m.edges) if (g[i] < Ee && Ee <= g[i + 1]) { return E < Ee ? l * Math.pow(E / Ee, Math.log(y[i] / l) / Math.log(g[i] / Ee)) : h * Math.pow(E / Ee, Math.log(y[i + 1] / h) / Math.log(g[i + 1] / Ee)); }
  const t = Math.log(E / g[i]) / Math.log(g[i + 1] / g[i]);
  return Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo)));
}
function sigKN(E) { const k = E / ME, a = 1 + 2 * k, L = Math.log(a); return 2 * Math.PI * RE2 * ((1 + k) / (k * k) * (2 * (1 + k) / a - L / k) + L / (2 * k) - (1 + 3 * k) / (a * a)); }
const sumW = (m, f) => m.comp.reduce((a, [s, w]) => a + w * f(EL[s]) / EL[s].A, 0);
function cohMu(m, E) { return 3.4e-4 * sumW(m, e => Math.pow(e.Z, 2.5)) * Math.pow(E / 0.1, -1.9); } // approximate Rayleigh
const PB = MAT.pb;
function pairPb(E) { if (E <= 1.022) return 0; const r = Math.max(0, muTot(PB, E) - sigKN(E) * NA * 0.39575 - 0.0199 * Math.pow(E, -1.1) - cohMu(PB, E)); return E < 1.4 ? r * Math.pow((E - 1.022) / 0.378, 2) : r; }
const PBZZ = 82 * 83 / 207.2;
const _pc = new Map();
function photonCoef(m, E) { // linear coefficients (1/cm)
  const key = m.name + E.toPrecision(6); if (_pc.has(key)) return _pc.get(key);
  const tot = muTot(m, E);
  let comp = sigKN(E) * NA * m.ZA, pair = pairPb(E) * sumW(m, e => e.Z * (e.Z + 1)) / PBZZ, coh = Math.min(cohMu(m, E), 0.3 * Math.max(0, tot - comp));
  if (comp + pair > tot) { const f = tot / (comp + pair) * 0.98; comp *= f; pair *= f; }
  let photo = tot - comp - pair - coh; if (photo < 0) { coh = Math.max(0, coh + photo); photo = 0; }
  const r = { tot: tot * m.rho, photo: photo * m.rho, comp: comp * m.rho, coh: coh * m.rho, pair: pair * m.rho };
  if (_pc.size > 5000) _pc.clear(); _pc.set(key, r); return r;
}

// ---------------------------------------------------------------- charged-particle stopping
function delta(m, bg) { const [C, x0, x1, a, k] = m.st, x = Math.log10(bg); if (x < x0) return 0; if (x > x1) return 4.6052 * x - C; return 4.6052 * x - C + a * Math.pow(x1 - x, k); }
function SeColl(m, T) { // electron collision stopping power (MeV cm²/g), ICRU 37 form
  const t = T / ME, g = t + 1, b2 = 1 - 1 / (g * g), Ir = m.I * 1e-6 / ME;
  const F = 1 - b2 + (t * t / 8 - (2 * t + 1) * Math.log(2)) / ((t + 1) * (t + 1));
  return Math.max(0.5, 0.153537 * m.ZA / b2 * (Math.log(t * t * (t + 2) / (2 * Ir * Ir)) + F - delta(m, Math.sqrt(g * g - 1))));
}
function SeRad(m, T) { return SeColl(m, T) * (T + ME) * m.Zb / 817.6; } // radiative/collision ≈ (E+mc²)Z/1600mc² (Knoll)
function heavy(type) { return type === 'p' ? { M: MP, z: 1, A: 1 } : { M: MA, z: 2, A: 4 }; }
function zEff(z, b) { return z * (1 - Math.exp(-125 * b * Math.pow(z, -2 / 3))); }
function bethe(m, T, M, z) { // Bethe–Bloch mass stopping power (MeV cm²/g)
  const g = 1 + T / M, b2 = 1 - 1 / (g * g), bg = Math.sqrt(g * g - 1), r = ME / M, Tmax = 2 * ME * bg * bg / (1 + 2 * g * r + r * r);
  return 0.307075 * z * z * m.ZA / b2 * (0.5 * Math.log(2 * ME * bg * bg * Tmax / Math.pow(m.I * 1e-6, 2)) - b2 - delta(m, bg) / 2);
}
// Low-energy proton stopping in water (MeV cm²/g), approximate values after ICRU 49 / NIST PSTAR.
const PW_T = [0.001, 0.003, 0.01, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 2.5];
const PW_S = [176.9, 300, 499.6, 728, 791, 826, 817, 770, 718, 609, 419, 337, 260.8, 192, 162.4, 137.9];
function protonS(m, T) { // proton stopping: table (scaled to the material) below 2 MeV, Bethe above, blended 1.5–2.5 MeV
  const hi = () => bethe(m, T, MP, 1);
  if (T >= 2.5) return hi();
  const k = bethe(m, 2.5, MP, 1) / bethe(MAT.water, 2.5, MP, 1);
  let lo; if (T <= PW_T[0]) lo = PW_S[0] * Math.pow(T / PW_T[0], 0.45); else { let i = 0; while (PW_T[i + 1] < T) i++; const t = Math.log(T / PW_T[i]) / Math.log(PW_T[i + 1] / PW_T[i]); lo = Math.exp(Math.log(PW_S[i]) + t * Math.log(PW_S[i + 1] / PW_S[i])); }
  lo *= k; if (T <= 1.5) return lo; const w = (T - 1.5); return lo * (1 - w) + hi() * w;
}
function SHeavy(m, T, type) { // electronic stopping (MeV cm²/g); alphas via effective-charge scaling of protons at equal velocity
  if (type === 'p') return protonS(m, T);
  const Tp = T * MP / MA, g = 1 + Tp / MP, b = Math.sqrt(1 - 1 / (g * g));
  return 4 * (1 - Math.exp(-107 * b)) * protonS(m, Tp);   // He effective charge², fitted so ranges match Geiger's rule (air) and Bragg–Kleeman (water)
}
const _rt = new Map();
function rangeTable(m, type) { // CSDA range table (g/cm²) on a log grid
  const key = m.name + type; if (_rt.has(key)) return _rt.get(key);
  const n = 400, lo = Math.log(1e-4), hi = Math.log(type === 'e' ? 50 : 1000), T = [], Rg = []; let acc = 0, prevT = 0;
  for (let i = 0; i < n; i++) {
    const t = Math.exp(lo + (hi - lo) * i / (n - 1));
    const S = type === 'e' ? SeColl(m, t) + SeRad(m, t) : SHeavy(m, t, type);
    const Smid = type === 'e' ? SeColl(m, (t + prevT) / 2 || t) + SeRad(m, (t + prevT) / 2 || t) : SHeavy(m, (t + prevT) / 2 || t, type);
    acc += i === 0 ? t / S * 0.6 : (t - prevT) / Smid; T.push(t); Rg.push(acc); prevT = t;
  }
  const r = { T, R: Rg }; _rt.set(key, r); return r;
}
function csda(m, type, E) { // g/cm²
  const { T, R: Rg } = rangeTable(m, type); if (E <= T[0]) return Rg[0] * E / T[0];
  let i = 0; while (i < T.length - 2 && T[i + 1] < E) i++;
  return Rg[i] + (Rg[i + 1] - Rg[i]) * (E - T[i]) / (T[i + 1] - T[i]);
}
function stopping(m, type, T) { return type === 'e' ? { col: SeColl(m, T), rad: SeRad(m, T) } : { col: SHeavy(m, T, type), rad: 0 }; }

// ---------------------------------------------------------------- neutron cross sections (barns; approximate analytic fits, resonances omitted)
const v1 = (s0, E) => s0 * Math.sqrt(2.53e-8 / Math.max(E, 1e-11));
const NXS = {
  H: { el: E => 3 * Math.PI / (1.206 * E + Math.pow(-1.86 + 0.09415 * E + 0.0001306 * E * E, 2)) + Math.PI / (1.206 * E + Math.pow(0.4223 + 0.13 * E, 2)),
       cap: E => v1(0.3326, E), capG: [2.2246] },
  C: { el: E => E < 0.01 ? 4.74 : 4.74 / (1 + 0.9 * Math.pow(E, 0.9)), cap: E => v1(0.00353, E), capG: [4.9453], inel: [[4.439, 4.81, 0.4]] },
  N: { el: E => 1.6 + 8.4 / (1 + E / 0.05), cap: E => v1(0.075, E), capG: [10.829], np: E => v1(1.83, E) },
  O: { el: E => E < 0.3 ? 3.76 : 3.76 / (1 + 0.9 * Math.pow(E - 0.3, 0.8)), cap: E => v1(0.00019, E), capG: [4.143], inel: [[6.13, 6.5, 0.3]] },
  Al: { el: E => 1.41 + 1.6 * E / (E + 0.15), cap: E => v1(0.231, E), capG: [7.724], inel: [[0.844, 0.875, 0.5], [1.014, 1.05, 0.3]] },
  Si: { el: E => 2.04 + 1.3 * E / (E + 0.2), cap: E => v1(0.171, E), capG: [3.539, 4.934], inel: [[1.779, 1.84, 0.6]] },
  Ca: { el: E => 2.8, cap: E => v1(0.43, E), capG: [6.42] },
  Ar: { el: E => 0.65 + 2 * E / (E + 0.5), cap: E => v1(0.66, E), capG: [6.1] },
  Pb: { el: E => 11.1 / (1 + E / 0.08) + 5.4 * E / (E + 0.08), cap: E => v1(0.171, E), capG: [7.368], inel: [[0.570, 0.573, 0.44], [0.803, 0.807, 0.48], [2.614, 2.627, 1.04]] }
};
function neutronXS(m, E) { // macroscopic (1/cm) per element and channel
  const ch = []; let tot = 0;
  for (const el of m.els) {
    const x = NXS[el.s]; if (!x) continue;
    const add = (kind, b, extra) => { const S = el.N * b * 1e-24; if (S > 0) { ch.push(Object.assign({ el: el.s, kind, S }, extra || {})); tot += S; } };
    add('elastic', x.el(E)); add('capture', x.cap(E));
    if (x.np) add('np', x.np(E));
    if (x.inel) for (const [lev, thr, s0] of x.inel) if (E > thr) add('inelastic', s0 * Math.sqrt(1 - thr / E), { lev });
  }
  return { ch, tot };
}

// ---------------------------------------------------------------- source spectra
const BETA = { 'C-14': { E0: 0.1565, Zd: 7 }, 'Sr-90': { E0: 0.546, Zd: 39 }, 'P-32': { E0: 1.7106, Zd: 16 }, 'Y-90': { E0: 2.2801, Zd: 40 } };
const _cdf = new Map();
function tabSample(key, n, a, b, f) {
  if (!_cdf.has(key)) { const xs = [], c = [0]; let s = 0; for (let i = 0; i < n; i++) { const x = a + (b - a) * (i + 0.5) / n; xs.push(x); s += Math.max(0, f(x)); c.push(s); } _cdf.set(key, { xs, c: c.map(v => v / s), dx: (b - a) / n }); }
  const t = _cdf.get(key), u = R(); let lo = 0, hi = t.c.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.c[mid] < u) lo = mid; else hi = mid; }
  return t.xs[Math.min(lo, t.xs.length - 1)] + (R() - 0.5) * t.dx;
}
function betaShape(nuc) { const b = BETA[nuc]; return T => { const W = T + ME, p = Math.sqrt(W * W - ME * ME), eta = ALPHA * b.Zd * W / p, F = 2 * Math.PI * eta / (1 - Math.exp(-2 * Math.PI * eta)); return p * W * Math.pow(b.E0 - T, 2) * F; }; }
function sampleBeta(nuc) { const b = BETA[nuc]; return tabSample('b' + nuc, 400, 0, b.E0, betaShape(nuc)); }
const W_LINES = [[0.057981, 0.32], [0.059318, 0.56], [0.067244, 0.12]];   // tungsten Kα2, Kα1, Kβ1 (X-ray Data Booklet)
function xraySpectrum(kVp) { // Kramers thick-target spectrum, 2.5 mm Al filtration, plus W K lines above 69.5 kV
  const E0 = kVp / 1000;
  return E => { if (E >= E0 || E < 0.008) return 0; return (E0 - E) / E * Math.exp(-muTot(MAT.al, E) * 2.699 * 0.25); };
}
function sampleXray(kVp) {
  const E0 = kVp / 1000, fK = kVp > 69.5 ? Math.min(0.22, 0.004 * (kVp - 69.5)) : 0;
  if (R() < fK) { let u = R(); for (const [e, p] of W_LINES) { u -= p; if (u <= 0) return e; } return W_LINES[1][0]; }
  return tabSample('x' + kVp, 300, 0.008, E0, xraySpectrum(kVp));
}

// ---------------------------------------------------------------- history
/** Simulate one primary. opt: {type:'e'|'beta'|'p'|'alpha'|'n'|'gamma'|'xray', E (MeV), nuc, kVp, mat, D (cm), H (cm), dotsTarget} */
function simulate(opt) {
  const m = MAT[opt.mat], D = opt.D, H = opt.H || D;
  const h = { tracks: [], dots: [], events: [], ledger: { E0: 0, Q: 0, mass: 0, dep: 0, esc: 0 }, depth: new Float64Array(60), counts: {},
              nIon: 0, nExc: 0, cher: [], D, H, mat: opt.mat };
  let E0;
  switch (opt.type) {
    case 'beta': E0 = sampleBeta(opt.nuc || 'Sr-90'); break;
    case 'xray': E0 = sampleXray(opt.kVp || 80); break;
    default: E0 = opt.E;
  }
  h.E0 = E0; h.ledger.E0 = E0;
  // representative-dot factor: about dotsTarget dots for the whole history
  const Wt = m.W * 1e-6, Echar = opt.type === 'n' ? Math.min(E0, 2) : E0;
  h.rep = Math.max(1, Echar / Wt / (opt.dotsTarget || 900));
  h.Tcut = Math.max(0.001, energyForRange(m, 'e', 0.04 * D));        // δ rays shown if they travel ≥ 4% of the slab
  h.kcut = Math.max(0.001, h.Tcut);
  h.Ecut = Math.max(0.0005, energyForRange(m, 'e', 0.004 * D));
  h.HcutR = 0.004 * D;
  const ptype = opt.type === 'beta' ? 'e' : opt.type === 'xray' ? 'gamma' : opt.type;
  const start = [-0.12 * D, (R() - 0.5) * 0.04 * H, (R() - 0.5) * 0.04 * H];
  const q = [{ type: ptype, E: E0, p: start, d: [1, 0, 0], t: 0, gen: 0, parent: -1, born: opt.type === 'xray' ? 'X-ray tube' : opt.type === 'beta' ? 'β⁻ decay' : 'beam', primary: true }];
  let guard = 0;
  while (q.length && guard++ < 4000) {
    const s = q.shift();
    if (s.type === 'gamma') photon(h, m, s, q);
    else if (s.type === 'e' || s.type === 'pos') electron(h, m, s, q);
    else if (s.type === 'p' || s.type === 'alpha') heavyIon(h, m, s, q);
    else if (s.type === 'n') neutron(h, m, s, q);
  }
  h.ledger.balance = h.ledger.E0 + h.ledger.Q - h.ledger.mass - h.ledger.dep - h.ledger.esc;
  return h;
}
function energyForRange(m, type, Rcm) { const g = Rcm * m.rho; let lo = 1e-4, hi = 50; for (let i = 0; i < 40; i++) { const mid = Math.sqrt(lo * hi); if (csda(m, type, mid) < g) lo = mid; else hi = mid; } return lo; }
const inside = (h, p) => p[0] >= 0 && p[0] <= h.D && Math.abs(p[1]) <= h.H / 2 && Math.abs(p[2]) <= h.H / 2;
function boxExit(h, p, d) { // distance along d to leave the slab from p (p inside)
  let s = Infinity;
  if (d[0] > 0) s = Math.min(s, (h.D - p[0]) / d[0]); else if (d[0] < 0) s = Math.min(s, -p[0] / d[0]);
  for (const k of [1, 2]) { if (d[k] > 0) s = Math.min(s, (h.H / 2 - p[k]) / d[k]); else if (d[k] < 0) s = Math.min(s, (-h.H / 2 - p[k]) / d[k]); }
  return Math.max(0, s);
}
function enter(h, p, d) { // move an outside point to the slab surface along d (or null)
  if (inside(h, p)) return { p, s: 0 };
  if (d[0] <= 0) return null; const s = -p[0] / d[0], q = add(p, d, s); return inside(h, q) ? { p: q, s } : null;
}
function deposit(h, p, E) { h.ledger.dep += E; const i = Math.floor(p[0] / h.D * 60); if (i >= 0 && i < 60) h.depth[i] += E; }
function count(h, k) { h.counts[k] = (h.counts[k] || 0) + 1; }
function beta(type, T) { const M = type === 'e' || type === 'pos' ? ME : type === 'p' ? MP : type === 'alpha' ? MA : MN; const g = 1 + T / M; return Math.sqrt(1 - 1 / (g * g)); }
function visSpeed(type, T) { return type === 'gamma' ? 1 : 0.3 + 0.7 * beta(type, T); }   // animation speed (fraction of photon speed)
function newTrack(h, s) { const tr = { id: h.tracks.length, type: s.type, E: s.E, gen: s.gen, parent: s.parent, born: s.born, pts: [[...s.p, s.t]], primary: !!s.primary }; h.tracks.push(tr); return tr; }
function tAt(h, s, dist, T) { return s.t + dist / h.D * 2.6 / visSpeed(s.type, T); }   // 2.6 animation seconds per slab thickness at full speed
function event(h, e) { e.id = h.events.length; h.events.push(e); return e; }
function pickEl(m, f) { let tot = 0; const w = m.els.map(el => { const v = el.w * f(el.e) / el.e.A; tot += v; return v; }); let u = R() * tot; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return m.els[i].s; } return m.els[0].s; }
function shellFor(el, Tmax) { // shell hit in a Coulomb collision: weight ∝ (electrons / binding energy), only shells with B < Tmax
  const e = EL[el]; let tot = 0; const w = e.shells.map(([n, B, ne]) => { const v = B < Tmax ? ne / B : 0; tot += v; return v; });
  if (tot === 0) return e.shells[e.shells.length - 1]; let u = R() * tot; for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return e.shells[i]; } return e.shells[e.shells.length - 1];
}

// ---------- atomic relaxation of an inner-shell vacancy ------------------------------
function relax(h, m, el, shell, p, t, q, parentEv, gen) {
  const e = EL[el], B = e.shells.find(s => s[0] === shell)[1];
  const out = { el, shell, B, steps: [] };
  if (shell === 'K' && e.Z > 2) {
    if (R() < e.wK) { // fluorescence
      const kb = R() < 0.15, Ex = kb ? e.Kb : (e.Ka2 && R() < 0.35 ? e.Ka2 : e.Ka);
      out.steps.push({ kind: 'fluor', line: kb ? 'Kβ' : 'Kα', E: Ex / 1000 });
      q.push({ type: 'gamma', E: Ex / 1000, p, d: iso(), t, gen, parent: parentEv, born: `${el} ${kb ? 'Kβ' : 'Kα'} fluorescence x-ray`, xray: true }); count(h, 'Fluorescence x-rays');
      const rest = B / 1000 - Ex / 1000;
      if (el === 'Pb' && !kb) out.steps.push(...relaxL(h, m, el, p, t, q, parentEv, gen, rest)); else deposit(h, p, rest);
    } else { // Auger
      const L1 = (e.shells.find(s => s[0].startsWith('L')) || [0, 0])[1], L3 = (e.shells.find(s => s[0] === 'L3' || s[0] === 'L23' || s[0] === 'L') || [0, L1])[1];
      const Ta = Math.max(0, B - L1 - L3) / 1000;
      out.steps.push({ kind: 'auger', line: 'KLL', E: Ta });
      q.push({ type: 'e', E: Ta, p, d: iso(), t, gen, parent: parentEv, born: `${el} KLL Auger electron` }); count(h, 'Auger electrons');
      deposit(h, p, B / 1000 - Ta);
    }
  } else if (el === 'Pb' && shell.startsWith('L')) out.steps.push(...relaxL(h, m, el, p, t, q, parentEv, gen, B / 1000));
  else deposit(h, p, B / 1000);                                   // outer / light-element L vacancy: low-energy Auger, absorbed on the spot
  return out;
}
function relaxL(h, m, el, p, t, q, parentEv, gen, avail) {
  const e = EL[el], st = [];
  if (R() < e.wL) { const Ex = (R() < 0.7 ? e.La : e.Lb) / 1000; st.push({ kind: 'fluor', line: Ex > 0.011 ? 'Lβ' : 'Lα', E: Ex }); q.push({ type: 'gamma', E: Ex, p, d: iso(), t, gen, parent: parentEv, born: 'Pb L fluorescence x-ray', xray: true }); count(h, 'Fluorescence x-rays'); deposit(h, p, Math.max(0, avail - Ex)); }
  else { const Ta = Math.max(0, 13.035 - 2 * 3.066) / 1000; st.push({ kind: 'auger', line: 'LMM', E: Ta }); q.push({ type: 'e', E: Ta, p, d: iso(), t, gen, parent: parentEv, born: 'Pb LMM Auger electron' }); count(h, 'Auger electrons'); deposit(h, p, Math.max(0, avail - Ta)); }
  return st;
}

// ---------- photons ----------------------------------------------------------------------
function photon(h, m, s, q) {
  let p = s.p, d = s.d, E = s.E, t = s.t, dist = 0;
  const tr = newTrack(h, s); tr.xray = !!s.xray || (s.primary && s.born === 'X-ray tube');
  if (!inside(h, p)) { const en = enter(h, p, d); if (!en) { tr.pts.push([...add(p, d, h.D * 0.6), t + 0.6 * 2.6]); escape(h, tr, E, 'missed'); return; } p = en.p; dist += en.s; tr.pts.push([...p, tAt(h, s, dist, E)]); }
  for (let guard = 0; guard < 500; guard++) {
    if (E < 0.001) { deposit(h, p, E); tr.end = 'absorbed'; return; }
    const c = photonCoef(m, E), sStep = -Math.log(1 - R()) / c.tot, sOut = boxExit(h, p, d);
    if (sStep >= sOut) { p = add(p, d, sOut); dist += sOut; tr.pts.push([...p, tAt(h, s, dist, E)]); const far = add(p, d, h.D * 0.35); tr.pts.push([...far, tAt(h, s, dist + h.D * 0.35, E)]); escape(h, tr, E, p[0] >= h.D - 1e-9 ? 'transmitted' : p[0] <= 1e-9 ? 'backscattered' : 'side'); return; }
    p = add(p, d, sStep); dist += sStep; const tn = tAt(h, s, dist, E); tr.pts.push([...p, tn]);
    const r = R() * c.tot;
    if (r < c.photo) {
      const el = pickEl(m, e => Math.pow(e.Z, 4.2));
      const e = EL[el], K = e.shells[0];
      let sh = e.shells[e.shells.length - 1];
      if (E * 1000 > K[1] && e.Z > 2 && R() < 1 - 1 / e.J) sh = K; else { const Ls = e.shells.filter(x => x[0].startsWith('L') && x[1] < E * 1000); if (Ls.length && R() < 0.85) sh = Ls[0]; }
      const B = Math.min(sh[1] / 1000, E * 0.999), T = E - B;
      const ev = event(h, { t: tn, p, proc: 'photoelectric', el, shell: sh[0], B, Ein: E, T, track: tr.id, desc: `Photon absorbed by a ${sh[0]}-shell electron of ${el}. Photoelectron T = E − B.` });
      q.push({ type: 'e', E: T, p, d: photoDir(d, T), t: tn, gen: s.gen + 1, parent: ev.id, born: `photoelectron (${el} ${sh[0]})` }); count(h, 'Photoelectrons');
      ev.relax = relax(h, m, el, sh[0], p, tn, q, ev.id, s.gen + 1);
      tr.end = 'absorbed'; return;
    } else if (r < c.photo + c.comp) {
      const el = pickEl(m, e => e.Z), k = E / ME;
      let eps, ct;
      for (;;) { const e0 = 1 / (1 + 2 * k), a1 = -Math.log(e0), a2 = (1 - e0 * e0) / 2; eps = R() * (a1 + a2) < a1 ? Math.exp(-a1 * R()) : Math.sqrt(e0 * e0 + (1 - e0 * e0) * R()); const omc = (1 - eps) / (eps * k), s2 = omc * (2 - omc); if (R() <= 1 - eps * s2 / (1 + eps * eps)) { ct = 1 - omc; break; } }
      const Ep = eps * E, T = E - Ep, th = Math.acos(ct), phi = 2 * Math.PI * R();
      const ed = T > 0 ? rot(d, Math.cos(Math.atan(1 / ((1 + k) * Math.tan(th / 2 + 1e-9)))), phi + Math.PI) : d;
      const sh = e2outer(el);
      event(h, { t: tn, p, proc: 'compton', el, shell: sh, Ein: E, Eout: Ep, T, angle: th * 180 / Math.PI, track: tr.id, desc: `Photon scattered by an outer electron of ${el}; the electron recoils with T = E − E′.` });
      q.push({ type: 'e', E: T, p, d: ed, t: tn, gen: s.gen + 1, parent: h.events.length - 1, born: 'Compton electron' }); count(h, 'Compton electrons');
      d = rot(d, ct, phi); E = Ep; count(h, 'Compton scatters');
    } else if (r < c.photo + c.comp + c.coh) {
      const el = pickEl(m, e => Math.pow(e.Z, 2.5)), th0 = Math.min(1.4, 0.03 * Math.cbrt(EL[el].Z) / E), th = Math.min(Math.PI, th0 * Math.sqrt(-Math.log(1 - R())));
      event(h, { t: tn, p, proc: 'rayleigh', el, Ein: E, angle: th * 180 / Math.PI, track: tr.id, desc: `Coherent (Rayleigh) scattering on the whole ${el} atom: direction changes, no energy is transferred, no ionization.` });
      count(h, 'Rayleigh scatters'); d = rot(d, Math.cos(th), 2 * Math.PI * R());
    } else {
      const el = pickEl(m, e => e.Z * (e.Z + 1)), T = E - 2 * ME, u = 0.15 + 0.7 * R(), Te = T * u, Tp = T - Te;
      const ev = event(h, { t: tn, p, proc: 'pair', el, Ein: E, Te, Tp, track: tr.id, desc: `In the Coulomb field of a ${el} nucleus the photon becomes an electron–positron pair (needs E > 1.022 MeV).` });
      h.ledger.mass += 2 * ME;
      const th = ME / E;
      q.push({ type: 'e', E: Te, p, d: rot(d, Math.cos(th * (0.5 + R())), 2 * Math.PI * R()), t: tn, gen: s.gen + 1, parent: ev.id, born: 'pair electron' });
      q.push({ type: 'pos', E: Tp, p, d: rot(d, Math.cos(th * (0.5 + R())), 2 * Math.PI * R()), t: tn, gen: s.gen + 1, parent: ev.id, born: 'pair positron' });
      count(h, 'Pairs (e⁻e⁺)'); tr.end = 'absorbed'; return;
    }
  }
}
function e2outer(el) { const sh = EL[el].shells; return sh[sh.length - 1][0]; }
function photoDir(d, T) { const b = beta('e', T), c = (b + (1 - b) * (2 * R() - 1)); return rot(d, Math.max(-1, Math.min(1, c)), 2 * Math.PI * R()); }
function escape(h, tr, E, how) { h.ledger.esc += E; tr.end = how; count(h, how === 'transmitted' ? 'Transmitted' : how === 'backscattered' ? 'Backscattered' : how === 'missed' ? 'Missed slab' : 'Escaped sideways'); }

// ---------- ionization / excitation dots along a charged step ----------------------------
function dotsAlong(h, m, a, b, ta, tb, dE, s) {
  const nI = dE / (m.W * 1e-6); h.nIon += nI; h.nExc += nI * m.ex;
  const k = poisson(nI / h.rep), kx = poisson(nI * m.ex / h.rep);
  const put = (type) => { const u = R(), jit = 0.003 * h.D; const p = [a[0] + (b[0] - a[0]) * u + gauss() * jit, a[1] + (b[1] - a[1]) * u + gauss() * jit, a[2] + (b[2] - a[2]) * u + gauss() * jit]; h.dots.push([p[0], p[1], p[2], ta + (tb - ta) * u, type]); return p; };
  for (let i = 0; i < k; i++) { const p = put(0); if (R() < 0.015 && h.events.length < 400) repEvent(h, m, p, ta, s, 'ionization'); }
  for (let i = 0; i < kx; i++) { const p = put(1); if (R() < 0.01 && h.events.length < 400) repEvent(h, m, p, ta, s, 'excitation'); }
}
function repEvent(h, m, p, t, s, kind) { // a representative atomic-level event, for the atomic view
  const el = pickEl(m, e => e.Z);
  if (kind === 'ionization') {
    const sh = shellFor(el, Math.min(s.E, 0.05) * 1000), B = sh[1] / 1000;
    const T = B * (1 + 3 * R()) + 0.000005;   // soft secondary electron (few-eV to ~keV)
    event(h, { t, p, proc: 'ionization', el, shell: sh[0], B, T, by: s.type, track: -1, rep: true, desc: `A passing ${pname(s.type)} transfers energy to a ${sh[0]}-shell electron of ${el} and ejects it: the atom becomes a positive ion.` });
  } else {
    const e = EL[el], outer = e.shells[e.shells.length - 1], dE = outer[1] * (0.55 + 0.4 * R());
    event(h, { t, p, proc: 'excitation', el, shell: outer[0], B: outer[1] / 1000, dE: dE / 1000, by: s.type, track: -1, rep: true, desc: `A passing ${pname(s.type)} lifts an outer electron of ${el} to a higher, unoccupied level without freeing it. It falls back and emits a UV/visible photon (or the energy becomes heat).` });
  }
}
function pname(t) { return { e: 'electron', pos: 'positron', p: 'proton', alpha: 'alpha particle', gamma: 'photon', n: 'neutron' }[t] || t; }

// ---------- electrons and positrons ------------------------------------------------------
function electron(h, m, s, q) {
  let p = s.p, d = s.d, E = s.E, dist = 0;
  const tr = newTrack(h, s);
  if (!inside(h, p)) { const en = enter(h, p, d); if (!en) { tr.pts.push([...add(p, d, h.D * 0.5), s.t + 1]); escape(h, tr, E, 'missed'); return; } p = en.p; dist += en.s; tr.pts.push([...p, tAt(h, s, dist, E)]); }
  let cherN = 0;
  for (let guard = 0; guard < 600; guard++) {
    const Rg = csda(m, 'e', E) / m.rho;
    if (E <= h.Ecut || Rg < h.HcutR) { // stop: deposit the rest
      const end = add(p, d, Math.min(Rg, h.HcutR)); dotsAlong(h, m, p, end, tAt(h, s, dist, E), tAt(h, s, dist + Rg, 0), E, s);
      deposit(h, p, E); tr.pts.push([...end, tAt(h, s, dist + Rg, 0)]); tr.end = 'stopped';
      if (s.type === 'pos') annihilate(h, m, end, tAt(h, s, dist + Rg, 0), q, s); return;
    }
    let ds = Math.max(Math.min(0.06 * Rg, 0.025 * h.D), 0.002 * h.D);
    const sOut = boxExit(h, p, d); let leaving = false; if (ds >= sOut) { ds = sOut + 1e-9; leaving = true; }
    // discrete δ rays (Møller ≈ Rutherford 1/T² above Tcut)
    const b2 = Math.pow(beta('e', E), 2), Tmax = s.type === 'pos' ? E : E / 2;
    let Tdelta = 0;
    if (Tmax > h.Tcut) {
      const N = 0.153537 * m.ZA * m.rho * ds / b2 * (1 / h.Tcut - 1 / Tmax), k = poisson(N);
      for (let i = 0; i < k; i++) {
        const T = 1 / (1 / h.Tcut - R() * (1 / h.Tcut - 1 / Tmax));
        const pp = add(p, d, R() * ds), ct = Math.sqrt(T * (E + 2 * ME) / (E * (T + 2 * ME))), el = pickEl(m, e => e.Z), sh = shellFor(el, T * 1000);
        if (Tdelta + T + sh[1] / 1000 > E * 0.6) break; Tdelta += T + sh[1] / 1000;   // primary loses T + binding energy
        const ev = event(h, { t: tAt(h, s, dist, E), p: pp, proc: 'delta', el, shell: sh[0], B: sh[1] / 1000, T, by: s.type, track: tr.id, desc: `Hard collision: the ${pname(s.type)} knocks a ${sh[0]}-shell electron out of ${el} with enough energy (${fmtE(T)}) to make its own track: a δ-ray.` });
        q.push({ type: 'e', E: T, p: pp, d: rot(d, Math.min(1, ct), 2 * Math.PI * R()), t: tAt(h, s, dist, E), gen: s.gen + 1, parent: ev.id, born: 'δ-ray' }); count(h, 'δ-rays');
        if (sh[0] === 'K' || (sh[0].startsWith('L') && el === 'Pb')) ev.relax = relax(h, m, el, sh[0], pp, ev.t, q, ev.id, s.gen + 1);
        else deposit(h, pp, sh[1] / 1000);
      }
    }
    // bremsstrahlung photons above kcut (complete-screening shape)
    let Kb = 0;
    if (E > h.kcut * 1.05) {
      const y0 = h.kcut / E, fr = Math.min(1.5, SeRad(m, E) / ((E + ME) / m.X0)), N = fr * ds * m.rho / m.X0 * ((4 / 3) * Math.log(1 / y0) - (4 / 3) * (1 - y0) + 0.5 * (1 - y0 * y0)), k = poisson(N);
      for (let i = 0; i < k; i++) {
        let kk; for (;;) { kk = h.kcut * Math.pow(E / h.kcut, R()); const y = kk / E; if (R() * 4 / 3 <= 4 / 3 - 4 / 3 * y + y * y) break; }
        if (Kb + kk + Tdelta > E * 0.9) break; Kb += kk;
        const gam = (E + ME) / ME, pp = add(p, d, R() * ds), el = pickEl(m, e => e.Z * e.Z);
        const ev = event(h, { t: tAt(h, s, dist, E), p: pp, proc: 'brems', el, Ein: E, k: kk, by: s.type, track: tr.id, desc: `The ${pname(s.type)} is deflected in the electric field of a ${el} nucleus and radiates a bremsstrahlung x-ray photon (${fmtE(kk)}).` });
        q.push({ type: 'gamma', E: kk, p: pp, d: rot(d, Math.cos(Math.min(1.5, Math.abs(gauss()) / gam)), 2 * Math.PI * R()), t: ev.t, gen: s.gen + 1, parent: ev.id, born: 'bremsstrahlung photon', xray: true }); count(h, 'Bremsstrahlung photons');
      }
    }
    // continuous (restricted) collision loss with Bohr straggling
    const Scol = SeColl(m, E), meanDelta = Tmax > h.Tcut ? 0.153537 * m.ZA / b2 * Math.log(Tmax / h.Tcut) : 0;
    let dE = Math.max(0.3 * Scol, Scol - meanDelta) * m.rho * ds;
    dE = Math.max(0.2 * dE, dE + gauss() * Math.sqrt(0.1569 * m.rho * m.ZA * ds) * 0.5);
    dE = Math.min(dE, E - Tdelta - Kb);
    const a = p, ta = tAt(h, s, dist, E);
    // multiple scattering (Highland)
    const pc = Math.sqrt(E * (E + 2 * ME)), bb = beta('e', E), x = ds * m.rho / m.X0;
    const th0 = 13.6 / (bb * pc) * Math.sqrt(x) * (1 + 0.038 * Math.log(Math.max(x, 1e-6)));
    p = add(p, d, ds); dist += ds;
    const Enew = E - dE - Tdelta - Kb, tb = tAt(h, s, dist, Enew);
    deposit(h, [(a[0] + p[0]) / 2, 0, 0], dE); dotsAlong(h, m, a, p, ta, tb, dE, s);
    if (m.n && bb > 1 / m.n) { const th = Math.acos(1 / (m.n * bb)); cherN++; h.cher.push([...a, ...p, ta, tb, th]); }
    tr.pts.push([...p, tb]);
    E = Enew;
    if (leaving) { const far = add(p, d, h.D * 0.25); tr.pts.push([...far, tAt(h, s, dist + h.D * 0.25, E)]); escape(h, tr, E, p[0] >= h.D - 1e-6 ? 'transmitted' : p[0] <= 1e-6 ? 'backscattered' : 'side'); if (s.type === 'pos') h.ledger.esc += 0; return; }
    const ang = Math.min(Math.PI, Math.abs(Math.hypot(gauss(), gauss()) * th0 / Math.SQRT2));
    d = rot(d, Math.cos(ang), 2 * Math.PI * R());
  }
  deposit(h, p, E); tr.end = 'stopped';
}
function annihilate(h, m, p, t, q, s) {
  const el = pickEl(m, e => e.Z), u = iso();
  const ev = event(h, { t, p, proc: 'annihilation', el, track: -1, desc: `The stopped positron meets an electron of ${el}; both vanish into two 511 keV photons emitted back to back.` });
  h.ledger.Q += 2 * ME;
  q.push({ type: 'gamma', E: ME, p, d: u, t, gen: s.gen + 1, parent: ev.id, born: 'annihilation photon' }, { type: 'gamma', E: ME, p, d: [-u[0], -u[1], -u[2]], t, gen: s.gen + 1, parent: ev.id, born: 'annihilation photon' });
  count(h, 'Annihilation photons'); count(h, 'Annihilation photons');
}
function fmtE(E) { return E >= 1 ? E.toFixed(2) + ' MeV' : E >= 1e-3 ? (E * 1000).toFixed(1) + ' keV' : (E * 1e6).toFixed(1) + ' eV'; }

// ---------- protons and alphas -----------------------------------------------------------
function heavyIon(h, m, s, q) {
  const type = s.type, hv = heavy(type);
  let p = s.p, d = s.d, E = s.E, dist = 0;
  const tr = newTrack(h, s);
  if (!inside(h, p)) { const en = enter(h, p, d); if (!en) { escape(h, tr, E, 'missed'); return; } p = en.p; dist += en.s; tr.pts.push([...p, tAt(h, s, dist, E)]); }
  // nuclear reaction probability (protons above 10 MeV): σ ≈ 45 mb·A^0.691
  const sigN = type === 'p' ? m.els.reduce((a, el) => a + el.N * 45e-27 * Math.pow(EL[el.s].A, 0.691) * (el.s === 'H' ? 0 : 1), 0) : 0;
  for (let guard = 0; guard < 600; guard++) {
    const Rg = csda(m, type, E) / m.rho;
    if (Rg < h.HcutR * 0.25 || E < 0.002) { deposit(h, p, E); dotsAlong(h, m, p, add(p, d, Rg), tAt(h, s, dist, E), tAt(h, s, dist + Rg, 0), E, s); tr.pts.push([...add(p, d, Rg), tAt(h, s, dist + Rg, 0)]); tr.end = 'stopped'; event(h, { t: tAt(h, s, dist + Rg, 0), p: add(p, d, Rg), proc: 'stop', el: pickEl(m, e => e.Z), by: type, track: tr.id, desc: type === 'alpha' ? 'The alpha particle has stopped: it picks up two electrons and becomes a neutral helium atom.' : 'The proton has stopped: it picks up an electron and becomes a hydrogen atom.' }); return; }
    let ds = Math.max(Math.min(0.03 * Rg, 0.02 * h.D), 0.0015 * h.D); if (ds > Rg) ds = Rg;
    const sOut = boxExit(h, p, d); let leaving = false; if (ds >= sOut) { ds = sOut + 1e-9; leaving = true; }
    // nuclear reaction
    if (sigN > 0 && E > 10 && R() < 1 - Math.exp(-sigN * ds * Math.min(1, (E - 10) / 40))) {
      const pp = add(p, d, R() * ds), el = pickEl(m, e => e.Z > 1 ? Math.pow(e.A, 0.691) : 0), tn = tAt(h, s, dist, E);
      const Ep = E * (0.2 + 0.4 * R()), En = E * (0.1 + 0.2 * R()), Eg = el === 'C' ? 4.439 : el === 'O' ? 6.13 : 2.0, Eloc = Math.max(0, E - Ep - En);
      const ev = event(h, { t: tn, p: pp, proc: 'nuclear', el, Ein: E, desc: `Non-elastic nuclear reaction with a ${el} nucleus: the proton is removed; secondary protons, neutrons and a γ ray emerge and heavy fragments stop on the spot (simplified).` });
      deposit(h, pp, Eloc); h.ledger.Q += Eg;
      q.push({ type: 'p', E: Ep, p: pp, d: rot(d, Math.cos(0.5 * R()), 2 * Math.PI * R()), t: tn, gen: s.gen + 1, parent: ev.id, born: 'secondary proton' });
      q.push({ type: 'n', E: En, p: pp, d: iso(), t: tn, gen: s.gen + 1, parent: ev.id, born: 'secondary neutron' });
      q.push({ type: 'gamma', E: Eg, p: pp, d: iso(), t: tn, gen: s.gen + 1, parent: ev.id, born: `prompt γ (${el}*)` });
      count(h, 'Nuclear reactions'); tr.pts.push([...pp, tn]); tr.end = 'nuclear'; return;
    }
    const g = 1 + E / hv.M, bg = Math.sqrt(g * g - 1), b2 = 1 - 1 / (g * g), r = ME / hv.M, Tmax = 2 * ME * bg * bg / (1 + 2 * g * r + r * r);
    let Tdelta = 0;
    if (Tmax > h.Tcut) {
      const z = zEff(hv.z, Math.sqrt(b2)), N = 0.153537 * z * z * m.ZA * m.rho * ds / b2 * (1 / h.Tcut - 1 / Tmax), k = poisson(N);
      for (let i = 0; i < k; i++) {
        const T = 1 / (1 / h.Tcut - R() * (1 / h.Tcut - 1 / Tmax)); if (Tdelta + T > 0.5 * E) break; Tdelta += T;
        const pp = add(p, d, R() * ds), el = pickEl(m, e => e.Z), sh = shellFor(el, T * 1000);
        const ev = event(h, { t: tAt(h, s, dist, E), p: pp, proc: 'delta', el, shell: sh[0], B: sh[1] / 1000, T, by: type, track: tr.id, desc: `Hard collision: the ${pname(type)} knocks a ${sh[0]}-shell electron out of ${el} fast enough to make its own track: a δ-ray.` });
        q.push({ type: 'e', E: T, p: pp, d: rot(d, Math.min(1, Math.sqrt(T / Tmax)), 2 * Math.PI * R()), t: ev.t, gen: s.gen + 1, parent: ev.id, born: 'δ-ray' }); count(h, 'δ-rays'); deposit(h, pp, 0);
      }
    }
    const S = SHeavy(m, E, type), z = zEff(hv.z, Math.sqrt(b2)), meanDelta = Tmax > h.Tcut ? 0.153537 * z * z * m.ZA / b2 * Math.log(Tmax / h.Tcut) : 0;
    let dE = Math.max(0.5 * S, S - meanDelta) * m.rho * ds; dE += gauss() * Math.sqrt(0.1569 * m.rho * m.ZA * ds) * hv.z;
    dE = Math.max(0, Math.min(dE, E - Tdelta));
    const a = p, ta = tAt(h, s, dist, E);
    p = add(p, d, ds); dist += ds;
    const En = E - dE - Tdelta, tb = tAt(h, s, dist, En);
    deposit(h, [(a[0] + p[0]) / 2, 0, 0], dE); dotsAlong(h, m, a, p, ta, tb, dE, s);
    tr.pts.push([...p, tb]); E = En;
    if (leaving) { tr.pts.push([...add(p, d, h.D * 0.2), tAt(h, s, dist + h.D * 0.2, E)]); escape(h, tr, E, p[0] >= h.D - 1e-6 ? 'transmitted' : 'side'); return; }
    const pc = Math.sqrt(E * (E + 2 * hv.M)), bb = Math.sqrt(b2), x = ds * m.rho / m.X0;
    const th0 = 13.6 * hv.z / (bb * pc) * Math.sqrt(x) * (1 + 0.038 * Math.log(Math.max(x, 1e-6)));
    d = rot(d, Math.cos(Math.min(1, Math.abs(gauss() * th0))), 2 * Math.PI * R());
  }
  deposit(h, p, E); tr.end = 'stopped';
}

// ---------- neutrons ---------------------------------------------------------------------
const ETH = 2.53e-8;
function neutron(h, m, s, q) {
  let p = s.p, d = s.d, E = s.E, dist = 0, coll = 0;
  const tr = newTrack(h, s);
  if (!inside(h, p)) { const en = enter(h, p, d); if (!en) { escape(h, tr, E, 'missed'); return; } p = en.p; dist += en.s; tr.pts.push([...p, tAt(h, s, dist, E)]); }
  for (let guard = 0; guard < 2500; guard++) {
    const X = neutronXS(m, E), sStep = -Math.log(1 - R()) / X.tot, sOut = boxExit(h, p, d);
    const visE = Math.max(E, 1e-4);
    if (sStep >= sOut) { p = add(p, d, sOut); dist += sOut; tr.pts.push([...p, tAt(h, s, dist, visE)]); tr.pts.push([...add(p, d, h.D * 0.3), tAt(h, s, dist + h.D * 0.3, visE)]); escape(h, tr, E, p[0] >= h.D - 1e-9 ? 'transmitted' : p[0] <= 1e-9 ? 'backscattered' : 'side'); h.nColl = coll; return; }
    p = add(p, d, sStep); dist += sStep; const tn = tAt(h, s, dist, visE); tr.pts.push([...p, tn]); coll++;
    let u = R() * X.tot, c = X.ch[0]; for (const ch of X.ch) { u -= ch.S; if (u <= 0) { c = ch; break; } }
    const A = EL[c.el].A / 1.00866;
    if (c.kind === 'elastic') {
      if (E <= 1.5 * ETH) { // thermal: random walk at constant (thermal) energy
        d = iso(); if (tr.thermalAt == null) tr.thermalAt = tr.pts.length - 1; continue;
      }
      const mu = 2 * R() - 1, Ep = E * (A * A + 2 * A * mu + 1) / ((A + 1) * (A + 1)), Er = E - Ep;
      const pn = [d[0] * Math.sqrt(E), d[1] * Math.sqrt(E), d[2] * Math.sqrt(E)];
      const cr = Math.sqrt(Math.max(0, Math.min(1, Er * (A + 1) * (A + 1) / (4 * A * E)))), dr = rot(d, cr, 2 * Math.PI * R()), pr = Math.sqrt(A * Er);
      const nd = norm([pn[0] - dr[0] * pr, pn[1] - dr[1] * pr, pn[2] - dr[2] * pr]);
      const ev = event(h, { t: tn, p, proc: 'n-elastic', el: c.el, Ein: E, Eout: Ep, Er, track: tr.id, desc: c.el === 'H' ? `Elastic collision with a hydrogen nucleus (a proton). Equal masses: up to all of the neutron energy goes to the recoil proton, which then ionizes.` : `Elastic collision with a ${c.el} nucleus. The heavy nucleus recoils with only a small share (≤ ${(4 * A / Math.pow(A + 1, 2) * 100).toFixed(0)}%) of the neutron energy.` });
      if (c.el === 'H' && Er > 1e-4) { q.push({ type: 'p', E: Er, p, d: dr, t: tn, gen: s.gen + 1, parent: ev.id, born: 'recoil proton' }); count(h, 'Recoil protons'); }
      else { deposit(h, p, Er); dotsAlong(h, m, p, add(p, dr, 0.002 * h.D), tn, tn + 0.05, Er, { type: 'p', E: Er }); count(h, 'Recoil nuclei'); }
      d = nd; E = Math.max(Ep, ETH);
      if (E <= 1.5 * ETH && tr.thermalAt == null) { tr.thermalAt = tr.pts.length - 1; h.nTherm = coll; event(h, { t: tn, p, proc: 'thermalized', el: c.el, track: tr.id, desc: `After ${coll} collisions the neutron is in thermal equilibrium (≈0.025 eV). It now wanders until it is captured or escapes.` }); }
    } else if (c.kind === 'inelastic') {
      const Ep = Math.max(ETH, E - c.lev * (A + 1) / A);
      const ev = event(h, { t: tn, p, proc: 'n-inelastic', el: c.el, Ein: E, Eout: Ep, lev: c.lev, track: tr.id, desc: `Inelastic scattering: the neutron leaves the ${c.el} nucleus in an excited state, which emits a ${fmtE(c.lev)} γ ray.` });
      h.ledger.Q += 0; deposit(h, p, Math.max(0, E - Ep - c.lev));
      q.push({ type: 'gamma', E: c.lev, p, d: iso(), t: tn, gen: s.gen + 1, parent: ev.id, born: `de-excitation γ (${c.el}*)` }); count(h, 'Inelastic γ');
      E = Ep; d = iso();
    } else if (c.kind === 'np') {
      const Q = 0.626, Ept = (E + Q) * 14 / 15, Ec = (E + Q) / 15;
      const ev = event(h, { t: tn, p, proc: 'n-p', el: c.el, Ein: E, desc: '¹⁴N(n,p)¹⁴C: nitrogen captures the neutron and emits a 0.58 MeV proton; the nucleus becomes carbon-14.' });
      h.ledger.Q += Q; deposit(h, p, Ec); q.push({ type: 'p', E: Ept, p, d: iso(), t: tn, gen: s.gen + 1, parent: ev.id, born: '¹⁴N(n,p) proton' }); count(h, 'Captures');
      tr.end = 'captured'; h.nColl = coll; return;
    } else {
      const gs = NXS[c.el].capG, Qt = gs.reduce((a, b) => a + b, 0);
      const ev = event(h, { t: tn, p, proc: 'n-capture', el: c.el, Ein: E, gammas: gs, track: tr.id, desc: `Radiative capture: the ${c.el} nucleus absorbs the neutron, becomes a heavier isotope in an excited state, and releases its binding energy as γ ray${gs.length > 1 ? 's' : ''} (${gs.map(g => g.toFixed(2)).join(' + ')} MeV).` });
      h.ledger.Q += Qt; deposit(h, p, E);
      for (const g of gs) q.push({ type: 'gamma', E: g, p, d: iso(), t: tn, gen: s.gen + 1, parent: ev.id, born: `capture γ (${c.el})` });
      count(h, 'Captures'); tr.end = 'captured'; h.nColl = coll; return;
    }
  }
  deposit(h, p, E); tr.end = 'stopped';
}

// ---------------------------------------------------------------- summary numbers for the info panel
function info(type, E, mat, extra) {
  const m = MAT[mat], o = { mat: m.name, rho: m.rho };
  if (type === 'gamma' || type === 'xray') {
    const c = photonCoef(m, E); o.mu = c.tot; o.muRho = c.tot / m.rho; o.mfp = 1 / c.tot; o.hvl = Math.log(2) / c.tot;
    o.frac = { 'Photoelectric': c.photo / c.tot, 'Compton': c.comp / c.tot, 'Rayleigh': c.coh / c.tot, 'Pair production': c.pair / c.tot };
  } else if (type === 'n') {
    const X = neutronXS(m, E); o.mfp = 1 / X.tot; o.Sigma = X.tot; o.frac = {};
    for (const c of X.ch) { const k = c.kind === 'elastic' ? `Elastic (${c.el})` : c.kind === 'capture' ? `Capture (${c.el})` : c.kind === 'np' ? `(n,p) (${c.el})` : `Inelastic (${c.el})`; o.frac[k] = (o.frac[k] || 0) + c.S / X.tot; }
  } else {
    const t = type === 'beta' ? 'e' : type === 'alpha' ? 'alpha' : type, s = stopping(m, t, E);
    o.Scol = s.col; o.Srad = s.rad; o.LET = s.col * m.rho * 0.1; o.csda = csda(m, t, E) / m.rho; o.csdaG = csda(m, t, E);
    if (t === 'e') { o.frac = { 'Collision (ionization + excitation)': s.col / (s.col + s.rad), 'Radiative (bremsstrahlung)': s.rad / (s.col + s.rad) }; o.cher = m.n ? (beta('e', E) > 1 / m.n) : false; o.cherThr = m.n ? ME * (1 / Math.sqrt(1 - 1 / (m.n * m.n)) - 1) : null; }
  }
  o.W = m.W; o.ex = m.ex;
  return o;
}
function autoThickness(type, E, mat, opt) {
  const m = MAT[mat];
  if (type === 'gamma' || type === 'xray') return 1.6 / photonCoef(m, type === 'xray' ? (opt.kVp || 80) / 1000 * 0.45 : E).tot;
  if (type === 'n') return 4 / neutronXS(m, Math.max(E, 1e-6)).tot * (E < 1e-6 ? 1.2 : 1);
  if (type === 'beta') return 1.3 * csda(m, 'e', BETA[opt.nuc || 'Sr-90'].E0) / m.rho;
  return 1.25 * csda(m, type === 'alpha' ? 'alpha' : type, E) / m.rho;
}

const API = { ME, MAT, EL, BETA, simulate, info, autoThickness, csda, stopping, photonCoef, neutronXS, muTot, sampleBeta, sampleXray, betaShape, xraySpectrum, fmtE, seed, setSeed: seed };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RP = API;
})(typeof window !== 'undefined' ? window : globalThis);
