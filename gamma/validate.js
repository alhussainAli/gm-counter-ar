#!/usr/bin/env node
/* Validation checklist for the Gamma Spectroscopy AR physics engine.
 * Run:  node gamma/validate.js      (writes gamma/VALIDATION.md)
 * Uses the same js/physics.js that the app loads in the browser. */
'use strict';
const path = require('path'), fs = require('fs');
const G = require(path.join(__dirname, 'js', 'physics.js'));
G.setSeed(20261014);
const rows = [];
function check(area, name, pass, detail) { rows.push({ area, name, pass, detail }); console.log((pass ? 'PASS' : 'FAIL') + '  [' + area + '] ' + name + ' — ' + detail); }
const det = k => G.cloneDet(G.DETECTORS[k]);
const cfg = Object.assign({}, G.CONFIG);
const b = k => cfg.gainFS / G.DETECTORS[k].channels;
function acquire(k, sources, dist, seconds, c, bkg) {
  const d = det(k), a = new G.Acquisition(d), R = G.rates(d, sources, dist, bkg || 0, {});
  const steps = 50; for (let i = 0; i < steps; i++) a.step(seconds / steps, R, null, dist, c || Object.assign({}, cfg, { pileup: false }), {}, 0);
  return { a, R, d };
}
for (const E of [59.5409, 122.0, 356.0129, 661.655, 1173.228, 1332.492, 2614.511]) G.SOURCES['Line ' + E] = { half: '—', lines: [{ E, I: 100 }] };
const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

// ---------------------------------------------------------------- 1. energy conservation
for (const k of ['hpge', 'nai']) {
  const d = det(k); let worst = 0, over = 0, n = 0;
  for (const E of [26.3446, 59.5409, 661.655, 1332.492, 2614.511]) for (let i = 0; i < 40000; i++) {
    const ev = G.simulatePhoton(d, E, 10); n++;
    worst = Math.max(worst, Math.abs(ev.Edep + ev.Eesc + ev.Ewin - E));
    if (ev.Edep > E + 1e-9) over++;
  }
  check('Energy conservation', `${d.name}: deposited + escaped + window = incident`, worst < 1e-6 && over === 0, `${n.toLocaleString()} histories, worst imbalance ${worst.toExponential(1)} keV, deposits above E0: ${over}`);
}
{ // pair production threshold
  const d = det('hpge'); let p1000 = 0, p1332 = 0, se = 0, de = 0;
  for (let i = 0; i < 150000; i++) { if (G.simulatePhoton(d, 1000, 2).pair) p1000++; const e = G.simulatePhoton(d, 2614.511, 2); if (e.pair) p1332++; if (e.cls === 'single-escape') se++; if (e.cls === 'double-escape') de++; }
  check('Energy conservation', 'Pair production only above 1022 keV', p1000 === 0 && p1332 > 0, `1000 keV: ${p1000} pair events; 2614.5 keV: ${p1332} pair events (${se} single-escape, ${de} double-escape)`);
}

// ---------------------------------------------------------------- 2. calibration
for (const k of ['hpge', 'nai']) {
  const d = det(k); d.dsp.noise = 0; let worst = 0;
  const c = Object.assign({}, cfg, { bits: 16 });
  for (const E of [59.54, 661.655, 1332.492, 2000]) {
    let ev; do { ev = G.simulatePhoton(d, E, 5); } while (ev.cls !== 'full');
    const w = G.processWaveform(d, ev, { Eq: E }, c);
    worst = Math.max(worst, Math.abs(w.Eest - E));
  }
  check('Calibration', `${d.name}: noise-free digitized pulse gives E_est = E`, worst < 0.05, `max |E_est − E| = ${worst.toFixed(3)} keV over 59.5–2000 keV (16-bit ADC)`);
}
{
  const d = det('hpge'), E = 661.655, out = [];
  for (const gfs of [1500, 3000, 6000]) { const c = Object.assign({}, cfg, { gainFS: gfs }), bb = G.binOf(d, E, c); out.push(`${gfs} keV FS → ch ${bb.channel} (${bb.binLo.toFixed(2)}–${bb.binHi.toFixed(2)} keV)`); }
  const ok = out.every(s => true) && G.binOf(d, E, Object.assign({}, cfg, { gainFS: 1500 })).channel === 2 * G.binOf(d, E, Object.assign({}, cfg, { gainFS: 3000 })).channel + (Math.floor(E / (1500 / 8192)) - 2 * Math.floor(E / (3000 / 8192)));
  const bins = [1500, 3000, 6000].map(g => { const bb = G.binOf(d, E, Object.assign({}, cfg, { gainFS: g })); return bb.binLo <= E && E < bb.binHi; });
  check('Calibration', 'Channel ↔ energy: E = (FS/Nch) × channel; gain moves channel, not energy', bins.every(Boolean), out.join('; '));
}
{ // waveform noise matches the statistical model used in Build mode
  for (const k of ['hpge', 'nai']) {
    const d = det(k); let ev; do { ev = G.simulatePhoton(d, 661.655, 10); } while (ev.cls !== 'full');
    const r = []; for (let i = 0; i < 600; i++) r.push(G.processWaveform(d, ev, { Eq: 661.655 }, cfg).Eest - 661.655);
    const s = sd(r), a = G.filteredNoise(d, cfg).sigma;
    check('Calibration', `${d.name}: waveform-filter noise = analytic noise used in Build mode`, Math.abs(s / a - 1) < 0.1, `σ from 600 digitized pulses ${s.toFixed(3)} keV vs analytic ${a.toFixed(3)} keV`);
  }
}

// ---------------------------------------------------------------- 3. peak positions
const PK = [];
for (const [k, tol] of [['hpge', 0.15], ['nai', 2.0]]) {
  // single-line sources isolate the detector response from neighbouring peaks
  const runs = [59.5409, 356.0129, 661.655, 1173.228, 1332.492].map(E => [['Line ' + E], [E]]);
  for (const [srcs, lines] of runs) {
    const { a } = acquire(k, srcs.map(n => ({ name: n, kBq: 370, on: true })), 5, 30);
    for (const E of lines) {
      const fw = G.modelFWHM(G.DETECTORS[k], E, cfg), r = G.measurePeak(a.hist, b(k), E, Math.max(1.2 * fw, 4 * b(k)));
      const dE = r ? r.centroid - E : NaN;
      PK.push({ k, E, r, fw });
      check('Peak positions', `${G.DETECTORS[k].name}: ${E} keV line`, r && Math.abs(dE) < tol, r ? `centroid ${r.centroid.toFixed(2)} keV (Δ ${dE >= 0 ? '+' : ''}${dE.toFixed(2)} keV, tolerance ±${tol})` : 'no peak found');
    }
  }
}
{ // Compton edge
  const { a } = acquire('hpge', [{ name: 'Cs-137', kBq: 370, on: true }], 5, 30), bb = b('hpge');
  const sm = i => { let s = 0; for (let j = -6; j <= 6; j++) s += a.hist[i + j]; return s / 13; };
  let best = 0, at = 0; for (let E = 430; E < 520; E += bb) { const i = Math.round(E / bb), dr = sm(i - 8) - sm(i + 8); if (dr > best) { best = dr; at = E; } }
  const edge = 661.655 * (2 * 661.655 / 510.9989) / (1 + 2 * 661.655 / 510.9989);
  check('Peak positions', 'HPGe: Cs-137 Compton edge where theory puts it', Math.abs(at - edge) < 8, `steepest drop at ${at.toFixed(1)} keV; E·2k/(1+2k) = ${edge.toFixed(1)} keV`);
}
{ // escape peaks
  const { a } = acquire('hpge', [{ name: 'Line 2614.511', kBq: 3700, on: true }], 2, 20);
  const near = E => { const i = Math.round(E / b('hpge')); let m = 0; for (let j = -3; j <= 3; j++) m = Math.max(m, a.hist[i + j]); let bg = 0; for (let j = 8; j < 18; j++) bg += a.hist[i - j] + a.hist[i + j]; return m / (bg / 20 + 1e-9); };
  const se = near(2614.511 - 510.999), de = near(2614.511 - 1021.998);
  check('Peak positions', 'HPGe: single- and double-escape peaks at E − 511 and E − 1022 keV', se > 2 && de > 2, `2614.5 keV line: peak/background ratio ${se.toFixed(1)} at 2103.5 keV, ${de.toFixed(1)} at 1592.5 keV`);
}

// ---------------------------------------------------------------- 4. intensity scaling
{
  const run = kBq => acquire('nai', [{ name: 'Cs-137', kBq, on: true }], 10, 20);
  G.setSeed(11); const A = run(37); G.setSeed(12); const B = run(370);
  const ratio = B.a.recorded / A.a.recorded;
  const pa = G.measurePeak(A.a.hist, b('nai'), 661.655, 50), pb = G.measurePeak(B.a.hist, b('nai'), 661.655, 50);
  check('Intensity scaling', 'NaI(Tl): 10× activity → 10× counts (no pile-up)', Math.abs(ratio / 10 - 1) < 0.03, `count ratio ${ratio.toFixed(3)}`);
  check('Intensity scaling', 'NaI(Tl): 10× activity does not shift the peak', Math.abs(pa.centroid - pb.centroid) < 0.6, `centroids ${pa.centroid.toFixed(2)} → ${pb.centroid.toFixed(2)} keV`);
  const d = det('nai'), r10 = G.rates(d, [{ name: 'Cs-137', kBq: 37, on: true }], 10, 0, {}), r20 = G.rates(d, [{ name: 'Cs-137', kBq: 37, on: true }], 20, 0, {});
  check('Intensity scaling', 'Activity → emitted → incident rates are separate and consistent', Math.abs(r10.emitted - 37000 * 0.8501) < 1e-6 && r10.incident < r10.emitted && r10.incident / r20.incident > 3,
    `37 kBq → ${r10.emitted.toFixed(0)} γ/s emitted (×0.8501) → ${r10.incident.toFixed(0)} /s on the crystal at 10 cm, ${r20.incident.toFixed(0)} /s at 20 cm (ratio ${(r10.incident / r20.incident).toFixed(2)}, approaches 4 at large distance)`);
  // high rate: dead time and pile-up appear, energies stay
  const c = Object.assign({}, cfg, { pileup: true, pur: false });
  G.setSeed(13); const H = acquire('nai', [{ name: 'Cs-137', kBq: 3700, on: true }], 2, 2, c);
  const dead = H.a.dead / H.a.real * 100;
  check('Intensity scaling', 'High rate: dead time and pile-up appear', dead > 10 && H.a.piled > 0, `3.7 MBq at 2 cm: dead time ${dead.toFixed(1)} %, ${H.a.piled.toLocaleString()} piled-up pulses`);
}

// ---------------------------------------------------------------- 5. resolution behaviour
for (const k of ['hpge', 'nai']) {
  const sel = PK.filter(p => p.k === k && p.r).sort((x, y) => x.E - y.E);
  const devs = sel.map(p => (p.r.fwhm / p.fw - 1) * 100);
  const maxDev = Math.max(...devs.map(Math.abs));
  check('Resolution', `${G.DETECTORS[k].name}: measured FWHM matches the model`, maxDev < 12, sel.map((p, i) => `${p.E.toFixed(0)} keV ${p.r.fwhm.toFixed(2)} vs ${p.fw.toFixed(2)} (${devs[i] >= 0 ? '+' : ''}${devs[i].toFixed(1)}%)`).join('; '));
  const Rs = sel.map(p => p.r.fwhm / p.E);
  const fw = sel.map(p => p.r.fwhm);
  check('Resolution', `${G.DETECTORS[k].name}: FWHM grows and R falls with energy`, fw[fw.length - 1] > fw[0] && Rs[Rs.length - 1] < Rs[0], `R from ${(Rs[0] * 100).toFixed(2)} % at ${sel[0].E.toFixed(0)} keV to ${(Rs[Rs.length - 1] * 100).toFixed(2)} % at ${sel[sel.length - 1].E.toFixed(0)} keV`);
}
{
  const Rh = G.modelFWHM(G.DETECTORS.hpge, 661.655, cfg) / 661.655 * 100, Rn = G.modelFWHM(G.DETECTORS.nai, 661.655, cfg) / 661.655 * 100;
  check('Resolution', 'HPGe resolves far better than NaI(Tl) at 662 keV (illustrative defaults)', Rh < 0.4 && Rn > 5 && Rn < 9, `R(662) HPGe ${Rh.toFixed(2)} %, NaI(Tl) ${Rn.toFixed(2)} %`);
  // Ba-133 doublet
  const maxima = (k, a) => { // local maxima in 74–88 keV, smoothing over at most 1/3 FWHM
    const bb = b(k), w = Math.floor(G.modelFWHM(G.DETECTORS[k], 80, cfg) / 3 / bb), sm = i => { let s = 0; for (let j = -w; j <= w; j++) s += a.hist[i + j]; return s; };
    const out = []; for (let i = Math.round(74 / bb); i <= Math.round(88 / bb); i++) { const v = sm(i); if (v > sm(i - 1) && v >= sm(i + 1) && v > 0.03 * sm(Math.round(80.9979 / bb))) out.push(((i + 0.5) * bb).toFixed(2)); }
    return out; };
  const A1 = acquire('hpge', [{ name: 'Ba-133', kBq: 370, on: true }], 5, 60).a, A2 = acquire('nai', [{ name: 'Ba-133', kBq: 370, on: true }], 5, 60).a;
  const mh = maxima('hpge', A1), mn = maxima('nai', A2);
  check('Resolution', 'Ba-133 79.6 / 81.0 keV doublet: two peaks in HPGe, one in NaI(Tl)', mh.length === 2 && mn.length === 1, `maxima between 74 and 88 keV: HPGe at ${mh.join(', ')} keV; NaI(Tl) at ${mn.join(', ')} keV`);
  // efficiency ≠ resolution
  const eff = k => { const { a } = acquire(k, [{ name: 'Cs-137', kBq: 370, on: true }], 10, 20); const t = [...a.lineTally.values()][0]; return t.full * t.frac / t.incident * 100; };
  const eh = eff('hpge'), en = eff('nai');
  check('Resolution', 'Efficiency is separate from resolution (NaI 3″×3″ more efficient here)', en > eh, `absolute FEP efficiency at 662 keV, 10 cm: HPGe ${eh.toFixed(3)} %, NaI(Tl) ${en.toFixed(3)} %`);
}

// ---------------------------------------------------------------- report
const pass = rows.filter(r => r.pass).length;
let md = `# Validation results\n\nGenerated by \`node gamma/validate.js\` on ${new Date().toISOString().slice(0, 10)} (seeded random numbers). ${pass} of ${rows.length} checks passed.\n\n| Result | Area | Check | Detail |\n|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.pass ? '✅ pass' : '❌ FAIL'} | ${r.area} | ${r.name} | ${r.detail.replace(/\|/g, '/')} |\n`;
fs.writeFileSync(path.join(__dirname, 'VALIDATION.md'), md);
console.log(`\n${pass}/${rows.length} checks passed. Wrote gamma/VALIDATION.md`);
process.exit(pass === rows.length ? 0 : 1);
