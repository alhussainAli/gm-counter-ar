/* Radiation–Matter Interaction AR — 3D scene: black stage, coloured material block,
 * time-animated particle tracks, ionization / excitation / Cherenkov points, event flashes.
 * three.js r147 API. Display units: cm (slab drawn 40 cm long whatever its real thickness). */
(function () {
'use strict';
function create({ THREE, COL }) {
  const root = new THREE.Group();
  const SL = 40, SH = 26, Y0 = 24;                 // displayed slab length, height/depth, centre height
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();

  // ------------------------------------------------ black stage
  const stage = new THREE.Group(); root.add(stage);
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(84, 1, 50), black); floor.position.set(0, 0.5, 0); stage.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(84, 52, 1), black); back.position.set(0, 26, -25); stage.add(back);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(1, 52, 50), black); sideL.position.set(-42, 26, 0); stage.add(sideL);
  const sideR = sideL.clone(); sideR.position.x = 42; stage.add(sideR);
  const grid = new THREE.GridHelper(80, 16, 0x1d2a2e, 0x111a1d); grid.position.set(0, 1.02, 0); grid.scale.z = 46 / 80; stage.add(grid);
  const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(84, 52, 50)), new THREE.LineBasicMaterial({ color: 0x263338 })); rim.position.set(0, 26, 0); stage.add(rim);

  // ------------------------------------------------ material slab
  const slabMat = new THREE.MeshPhysicalMaterial({ color: 0x2f7dff, transparent: true, opacity: 0.25, roughness: 0.25, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(SL, SH, SH), slabMat); slab.position.set(0, Y0, 0); slab.renderOrder = 1; root.add(slab);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SL, SH, SH)), new THREE.LineBasicMaterial({ color: 0x9cc4ff, transparent: true, opacity: 0.8 })); edges.position.copy(slab.position); root.add(edges);
  root.add(new THREE.AmbientLight(0xffffff, 0.55)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(20, 60, 40); root.add(dl);
  // beam source
  const gun = new THREE.Group(); root.add(gun);
  const gunBody = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 24), new THREE.MeshStandardMaterial({ color: 0x3a464c, metalness: 0.6, roughness: 0.4 })); gunBody.rotation.z = Math.PI / 2; gun.add(gunBody);
  const gunTip = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xffd34d })); gunTip.rotation.y = Math.PI / 2; gunTip.position.x = 3.55; gun.add(gunTip);
  gun.position.set(-SL / 2 - 9, Y0, 0);
  const labels = new THREE.Group(); root.add(labels);

  function textSprite(text, color, size, bg) {
    const lines = String(text).split('\n'), fs = 44, pad = 16, c = document.createElement('canvas'), x = c.getContext('2d');
    x.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
    const w = Math.ceil(Math.max(...lines.map(l => x.measureText(l).width)) + pad * 2), h = Math.ceil(lines.length * fs * 1.22 + pad * 1.2);
    c.width = w; c.height = h; x.font = `600 ${fs}px "IBM Plex Sans", system-ui, sans-serif`;
    if (bg !== false) { x.fillStyle = 'rgba(0,0,0,0.72)'; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, 14) : x.rect(0, 0, w, h); x.fill(); }
    x.fillStyle = color || '#e8eef0'; x.textBaseline = 'top'; lines.forEach((l, i) => x.fillText(l, pad, pad * 0.6 + i * fs * 1.22));
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false })); const H = (size || 1.6) * lines.length;
    s.scale.set(H * w / h, H, 1); s.renderOrder = 30; return s;
  }
  let labelObjs = [];
  function setLabels(mat, D, beamText, beamColor) {
    for (const o of labelObjs) labels.remove(o); labelObjs = [];
    const add = (o) => { labels.add(o); labelObjs.push(o); return o; };
    const m = add(textSprite(mat.name + `  ·  ρ = ${mat.rho < 0.01 ? mat.rho.toExponential(2) : mat.rho} g/cm³`, mat.color, 2.6)); m.position.set(0, Y0 + SH / 2 + 4, 0);
    const b = add(textSprite(beamText, beamColor, 2.2)); b.position.set(-SL / 2 - 6, Y0 + 5.5, 0);
    // scale bar along the bottom front edge
    const bar = new THREE.Group(); add(bar);
    const lm = new THREE.LineBasicMaterial({ color: 0xe8eef0 });
    const pts = [new THREE.Vector3(-SL / 2, 0, 0), new THREE.Vector3(SL / 2, 0, 0), new THREE.Vector3(-SL / 2, -0.8, 0), new THREE.Vector3(-SL / 2, 0.8, 0), new THREE.Vector3(SL / 2, -0.8, 0), new THREE.Vector3(SL / 2, 0.8, 0)];
    bar.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm)); bar.position.set(0, Y0 - SH / 2 - 2.2, SH / 2);
    const t = textSprite('thickness ' + fmtLen(D), '#e8eef0', 2.2, false); t.position.set(0, -2.4, 0); bar.add(t);
  }
  function fmtLen(cm) { return cm >= 100 ? (cm / 100).toPrecision(3) + ' m' : cm >= 1 ? cm.toPrecision(3) + ' cm' : cm >= 0.1 ? (cm * 10).toPrecision(3) + ' mm' : (cm * 1e4).toPrecision(3) + ' µm'; }

  // ------------------------------------------------ histories
  const P2D = { s: SL };
  let k = 1, D = 1;                                   // display scale: display cm per physical cm
  const map = (x, y, z) => new THREE.Vector3(-SL / 2 + x * k, Y0 + y * k, z * k);
  const hist = [];                                    // active animated histories
  const dotVS = `attribute float t; attribute vec3 color; uniform float uT; uniform float uSize; varying vec3 vC; varying float vA;
    void main(){ vC = color; float age = uT - t; vA = age < 0.0 ? 0.0 : clamp(1.0 - age * 0.0, 0.0, 1.0) * (age < 0.25 ? 1.0 + 2.0 * (0.25 - age) : 1.0);
      vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * (age < 0.0 ? 0.0 : 1.0) * (age < 0.25 ? 1.8 : 1.0) * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
  const dotFS = `varying vec3 vC; varying float vA; uniform float uFade; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r) * vA * uFade; gl_FragColor = vec4(vC * (0.7 + 0.6 * a), a); }`;
  const ctype = { gamma: COL.gamma, xray: COL.xray, e: COL.e, pos: COL.pos, p: COL.p, alpha: COL.alpha, n: COL.n };
  const procCol = { photoelectric: COL.gamma, compton: COL.e, rayleigh: '#9fb0b6', pair: COL.pos, annihilation: COL.pos, brems: COL.xray, delta: COL.e, 'n-elastic': COL.n, 'n-capture': '#ffffff', 'n-inelastic': COL.n, 'n-p': COL.p, nuclear: '#ffffff', ionization: COL.ion, excitation: COL.exc, stop: COL.alpha, thermalized: COL.n };
  function addHistory(h, opt) {
    const g = new THREE.Group(); root.add(g);
    const H = { h, g, t: 0, tracks: [], done: false, fade: 1, flashes: [], speed: opt.speed || 1, tEnd: 0 };
    for (const tr of h.tracks) {
      if (tr.pts.length < 2) continue;
      const kind = tr.type === 'gamma' && tr.xray ? 'xray' : tr.type;
      if (!opt.secondaries && tr.gen > 0 && !(tr.type === 'p' && tr.born === 'recoil proton')) continue;
      const n = tr.pts.length, pos = new Float32Array(n * 3);
      tr.pts.forEach((p, i) => { const v = map(p[0], p[1], p[2]); pos[3 * i] = v.x; pos[3 * i + 1] = v.y; pos[3 * i + 2] = v.z; });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setDrawRange(0, 0);
      const col = new THREE.Color(ctype[kind] || '#ffffff');
      const isPhoton = tr.type === 'gamma', isN = tr.type === 'n';
      const mat = isN ? new THREE.LineDashedMaterial({ color: col, dashSize: 0.9, gapSize: 0.6, transparent: true, opacity: 0.95 }) : new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: isPhoton ? 0.75 : 0.95 });
      const line = new THREE.Line(geo, mat); if (isN) line.computeLineDistances(); line.renderOrder = 5; g.add(line);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      head.scale.setScalar(tr.gen === 0 ? 2.6 : 1.5); head.visible = false; head.renderOrder = 12; g.add(head);
      H.tracks.push({ tr, line, geo, pos, orig: pos.slice(), head, n, times: tr.pts.map(p => p[3]) });
      H.tEnd = Math.max(H.tEnd, tr.pts[n - 1][3]);
    }
    // points: ionization (0), excitation (1), Cherenkov (2)
    const dots = h.dots.filter(d => (d[4] === 0 && opt.ion) || (d[4] === 1 && opt.exc));
    const cher = opt.cher ? h.cher : [];
    const nC = cher.length * 6, N = dots.length + nC;
    if (N) {
      const pos = new Float32Array(N * 3), tt = new Float32Array(N), cc = new Float32Array(N * 3);
      const cI = new THREE.Color(COL.ion), cE = new THREE.Color(COL.exc), cK = new THREE.Color(COL.cher);
      dots.forEach((d, i) => { const v = map(d[0], d[1], d[2]); pos.set([v.x, v.y, v.z], 3 * i); tt[i] = d[3]; const c = d[4] ? cE : cI; cc.set([c.r, c.g, c.b], 3 * i); });
      let j = dots.length;
      for (const c of cher) for (let q = 0; q < 6; q++) { // light emitted on a cone around the track
        const u = Math.random(), a = map(c[0] + (c[3] - c[0]) * u, c[1] + (c[4] - c[1]) * u, c[2] + (c[5] - c[2]) * u), r = 0.6 + Math.random() * 1.4, f = Math.random() * 6.283, th = c[8];
        pos.set([a.x + r * Math.cos(th), a.y + r * Math.sin(th) * Math.cos(f), a.z + r * Math.sin(th) * Math.sin(f)], 3 * j); tt[j] = c[6] + (c[7] - c[6]) * u + 0.05; cc.set([cK.r, cK.g, cK.b], 3 * j); j++;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('t', new THREE.BufferAttribute(tt, 1)); geo.setAttribute('color', new THREE.BufferAttribute(cc, 3));
      const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSize: { value: opt.dotSize || 0.45 }, uFade: { value: 1 } }, vertexShader: dotVS, fragmentShader: dotFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(geo, mat); pts.renderOrder = 8; pts.frustumCulled = false; g.add(pts); H.points = pts;
    }
    for (const e of h.events) if (!e.rep && e.proc !== 'stop') H.flashes.push({ e, done: false });
    hist.push(H);
    while (hist.length > (opt.keep || 6)) { const o = hist.shift(); root.remove(o.g); dispose(o.g); }
    return H;
  }
  function dispose(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  function flash(H, e) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(procCol[e.proc] || '#ffffff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.position.copy(map(e.p[0], e.p[1], e.p[2])); s.renderOrder = 14; H.g.add(s);
    const big = ['photoelectric', 'compton', 'pair', 'n-capture', 'nuclear', 'annihilation', 'n-inelastic', 'n-p'].includes(e.proc);
    fx.push({ s, t: 0, life: big ? 1.1 : 0.6, size: big ? 4.5 : 2.2, parent: H.g });
  }
  const fx = [];
  let selMarker = null;
  function markEvent(H, e) { // ring around the event shown in the atomic view
    if (selMarker) { selMarker.parent && selMarker.parent.remove(selMarker); selMarker = null; }
    if (!H || !e) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xf2b33d, transparent: true, depthTest: false, side: THREE.DoubleSide }));
    ring.position.copy(map(e.p[0], e.p[1], e.p[2])); ring.renderOrder = 40; H.g.add(ring); selMarker = ring;
  }
  function update(dt, cam) {
    for (const H of hist) {
      if (!H.done) H.t += dt * H.speed;
      const t = H.t;
      for (const T of H.tracks) {
        const ts = T.times; let i = 0; while (i < T.n && ts[i] <= t) i++;
        if (i === 0) { T.geo.setDrawRange(0, 0); T.head.visible = false; continue; }
        const P = T.geo.attributes.position;
        if (i < T.n) { // interpolate the head on segment i-1 → i
          const u = (t - ts[i - 1]) / Math.max(1e-9, ts[i] - ts[i - 1]), o = T.orig;
          for (let q = 0; q < 3; q++) P.array[3 * i + q] = o[3 * (i - 1) + q] + (o[3 * i + q] - o[3 * (i - 1) + q]) * u;
          P.needsUpdate = true; T.geo.setDrawRange(0, i + 1);
          T.head.visible = true; T.head.position.set(P.array[3 * i], P.array[3 * i + 1], P.array[3 * i + 2]);
        } else { if (T.full !== true) { P.array.set(T.orig); P.needsUpdate = true; T.full = true; } T.geo.setDrawRange(0, T.n); T.head.visible = false; }
        if (T.line.material.isLineDashedMaterial && T.dashT !== i) { T.line.computeLineDistances(); T.dashT = i; }
      }
      if (H.points) H.points.material.uniforms.uT.value = t;
      for (const f of H.flashes) if (!f.done && f.e.t <= t) { f.done = true; flash(H, f.e); }
      if (!H.done && t > H.tEnd + 0.4) H.done = true;
    }
    // older histories fade
    const n = hist.length;
    hist.forEach((H, i) => { const age = n - 1 - i, f = Math.max(0.12, 1 - age * 0.16); if (H.fade !== f) { H.fade = f; H.g.traverse(o => { if (o.material && o.material.opacity != null && !o.isSprite) o.material.opacity = (o.material.userOpacity || (o.material.userOpacity = o.material.opacity)) * f; }); if (H.points) H.points.material.uniforms.uFade.value = f; } });
    for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.t += dt; const u = e.t / e.life; e.s.material.opacity = Math.max(0, 1 - u); e.s.scale.setScalar(e.size * (0.5 + u)); if (u >= 1) { e.parent.remove(e.s); e.s.material.dispose(); fx.splice(i, 1); } }
    if (selMarker && cam) selMarker.lookAt(cam.position);
  }
  function setMaterial(mat, D_, beamText, beamColor) {
    D = D_; k = SL / D;
    slabMat.color.set(mat.color); slabMat.opacity = Math.max(0.05, mat.opacity); slabMat.needsUpdate = true;
    edges.material.color.set(mat.color).offsetHSL(0, 0, 0.15);
    gunTip.material.color.set(beamColor);
    setLabels(mat, D, beamText, beamColor);
  }
  function clear() { while (hist.length) { const o = hist.shift(); root.remove(o.g); dispose(o.g); } }
  return { root, Y0, SL, SH, addHistory, update, setMaterial, clear, markEvent, get histories() { return hist; }, setLabelsVisible(v) { labels.visible = v; } };
}
window.IS = { create };
})();
