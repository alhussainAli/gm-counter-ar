/* Atomic close-up: a looping 2D animation of one interaction at the scale of a single atom.
 * Bohr-style shells (not to scale), real binding energies and x-ray / Auger energies. */
(function () {
'use strict';
function create(cv, COL, RP) {
  const x = cv.getContext('2d');
  let ev = null, msg = 'Fire a particle, then pick an event.', t0 = performance.now(), W = 300, H = 300, dpr = 1, rngSeed = 1;
  const DUR = 5.2;           // seconds per loop
  function size() { dpr = Math.min(2, devicePixelRatio || 1); W = cv.clientWidth || 300; H = cv.clientHeight || 300; cv.width = W * dpr; cv.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function set(e, m) { ev = e; if (m) msg = m; t0 = performance.now(); rngSeed = (e && e.id || 1) * 9301 + 49297; }
  const rnd = () => { rngSeed = (rngSeed * 9301 + 49297) % 233280; return rngSeed / 233280; };
  const ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
  const seg = (u, a, b) => ease((u - a) / (b - a));
  const fmt = E => RP.fmtE(E);
  function shells(el) { const e = RP.EL[el]; return e.draw.map((n, i) => ({ n, name: ['K', 'L', 'M', 'N', 'O', 'P'][i] })); }
  function shellB(el, name) { const e = RP.EL[el]; const s = e.shells.find(s => s[0][0] === name[0]); return s ? s[1] : null; }

  function draw() {
    if (!cv.isConnected) return;
    if (cv.width !== Math.round((cv.clientWidth || 300) * dpr)) size();
    x.clearRect(0, 0, W, H); x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
    if (!ev) { msg.split('\n').forEach((l, i) => text(l, W / 2, H / 2 + i * 18, '#8fa09b', 13, 'center')); return requestAnimationFrame(draw); }
    const time = (performance.now() - t0) / 1000, u = (time % (DUR + 1.2)) / DUR;     // 0..1 then hold
    const el = ev.el || 'O', E = RP.EL[el], cx = W * 0.5, cy = H * 0.52, R0 = Math.min(W, H) * 0.42;
    const sh = shells(el), nS = sh.length, rOf = i => R0 * (0.22 + 0.78 * (i + 1) / nS);
    const nucR = Math.max(5, R0 * 0.05 * Math.cbrt(E.Z) * 0.7);
    // which shell / electron is involved
    const sIdx = ev.shell ? Math.max(0, sh.findIndex(s => s.name === ev.shell[0])) : nS - 1;
    const tgtAng = -0.6;
    const nuclearProc = ['n-elastic', 'n-capture', 'n-inelastic', 'n-p', 'nuclear', 'pair', 'brems'].includes(ev.proc);
    // ---------- shells and electrons
    x.lineWidth = 1;
    sh.forEach((s, i) => {
      const r = rOf(i); x.strokeStyle = 'rgba(120,160,190,0.28)'; x.beginPath(); x.arc(cx, cy, r, 0, 2 * Math.PI); x.stroke();
      const B = shellB(el, s.name); x.fillStyle = 'rgba(160,190,210,.85)'; text(`${s.name}  ${B != null ? fmtB(B) : ''}`, W - 8, 34 + i * 13, i === sIdx && involvesElectron(ev) ? '#f2b33d' : 'rgba(160,190,210,.8)', 10.5, 'right');
      const nDraw = Math.min(s.n, 32), spin = time * (0.5 / (i + 1));
      for (let j = 0; j < nDraw; j++) {
        let a = spin + j / nDraw * 2 * Math.PI;
        const isT = i === sIdx && j === 0 && involvesElectron(ev);
        if (isT) a = tgtAng;
        if (isT && electronGone(ev, u)) continue;
        if (isT && ev.proc === 'excitation') { const r2 = lerp(r, rOf(Math.min(nS, i + 1)) + (i === nS - 1 ? 14 : 0), excitePos(u)); dot(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a), 3.4, COL.e); continue; }
        if (ev.proc === 'rayleigh') { const w = Math.sin(time * 30) * 2 * Math.max(0, 1 - Math.abs(u - 0.45) * 5); dot(cx + (r + w) * Math.cos(a), cy + r * Math.sin(a), 2.6, COL.e); continue; }
        dot(cx + r * Math.cos(a), cy + r * Math.sin(a), i === sIdx && j === 0 ? 3.2 : 2.4, COL.e);
      }
    });
    // ---------- nucleus
    const glowN = ['n-capture', 'n-inelastic'].includes(ev.proc) ? Math.max(0, Math.sin(Math.PI * seg(u, 0.4, 0.75))) : 0;
    let nx = cx, ny = cy;
    if (ev.proc === 'n-elastic') { const k = seg(u, 0.45, 1); const d = ev.el === 'H' ? R0 * 1.1 : R0 * 0.12; nx += d * k * 0.8; ny += d * k * 0.6; }
    const g = x.createRadialGradient(nx, ny, 0, nx, ny, nucR * (1 + glowN));
    g.addColorStop(0, glowN ? '#fff6c8' : '#ff8a8a'); g.addColorStop(1, glowN ? 'rgba(255,200,80,.0)' : '#a33a3a');
    if (!(ev.proc === 'n-p' && u > 0.55)) { x.fillStyle = g; x.beginPath(); x.arc(nx, ny, nucR * (1 + glowN * 1.6), 0, 2 * Math.PI); x.fill(); }
    text(`${el}  Z = ${E.Z}`, 10, 18, '#e8eef0', 13, 'left'); text('binding energy', W - 8, 20, 'rgba(160,190,210,.6)', 9.5, 'right');
    // ---------- process-specific animation
    const L = -R0 * 1.25, Rr = R0 * 1.3;
    const tx = cx + rOf(sIdx) * Math.cos(tgtAng), ty = cy + rOf(sIdx) * Math.sin(tgtAng);
    const by = ev.by || 'e', byCol = colFor(by);
    const out = (ang, k, col, label, sz, wavy) => { const d = R0 * 0.1 + k * R0 * 1.15, px = tx + d * Math.cos(ang), py = ty + d * Math.sin(ang); if (wavy) wave(tx, ty, px, py, col); else { line(tx, ty, px, py, col, 0.35); dot(px, py, sz || 3.4, col); } if (k > 0.25 && label) text(label, px + 6, py + (Math.sin(ang) > 0 ? 14 : -6), col, 11, px > W * 0.62 ? 'right' : 'left'); };
    switch (ev.proc) {
      case 'ionization': case 'delta': {
        passBy(u, byCol, by, cy - R0 * 0.95);
        if (u > 0.35) { hole(tx, ty, u); out(-1.2, seg(u, 0.35, 0.75), COL.e, `e⁻ ejected, T ≈ ${fmt(ev.T)}`, 3.4); }
        relaxAnim(u, 0.7);
        caption(ev.proc === 'delta' ? 'δ-ray: hard ionization' : 'Ionization', `${el} → ${el}⁺ ion + free electron`);
        break; }
      case 'excitation': {
        passBy(u, byCol, by, cy - R0 * 0.95);
        if (u > 0.68) wave(tx + 4, ty, tx + R0 * 0.9 * seg(u, 0.68, 0.95) + 4, ty - R0 * 0.6 * seg(u, 0.68, 0.95), COL.exc);
        if (u > 0.8) text(`de-excitation photon ≈ ${fmt(ev.dE)} (UV)`, W - 10, H - 50, COL.exc, 11, 'right');
        caption('Excitation', 'Electron raised to a higher level, not freed; it falls back and emits light');
        break; }
      case 'photoelectric': {
        if (u < 0.36) wave(cx + L, ty, lerp(cx + L, tx, seg(u, 0, 0.35)), ty, COL.gamma);
        if (u < 0.36) text(`γ ${fmt(ev.Ein)}`, cx + L, ty - 10, COL.gamma, 11, 'left');
        if (u > 0.35) { hole(tx, ty, u); out(-0.4, seg(u, 0.35, 0.75), COL.e, `photoelectron T = ${fmt(ev.T)}`, 3.6); }
        relaxAnim(u, 0.62);
        caption('Photoelectric absorption', `Photon vanishes; ${ev.shell}-shell electron leaves (binding ${fmtB(ev.B * 1000)})`);
        break; }
      case 'compton': {
        const k = seg(u, 0, 0.35);
        if (u < 0.36) wave(cx + L, ty, lerp(cx + L, tx, k), ty, COL.gamma);
        if (u > 0.35) {
          hole(tx, ty, u); out(0.6, seg(u, 0.35, 0.8), COL.e, `recoil e⁻ ${fmt(ev.T)}`, 3.4);
          const a = -(ev.angle || 40) * Math.PI / 180, kk = seg(u, 0.35, 0.85);
          wave(tx, ty, tx + Math.cos(a) * R0 * 1.2 * kk, ty + Math.sin(a) * R0 * 1.2 * kk, COL.gamma, 1.4);
          if (kk > 0.4) text(`scattered γ ${fmt(ev.Eout)}, θ = ${ev.angle.toFixed(0)}°`, W - 10, H - 50, COL.gamma, 11, 'right');
        }
        caption('Compton scattering', 'Photon gives part of its energy to an outer electron');
        break; }
      case 'rayleigh': {
        const kin = seg(u, 0, 0.4), a = -(ev.angle || 20) * Math.PI / 180;
        if (u < 0.42) wave(cx + L, cy, lerp(cx + L, cx, kin), cy, COL.gamma);
        else { const k2 = seg(u, 0.42, 0.9); wave(cx, cy, cx + Math.cos(a) * Rr * k2, cy + Math.sin(a) * Rr * k2, COL.gamma); }
        caption('Rayleigh (coherent) scattering', 'Whole electron cloud oscillates; photon redirected, same energy');
        break; }
      case 'pair': {
        if (u < 0.42) wave(cx + L, cy - nucR * 2.2, lerp(cx + L, cx, seg(u, 0, 0.4)), cy - nucR * 2.2, COL.gamma);
        if (u > 0.4) { const k = seg(u, 0.4, 0.95), ox = cx, oy = cy - nucR * 2.2; line(ox, oy, ox + R0 * 1.1 * k, oy - R0 * 0.55 * k, COL.e, 0.5); dot(ox + R0 * 1.1 * k, oy - R0 * 0.55 * k, 3.6, COL.e); line(ox, oy, ox + R0 * 1.1 * k, oy + R0 * 0.25 * k, COL.pos, 0.5); dot(ox + R0 * 1.1 * k, oy + R0 * 0.25 * k, 3.6, COL.pos);
          if (k > 0.4) { text(`e⁻ ${fmt(ev.Te)}`, ox + R0 * 1.1 * k + 6, oy - R0 * 0.55 * k, COL.e, 11, 'left'); text(`e⁺ ${fmt(ev.Tp)}`, ox + R0 * 1.1 * k + 6, oy + R0 * 0.25 * k + 12, COL.pos, 11, 'left'); } }
        caption('Pair production', 'Photon energy → e⁻e⁺ pair near the nucleus (1.022 MeV goes into their mass)');
        break; }
      case 'annihilation': {
        const k = seg(u, 0, 0.4);
        if (u < 0.42) { dot(lerp(cx + L, tx, k), ty + 10 * (1 - k), 3.6, COL.pos); text('e⁺ (at rest)', lerp(cx + L, tx, k), ty + 26, COL.pos, 11, 'left'); }
        if (u > 0.4) { const k2 = seg(u, 0.4, 0.95); hole(tx, ty, u); wave(tx, ty, tx + R0 * 1.2 * k2, ty - R0 * 0.5 * k2, COL.gamma); wave(tx, ty, tx - R0 * 1.2 * k2, ty + R0 * 0.5 * k2, COL.gamma); if (k2 > 0.4) text('2 × 511 keV, back to back', W - 10, H - 50, COL.gamma, 11, 'right'); }
        caption('Annihilation', 'Positron + electron → two 511 keV photons');
        break; }
      case 'brems': {
        const path = s => { const ang = Math.PI * (1 - s), r = R0 * 0.25 + Math.abs(s - 0.5) * R0 * 2.2; return [cx + r * Math.cos(ang) * (s < 0.5 ? 1 : 1), cy - R0 * 0.32 + (s - 0.5) * (s - 0.5) * R0 * 2.4]; };
        const k = seg(u, 0, 0.9); let prev = path(0); x.strokeStyle = byCol; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(...prev); for (let s = 0; s <= k; s += 0.02) x.lineTo(...path(s)); x.stroke(); x.globalAlpha = 1; dot(...path(k), 3.6, byCol);
        if (u > 0.45) { const k2 = seg(u, 0.45, 0.95), p = path(0.5); wave(p[0], p[1], p[0] + R0 * 1.1 * k2, p[1] - R0 * 0.7 * k2, COL.xray); if (k2 > 0.3) text(`bremsstrahlung x-ray ${fmt(ev.k)}`, W - 10, H - 50, COL.xray, 11, 'right'); }
        caption('Bremsstrahlung', 'Electron decelerated by the nucleus’ field radiates an x-ray');
        break; }
      case 'n-elastic': case 'n-inelastic': {
        const k = seg(u, 0, 0.45);
        if (u < 0.46) { dot(lerp(cx + L, cx - nucR, k), cy, 4, COL.n); text(`n ${fmt(ev.Ein)}`, lerp(cx + L, cx - nucR, k), cy - 10, COL.n, 11, 'left'); }
        else { const k2 = seg(u, 0.45, 1); dot(cx - R0 * 1.0 * k2, cy + R0 * 0.8 * k2, 4, COL.n); text(`n ${fmt(ev.Eout)}`, cx - R0 * k2, cy + R0 * 0.8 * k2 + 14, COL.n, 11, 'left'); }
        if (ev.proc === 'n-elastic') { if (u > 0.5) text(`${ev.el === 'H' ? 'recoil proton' : el + ' recoil'} ${fmt(ev.Er)}`, W - 10, H - 50, COL.p, 11, 'right'); caption('Neutron elastic scattering', ev.el === 'H' ? 'Billiard-ball collision with a proton: big energy transfer' : 'Heavy nucleus recoils slowly: small energy transfer'); }
        else { if (u > 0.62) { const k3 = seg(u, 0.62, 0.95); wave(cx, cy, cx + R0 * 1.2 * k3, cy - R0 * 0.6 * k3, COL.gamma); text(`γ ${fmt(ev.lev)}`, W - 10, H - 50, COL.gamma, 11, 'right'); } caption('Inelastic scattering (n,n′γ)', 'Neutron leaves the nucleus excited; it emits a γ ray'); }
        break; }
      case 'n-capture': {
        const k = seg(u, 0, 0.4); if (u < 0.41) dot(lerp(cx + L, cx, k), cy, 4, COL.n);
        if (u > 0.6) (ev.gammas || [2.2]).forEach((gE, i) => { const k3 = seg(u, 0.6 + i * 0.08, 0.95), a = -0.5 + i * 1.6; wave(cx, cy, cx + Math.cos(a) * R0 * 1.2 * k3, cy + Math.sin(a) * R0 * 1.2 * k3, COL.gamma); });
        if (u > 0.7) text(`capture γ: ${(ev.gammas || []).map(g => g.toFixed(3)).join(' + ')} MeV`, W - 10, H - 50, COL.gamma, 11, 'right');
        caption('Neutron capture (n,γ)', `${el} absorbs the neutron, becomes A+1 (excited), releases its binding energy`);
        break; }
      case 'n-p': {
        const k = seg(u, 0, 0.4); if (u < 0.41) dot(lerp(cx + L, cx, k), cy, 4, COL.n);
        if (u > 0.5) { const k2 = seg(u, 0.5, 0.95); dot(cx + R0 * 1.1 * k2, cy - R0 * 0.4 * k2, 4, COL.p); text('proton 0.58 MeV', cx + R0 * 1.1 * k2, cy - R0 * 0.4 * k2 - 8, COL.p, 11, 'right'); dot(cx - 6 * k2, cy + 4 * k2, nucR, '#c96b6b'); }
        caption('¹⁴N(n,p)¹⁴C', 'Nitrogen becomes carbon-14 and emits a proton');
        break; }
      case 'nuclear': {
        passBy(Math.min(u, 0.4), COL.p, 'p', cy);
        if (u > 0.4) { const k2 = seg(u, 0.4, 0.95); dot(cx + R0 * k2, cy - R0 * 0.5 * k2, 3.6, COL.p); dot(cx - R0 * 0.6 * k2, cy + R0 * 0.8 * k2, 4, COL.n); wave(cx, cy, cx + R0 * 1.1 * k2, cy + R0 * 0.5 * k2, COL.gamma); }
        caption('Nuclear reaction', 'Proton breaks into the nucleus: p, n and γ emerge');
        break; }
      case 'stop': {
        const k = seg(u, 0, 0.5); dot(lerp(cx + L, cx, k), cy, ev.by === 'alpha' ? 5 : 4, colFor(ev.by));
        if (u > 0.5) { const k2 = seg(u, 0.5, 0.9); for (let i = 0; i < (ev.by === 'alpha' ? 2 : 1); i++) { const a = i * Math.PI; dot(cx + 22 * Math.cos(a + time) * k2, cy + 22 * Math.sin(a + time) * k2, 3, COL.e); } }
        caption(ev.by === 'alpha' ? 'End of an alpha track' : 'End of a proton track', ev.by === 'alpha' ? 'He²⁺ captures 2 electrons → neutral helium' : 'H⁺ captures an electron → hydrogen atom');
        break; }
      case 'thermalized': caption('Thermalized neutron', 'Energy ≈ 0.025 eV: in equilibrium with the atoms; now diffuses until captured'); break;
      default: caption(ev.proc, '');
    }
    requestAnimationFrame(draw);

    // ---- helpers bound to this frame
    function relaxAnim(u, a) {
      const R = ev.relax; if (!R || !R.steps || !R.steps.length) return;
      const st = R.steps[0];
      if (u > a) {
        const k = seg(u, a, a + 0.12), r1 = rOf(Math.min(nS - 1, sIdx + 1)), ang = tgtAng + 0.9;
        const fx = lerp(cx + r1 * Math.cos(ang), tx, k), fy = lerp(cy + r1 * Math.sin(ang), ty, k); dot(fx, fy, 3.2, COL.e);
        if (k < 1) line(cx + r1 * Math.cos(ang), cy + r1 * Math.sin(ang), fx, fy, 'rgba(79,179,255,.5)', 1);
      }
      if (u > a + 0.12) {
        const k = seg(u, a + 0.12, a + 0.36);
        if (st.kind === 'fluor') { wave(tx, ty, tx + R0 * 1.1 * k, ty + R0 * 0.75 * k, COL.xray); if (k > 0.3) text(`${st.line} x-ray ${fmt(st.E)}`, W - 10, H - 66, COL.xray, 11, 'right'); }
        else { const r2 = rOf(Math.min(nS - 1, sIdx + 1)), ax = cx + r2 * Math.cos(tgtAng + 2), ay = cy + r2 * Math.sin(tgtAng + 2); line(ax, ay, ax + R0 * 0.9 * k, ay + R0 * 0.6 * k, COL.e, 0.4); dot(ax + R0 * 0.9 * k, ay + R0 * 0.6 * k, 3.2, COL.e); hole(ax, ay, 1); if (k > 0.3) text(`${st.line} Auger e⁻ ${fmt(st.E)}`, W - 10, H - 66, COL.e, 11, 'right'); }
      }
    }
    function passBy(u, col, kind, yLine) { const k = seg(u, 0, 0.8), px = lerp(cx + L, cx + Rr, k); if (kind === 'gamma') wave(cx + L, yLine, px, yLine, col); else { line(cx + L, yLine, px, yLine, col, 0.4); dot(px, yLine, kind === 'alpha' ? 5 : 3.8, col); } if (k < 0.3) text(nameOf(kind), cx + L, yLine - 10, col, 11, 'left'); }
    function hole(hx, hy, u) { x.strokeStyle = '#ff5b5b'; x.lineWidth = 1.6; x.beginPath(); x.arc(hx, hy, 4.5, 0, 2 * Math.PI); x.stroke(); x.lineWidth = 1; }
  }
  function involvesElectron(e) { return ['ionization', 'delta', 'photoelectric', 'compton', 'excitation', 'annihilation'].includes(e.proc); }
  function electronGone(e, u) { return e.proc !== 'excitation' && u > (e.proc === 'annihilation' ? 0.4 : 0.35); }
  function excitePos(u) { return u < 0.35 ? 0 : u < 0.5 ? (u - 0.35) / 0.15 : u < 0.66 ? 1 : u < 0.72 ? 1 - (u - 0.66) / 0.06 : 0; }
  function colFor(t) { return { e: COL.e, pos: COL.pos, p: COL.p, alpha: COL.alpha, gamma: COL.gamma, n: COL.n }[t] || COL.e; }
  function nameOf(t) { return { e: 'e⁻', pos: 'e⁺', p: 'proton', alpha: 'α', gamma: 'γ', n: 'n' }[t] || t; }
  function fmtB(keV) { return keV >= 1 ? keV.toFixed(keV >= 10 ? 1 : 2) + ' keV' : (keV * 1000).toFixed(1) + ' eV'; }
  const lerp = (a, b, k) => a + (b - a) * k;
  function dot(px, py, r, col) { x.fillStyle = col; x.beginPath(); x.arc(px, py, r, 0, 2 * Math.PI); x.fill(); }
  function line(a, b, c, d, col, al) { x.strokeStyle = col; x.globalAlpha = al == null ? 1 : al; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); x.globalAlpha = 1; }
  function wave(a, b, c, d, col, lam) { const L = Math.hypot(c - a, d - b); if (L < 1) return; const ux = (c - a) / L, uy = (d - b) / L, n = Math.ceil(L / 2), wl = 9 * (lam || 1); x.strokeStyle = col; x.lineWidth = 1.6; x.beginPath(); for (let i = 0; i <= n; i++) { const s = i / n * L, o = Math.sin(s / wl * 2 * Math.PI) * 4; const px = a + ux * s - uy * o, py = b + uy * s + ux * o; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.lineWidth = 1; dot(c, d, 2.6, col); }
  function text(s, px, py, col, sz, al) { x.font = `${sz >= 13 ? 600 : 500} ${sz}px "IBM Plex Sans", system-ui, sans-serif`; x.fillStyle = col; x.textAlign = al || 'left'; x.fillText(s, Math.max(4, Math.min(W - 4, px)), py); }
  function caption(a, b) { x.fillStyle = 'rgba(0,0,0,.7)'; x.fillRect(0, H - 38, W, 38); text(a, 10, H - 22, '#f2b33d', 13, 'left'); text(b, 10, H - 7, '#c9d3d0', 11, 'left'); }
  size(); requestAnimationFrame(draw);
  return { set, resize: size, get event() { return ev; } };
}
window.IA = { create };
})();
