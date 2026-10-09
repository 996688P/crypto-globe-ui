/*
 * crypto-globe-ui — 环绕粒子层 (纯装饰 canvas, MIT)
 * ---------------------------------------------------------------------------
 * 与线上视觉层同款画法: 币种节点在椭圆轨道环绕地球 + 邻近节点连线(区块链感)
 * + 区块脉冲(内环跑点 + 扩散圈)。
 *
 * 移植自私有终端的 HW_AURORA_V9B 粒子层, 已中性化:
 *   (原站实现: 独立 canvas 粒子层, 已中性化为 #cgField / cg-particles-on)
 *
 * 安全: 纯装饰(pointer-events:none), 不读任何接口, 只按时间画形状;
 *       prefers-reduced-motion → 只画静态一帧; 页面隐藏即停止 rAF 省电。
 * 节点数: 与原站一致 —— n = clamp(W/62, 16, 26)。
 */
(function () {
  "use strict";
  if (window.__cgParticles) return;
  window.__cgParticles = { on: 1 };

  var reduce = false;
  try {
    reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  var cv, ctx, W, H, DPR, cx, cy, R;
  var coins = [], blocks = [];
  var raf = 0, running = false, t0 = 0;

  // 通用币种符号(仅取形状/配色, 与任何业务/行情无关)
  var SYMS = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","TON","TRX","DOT",
              "MATIC","ARB","OP","SUI","APT","NEAR","ATOM","FIL","INJ","SEI","TIA","PEPE"];

  function resize() {
    if (!cv) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 环绕中心: 页面中上部(与地球球心大致对齐)
    cx = W * 0.5; cy = H * 0.52; R = Math.min(H * 0.30, W * 0.26);
    build();
  }

  function build() {
    coins = []; blocks = [];
    var n = Math.min(26, Math.max(16, Math.round(W / 62)));
    for (var i = 0; i < n; i++) {
      coins.push({
        sym: SYMS[i % SYMS.length],
        a: Math.random() * Math.PI * 2,           // 轨道角
        r: 1.18 + Math.random() * 0.92,           // 半径倍数
        sp: (0.00013 + Math.random() * 0.00030) * (Math.random() < 0.5 ? -1 : 1),
        tilt: (Math.random() - 0.5) * 0.55,       // 轨道倾角(扁率)
        ph: Math.random() * Math.PI * 2,
        size: 1.5 + Math.random() * 1.9,
        hue: Math.random() < 0.22 ? 44 : 225,     // 少量暖色点缀, 其余蓝紫
        yj: 0.5 + Math.random() * 0.8             // 垂直抖动
      });
    }
    var cn = Math.max(5, Math.round(n / 4));
    for (var j = 0; j < cn; j++) {
      blocks.push({ a: Math.random() * Math.PI * 2, r: 1.02 + Math.random() * 0.2,
                    sp: 0.0004 * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28 });
    }
  }

  function draw(ts) {
    if (!running) return;
    if (!t0) t0 = ts;
    var t = ts - t0;
    ctx.clearRect(0, 0, W, H);

    // 1) 轨道环(极淡)
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.028)";
    ctx.lineWidth = 1;
    for (var k = 0; k < 3; k++) {
      var rr = R * (1.12 + k * 0.42);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 2) 位置计算
    var pts = [];
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      c.a += c.sp * (reduce ? 0 : 16);
      var rr2 = R * c.r;
      var px = cx + Math.cos(c.a) * rr2;
      var py = cy + Math.sin(c.a) * rr2 * 0.34 + Math.sin(t * 0.0006 + c.ph) * rr2 * 0.06 * c.yj;
      pts.push({ x: px, y: py, c: c });
      // 深度感: 靠"下"的暗一点
      var depth = (py - cy) / (R * 0.42);           // -1..1 近似
      var al = 0.30 + 0.42 * (1 - Math.abs(depth)) / 1;
      // 节点
      ctx.beginPath();
      ctx.fillStyle = c.hue === 44
        ? "rgba(139,125,255," + al.toFixed(3) + ")"
        : "rgba(139,163,255," + (al * 0.92).toFixed(3) + ")";
      ctx.arc(px, py, c.size * (0.85 + 0.25 * (1 - Math.abs(depth))), 0, Math.PI * 2);
      ctx.fill();
      // 光晕(近处节点)
      if (1 - Math.abs(depth) > 0.6) {
        var g = ctx.createRadialGradient(px, py, 0, px, py, c.size * 7);
        g.addColorStop(0, c.hue === 44 ? "rgba(139,125,255,.16)" : "rgba(139,163,255,.13)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, c.size * 7, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 3) 邻近连线(区块链感)
    ctx.lineWidth = 0.7;
    for (var a = 0; a < pts.length; a++) {
      for (var b = a + 1; b < pts.length; b++) {
        var dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y;
        var d2 = dx * dx + dy * dy;
        var lim = R * 0.62;
        if (d2 < lim * lim) {
          var f = 1 - Math.sqrt(d2) / lim;
          ctx.strokeStyle = "rgba(120,150,255," + (0.10 * f).toFixed(3) + ")";
          ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
        }
      }
    }

    // 4) 区块脉冲(沿内环跑 + 扩散圈)
    for (var m = 0; m < blocks.length; m++) {
      var bl = blocks[m];
      bl.a += bl.sp * (reduce ? 0 : 16);
      var br = R * bl.r;
      var bx = cx + Math.cos(bl.a) * br, by = cy + Math.sin(bl.a) * br * 0.34;
      var pulse = (Math.sin(t * 0.0022 + bl.ph) + 1) / 2;
      ctx.beginPath();
      ctx.fillStyle = "rgba(139,125,255," + (0.20 + 0.35 * pulse).toFixed(3) + ")";
      ctx.arc(bx, by, 1.4 + 1.1 * pulse, 0, Math.PI * 2); ctx.fill();
      if (!reduce) {
        var ring = ((t * 0.00035 + bl.ph) % 1);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(139,125,255," + (0.14 * (1 - ring)).toFixed(3) + ")";
        ctx.lineWidth = 1;
        ctx.arc(bx, by, 3 + ring * 26, 0, Math.PI * 2); ctx.stroke();
      }
    }

    raf = requestAnimationFrame(draw);
  }

  function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(draw); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function boot() {
    if (document.getElementById("cgField")) return;
    cv = document.createElement("canvas");
    cv.id = "cgField";
    cv.setAttribute("aria-hidden", "true");
    document.body.insertBefore(cv, document.body.firstChild);
    ctx = cv.getContext("2d");
    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.documentElement.classList.add("cg-particles-on");
    if (reduce) { draw(performance.now()); running = false; }  // 静态一帧
    else start();
    // 页面不可见即停(省电)
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });
  }

  if (document.readyState === "complete" || document.readyState === "interactive") setTimeout(boot, 1000);
  else window.addEventListener("load", function () { setTimeout(boot, 1000); });

  window.__cgParticles.refresh = function () { resize(); };
})();
