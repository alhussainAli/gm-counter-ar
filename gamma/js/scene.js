/* Gamma Spectroscopy AR — 3D scene (three.js r147 API; units: cm).
 * Exposes window.GS.create({ THREE, GP, COL }) -> scene API. */
(function () {
'use strict';
function create({ THREE, GP, COL }) {
  const root = new THREE.Group();          // everything; scaled by the host (AR uses metres)
  const bench = new THREE.Group(); root.add(bench);
  const AXIS_Y = 32;                       // detector axis height above the table (cm)
  const glowTex = makeGlowTex();
  const S = { layout: 'hpge', dist: 10, cutaway: true, labels: true, source: 'Cs-137', labelScale: 1 };

  // ---------------------------------------------------------------- materials
  const M = {
    al: new THREE.MeshStandardMaterial({ color: 0xb9c2c8, metalness: 0.75, roughness: 0.35, transparent: true }),
    alDark: new THREE.MeshStandardMaterial({ color: 0x6d7880, metalness: 0.7, roughness: 0.45, transparent: true }),
    cu: new THREE.MeshStandardMaterial({ color: 0xc77b4a, metalness: 0.8, roughness: 0.35, transparent: true }),
    ge: new THREE.MeshStandardMaterial({ color: 0x9aa6b8, metalness: 0.55, roughness: 0.25, transparent: true, opacity: 0.85 }),
    nai: new THREE.MeshPhysicalMaterial({ color: 0xe8f0ff, metalness: 0, roughness: 0.15, transparent: true, opacity: 0.55, transmission: 0 }),
    refl: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    gel: new THREE.MeshStandardMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.6 }),
    cathode: new THREE.MeshStandardMaterial({ color: 0xb8864b, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }),
    dynode: new THREE.MeshStandardMaterial({ color: 0xd0d6da, metalness: 0.9, roughness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0b44c, metalness: 0.9, roughness: 0.25 }),
    nplus: new THREE.MeshStandardMaterial({ color: 0x5c6c88, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    mu: new THREE.MeshStandardMaterial({ color: 0x3a4248, metalness: 0.6, roughness: 0.5, transparent: true }),
    box: new THREE.MeshStandardMaterial({ color: 0x2f3a40, metalness: 0.3, roughness: 0.6, transparent: true }),
    dewar: new THREE.MeshStandardMaterial({ color: 0xc9d1d6, metalness: 0.85, roughness: 0.3, transparent: true }),
    ln2: new THREE.MeshStandardMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.55, emissive: 0x1a4a70, emissiveIntensity: 0.4 }),
    stand: new THREE.MeshStandardMaterial({ color: 0x3b464c, metalness: 0.4, roughness: 0.6 }),
    table: new THREE.MeshStandardMaterial({ color: 0x151c1f, roughness: 0.9, transparent: true, opacity: 0.55 }),
    src: new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 0.3, roughness: 0.5 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x20262e, side: THREE.DoubleSide }),
    pulse: new THREE.MeshBasicMaterial({ color: COL.analog, transparent: true, opacity: 0 })
  };
  const housingMats = [M.al, M.alDark, M.mu, M.box, M.dewar, M.cu];
  root.add(new THREE.HemisphereLight(0xffffff, 0x2a3236, 1.0));
  const dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(30, 80, 50); root.add(dl);

  // ---------------------------------------------------------------- helpers
  function cylX(r1, r2, len, mat, x0, open, seg) { // cylinder along +x from x0 to x0+len
    const g = new THREE.CylinderGeometry(r1, r2, len, seg || 48, 1, !!open);
    const m = new THREE.Mesh(g, mat); m.rotation.z = -Math.PI / 2; m.position.x = x0 + len / 2; return m;
  }
  function disc(r, mat, x) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat); m.rotation.y = Math.PI / 2; m.position.x = x; return m; }
  function tube(rIn, rOut, len, mat, x0) { // thick-walled tube along x
    const shape = new THREE.Shape(); shape.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absarc(0, 0, rIn, 0, Math.PI * 2, true); shape.holes.push(h);
    const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 40 });
    const m = new THREE.Mesh(g, mat); m.rotation.y = Math.PI / 2; m.position.x = x0; return m;
  }
  function textSprite(text, opt) {
    opt = opt || {};
    const lines = String(text).split('\n'), fs = 44, pad = 18;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
    const w = Math.ceil(Math.max(...lines.map(l => x.measureText(l).width)) + pad * 2), h = lines.length * fs * 1.25 + pad * 1.4;
    c.width = w; c.height = h;
    x.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
    x.fillStyle = opt.bg || 'rgba(12,17,20,0.82)';
    roundRect(x, 0, 0, w, h, 16); x.fill();
    if (opt.border) { x.strokeStyle = opt.border; x.lineWidth = 4; roundRect(x, 2, 2, w - 4, h - 4, 14); x.stroke(); }
    x.fillStyle = opt.color || '#e9eef0'; x.textBaseline = 'top';
    lines.forEach((l, i) => x.fillText(l, pad, pad * 0.7 + i * fs * 1.25));
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const H = (opt.size || 1.5) * lines.length * 0.9;
    s.scale.set(H * w / h * (1 / lines.length) * lines.length, H, 1);
    s.scale.set(H * w / h, H, 1);
    s.renderOrder = 20; s.userData.baseScale = s.scale.clone();
    return s;
  }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  function makeGlowTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  function glow(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.scale.setScalar(size); s.renderOrder = 15; return s;
  }
  function label(group, text, anchor, offset, opt) {
    const s = textSprite(text, Object.assign({ size: 1.3 }, opt || {}));
    s.position.copy(anchor).add(offset);
    const lg = new THREE.BufferGeometry().setFromPoints([anchor, s.position.clone()]);
    const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x9fb0b6, transparent: true, opacity: 0.8, depthTest: false }));
    ln.renderOrder = 19;
    const g = new THREE.Group(); g.add(ln, s); g.userData.isLabel = true; group.add(g); return g;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---------------------------------------------------------------- table, source
  const table = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), M.table); table.position.y = -0.6; bench.add(table);
  const source = new THREE.Group(); bench.add(source);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, AXIS_Y - 1.4, 16), M.stand); post.position.y = (AXIS_Y - 1.4) / 2; source.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.6, 32), M.stand); foot.position.y = 0.3; source.add(foot);
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.32, 32), M.src); puck.rotation.z = Math.PI / 2; puck.position.y = AXIS_Y; source.add(puck);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: COL.gamma })); dot.position.y = AXIS_Y; source.add(dot);
  const srcGlow = glow(COL.gamma, 3); srcGlow.position.y = AXIS_Y; srcGlow.material.opacity = 0.45; source.add(srcGlow);
  let srcLabel = null;
  function setSourceLabel(name) {
    if (srcLabel) source.remove(srcLabel);
    srcLabel = label(source, name + ' source\n(sealed, virtual)', V(0, AXIS_Y + 1.3, 0), V(0, 6, 0), { size: 1.4, color: COL.gamma });
    srcLabel.visible = S.labels;
  }

  // ---------------------------------------------------------------- HPGe detector
  function buildHPGe(det) {
    const g = new THREE.Group(), c = det.crystal, L = c.L, R = c.R;
    const parts = new THREE.Group(); g.add(parts);
    const crystal = new THREE.Group(); parts.add(crystal);
    crystal.add(cylX(R, R, L, M.ge, 0));
    crystal.add(cylX(R + 0.03, R + 0.03, L, M.nplus, 0, true));                       // outer n+ contact (Li)
    crystal.add(cylX(c.holeR, c.holeR, c.holeDepth, M.hole, L - c.holeDepth + 0.001, false, 24)); // core hole
    crystal.add(cylX(c.holeR * 0.6, c.holeR * 0.6, c.holeDepth + 2, M.gold, L - c.holeDepth + 0.2, false, 16)); // p+ core contact pin
    parts.add(tube(R + 0.15, R + 0.3, L + 0.6, M.cu, 0.2));                            // copper holder
    parts.add(cylX(R + 0.3, R + 0.3, 0.3, M.cu, L + 0.8));
    const endcap = new THREE.Group(); parts.add(endcap);
    endcap.add(tube(3.65, 3.8, 14.5, M.al, -det.gap));
    endcap.add(disc(3.8, M.al, -det.gap));
    parts.add(cylX(0.55, 0.55, 18, M.cu, L + 1.1, false, 16));                          // cold finger
    parts.add(tube(1.6, 1.8, 13, M.al, 14));                                            // cryostat arm
    const pre = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), M.box); pre.position.set(17, 4.2, 0); parts.add(pre);
    const pulseBox = new THREE.Mesh(new THREE.BoxGeometry(6.2, 4.2, 5.2), M.pulse); pulseBox.position.copy(pre.position); parts.add(pulseBox);
    // LN2 dewar
    const dew = new THREE.Group(); dew.position.set(34, 0, 0); parts.add(dew);
    const dw = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 30, 48, 1, true), M.dewar); dw.position.y = -15 + 1.5; dew.add(dw);
    const dt = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 0.6, 48), M.dewar); dt.position.y = 1.5; dew.add(dt);
    const db = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 0.6, 48), M.dewar); db.position.y = -28.5; dew.add(db);
    const ln = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.8, 20, 40), M.ln2); ln.position.y = -18; dew.add(ln);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4, 16), M.dewar); neck.position.y = 3.8; dew.add(neck);
    const dip = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 18, 12), M.cu); dip.position.set(-7, -9, 0); dew.add(dip);
    const lab = new THREE.Group(); g.add(lab);
    label(lab, 'Ge crystal (p-type coaxial)\nE/2.96 eV → electron–hole pairs', V(L * 0.5, R, 0), V(-2, 11, 0));
    label(lab, 'Outer n⁺ contact (+HV ≈ 3–4 kV)', V(L * 0.7, -R, 1.5), V(-4, -9, 4));
    label(lab, 'Inner p⁺ contact', V(L - 0.5, 0, 0), V(2, -7.5, 6));
    label(lab, 'Al endcap (vacuum inside)', V(-det.gap, 2.5, 3), V(-6, 5, 5));
    label(lab, 'Preamplifier (charge-sensitive)', V(17, 6.2, 0), V(-2, 6, 0));
    label(lab, 'Copper cold finger', V(22, 0, 0.6), V(2, -8, 6));
    label(lab, 'LN₂ dewar, 77 K\nCooling stops thermally\ngenerated leakage current', V(34, 2, 6), V(-4, 13, 6));
    return { g, parts, crystal, housing: [endcap, dew], pulseBox, lab, preAnchor: pre.position.clone() };
  }
  // ---------------------------------------------------------------- NaI(Tl) detector
  function buildNaI(det) {
    const g = new THREE.Group(), c = det.crystal, L = c.L, R = c.R;
    const parts = new THREE.Group(); g.add(parts);
    const crystal = new THREE.Group(); parts.add(crystal);
    crystal.add(cylX(R, R, L, M.nai, 0));
    crystal.add(cylX(R + 0.08, R + 0.08, L, M.refl, 0, true));                          // reflector
    parts.add(disc(R + 0.08, M.refl, -0.02));
    const housing = new THREE.Group(); parts.add(housing);
    housing.add(tube(4.05, 4.2, L + 0.8, M.al, -det.gap));
    housing.add(disc(4.2, M.al, -det.gap));
    parts.add(cylX(R, R, 0.5, M.glass, L));                                              // optical window
    parts.add(cylX(R, R, 0.12, M.gel, L + 0.5));                                         // coupling gel
    const px = L + 0.62;
    parts.add(cylX(3.8, 3.8, 15, M.glass, px, true));                                    // PMT envelope
    parts.add(disc(3.7, M.cathode, px + 0.15));                                          // photocathode
    for (let i = 0; i < 10; i++) {                                                       // dynodes
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 2.2), M.dynode);
      d.position.set(px + 4 + i * 0.95, (i % 2 ? -0.9 : 0.9), 0); d.rotation.z = (i % 2 ? 0.5 : -0.5); parts.add(d);
    }
    const anode = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 1.8), M.gold); anode.position.set(px + 14, 0, 0); parts.add(anode);
    const shield = tube(4.0, 4.15, 15.5, M.mu, px - 0.2); housing.add(shield);
    const base = cylX(3.2, 3.2, 5.5, M.box, px + 15.3); housing.add(base);
    const pulseBox = cylX(3.35, 3.35, 5.7, M.pulse, px + 15.2); parts.add(pulseBox);
    // stand
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, AXIS_Y - 4, 16), M.stand); st.position.set(L + 8, -(AXIS_Y - 4) / 2 - 4, 0); parts.add(st);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 9), M.stand); cl.position.set(L + 8, -4.3, 0); parts.add(cl);
    const ft = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.6, 32), M.stand); ft.position.set(L + 8, -AXIS_Y + 0.3, 0); parts.add(ft);
    const lab = new THREE.Group(); g.add(lab);
    label(lab, 'NaI(Tl) crystal\n~38 light photons per keV', V(L * 0.4, R, 0), V(-2, 11, 0));
    label(lab, 'Reflector (diffuse white)', V(L * 0.8, -R, 1), V(-3, -8, 5));
    label(lab, 'Optical window + coupling gel', V(L + 0.5, -2.5, 2), V(1, -11, 6));
    label(lab, 'Photocathode (light → photoelectrons)', V(px + 0.2, 2.5, 2), V(3, 9.5, 2));
    label(lab, 'Dynodes ×10: gain ≈ 10⁶', V(px + 8, 1, 1), V(1, 13.5, 2));
    label(lab, 'Voltage divider + preamp', V(px + 18, 3.2, 0), V(3, 7, 0));
    label(lab, 'Al housing (crystal is hygroscopic)', V(-det.gap, 3, 3), V(-6, 5, 5));
    return { g, parts, crystal, housing: [housing], pulseBox, lab, px };
  }

  const dets = {};
  function buildDetectors(defs) {
    for (const k of Object.keys(dets)) { bench.remove(dets[k].g); }
    dets.hpge = buildHPGe(defs.hpge); dets.nai = buildNaI(defs.nai);
    dets.hpge.def = defs.hpge; dets.nai.def = defs.nai;
    for (const k of ['hpge', 'nai']) { dets[k].fx = new THREE.Group(); dets[k].g.add(dets[k].fx); bench.add(dets[k].g); }
    applyLayout(); applyCutaway();
  }

  function applyLayout() {
    const show = { hpge: S.layout !== 'nai', nai: S.layout !== 'hpge' };
    let minX = 0, maxX = 0;
    for (const k of ['hpge', 'nai']) {
      const d = dets[k]; d.g.visible = show[k];
      const zs = S.dist + d.def.gap;
      d.zs = zs;
      if (S.layout === 'both') {
        if (k === 'nai') { d.g.position.set(zs, AXIS_Y, 0); d.g.rotation.y = 0; }
        else { d.g.position.set(-zs, AXIS_Y, 0); d.g.rotation.y = Math.PI; }
      } else { d.g.position.set(zs, AXIS_Y, 0); d.g.rotation.y = 0; }
      if (show[k]) {
        const far = k === 'hpge' ? 46 : d.def.crystal.L + 28;
        const sgn = (S.layout === 'both' && k === 'hpge') ? -1 : 1;
        minX = Math.min(minX, sgn > 0 ? 0 : -zs - far); maxX = Math.max(maxX, sgn > 0 ? zs + far : 0);
      }
    }
    const cx = (minX + maxX) / 2, w = maxX - minX + 16;
    bench.position.x = -cx;
    table.scale.set(w, 1, 34);
    table.position.x = cx;
    S.extent = { w, cx };
  }
  function applyCutaway() {
    for (const m of housingMats) { m.opacity = S.cutaway ? 0.13 : 1; m.depthWrite = !S.cutaway; m.needsUpdate = true; }
  }
  function applyLabels() {
    for (const k of Object.keys(dets)) dets[k].lab.visible = S.labels;
    if (srcLabel) srcLabel.visible = S.labels;
  }

  // ---------------------------------------------------------------- animation
  const flights = [];      // build-mode photons
  const fx = [];           // transient effects (glows, labels)
  const mc2l = p => V(p[2], p[1], p[0]);   // MC crystal frame -> detector local frame
  const kindColor = k => ({ gamma: COL.gamma, scatter: COL.scatter, annih: COL.annih, xray: COL.xray }[k] || COL.gamma);
  const intColor = t => ({ photo: COL.photo, compton: COL.scatter, pair: COL.annih, absorb: COL.photo }[t]);

  function photonMesh(color, r) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(r || 0.22, 10, 8), new THREE.MeshBasicMaterial({ color })); g.add(core);
    const gl = glow(color, (r || 0.22) * 7); gl.material.opacity = 0.8; g.add(gl);
    return g;
  }
  function trail(a, b, color, op) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), a.clone()]);
    const ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op == null ? 0.7 : op, depthTest: false }));
    ln.renderOrder = 12; ln.userData = { a: a.clone(), b: b.clone() }; return ln;
  }
  /** Build-mode: animate one real Monte Carlo history (slowed down). */
  function spawnFlight(detKey, ev, speed) {
    const d = dets[detKey]; if (!d || !d.g.visible) return;
    if (flights.filter(f => f.det === detKey).length > 10) return;
    const segs = [];
    for (const t of ev.tracks) {
      const a = mc2l(t.a), b = mc2l(t.end === 'escape' ? t.far : t.b);
      segs.push({ a, b, kind: t.kind, end: t.end, len: a.distanceTo(b) });
    }
    // order: primary first, secondaries follow from their start points (already in emission order)
    const f = { det: detKey, ev, segs, i: 0, s: 0, speed: speed || 22, obj: photonMesh(kindColor(segs[0].kind)), lines: [], dead: false };
    d.fx.add(f.obj); flights.push(f);
  }
  function stepFlights(dt) {
    for (const f of flights) {
      const d = dets[f.det]; let seg = f.segs[f.i];
      if (!seg) { f.dead = true; continue; }
      if (f.s === 0) {
        f.obj.position.copy(seg.a);
        f.obj.children[0].material.color.set(kindColor(seg.kind)); f.obj.children[1].material.color.set(kindColor(seg.kind));
        const ln = trail(seg.a, seg.b, kindColor(seg.kind), 0.45); d.fx.add(ln); f.lines.push(ln); f.cur = ln;
      }
      const inside = seg.end !== 'enter';
      f.s += dt * f.speed * (inside ? 0.35 : 1);
      const u = Math.min(1, f.s / Math.max(0.01, seg.len));
      f.obj.position.lerpVectors(seg.a, seg.b, u);
      const pos = f.cur.geometry.attributes.position; pos.setXYZ(1, f.obj.position.x, f.obj.position.y, f.obj.position.z); pos.needsUpdate = true;
      if (u >= 1) {
        if (seg.end === 'int') { const it = f.ev.ints.find(q => Math.abs(q.p[2] - seg.b.x) < 1e-6 && Math.abs(q.p[0] - seg.b.z) < 1e-6); flash(d, seg.b, intColor(it ? it.type : 'photo'), 2.2); }
        f.i++; f.s = 0;
      }
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      if (f.dead) {
        f.fade = (f.fade || 1) - dt * 1.5;
        for (const l of f.lines) l.material.opacity = Math.max(0, 0.45 * f.fade);
        f.obj.visible = false;
        if (f.fade <= 0) { const d = dets[f.det]; d.fx.remove(f.obj); f.lines.forEach(l => d.fx.remove(l)); flights.splice(i, 1); }
      }
    }
  }
  function flash(d, pos, color, size, life) {
    const s = glow(color, size); s.position.copy(pos); d.fx.add(s);
    fx.push({ obj: s, parent: d.fx, t: 0, life: life || 0.7, size, kind: 'flash' });
  }
  function pulseElectronics(detKey) { const d = dets[detKey]; if (d) fx.push({ kind: 'pulse', d, t: 0, life: 0.6 }); }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i]; e.t += dt; const u = e.t / e.life;
      if (e.kind === 'flash') { e.obj.material.opacity = Math.max(0, 1 - u); e.obj.scale.setScalar(e.size * (0.6 + u)); }
      if (e.kind === 'pulse') e.d.pulseBox.material.opacity = Math.max(0, 0.55 * (1 - u));
      if (u >= 1) { if (e.obj) e.parent.remove(e.obj); fx.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------- follow one photon
  const F = { active: false };
  function clearFollow() {
    if (F.group) F.group.parent.remove(F.group);
    F.active = false; F.group = null; F.nLab = 0;
  }
  /** stage: 0 emission, 1 interactions, 2 detector signal, >=3 electronics */
  function followEvent(detKey, ev, q, stage) {
    clearFollow();
    const d = dets[detKey]; if (!d) return;
    const g = new THREE.Group(); d.fx.add(g);
    Object.assign(F, { active: true, d, detKey, ev, q, stage, t: 0, group: g, objs: [], done: false });
    const prim = ev.tracks[0];
    if (stage === 0) {
      const ph = photonMesh(COL.gamma, 0.35); g.add(ph); F.ph = ph;
      F.trail = trail(mc2l(prim.a), mc2l(prim.b), COL.gamma, 0.9); g.add(F.trail);
      const lb = textSprite(`γ ${ev.E0.toFixed(1)} keV`, { size: 1.5, color: COL.gamma }); g.add(lb); F.lab = lb;
      if (ev.cls === 'window') { const w = textSprite('Absorbed in ' + (ev.windowLabel || 'window'), { size: 1.3, color: COL.scatter }); w.position.copy(mc2l(prim.b)).add(V(0, 4, 0)); g.add(w); }
    } else {
      // the primary path stays drawn
      const l0 = trail(mc2l(prim.a), mc2l(prim.b), COL.gamma, 0.5); setFull(l0); g.add(l0);
    }
    if (stage >= 1) {
      F.segs = ev.tracks.slice(1).map(t => ({ a: mc2l(t.a), b: mc2l(t.end === 'escape' ? t.far : t.b), bb: mc2l(t.b), t }));
      F.si = stage === 1 ? 0 : F.segs.length; F.ss = 0;
      if (stage === 1) { F.ph = photonMesh(COL.gamma, 0.3); g.add(F.ph); }
      F.marked = new Set();
      if (stage > 1) { F.segs.forEach((s, i) => { const l = trail(s.a, s.b, kindColor(s.t.kind), 0.35); setFull(l); g.add(l); markEnd(i, true); }); }
      if (!ev.ints.length && stage === 1) { const w = textSprite('No interaction: the photon passes straight through', { size: 1.3, color: COL.gamma }); w.position.copy(mc2l(prim.b)).add(V(d.def.crystal.L / 2, 6, 0)); g.add(w); }
    }
    if (stage === 2) startSignal();
    if (stage >= 3) { F.t = 0; }
  }
  function setFull(l) { const p = l.geometry.attributes.position; p.setXYZ(1, l.userData.b.x, l.userData.b.y, l.userData.b.z); p.needsUpdate = true; }
  function markEnd(i, quiet) {
    if (F.marked.has(i)) return; F.marked.add(i);
    const s = F.segs[i], g = F.group;
    if (s.t.end === 'escape' && F.stage >= 3) return;
    if (s.t.end === 'int') {
      const it = F.ev.ints.find(q => Math.abs(q.p[0] - s.t.b[0]) < 1e-9 && Math.abs(q.p[2] - s.t.b[2]) < 1e-9);
      if (!it) return;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: intColor(it.type) })); m.position.copy(s.b); g.add(m);
      if (!quiet) flash(F.d, s.b, intColor(it.type), 1.6, 0.8);
      if (F.stage >= 3) return;
      const nm = { photo: 'Photoelectric', compton: 'Compton', pair: 'Pair production', absorb: 'Absorbed' }[it.type];
      let txt = `${nm}: ${it.Edep.toFixed(1)} keV deposited`;
      if (it.type === 'compton') txt += `\nscattered ${it.angle.toFixed(0)}°, ${it.Eout.toFixed(1)} keV continues`;
      if (it.type === 'pair') txt += '\n+ two 511 keV annihilation photons';
      if (it.xray) txt += `\nK x-ray ${it.xray.toFixed(1)} keV emitted`;
      const lb = textSprite(txt, { size: 0.62, color: intColor(it.type) === COL.photo ? '#ffffff' : intColor(it.type) });
      const k = (F.nLab = (F.nLab || 0) + 1) - 1; lb.position.set(-3.2 - lb.scale.x / 2, F.d.def.crystal.R + 1.2 - 1.15 * k, 2.5); g.add(lb);
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([s.b.clone(), lb.position.clone()]), new THREE.LineBasicMaterial({ color: 0x9fb0b6, transparent: true, opacity: 0.6, depthTest: false })); ln.renderOrder = 19; g.add(ln);
    } else if (s.t.end === 'escape') {
      const lb = textSprite(`escapes: ${s.t.E.toFixed(1)} keV`, { size: 0.62, color: kindColor(s.t.kind) });
      lb.position.copy(s.b).add(V(0, 1.0, 0)); g.add(lb);
    }
  }
  function startSignal() {
    const { d, ev, q, group: g } = F;
    F.sig = { t: 0, dots: [] };
    const sites = ev.ints.filter(i => i.Edep > 0);
    sites.forEach(it => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), new THREE.MeshBasicMaterial({ color: intColor(it.type) })); m.position.copy(mc2l(it.p)); g.add(m); });
    const c = d.def.crystal;
    if (F.detKey === 'hpge') {
      const v = d.def.drift, rc = Math.max(c.holeR, 0.05);
      for (const it of sites) {
        const p = mc2l(it.p), r = Math.max(rc + 0.02, Math.hypot(p.y, p.z));
        const dir = r > 1e-6 ? V(0, p.y / r, p.z / r) : V(0, 1, 0);
        const te = (c.R - r) / v, th = (r - rc) / v;
        const n = Math.max(6, Math.min(26, Math.round(26 * it.Edep / ev.E0)));
        for (let i = 0; i < n; i++) {
          const j = V((Math.random() - .5) * .5, (Math.random() - .5) * .5, (Math.random() - .5) * .5);
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), new THREE.MeshBasicMaterial({ color: COL.electron }));
          const h = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), new THREE.MeshBasicMaterial({ color: COL.hole }));
          const p0 = p.clone().add(j); e.position.copy(p0); h.position.copy(p0); g.add(e, h);
          const pe = V(p0.x, dir.y * (c.R - 0.05), dir.z * (c.R - 0.05)), ph = V(Math.min(p0.x, c.L), dir.y * rc, dir.z * rc);
          if (p0.x < c.L - c.holeDepth) ph.x = Math.max(p0.x, c.L - c.holeDepth);    // closed end: holes head for the core
          F.sig.dots.push({ m: e, a: p0, b: pe, dur: 0.6 + 2.4 * te / 300 }, { m: h, a: p0.clone(), b: ph, dur: 0.6 + 2.4 * th / 300 });
        }
      }
      const lb = textSprite(`${fmtN(q.N)} electron–hole pairs\n(${(ev.Edep).toFixed(1)} keV ÷ 2.96 eV)\nElectrons → outer contact, holes → core`, { size: 0.85, color: '#cfe0ff' });
      lb.position.set(c.L / 2, c.R + 4.2, 0); g.add(lb);
    } else {
      const L = c.L, R = c.R;
      for (const it of sites) {
        const p = mc2l(it.p); flash(d, p, COL.light, 2.0, 1.2);
        const n = Math.max(10, Math.min(46, Math.round(46 * it.Edep / ev.E0)));
        for (let i = 0; i < n; i++) {
          const u = isoV(); const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: COL.light }));
          m.position.copy(p); g.add(m);
          F.sig.dots.push({ m, light: true, p: p.clone(), v: u.multiplyScalar(9), alive: true, life: 3.5 + Math.random() });
        }
      }
      F.sig.pmt = { px: d.px, started: false };
      const lb = textSprite(`${fmtN(q.Nph)} scintillation photons (415 nm)\n→ ${fmtN(q.Npe)} photoelectrons\n→ ×${(q.gain / 1e6).toFixed(1)}×10⁶ in the PMT`, { size: 0.85, color: '#ddd3ff' });
      lb.position.set(L * 0.55, R + 4.6, 0); g.add(lb);
    }
  }
  function isoV() { const c = 2 * Math.random() - 1, s = Math.sqrt(1 - c * c), f = 2 * Math.PI * Math.random(); return V(c, s * Math.cos(f), s * Math.sin(f)); }
  function fmtN(n) { n = Math.round(n); return n >= 1e4 ? n.toLocaleString('en-US') : String(n); }

  function stepFollow(dt) {
    if (!F.active) return;
    F.t += dt;
    const ev = F.ev, prim = ev.tracks[0];
    if (F.stage === 0) {
      const a = mc2l(prim.a), b = mc2l(prim.b), u = Math.min(1, F.t / 2.2);
      F.ph.position.lerpVectors(a, b, u); F.lab.position.copy(F.ph.position).add(V(0, 2.2, 0));
      const p = F.trail.geometry.attributes.position; p.setXYZ(1, F.ph.position.x, F.ph.position.y, F.ph.position.z); p.needsUpdate = true;
      if (u >= 1 && !F.done) { F.done = true; }
    } else if (F.stage === 1 && F.si < F.segs.length) {
      const s = F.segs[F.si];
      if (F.ss === 0) { F.cur = trail(s.a, s.b, kindColor(s.t.kind), 0.8); F.group.add(F.cur); F.ph.children[0].material.color.set(kindColor(s.t.kind)); F.ph.children[1].material.color.set(kindColor(s.t.kind)); }
      F.ss += dt * 2.6;
      const u = Math.min(1, F.ss / Math.max(0.05, s.a.distanceTo(s.b)));
      F.ph.position.lerpVectors(s.a, s.b, u);
      const p = F.cur.geometry.attributes.position; p.setXYZ(1, F.ph.position.x, F.ph.position.y, F.ph.position.z); p.needsUpdate = true;
      if (u >= 1) { markEnd(F.si); F.si++; F.ss = 0; if (F.si >= F.segs.length) { F.ph.visible = false; F.done = true; } }
    } else if (F.stage === 1 && !F.segs.length) { F.done = true; if (F.ph) F.ph.visible = false; }
    if (F.stage === 2 && F.sig) stepSignal(dt);
    if (F.stage >= 3) { const ph = (F.t % 1.4) / 1.4; F.d.pulseBox.material.opacity = 0.5 * (1 - ph); }
  }
  function stepSignal(dt) {
    const sig = F.sig, c = F.d.def.crystal; sig.t += dt;
    if (F.detKey === 'hpge') {
      let all = true;
      for (const o of sig.dots) { const u = Math.min(1, sig.t / o.dur); if (u < 1) all = false; o.m.position.lerpVectors(o.a, o.b, u); o.m.visible = u < 1; }
      if (all && !sig.fired) { sig.fired = true; pulseElectronics('hpge'); F.done = true; }
      return;
    }
    const L = c.L, R = c.R; let collected = 0, alive = 0;
    for (const o of sig.dots) {
      if (!o.light || !o.alive) continue;
      o.life -= dt; if (o.life <= 0) { o.alive = false; o.m.visible = false; continue; }
      o.p.addScaledVector(o.v, dt);
      const rr = Math.hypot(o.p.y, o.p.z);
      if (rr > R) { const n = V(0, o.p.y / rr, o.p.z / rr); o.v.addScaledVector(n, -2 * o.v.dot(n)); o.v.applyAxisAngle(V(1, 0, 0), (Math.random() - .5) * 1.2); o.p.y *= R / rr; o.p.z *= R / rr; }
      if (o.p.x < 0) { o.p.x = 0; o.v.x = Math.abs(o.v.x); }
      if (o.p.x > L + 0.62) { o.alive = false; o.m.visible = false; collected++; sig.nCol = (sig.nCol || 0) + 1; flash(F.d, o.p.clone(), COL.light, 0.9, 0.35); continue; }
      o.m.position.copy(o.p); alive++;
    }
    if (!sig.pmt.started && (sig.t > 1.6 || alive === 0)) {
      sig.pmt.started = true; sig.pmt.t = 0; sig.pe = [];
      for (let i = 0; i < 3; i++) addPE(V(sig.pmt.px + 0.2, (Math.random() - .5) * 3, (Math.random() - .5) * 3), 0);
    }
    if (sig.pmt.started) {
      sig.pmt.t += dt;
      const D = i => V(sig.pmt.px + 4 + i * 0.95, i % 2 ? -0.9 : 0.9, 0);
      for (const e of sig.pe) {
        e.u += dt * 3.2; const target = e.stage < 10 ? D(e.stage) : V(sig.pmt.px + 14, 0, 0);
        e.m.position.lerpVectors(e.from, target, Math.min(1, e.u));
        if (e.u >= 1 && !e.hit) {
          e.hit = true;
          if (e.stage < 10) { flash(F.d, target, COL.electron, 0.8, 0.3); const k = sig.pe.length < 70 ? 2 : 1; for (let j = 0; j < k; j++) addPE(target.clone().add(V(0, (Math.random() - .5) * .6, (Math.random() - .5) * .8)), e.stage + 1); }
          e.m.visible = false;
        }
      }
      if (!sig.fired && sig.pmt.t > 4.0) { sig.fired = true; pulseElectronics('nai'); F.done = true; }
    }
  }
  function addPE(from, stage) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color: COL.electron }));
    m.position.copy(from); F.group.add(m); F.sig.pe.push({ m, from, stage, u: 0 });
  }

  // ---------------------------------------------------------------- API
  function update(dt) {
    dt = Math.min(dt, 0.05);
    stepFlights(dt); stepFx(dt); stepFollow(dt);
    srcGlow.material.opacity = 0.35 + 0.15 * Math.sin(performance.now() / 300);
    // keep labels upright and readable
  }
  function crystalCenter(detKey) {
    const d = dets[detKey] || dets.hpge; const v = V(d.def.crystal.L / 2, 0, 0); d.g.updateMatrixWorld(true); return d.g.localToWorld(v);
  }
  function setLabelScale(f) {
    S.labelScale = f;
    root.traverse(o => { if (o.isSprite && o.userData.baseScale) o.scale.copy(o.userData.baseScale).multiplyScalar(f); });
  }

  return {
    root, bench, AXIS_Y, dets,
    build: defs => { buildDetectors(defs); setSourceLabel(S.source); },
    setLayout(layout, dist) { S.layout = layout; S.dist = dist; applyLayout(); },
    setCutaway(v) { S.cutaway = v; applyCutaway(); },
    setLabels(v) { S.labels = v; applyLabels(); },
    setCloseUp(v) { S.close = v; for (const k of Object.keys(dets)) dets[k].lab.visible = S.labels && !v; if (srcLabel) srcLabel.visible = S.labels && !v; },
    setSource(name) { S.source = name; setSourceLabel(name); },
    setLabelScale, spawnFlight, followEvent, clearFollow, pulseElectronics, update, crystalCenter,
    get followDone() { return !F.active || F.done; },
    get extent() { return S.extent; },
    clearFlights() { for (const f of flights) f.dead = true; }
  };
}
window.GS = { create };
})();
