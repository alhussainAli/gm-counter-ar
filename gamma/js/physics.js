/* Gamma Spectroscopy AR — physics engine (educational approximation).
 * Coherent event model: one Monte Carlo photon history -> deposited energy ->
 * detector quanta -> preamp waveform -> ADC samples -> trapezoidal filter ->
 * energy estimate -> calibrated histogram channel.
 * Works in the browser (window.GP) and in Node (module.exports) for validation.
 */
(function (root) {
'use strict';

const ME = 510.9989;            // electron rest energy, keV
const RE2 = 7.9407877e-26;      // classical electron radius squared, cm^2
const NA = 6.02214076e23;

// ------------------------------------------------------------------ nuclear data
// Simplified line lists. Energies (keV) and emission probabilities (photons per
// 100 decays) from DDEP / LNHB "Table de Radionucléides", lnhb.fr (checked Oct 2026).
const DATA_SOURCE = 'DDEP/LNHB Recommended Data (lnhb.fr)';
const SOURCES = {
  'Cs-137': { half: '30.05 y', color: '#ffd34d',
    note: '661.655 keV γ is emitted by Ba-137m. Ba K x-rays (~32 keV) and weak lines are omitted.',
    lines: [{ E: 661.655, I: 85.01 }] },
  'Co-60': { half: '5.27 y', color: '#ffd34d',
    note: 'Two cascade γ rays. Lines below 0.01% omitted. True-coincidence summing is not modelled.',
    lines: [{ E: 1173.228, I: 99.85 }, { E: 1332.492, I: 99.9826 }] },
  'Na-22': { half: '2.60 y', color: '#ffd34d',
    note: '511 keV photons come from positron annihilation in the source capsule (180.7 per 100 decays). Their back-to-back correlation is not modelled.',
    lines: [{ E: 510.999, I: 180.7, tag: 'annihilation' }, { E: 1274.537, I: 99.94 }] },
  'Am-241': { half: '432.6 y', color: '#ffd34d',
    note: 'Np L x-rays (11.9–22.2 keV, 37.7%) and lines below 0.1% omitted.',
    lines: [{ E: 26.3446, I: 2.31 }, { E: 33.1963, I: 0.1215 }, { E: 59.5409, I: 35.92 }] },
  'Ba-133': { half: '10.54 y', color: '#ffd34d',
    note: 'Main γ lines plus Cs Kα1, Kα2 and Kβ1 x-rays. Kβ2 and lines below 0.45% omitted. Note the 79.61 / 81.00 keV doublet.',
    lines: [
      { E: 30.6254, I: 33.8, tag: 'Cs Kα2 x-ray' }, { E: 30.9731, I: 62.4, tag: 'Cs Kα1 x-ray' }, { E: 34.9873, I: 18.24, tag: 'Cs Kβ1 x-ray' },
      { E: 53.1622, I: 2.14 }, { E: 79.6142, I: 2.63 }, { E: 80.9979, I: 33.31 }, { E: 160.6121, I: 0.638 },
      { E: 223.2368, I: 0.45 }, { E: 276.3989, I: 7.13 }, { E: 302.8508, I: 18.31 }, { E: 356.0129, I: 62.05 }, { E: 383.8485, I: 8.94 }] },
  'Two-line test': { half: '—', synthetic: true,
    note: 'Synthetic source: two equal lines with adjustable separation. Not a real nuclide.',
    lines: [{ E: 661, I: 50 }, { E: 665, I: 50 }] }
};
// Natural background (illustrative mix). K-40 energy and yield from DDEP; other
// energies are standard U/Th-series values, relative weights are illustrative.
const BKG_LINES = [
  { E: 1460.822, w: 0.30, tag: 'K-40' }, { E: 609.312, w: 0.17, tag: 'Bi-214' }, { E: 351.932, w: 0.12, tag: 'Pb-214' },
  { E: 2614.511, w: 0.10, tag: 'Tl-208' }, { E: 583.191, w: 0.09, tag: 'Tl-208' }, { E: 911.204, w: 0.08, tag: 'Ac-228' },
  { E: 1764.494, w: 0.06, tag: 'Bi-214' }, { E: 238.632, w: 0.08, tag: 'Pb-212' }];
const BKG_LINE_FRACTION = 0.30; // remainder is a falling continuum (scattered radiation)

// ------------------------------------------------------------------ attenuation data
// NIST XCOM / Hubbell–Seltzer mass attenuation coefficients μ/ρ (cm²/g), total with coherent.
const GRID = [15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 2000, 3000];
const MU = {
  Ge: [91.52, 42.22, 13.85, 6.207, 3.335, 2.023, 0.9501, 0.555, 0.2491, 0.1661, 0.1131, 0.09327, 0.08212, 0.07452, 0.06426, 0.05727, 0.05101, 0.04657, 0.04086, 0.03524],
  Na: [4.694, 2.057, 0.7197, 0.3969, 0.2804, 0.2268, 0.1796, 0.1585, 0.1335, 0.1199, 0.1029, 0.09185, 0.08372, 0.07736, 0.06788, 0.061, 0.05454, 0.04968, 0.04282, 0.03487],
  Al: [7.955, 3.441, 1.128, 0.5685, 0.3681, 0.2778, 0.2018, 0.1704, 0.1378, 0.1223, 0.1042, 0.09276, 0.08445, 0.07802, 0.06841, 0.06146, 0.05496, 0.05006, 0.04324, 0.03541]
};
// Iodine has its K edge (33.1694 keV) inside the grid.
const I_GRID = [15, 20, 30, 33.1694, 33.1694, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1250, 1500, 2000, 3000];
const MU_I = [55.12, 25.43, 8.561, 6.553, 35.82, 22.10, 12.32, 7.579, 3.51, 1.942, 0.6978, 0.3663, 0.1771, 0.1217, 0.09701, 0.08313, 0.06749, 0.05841, 0.05111, 0.04647, 0.04124, 0.03716];
const W_NA = 22.98977 / (22.98977 + 126.90447), W_I = 1 - W_NA;

function loglog(xs, ys, x) {
  if (x <= xs[0]) return ys[0] * Math.pow(x / xs[0], -2.8);
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1] * Math.pow(x / xs[n - 1], -0.5);
  let i = 0; while (!(xs[i] <= x && x < xs[i + 1])) i++;
  if (xs[i + 1] === xs[i]) i++;          // above an absorption edge
  const t = Math.log(x / xs[i]) / Math.log(xs[i + 1] / xs[i]);
  return Math.exp(Math.log(ys[i]) + t * (Math.log(ys[i + 1]) - Math.log(ys[i])));
}
// Approximate pair-production coefficients (cm²/g), scaled from Z²/A; illustrative.
const PAIR = { Ge: [[1022, 0], [1250, 1.0e-4], [1500, 3.0e-4], [2000, 1.6e-3], [3000, 5.5e-3]],
               NaI: [[1022, 0], [1250, 1.4e-4], [1500, 4.0e-4], [2000, 2.1e-3], [3000, 7.2e-3]] };
function pairMu(mat, E) {
  const t = PAIR[mat]; if (E <= 1022) return 0;
  for (let i = 0; i < t.length - 1; i++) if (E <= t[i + 1][0]) return t[i][1] + (t[i + 1][1] - t[i][1]) * (E - t[i][0]) / (t[i + 1][0] - t[i][0]);
  return t[t.length - 1][1] * (E / 3000);
}
// Klein–Nishina total cross section per electron (cm²)
function sigmaKN(E) {
  const k = E / ME, a = 1 + 2 * k, L = Math.log(a);
  return 2 * Math.PI * RE2 * ((1 + k) / (k * k) * (2 * (1 + k) / a - L / k) + L / (2 * k) - (1 + 3 * k) / (a * a));
}
const MATS = {
  Ge:  { rho: 5.323, ZA: 32 / 72.630, tot: E => loglog(GRID, MU.Ge, E), pair: 'Ge',
         K: { edge: 11.103, frac: 0.87, omega: 0.535, lines: [[9.876, 0.88], [10.982, 0.12]] } },
  NaI: { rho: 3.667, ZA: 64 / 149.894, tot: E => W_NA * loglog(GRID, MU.Na, E) + W_I * loglog(I_GRID, MU_I, E), pair: 'NaI',
         K: { edge: 33.169, frac: 0.84, omega: 0.882, lines: [[28.51, 0.81], [32.29, 0.19]] } },
  Al:  { rho: 2.699, ZA: 13 / 26.98, tot: E => loglog(GRID, MU.Al, E) }
};
// Partial linear attenuation coefficients (1/cm). Compton from Klein–Nishina,
// pair from the table above, photoelectric = remainder (includes the small
// coherent-scattering part, which is treated as absorption: an approximation).
function coeffsExact(matKey, E) {
  const m = MATS[matKey];
  const tot = m.tot(E);
  const comp = Math.min(tot, sigmaKN(E) * NA * m.ZA);
  const pair = m.pair ? Math.min(tot - comp, pairMu(m.pair, E)) : 0;
  const photo = Math.max(0, tot - comp - pair);
  return { tot: tot * m.rho, photo: photo * m.rho, comp: comp * m.rho, pair: pair * m.rho };
}
// Fast lookup: 4000-point log-energy table per material (1 keV – 3.5 MeV), linear interpolation.
const _tab = {}, TAB_N = 4000, TAB_L0 = 0, TAB_L1 = Math.log(3500);
function table(matKey) {
  if (_tab[matKey]) return _tab[matKey];
  const t = new Float64Array(TAB_N * 4);
  for (let i = 0; i < TAB_N; i++) {
    const c = coeffsExact(matKey, Math.exp(TAB_L0 + (TAB_L1 - TAB_L0) * i / (TAB_N - 1)));
    t[4 * i] = c.tot; t[4 * i + 1] = c.photo; t[4 * i + 2] = c.comp; t[4 * i + 3] = c.pair;
  }
  return (_tab[matKey] = t);
}
const _out = { tot: 0, photo: 0, comp: 0, pair: 0 };
function coeffs(matKey, E) {
  const t = table(matKey);
  let x = (Math.log(Math.max(1, Math.min(3499, E))) - TAB_L0) / (TAB_L1 - TAB_L0) * (TAB_N - 1);
  const i = Math.min(TAB_N - 2, Math.floor(x)), f = x - i, j = 4 * i;
  _out.tot = t[j] + f * (t[j + 4] - t[j]); _out.photo = t[j + 1] + f * (t[j + 5] - t[j + 1]);
  _out.comp = t[j + 2] + f * (t[j + 6] - t[j + 2]); _out.pair = t[j + 3] + f * (t[j + 7] - t[j + 3]);
  return _out;
}

// ------------------------------------------------------------------ random numbers
function makeRng(seed) {
  if (seed == null) return Math.random;
  let s = seed >>> 0;
  return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let rng = Math.random;
function gauss() { let u = 0; while (u === 0) u = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function poisson(l) {
  if (l <= 0) return 0;
  if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss()));
  const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rng(); } while (p > L); return k - 1;
}
function isoDir() { const c = 2 * rng() - 1, s = Math.sqrt(1 - c * c), f = 2 * Math.PI * rng(); return [s * Math.cos(f), s * Math.sin(f), c]; }
function rotate(d, cosT, phi) { // new direction at polar angle (cosT, phi) relative to d
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT)), cp = Math.cos(phi), sp = Math.sin(phi);
  const [u, v, w] = d;
  if (Math.abs(w) > 0.99999) return [sinT * cp, sinT * sp, cosT * Math.sign(w)];
  const s = Math.sqrt(1 - w * w);
  return [u * cosT + sinT * (u * w * cp - v * sp) / s, v * cosT + sinT * (v * w * cp + u * sp) / s, w * cosT - s * sinT * cp];
}
function sampleKN(E) { // Butcher–Messel sampling of Klein–Nishina; returns {Ep, cosT}
  const k = E / ME, e0 = 1 / (1 + 2 * k), a1 = -Math.log(e0), a2 = (1 - e0 * e0) / 2;
  for (;;) {
    let eps;
    if (rng() * (a1 + a2) < a1) eps = Math.exp(-a1 * rng()); else eps = Math.sqrt(e0 * e0 + (1 - e0 * e0) * rng());
    const omc = (1 - eps) / (eps * k), sin2 = omc * (2 - omc), g = 1 - eps * sin2 / (1 + eps * eps);
    if (rng() <= g) return { Ep: eps * E, cosT: 1 - omc };
  }
}

// ------------------------------------------------------------------ detectors
// Illustrative defaults. All are adjustable in the app.
const DETECTORS = {
  hpge: { key: 'hpge', name: 'HPGe', mat: 'Ge', color: '#8ab4f8',
    crystal: { R: 3.0, L: 6.0, holeR: 0.5, holeDepth: 4.5 },
    window: [{ mat: 'Al', t: 0.10, label: 'Al endcap 1.0 mm' }, { mat: 'Ge', t: 0.07, label: 'Ge dead layer 0.7 mm' }],
    gap: 0.5, channels: 8192,
    res: { eps: 2.96e-3, F: 0.10, cc: 2.7e-4 },               // keV per e-h pair, Fano factor, charge-collection term
    dsp: { rise: 4.0, flat: 1.0, tau: 50, noise: 4.4 },        // µs, µs, µs, keV-equiv RMS per sample
    drift: 0.01 },                                             // cm/ns carrier drift velocity (≈ saturated)
  nai: { key: 'nai', name: 'NaI(Tl)', mat: 'NaI', color: '#f0a875',
    crystal: { R: 3.81, L: 7.62, holeR: 0, holeDepth: 0 },
    window: [{ mat: 'Al', t: 0.05, label: 'Al housing 0.5 mm' }],
    gap: 0.3, channels: 1024,
    res: { LY: 38, eta: 0.15, intrinsic: 0.054, enf: 1.25, gain: 1e6 }, // photons/keV, light collection×QE, intrinsic FWHM (rel), PMT excess-noise factor
    dsp: { rise: 1.0, flat: 0.8, tau: 50, noise: 2.4, decay: 0.23 }   // decay: NaI(Tl) scintillation decay (µs)
  }
};
const CONFIG = { fs: 100, bits: 14, gainFS: 3000, threshold: 3.0, pileup: true, pur: false };
// fs in MS/s, gainFS = energy (keV) at ADC full scale

function cloneDet(d) { return JSON.parse(JSON.stringify(d)); }

// ------------------------------------------------------------------ Monte Carlo transport
function insideOuter(c, p) { return p[2] >= 0 && p[2] <= c.L && p[0] * p[0] + p[1] * p[1] <= c.R * c.R; }
function inHole(c, p) { return c.holeR > 0 && p[2] >= c.L - c.holeDepth && p[0] * p[0] + p[1] * p[1] < c.holeR * c.holeR; }
function exitPoint(c, p, d, sMax) { // bisection to the outer boundary
  let a = 0, b = sMax;
  for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (insideOuter(c, [p[0] + d[0] * m, p[1] + d[1] * m, p[2] + d[2] * m])) a = m; else b = m; }
  return [p[0] + d[0] * a, p[1] + d[1] * a, p[2] + d[2] * a];
}

/** Simulate one photon of energy E0 emitted by a point source on the detector axis.
 * dist = source-to-detector-face distance (cm). Coordinates: crystal frame, z along
 * the axis from the crystal front face, source at z = -(dist + gap). */
function simulatePhoton(det, E0, dist, opt) {
  opt = opt || {};
  const c = det.crystal, zs = dist + det.gap;
  const ev = { det: det.key, E0, tag: opt.tag || '', src: [0, 0, -zs], tracks: [], ints: [], escaped: [],
               Edep: 0, Eesc: 0, Ewin: 0, pair: false, cls: '' };
  let dir, entry;
  if (opt.background) { // isotropic flux on the front face (cosine-weighted)
    const r = c.R * Math.sqrt(rng()), f = 2 * Math.PI * rng();
    entry = [r * Math.cos(f), r * Math.sin(f), 0];
    const ct = Math.sqrt(rng()), st = Math.sqrt(1 - ct * ct), g = 2 * Math.PI * rng();
    dir = [st * Math.cos(g), st * Math.sin(g), ct];
    ev.src = [entry[0] - dir[0] * 30, entry[1] - dir[1] * 30, -30 * dir[2]];
  } else {
    const cosMax = zs / Math.sqrt(zs * zs + c.R * c.R);
    const ct = 1 - rng() * (1 - cosMax), st = Math.sqrt(1 - ct * ct), f = 2 * Math.PI * rng();
    dir = [st * Math.cos(f), st * Math.sin(f), ct];
    const t = zs / ct; entry = [dir[0] * t, dir[1] * t, 0];
  }
  ev.entry = entry;
  ev.tracks.push({ a: ev.src, b: entry, E: E0, kind: 'gamma', end: 'enter' });
  // entrance window / dead layer
  for (const w of det.window) {
    const mu = coeffs(w.mat, E0).tot, path = w.t / dir[2];
    if (rng() > Math.exp(-mu * path)) { ev.Ewin = E0; ev.cls = 'window'; ev.windowLabel = w.label; return ev; }
  }
  const stack = [{ p: entry, d: dir, E: E0, kind: 'gamma' }];
  let guard = 0;
  while (stack.length && guard++ < 200) {
    let { p, d, E, kind } = stack.pop();
    const start = p;
    for (;;) {
      if (E < 1.0) { // below 1 keV: absorb locally
        ev.ints.push({ p, type: 'absorb', Ein: E, Edep: E, Eout: 0 }); ev.Edep += E; break;
      }
      const k = coeffs(det.mat, E);
      const s = -Math.log(1 - rng()) / k.tot;
      const q = [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
      if (!insideOuter(c, q)) {
        const x = exitPoint(c, p, d, s);
        ev.tracks.push({ a: start, b: x, E, kind, end: 'escape' });
        ev.tracks[ev.tracks.length - 1].far = [x[0] + d[0] * 25, x[1] + d[1] * 25, x[2] + d[2] * 25];
        ev.escaped.push({ E, kind }); ev.Eesc += E; break;
      }
      if (inHole(c, q)) { p = q; continue; } // vacuum in the core hole: no interaction
      ev.tracks.push({ a: start, b: q, E, kind, end: 'int' });
      const r = rng() * k.tot;
      if (r < k.photo) {
        const K = MATS[det.mat].K;
        if (E > K.edge && rng() < K.frac * K.omega) { // K x-ray fluorescence
          const Ex = rng() < K.lines[0][1] ? K.lines[0][0] : K.lines[1][0];
          ev.ints.push({ p: q, type: 'photo', Ein: E, Edep: E - Ex, Eout: Ex, xray: Ex });
          ev.Edep += E - Ex;
          stack.push({ p: q, d: isoDir(), E: Ex, kind: 'xray' });
        } else {
          ev.ints.push({ p: q, type: 'photo', Ein: E, Edep: E, Eout: 0 }); ev.Edep += E;
        }
        break;
      } else if (r < k.photo + k.comp) {
        const kn = sampleKN(E), Te = E - kn.Ep;
        ev.ints.push({ p: q, type: 'compton', Ein: E, Edep: Te, Eout: kn.Ep, angle: Math.acos(kn.cosT) * 180 / Math.PI });
        ev.Edep += Te;
        stack.push({ p: q, d: rotate(d, kn.cosT, 2 * Math.PI * rng()), E: kn.Ep, kind: kind === 'gamma' ? 'scatter' : kind });
        break;
      } else {
        const T = E - 2 * ME;
        ev.ints.push({ p: q, type: 'pair', Ein: E, Edep: T, Eout: 2 * ME });
        ev.Edep += T; ev.pair = true;
        const u = isoDir();
        stack.push({ p: q, d: u, E: ME, kind: 'annih' }, { p: q, d: [-u[0], -u[1], -u[2]], E: ME, kind: 'annih' });
        break;
      }
    }
  }
  ev.cls = classify(ev);
  return ev;
}
function classify(ev) {
  if (ev.cls === 'window') return 'window';
  if (!ev.ints.length) return 'through';
  const tol = 1e-6 * ev.E0;
  if (Math.abs(ev.Edep - ev.E0) < tol) return 'full';
  if (ev.pair) {
    const n511 = ev.escaped.filter(e => e.kind === 'annih' && Math.abs(e.E - ME) < 1e-6).length;
    if (n511 === 2 && Math.abs(ev.Edep - (ev.E0 - 2 * ME)) < tol) return 'double-escape';
    if (n511 === 1 && Math.abs(ev.Edep - (ev.E0 - ME)) < tol) return 'single-escape';
  }
  if (ev.escaped.length === 1 && ev.escaped[0].kind === 'xray') return 'xray-escape';
  return 'partial';
}
const CLASS_TEXT = {
  window: 'Absorbed before reaching the active crystal (window or dead layer). No pulse.',
  through: 'Passed through without interacting. No pulse — most photons above a few hundred keV do this in part.',
  full: 'Full-energy deposition: every bit of the photon energy stayed in the crystal. This event lands in the photopeak.',
  'single-escape': 'Pair production, one 511 keV annihilation photon escaped. Lands in the single-escape peak (E − 511 keV).',
  'double-escape': 'Pair production, both 511 keV photons escaped. Lands in the double-escape peak (E − 1022 keV).',
  'xray-escape': 'Photoabsorption, but the K x-ray escaped. Lands in the x-ray escape peak just below the photopeak.',
  partial: 'Partial deposition: a scattered photon escaped. This event lands in the Compton continuum, below the photopeak.'
};

// ------------------------------------------------------------------ detector quanta
/** Convert deposited energy into the detector's physical signal carriers. Returns the
 * energy-equivalent collected signal Eq (keV) plus the intermediate numbers. */
function quanta(det, Edep, ev) {
  if (det.key === 'hpge') {
    const r = det.res, Nmean = Edep / r.eps;
    const N = Math.max(0, Nmean + gauss() * Math.sqrt(r.F * Nmean));
    const coll = 1 + gauss() * r.cc;          // charge-collection / trapping variation
    return { kind: 'eh', Nmean, N, Eq: N * r.eps * coll, eps: r.eps, F: r.F };
  }
  const r = det.res;
  const sigInt = r.intrinsic / 2.355;
  const Nph = Math.max(0, Edep * r.LY * (1 + gauss() * sigInt) + gauss() * Math.sqrt(Edep * r.LY));
  const pe = Nph * r.eta;
  const Npe = pe < 30 ? poisson(pe) : Math.max(0, Math.round(pe + gauss() * Math.sqrt(pe * (1 - r.eta))));
  const G = Npe > 0 ? r.gain * (1 + gauss() * Math.sqrt((r.enf - 1) / Npe)) : 0;
  const Q = Npe * G;
  return { kind: 'pe', Nph, NphMean: Edep * r.LY, Npe, pePerKeV: r.LY * r.eta, gain: r.gain, Q, Eq: Q / (r.gain * r.LY * r.eta) };
}
/** Model FWHM (keV) at energy E, combining all terms analytically. */
function modelFWHM(det, E, cfg) {
  const sE = filteredNoise(det, cfg || CONFIG).sigma;
  if (det.key === 'hpge') {
    const r = det.res;
    const s2 = r.F * r.eps * E + Math.pow(r.cc * E, 2) + sE * sE;
    return 2.355 * Math.sqrt(s2);
  }
  const r = det.res, p = r.LY * r.eta;
  const rel2 = r.enf / (p * E) + Math.pow(r.intrinsic / 2.355, 2) + 1 / (r.LY * E) * 0; // photon-statistics term folded into pe term
  return 2.355 * Math.sqrt(rel2 * E * E + sE * sE);
}
function fwhmTerms(det, E, cfg) {
  const sE = filteredNoise(det, cfg || CONFIG).sigma;
  if (det.key === 'hpge') {
    const r = det.res;
    return [{ name: 'Charge-carrier statistics (Fano)', fwhm: 2.355 * Math.sqrt(r.F * r.eps * E) },
            { name: 'Charge collection', fwhm: 2.355 * r.cc * E }, { name: 'Electronic noise', fwhm: 2.355 * sE }];
  }
  const r = det.res, p = r.LY * r.eta;
  return [{ name: 'Photoelectron statistics', fwhm: 2.355 * Math.sqrt(r.enf * E / p) },
          { name: 'Intrinsic (non-proportionality)', fwhm: r.intrinsic * E }, { name: 'Electronic noise', fwhm: 2.355 * sE }];
}

// ------------------------------------------------------------------ pulse processing
const _filterCache = new Map();
function dspParams(det, cfg) {
  const Ts = 1000 / cfg.fs;                        // ns per sample
  const k = Math.max(2, Math.round(det.dsp.rise * 1000 / Ts));
  const m = Math.max(1, Math.round(det.dsp.flat * 1000 / Ts));
  const M = 1 / (Math.exp(Ts / (det.dsp.tau * 1000)) - 1);
  const lsb = cfg.gainFS / Math.pow(2, cfg.bits);  // keV per ADC code
  return { Ts, k, m, l: k + m, M, lsb };
}
function trapezoid(x, k, l, M) { // Jordanov–Knoll recursive trapezoidal filter with pole-zero correction
  const n = x.length, out = new Float64Array(n);
  let p = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - (i >= k ? x[i - k] : 0) - (i >= l ? x[i - l] : 0) + (i >= k + l ? x[i - k - l] : 0);
    p += d; s += p + M * d; out[i] = s;
  }
  return out;
}
/** Charge-sensitive preamp: each increment of collected charge steps the output up,
 * then decays with the feedback time constant tau (all times in ns). */
function preampTrace(comps, A, n, pre, Ts, tau) {
  const x = new Float64Array(n), dec = Math.exp(-Ts / tau);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = (i - pre) * Ts;
    let g = 0; if (t > 0) for (const c of comps) g += c.w * c.fn(t);
    x[i] = (i ? x[i - 1] * dec : 0) + A * (g - prev); prev = g;
  }
  return x;
}
function filterInfo(det, cfg) {
  const P = dspParams(det, cfg), key = det.key + P.k + '/' + P.m + '/' + P.M.toFixed(3);
  if (_filterCache.has(key)) return Object.assign({}, P, _filterCache.get(key));
  // normalisation ("calibration"): response to a noise-free reference pulse of unit
  // amplitude with this detector's nominal shape, read where the energy is sampled
  const pre = 10, n = pre + P.k + P.l + 40;
  const ref = det.key === 'hpge' ? smooth([{ w: 1, fn: t => 1 }], 15) : smooth([{ w: 1, fn: t => 1 - Math.exp(-t / (det.dsp.decay * 1000)) }], 10);
  const x = preampTrace(ref, 1, n, pre, P.Ts, det.dsp.tau * 1000);
  const y = trapezoid(x, P.k, P.l, P.M), norm = y[pre + P.k + P.m - 1];
  // white-noise gain = sqrt(sum of squared impulse response)
  const imp = new Float64Array(P.k + P.l + 4); imp[0] = 1;
  const h = trapezoid(imp, P.k, P.l, P.M); let ss = 0; for (const v of h) ss += v * v;
  const info = { norm, noiseGain: Math.sqrt(ss) / norm };
  _filterCache.set(key, info);
  return Object.assign({}, P, info);
}
function filteredNoise(det, cfg) {
  const f = filterInfo(det, cfg);
  const perSample = Math.sqrt(det.dsp.noise * det.dsp.noise + f.lsb * f.lsb / 12); // keV-equiv
  return { sigma: perSample * f.noiseGain, perSample, lsb: f.lsb, k: f.k, m: f.m, Ts: f.Ts, M: f.M };
}

/** Full waveform-level processing of one event (used in "Follow one photon"). */
function processWaveform(det, ev, q, cfg) {
  cfg = cfg || CONFIG;
  const f = filterInfo(det, cfg);
  const view = Math.round(2000 / f.Ts);                    // 2 µs of pre-trigger shown
  const pre = f.k + f.l + 60 + view;                       // long enough for the filter to settle
  const n = pre + f.k + f.l + Math.round(3000 / f.Ts);
  const tau = det.dsp.tau * 1000, Ts = f.Ts;
  const baseline = Math.round(0.03 * Math.pow(2, cfg.bits));
  const comps = signalComponents(det, ev);
  const analog = preampTrace(comps, q.Eq, n, pre, Ts, tau); // keV-equivalent preamp output, noise-free
  const maxCode = Math.pow(2, cfg.bits) - 1;
  const noisy = new Float64Array(n), codes = new Int32Array(n);
  let overflow = false;
  for (let i = 0; i < n; i++) {
    noisy[i] = analog[i] + gauss() * det.dsp.noise;
    let c = Math.round(noisy[i] / f.lsb) + baseline;
    if (c > maxCode) { c = maxCode; overflow = true; } if (c < 0) c = 0;
    codes[i] = c;
  }
  let b = 0; for (let i = 0; i < pre - 5; i++) b += codes[i]; b /= (pre - 5);   // baseline from the pre-trigger
  const x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = codes[i] - b;
  const y = trapezoid(x, f.k, f.l, f.M);
  const tSample = pre + f.k + f.m - 1;                  // end of the flat top
  const trap = new Float64Array(n); for (let i = 0; i < n; i++) trap[i] = y[i] / f.norm * f.lsb;
  const Eest = overflow ? NaN : trap[tSample];
  const b0 = binOf(det, Eest, cfg);
  return { Ts, pre, view0: pre - view, n, analog, noisy, codes, baseline: b, lsb: f.lsb, trap, tSample, Eest, overflow,
           k: f.k, m: f.m, ...b0, sigmaE: filteredNoise(det, cfg).sigma };
}
/** Time-shape of the collected charge (fraction collected vs time, ns). */
function signalComponents(det, ev) {
  const sites = ev.ints.filter(i => i.Edep > 0), Etot = sites.reduce((s, i) => s + i.Edep, 0) || 1;
  if (det.key === 'hpge') {
    const c = det.crystal, R = c.R, rc = Math.max(c.holeR, 0.05), v = det.drift, out = [];
    for (const s of sites) {
      const r = Math.min(R - 0.01, Math.max(rc + 0.02, Math.hypot(s.p[0], s.p[1])));
      const we = 1 - Math.log(r / rc) / Math.log(R / rc), wh = 1 - we;   // Ramo weighting-potential split
      const te = Math.max(5, (R - r) / v), th = Math.max(5, (r - rc) / v);
      const w = s.Edep / Etot;
      out.push({ w: w * we, fn: t => Math.min(1, t / te), te, r }, { w: w * wh, fn: t => Math.min(1, t / th), th, r });
    }
    return smooth(out, 15);
  }
  const td = det.dsp.decay * 1000;
  return smooth([{ w: 1, fn: t => 1 - Math.exp(-t / td) }], 10);
}
function smooth(comps, rc) { // first-order preamp bandwidth (rc ns) — gentle rounding of the edges
  return comps.map(c => ({ w: c.w, fn: t => { const a = c.fn(t), b = c.fn(Math.max(0, t - rc)); return 0.5 * (a + b); }, te: c.te, th: c.th, r: c.r }));
}
function riseTimeNs(det, ev) {
  if (det.key !== 'hpge') return det.dsp.decay * 1000 * 2.2;
  const comps = signalComponents(det, ev); let t = 0;
  for (const c of comps) t = Math.max(t, c.te || 0, c.th || 0);
  return t;
}
function binOf(det, E, cfg) {
  cfg = cfg || CONFIG;
  const b = cfg.gainFS / det.channels;                     // keV per channel
  const ch = isFinite(E) ? Math.floor(E / b) : -1;
  return { channel: ch, keVperCh: b, binLo: ch * b, binHi: (ch + 1) * b, inRange: ch >= 0 && ch < det.channels };
}

/** Fast estimate used in "Build a spectrum": same statistics as processWaveform,
 * applied analytically (noise filtered by the same trapezoid). */
function fastEstimate(det, q, cfg) {
  const fn = filteredNoise(det, cfg);
  const E = q.Eq + gauss() * fn.sigma;
  return E;
}

// ------------------------------------------------------------------ acquisition
function lineList(name, opts) {
  const s = SOURCES[name]; if (!s) return [];
  if (s.synthetic) { const c = opts.twoCentre, h = opts.twoSep / 2; return [{ E: c - h, I: 50 }, { E: c + h, I: 50 }]; }
  return s.lines;
}
/** Emission summary: activity (Bq) -> emitted photons/s -> photons reaching crystal face. */
function rates(det, srcs, dist, bkgLevel, opts) {
  const c = det.crystal, zs = dist + det.gap;
  const frac = (1 - zs / Math.sqrt(zs * zs + c.R * c.R)) / 2; // solid-angle fraction Ω/4π (front face)
  let activity = 0, emitted = 0; const lines = [];
  for (const s of srcs) {
    if (!s.on) continue;
    const A = s.kBq * 1000; activity += A;
    for (const L of lineList(s.name, opts)) {
      const em = A * L.I / 100; emitted += em;
      lines.push({ src: s.name, E: L.E, I: L.I, tag: L.tag, emitted: em, incident: em * frac });
    }
  }
  const bkgIncident = bkgLevel * Math.PI * c.R * c.R;
  const incident = lines.reduce((a, l) => a + l.incident, 0) + bkgIncident;
  return { activity, emitted, frac, lines, bkgIncident, incident };
}
function sampleBkgEnergy() {
  if (rng() < BKG_LINE_FRACTION) {
    let r = rng(), tot = BKG_LINES.reduce((a, l) => a + l.w, 0) * r;
    for (const l of BKG_LINES) { tot -= l.w; if (tot <= 0) return { E: l.E, tag: l.tag }; }
  }
  // continuum ∝ E^-1.3 between 30 and 2700 keV (inverse CDF)
  const a = -0.3, lo = Math.pow(30, a), hi = Math.pow(2700, a);
  return { E: Math.pow(lo + rng() * (hi - lo), 1 / a), tag: 'background continuum' };
}

/** Streaming acquisition for one detector: random arrivals, MC transport, quanta,
 * filtered-noise energy estimate, pile-up/dead time, histogram. */
class Acquisition {
  constructor(det) { this.det = det; this.reset(); }
  reset() {
    this.hist = new Float64Array(this.det.channels);
    this.real = 0; this.dead = 0; this.incident = 0; this.interacted = 0; this.recorded = 0; this.piled = 0; this.lost = 0; this.overflow = 0;
    this.pending = null; this.lineTally = new Map(); this.lastEvent = null; this.lastRecorded = null; this.window = 0;
  }
  /** Advance simulated time by dt seconds. Returns events kept for animation (a few). */
  step(dt, R, srcList, dist, cfg, opts, keep) {
    const det = this.det, f = filterInfo(det, cfg);
    const tRise = f.k * f.Ts * 1e-9, tSamp = (f.k + f.m) * f.Ts * 1e-9, tBusy = (f.k + f.l) * f.Ts * 1e-9;
    const n = poisson(R.incident * dt);
    const times = new Float64Array(n); for (let i = 0; i < n; i++) times[i] = this.real + rng() * dt; times.sort();
    const kept = [];
    const lineW = R.lines.map(l => l.incident), totW = lineW.reduce((a, b) => a + b, 0) + R.bkgIncident;
    for (let i = 0; i < n; i++) {
      let r = rng() * totW, L = null;
      for (let j = 0; j < lineW.length; j++) { r -= lineW[j]; if (r <= 0) { L = R.lines[j]; break; } }
      let ev;
      if (L) ev = simulatePhoton(det, L.E, dist, { tag: L.src });
      else { const b = sampleBkgEnergy(); ev = simulatePhoton(det, b.E, dist, { background: true, tag: b.tag }); }
      this.incident++;
      if (L) {
        const key = L.src + '|' + L.E.toFixed(3);
        const t = this.lineTally.get(key) || { src: L.src, E: L.E, I: L.I, incident: 0, full: 0, frac: R.frac };
        t.incident++; if (ev.cls === 'full') t.full++; this.lineTally.set(key, t);
      }
      if (keep && kept.length < keep && ev.cls !== 'window') kept.push(ev);
      if (ev.Edep < cfg.threshold) continue;
      this.interacted++;
      const q = quanta(det, ev.Edep, ev);
      const E = fastEstimate(det, q, cfg);
      this.lastEvent = { ev, q, E };
      this.pulse(times[i], E, ev, q, cfg, tRise, tSamp, tBusy);
    }
    this.real += dt;
    if (this.pending && this.real > this.pending.t + tBusy) this.flush(cfg);
    return kept;
  }
  pulse(t, E, ev, q, cfg, tRise, tSamp, tBusy) {
    const P = this.pending;
    if (cfg.pileup && P) {
      if (t < P.t + tSamp) {           // second step arrives before the energy is sampled -> sum (pile-up)
        if (cfg.pur) P.rejected = true; else P.E += E * Math.max(0, Math.min(1, (P.t + tSamp - t) / tRise));
        P.piled = true; this.piled++; return;
      }
      if (t < P.t + tBusy) {           // arrives during the busy (falling-edge) period -> lost
        if (cfg.pur) P.rejected = true;
        this.lost++; return;
      }
    }
    if (P) this.flush(cfg);
    this.pending = { t, E, ev, q };
    if (cfg.pileup) this.dead += tBusy;
  }
  flush(cfg) {
    const P = this.pending; this.pending = null; if (!P) return;
    if (P.rejected) { this.lost++; return; }
    const b = binOf(this.det, P.E, cfg);
    if (!b.inRange) { this.overflow++; return; }
    this.hist[b.channel]++; this.recorded++;
    this.lastRecorded = { ev: P.ev, q: P.q, E: P.E, channel: b.channel, piled: !!P.piled };
  }
  get live() { return Math.max(0, this.real - this.dead); }
}

/** Find a peak near Eguess in a histogram and measure FWHM (linear background). */
function measurePeak(hist, keVperCh, Eguess, halfWidth) {
  const n = hist.length, c0 = Math.round(Eguess / keVperCh), w = Math.max(3, Math.round(halfWidth / keVperCh));
  let lo = Math.max(1, c0 - w), hi = Math.min(n - 2, c0 + w), imax = lo;
  for (let i = lo; i <= hi; i++) if (hist[i] > hist[imax]) imax = i;
  if (hist[imax] < 5) return null;
  // background from the mean of 3 bins at each edge of a ±2w window
  const bl = Math.max(0, imax - 2 * w), br = Math.min(n - 3, imax + 2 * w);
  const yl = (hist[bl] + hist[bl + 1] + hist[bl + 2]) / 3, yr = (hist[br] + hist[br + 1] + hist[br + 2]) / 3;
  const bg = i => yl + (yr - yl) * (i - bl) / Math.max(1, br - bl);
  const peak = hist[imax] - bg(imax); if (peak <= 0) return null;
  const half = peak / 2;
  let L = imax; while (L > bl && hist[L] - bg(L) > half) L--;
  let Rr = imax; while (Rr < br && hist[Rr] - bg(Rr) > half) Rr++;
  const xl = L + (half - (hist[L] - bg(L))) / ((hist[L + 1] - bg(L + 1)) - (hist[L] - bg(L)) || 1);
  const xr = Rr - (half - (hist[Rr] - bg(Rr))) / ((hist[Rr - 1] - bg(Rr - 1)) - (hist[Rr] - bg(Rr)) || 1);
  let sw = 0, sx = 0, net = 0;
  const a = Math.max(bl, Math.floor(2 * xl - imax - 1)), b2 = Math.min(br, Math.ceil(2 * xr - imax + 1));
  for (let i = a; i <= b2; i++) { const y = Math.max(0, hist[i] - bg(i)); sw += y; sx += y * (i + 0.5); net += y; }
  const centroid = sw > 0 ? sx / sw * keVperCh : (imax + 0.5) * keVperCh;
  const fwhm = (xr - xl) * keVperCh;
  return { centroid, fwhm, R: fwhm / centroid * 100, net, height: peak, bgAt: bg(imax), chMax: imax };
}

const API = { ME, SOURCES, DATA_SOURCE, BKG_LINES, DETECTORS, CONFIG, MATS, coeffs: (m, E) => Object.assign({}, coeffs(m, E)), coeffsExact, sigmaKN, simulatePhoton, classify, CLASS_TEXT,
  quanta, modelFWHM, fwhmTerms, filterInfo, filteredNoise, processWaveform, signalComponents, riseTimeNs, binOf, fastEstimate,
  rates, lineList, Acquisition, measurePeak, cloneDet, setSeed: s => { rng = makeRng(s); }, rand: () => rng(), gauss: () => gauss() };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GP = API;
})(typeof window !== 'undefined' ? window : globalThis);
