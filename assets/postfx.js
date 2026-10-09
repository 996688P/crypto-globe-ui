/* postfx.js
   CG_POSTFX_V1 — 后处理电影感层 (作者: 网站特效要"电影级/星云爆发核")
   做法: 只给「地球/玻璃币」这一个 three 场景挂 UnrealBloom 泛光管线, 其余渲染原样透传。
   安全: 纯装饰 · fail-open(任何异常自动退回原渲染) · 只包 WebGLRenderer(r128 是普通函数, 非 class)
   依赖: vendor/three.min.js + vendor/postproc/*.js (均本地, 无 CDN)
   回滚: URL 加 ?postfx=off; 或删除 index.html 中本文件引用 */
(function () {
  "use strict";
  if (window.__cgPostFX) return;
  window.__cgPostFX = { v: 2, on: false, bloom: false, ready: false };

  var enabled = true;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('postfx') === 'off') enabled = false;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) enabled = false;
  } catch (e) {}
  if (!enabled) { window.__cgPostFX.on = false; return; }
  window.__cgPostFX.on = true;

  var CAP = { renderer: null, scene: null, camera: null };
  var composer = null, bloomPass = null, _in = false, _tried = false;

  function build() {
    if (composer) return true;
    if (_tried) return false;
    var r = CAP.renderer, sc = CAP.scene, cam = CAP.camera;
    if (!r || !sc || !cam) return false;
    if (typeof THREE.EffectComposer !== 'function' || typeof THREE.UnrealBloomPass !== 'function') return false;
    _tried = true;
    try {
      var size = r.getSize(new THREE.Vector2());
      composer = new THREE.EffectComposer(r);
      composer.addPass(new THREE.RenderPass(sc, cam));
      /* 泛光: 只让「极亮部」(币面高光/能量核/扫描光) 溢出柔光。
         2026-10-05 反馈「地球泛光爆了」→ 像素级诊断: 旧参 0.48/0.42/0.82 把
         整块地球盘面从亮度均值 33 抬到 105.8(3.2×)、中心 30→134.8(4.5×) = 洗白。
         新参 0.30/0.40/0.92: 盘面仅 33→40.8(+24%), 亮斑落回原有高光位置, 杜绝洗白。 */
      bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.30, 0.40, 0.92);
      composer.addPass(bloomPass);
      composer.renderToScreen = true;
      composer.setSize(size.x, size.y);
      try { composer.setPixelRatio && composer.setPixelRatio(r.getPixelRatio()); } catch (e) {}
      window.__cgPostFX.bloom = true;
      window.__cgPostFX.ready = true;
      return true;
    } catch (e) {
      window.__cgPostFX.err = (e && (e.message || e.stack) || String(e)).slice(0, 300);
      try { console.warn('[hwPostFX] build failed:', e); } catch (x) {}
      composer = null;                                   /* fail-open */
      return false;
    }
  }

  function hookInstance(rend) {
    try {
      var orig = rend.render;
      rend.render = function (scene, camera) {
        if (!CAP.scene) { CAP.scene = scene; CAP.camera = camera; build(); }
        if (composer && scene === CAP.scene) {
          if (_in) return orig.apply(rend, arguments);   /* composer 内部调用 → 透传 */
          _in = true;
          try { composer.render(); } finally { _in = false; }
          return;
        }
        return orig.apply(rend, arguments);
      };
      window.__cgPostFX.hooked = true;
    } catch (e) {
      window.__cgPostFX.hookErr = String(e && e.message || e).slice(0, 200);
    }
  }

  /* ── 包装 WebGLRenderer 构造器(r128 为普通函数, apply 安全) ── */
  try {
    if (typeof THREE.WebGLRenderer !== 'function') return;
    var Orig = THREE.WebGLRenderer;
    function Wrapped() {
      Orig.apply(this, arguments);
      try { if (!CAP.renderer) { CAP.renderer = this; hookInstance(this); } } catch (e) {}
    }
    Wrapped.prototype = Orig.prototype;
    try { Object.setPrototypeOf(Wrapped, Orig); } catch (e) {}
    THREE.WebGLRenderer = Wrapped;
  } catch (e) { return; }

  function syncSize() {
    if (!composer || !CAP.renderer) return;
    try {
      var s = CAP.renderer.getSize(new THREE.Vector2());
      composer.setSize(s.x, s.y);
      try { composer.setPixelRatio && composer.setPixelRatio(CAP.renderer.getPixelRatio()); } catch (e) {}
      if (bloomPass && bloomPass.setSize) bloomPass.setSize(s.x, s.y);
    } catch (e) {}
  }
  addEventListener('resize', function () { setTimeout(syncSize, 60); });
  setInterval(syncSize, 1500);

  /* 调参接口: __cgPostFX.set(strength, radius, threshold) */
  window.__cgPostFX.set = function (s, r, t) {
    try {
      if (bloomPass) {
        if (s != null) bloomPass.strength = s;
        if (r != null) bloomPass.radius = r;
        if (t != null) bloomPass.threshold = t;
      }
    } catch (e) {}
  };
})();
