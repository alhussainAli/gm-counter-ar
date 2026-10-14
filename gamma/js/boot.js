/* Loads the right 3D/AR libraries for the chosen view, then the app.
 * ?view=marker -> A-Frame 1.4.2 + AR.js 3.4.5 (marker tracking, works on iPhone)
 * otherwise    -> three.js r147 + OrbitControls (3D view and WebXR surface AR) */
(function () {
  const params = new URLSearchParams(location.search);
  const view = params.get('view');
  const libs = view === 'marker'
    ? ['https://aframe.io/releases/1.4.2/aframe.min.js',
       'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.5/aframe/build/aframe-ar.js']
    : ['https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js',
       'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js'];
  const own = ['js/physics.js', 'js/scene.js', 'js/app.js'];
  function load(list, done) {
    if (!list.length) return done();
    const s = document.createElement('script'); s.src = list[0];
    s.onload = () => load(list.slice(1), done);
    s.onerror = () => { const n = document.querySelector('#xr-note'); if (n) n.textContent = 'Could not load ' + list[0] + '. Check the internet connection and reload.'; };
    document.head.appendChild(s);
  }
  window.GAMMA_VIEW = view;
  load(libs.concat(own), () => window.GammaApp && window.GammaApp.boot(view));
})();
