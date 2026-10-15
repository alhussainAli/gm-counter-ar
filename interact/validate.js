#!/usr/bin/env node
/* Validation checklist for Radiation–Matter Interactions AR. Run: node interact/validate.js */
'use strict';
const path = require('path'), fs = require('fs');
const P = require(path.join(__dirname, 'js', 'physics.js'));
P.seed(20261015);
const rows = [];
const check = (area, name, pass, detail) => { rows.push({ area, name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + '  [' + area + '] ' + name + ' — ' + detail); };
const pct = (a, b) => ((a / b - 1) * 100).toFixed(1) + '%';

// 1. energy conservation
{
  const types = [['e', 1], ['beta', 0], ['p', 100], ['alpha', 5.486], ['n', 2], ['n', 2.53e-8], ['n', 14.1], ['gamma', 0.0595], ['gamma', 0.662], ['gamma', 6], ['xray', 0]];
  let worst = 0, n = 0;
  for (const mat of Object.keys(P.MAT)) for (const [type, E] of types) {
    const D = P.autoThickness(type, E, mat, { nuc: 'Y-90', kVp: 120 });
    for (let i = 0; i < 25; i++) { const h = P.simulate({ type, E, mat, D, nuc: 'Y-90', kVp: 120, dotsTarget: 200 }); worst = Math.max(worst, Math.abs(h.ledger.balance)); n++; }
  }
  check('Energy conservation', 'E₀ + Q(capture, annihilation) − rest mass = deposited + escaped', worst < 1e-6, `${n} histories, 7 radiation types × 6 materials; worst imbalance ${worst.toExponential(1)} MeV`);
}

// 2. ranges and stopping powers
const W = P.MAT.water, A = P.MAT.air;
for (const [name, val, ref, tol] of [
  ['Electron 1 MeV in water, CSDA', P.csda(W, 'e', 1), 0.4367, 3], ['Electron 10 MeV in water, CSDA', P.csda(W, 'e', 10), 4.975, 4],
  ['Proton 10 MeV in water, CSDA', P.csda(W, 'p', 10), 0.1230, 2], ['Proton 100 MeV in water, CSDA', P.csda(W, 'p', 100), 7.718, 2], ['Proton 200 MeV in water, CSDA', P.csda(W, 'p', 200), 25.96, 2],
  ['Alpha 5.486 MeV in air (Geiger rule R = 0.318 E^1.5 cm)', P.csda(A, 'alpha', 5.486) / A.rho, 0.318 * Math.pow(5.486, 1.5), 6],
  ['Alpha 5 MeV in water (Bragg–Kleeman scaling from air, a ±15% rule)', P.csda(W, 'alpha', 5) * 1e4, 0.318 * Math.pow(5, 1.5) * 1.205e-3 * 3.0 / 3.81 * 1e4, 15],
  ['Electron collision stopping 1 MeV water', P.stopping(W, 'e', 1).col, 1.849, 2], ['Proton stopping 100 MeV water', P.stopping(W, 'p', 100).col, 7.289, 2], ['Proton stopping 1 MeV water', P.stopping(W, 'p', 1).col, 260.8, 3]])
  check('Ranges', name, Math.abs(val / ref - 1) * 100 < tol, `${val.toPrecision(4)} vs reference ${ref.toPrecision(4)} (${pct(val, ref)}, tolerance ±${tol}%)`);

// 3. Bragg peak position
{
  const D = 1.25 * P.csda(W, 'p', 100), dep = new Float64Array(60);
  for (let i = 0; i < 150; i++) { const h = P.simulate({ type: 'p', E: 100, mat: 'water', D, dotsTarget: 50 }); for (let j = 0; j < 60; j++) dep[j] += h.depth[j]; }
  let im = 0; for (let j = 0; j < 60; j++) if (dep[j] > dep[im]) im = j;
  const zPeak = (im + 0.5) / 60 * D, R = P.csda(W, 'p', 100), ratio = dep[im] / dep[2];
  check('Depth dose', 'Proton 100 MeV in water: Bragg peak just before the range', zPeak / R > 0.88 && zPeak / R < 1.02 && ratio > 2.5, `peak at ${zPeak.toFixed(2)} cm (${(zPeak / R * 100).toFixed(0)}% of CSDA range ${R.toFixed(2)} cm), peak/entrance = ${ratio.toFixed(1)}`);
}

// 4. photon attenuation (uncollided transmission = exp(−μx))
for (const [mat, E] of [['water', 0.662], ['pb', 0.662], ['pb', 0.1], ['al', 0.06]]) {
  const m = P.MAT[mat], mu = P.photonCoef(m, E).tot, D = 1.2 / mu; let un = 0, N = 4000;
  for (let i = 0; i < N; i++) { const h = P.simulate({ type: 'gamma', E, mat, D, dotsTarget: 10 }); if (!h.events.filter(e => !e.rep).length && h.tracks[0].end === 'transmitted') un++; }
  const exp = Math.exp(-mu * D), sig = Math.sqrt(N * exp * (1 - exp)) / N;
  check('Photon attenuation', `${m.name} ${E * 1000} keV: uncollided transmission = e^(−μx)`, Math.abs(un / N - exp) < 3.5 * sig + 0.005, `${(un / N * 100).toFixed(1)}% vs ${(exp * 100).toFixed(1)}% (μ = ${mu.toPrecision(3)} /cm, x = ${D.toPrecision(3)} cm)`);
}
{
  const m = P.MAT.water, o = P.info('gamma', 0.03, 'water'), o2 = P.info('gamma', 1, 'water'), o3 = P.info('gamma', 10, 'pb');
  check('Photon attenuation', 'Dominant process: photo at 30 keV water, Compton at 1 MeV water, pair at 10 MeV Pb',
    o.frac['Photoelectric'] > o.frac['Compton'] * 0.6 && o2.frac['Compton'] > 0.98 && o3.frac['Pair production'] > 0.5,
    `30 keV water photo ${(o.frac['Photoelectric'] * 100).toFixed(0)}% / Compton ${(o.frac['Compton'] * 100).toFixed(0)}%; 1 MeV water Compton ${(o2.frac['Compton'] * 100).toFixed(1)}%; 10 MeV Pb pair ${(o3.frac['Pair production'] * 100).toFixed(0)}%`);
}

// 5. atomic relaxation
{
  let K = 0, ph = 0, fl = 0, au = 0, D = 3 / P.photonCoef(P.MAT.pb, 0.1).tot;
  for (let i = 0; i < 3000; i++) { const h = P.simulate({ type: 'gamma', E: 0.1, mat: 'pb', D, dotsTarget: 5 }); for (const e of h.events) if (e.proc === 'photoelectric' && e.Ein === 0.1) { ph++; if (e.shell === 'K') { K++; const s = e.relax.steps[0]; if (s.kind === 'fluor') fl++; else au++; } } }
  check('Atomic processes', 'Pb, 100 keV primary photons: most photoabsorption in the K shell', K / ph > 0.7 && K / ph < 0.85, `K-shell fraction ${(K / ph * 100).toFixed(1)}% (1 − 1/jump ratio ≈ 80%)`);
  check('Atomic processes', 'Pb K vacancies: fluorescence yield ≈ 0.963', Math.abs(fl / (fl + au) - 0.963) < 0.02, `${(fl / (fl + au) * 100).toFixed(1)}% x-rays, ${(au / (fl + au) * 100).toFixed(1)}% Auger`);
  let oK = 0, oA = 0;
  for (let i = 0; i < 4000; i++) { const h = P.simulate({ type: 'gamma', E: 0.02, mat: 'water', D: 3, dotsTarget: 5 }); for (const e of h.events) if (e.proc === 'photoelectric' && e.el === 'O' && e.shell === 'K') { oK++; if (e.relax.steps[0].kind === 'auger') oA++; } }
  check('Atomic processes', 'O K vacancies (water): Auger dominates (ωK = 0.0083)', oA / oK > 0.97, `${(oA / oK * 100).toFixed(1)}% Auger of ${oK} K vacancies; KLL energy ≈ ${((543.1 - 41.6 - 13.6) / 1000).toFixed(3)} keV`);
  let maxT = 0; for (let i = 0; i < 4000; i++) { const h = P.simulate({ type: 'gamma', E: 0.662, mat: 'water', D: 20, dotsTarget: 5 }); for (const e of h.events) if (e.proc === 'compton' && e.Ein === 0.662) maxT = Math.max(maxT, e.T); }
  const edge = 0.662 * (2 * 0.662 / P.ME) / (1 + 2 * 0.662 / P.ME);
  check('Atomic processes', 'Compton electron energy never exceeds the Compton edge', maxT <= edge + 1e-9 && maxT > 0.97 * edge, `max ${(maxT * 1000).toFixed(1)} keV, edge ${(edge * 1000).toFixed(1)} keV`);
  let pairs = 0; for (let i = 0; i < 3000; i++) { const h = P.simulate({ type: 'gamma', E: 1.0, mat: 'pb', D: 3, dotsTarget: 5 }); pairs += h.events.filter(e => e.proc === 'pair').length; }
  check('Atomic processes', 'No pair production below 1.022 MeV', pairs === 0, `1.0 MeV photons in lead: ${pairs} pairs`);
  const cw = P.info('e', 0.2, 'water').cher, cw2 = P.info('e', 0.4, 'water').cher;
  check('Atomic processes', 'Cherenkov threshold for electrons in water ≈ 0.26 MeV', !cw && cw2 && Math.abs(P.info('e', 1, 'water').cherThr - 0.264) < 0.01, `threshold ${(P.info('e', 1, 'water').cherThr * 1000).toFixed(0)} keV`);
}

// 6. neutrons
{
  const coll = []; let capG = 0, capH = 0, caps = 0;
  for (let i = 0; i < 400; i++) { const h = P.simulate({ type: 'n', E: 2, mat: 'water', D: 400, dotsTarget: 20 }); if (h.nTherm) coll.push(h.nTherm); for (const e of h.events) if (e.proc === 'n-capture') { caps++; if (e.el === 'H') capH++; } }
  const mean = coll.reduce((a, b) => a + b, 0) / coll.length, theory = Math.log(2e6 / 0.0253) / 0.92;
  check('Neutrons', '2 MeV neutrons in water: collisions to thermalize ≈ ln(E₀/E_th)/ξ', Math.abs(mean / theory - 1) < 0.15, `mean ${mean.toFixed(1)} collisions vs ${theory.toFixed(1)} (ξ = 0.92)`);
  check('Neutrons', 'Thermal capture in water is on hydrogen (2.2246 MeV γ)', caps > 100 && capH / caps > 0.99, `${capH} of ${caps} captures on H`);
  let maxRatio = 0; for (let i = 0; i < 200; i++) { const h = P.simulate({ type: 'n', E: 2, mat: 'pb', D: 20, dotsTarget: 5 }); for (const e of h.events) if (e.proc === 'n-elastic') maxRatio = Math.max(maxRatio, e.Er / e.Ein); }
  const lim = 4 * 205.4 / Math.pow(206.4, 2);
  check('Neutrons', 'Elastic scattering on lead transfers at most 4A/(A+1)² ≈ 1.9%', maxRatio <= lim + 1e-9 && maxRatio > 0.8 * lim, `max recoil fraction ${(maxRatio * 100).toFixed(2)}% (limit ${(lim * 100).toFixed(2)}%)`);
}

// 7. sources
{
  const mean = n => { let s = 0; for (let i = 0; i < 40000; i++) s += P.sampleBeta(n); return s / 40000; };
  const mP = mean('P-32'), mC = mean('C-14');
  check('Sources', 'β spectrum mean energies (allowed shape)', Math.abs(mP / 0.6949 - 1) < 0.05 && Math.abs(mC / 0.0495 - 1) < 0.08, `P-32 mean ${(mP * 1000).toFixed(0)} keV (DDEP 694.9), C-14 mean ${(mC * 1000).toFixed(1)} keV (DDEP 49.5)`);
  let mx = 0, sum = 0; for (let i = 0; i < 20000; i++) { const E = P.sampleXray(80); mx = Math.max(mx, E); sum += E; }
  check('Sources', 'X-ray tube 80 kVp: no photon above 80 keV, mean ≈ 35–50 keV', mx <= 0.080 && sum / 20000 > 0.035 && sum / 20000 < 0.05, `max ${(mx * 1000).toFixed(1)} keV, mean ${(sum / 20 ).toFixed(1)} keV`);
}
// 8. ionization count consistency
{
  const h = P.simulate({ type: 'alpha', E: 5.486, mat: 'air', D: 5, dotsTarget: 500 });
  const expected = h.ledger.dep / (33.97e-6);
  check('Ionization', 'Alpha 5.49 MeV stopped in air: ion pairs = E/W (W = 33.97 eV)', Math.abs(h.nIon / expected - 1) < 0.02, `${Math.round(h.nIon).toLocaleString()} ion pairs (expected ${Math.round(expected).toLocaleString()} ≈ 1.6 × 10⁵)`);
}

const pass = rows.filter(r => r.pass).length;
let md = `# Validation results\n\nGenerated by \`node interact/validate.js\` on ${new Date().toISOString().slice(0, 10)} (seeded). ${pass} of ${rows.length} checks passed.\n\n| Result | Area | Check | Detail |\n|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.pass ? '✅ pass' : '❌ FAIL'} | ${r.area} | ${r.name} | ${r.detail.replace(/\|/g, '/')} |\n`;
fs.writeFileSync(path.join(__dirname, 'VALIDATION.md'), md);
console.log(`\n${pass}/${rows.length} checks passed.`);
process.exit(pass === rows.length ? 0 : 1);
