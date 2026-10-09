/* market-feed.js — 免费公开行情接入 (no API key, CORS-enabled, fail-open)
   ------------------------------------------------------------------
   把公开行情喂给视觉层:
     · window.__cgHexMkt({universe:[{sym, chg_pct, vol}]})  → 六边形玻璃币球
     · window.__cgTerrMkt([{sym, chg_pct, vol}])            → 领土层(若启用)
   数据源(均为公开、免费、允许跨域):
     · CoinGecko  /api/v3/coins/markets   (市值前 250, 覆盖广)
     · Binance    /api/v3/ticker/24hr     (全部 USDT 交易对, 补齐成交额)
   取不到数据时静默退出 → 球面只出 logo(不伪造 0.00%), 不影响渲染。
   币种符号须存在于 vendor/coin_atlas_hi.json 的 sym2idx; 不在图集内的自动忽略。
   无需任何密钥; 请遵守各源的使用条款与限频。
   ------------------------------------------------------------------ */
(function () {
  "use strict";

  var REFRESH_MS = 60000;      // 刷新间隔
  var CG_URL = "https://api.coingecko.com/api/v3/coins/markets" +
               "?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false";
  var BN_URL = "https://api.binance.com/api/v3/ticker/24hr";

  var running = false;

  function upper(s) { return (s || "").toString().toUpperCase(); }

  /* CoinGecko → [{sym, chg_pct, vol}] */
  function fromCoinGecko() {
    return fetch(CG_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("cg " + r.status); return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return [];
        return arr.map(function (c) {
          return { sym: upper(c.symbol), chg_pct: +(c.price_change_percentage_24h || 0), vol: +(c.total_volume || 0) };
        });
      });
  }

  /* Binance → 只取 USDT 现货对, 以成交额排序 */
  function fromBinance() {
    return fetch(BN_URL, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("bn " + r.status); return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return [];
        return arr
          .filter(function (t) { return /USDT$/.test(t.symbol) && +t.quoteVolume > 0; })
          .map(function (t) {
            return { sym: upper(t.symbol).replace(/USDT$/, ""), chg_pct: +(t.priceChangePercent || 0), vol: +(t.quoteVolume || 0) };
          });
      });
  }

  /* 合并: 同一 sym 取成交额更大的一条(避免 0 值覆盖真实值) */
  function merge(lists) {
    var bySym = {};
    for (var i = 0; i < lists.length; i++) {
      var L = lists[i] || [];
      for (var k = 0; k < L.length; k++) {
        var x = L[k];
        if (!x || !x.sym) continue;
        var cur = bySym[x.sym];
        if (!cur || (x.vol || 0) > (cur.vol || 0)) bySym[x.sym] = x;
      }
    }
    var out = [];
    for (var s in bySym) if (Object.prototype.hasOwnProperty.call(bySym, s)) out.push(bySym[s]);
    return out;
  }

  /* 先都试, 谁成用谁; 都失败 → 返回空(静默) */
  function fetchAll() {
    return Promise.all([
      fromCoinGecko().catch(function () { return []; }),
      fromBinance().catch(function () { return []; })
    ]).then(merge);
  }

  function apply(rows) {
    if (!rows || !rows.length) return 0;
    // 半球钩子(若页面使用领土层)
    try { if (typeof window.__cgTerrMkt === "function") window.__cgTerrMkt(rows); } catch (e) {}
    // 六边形玻璃币球钩子(本 demo 主视觉)
    try {
      var payload = { universe: rows };
      window.__cgMktLastRaw = payload;                 // 供图集就绪后补投
      if (typeof window.__cgHexMkt === "function") window.__cgHexMkt(payload);
      if (typeof window.__cgCoinMkt === "function") window.__cgCoinMkt(rows);
    } catch (e) {}
    return rows.length;
  }

  function tick() {
    if (running) return;
    running = true;
    fetchAll()
      .then(function (rows) {
        running = false;
        var n = apply(rows);
        window.__cgFeedStatus = { ok: n > 0, count: n, at: Date.now() };
        if (window.console && n) console.log("[market-feed] " + n + " symbols applied");
      })
      .catch(function () { running = false; });
  }

  // 首次: 等视觉层把钩子挂上(最多 ~20s), 之后周期刷新
  var tries = 0;
  (function boot() {
    if (typeof window.__cgHexMkt === "function" || typeof window.__cgTerrMkt === "function") {
      tick();
      setInterval(tick, REFRESH_MS);
      // 页面切回前台时补刷一次
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) tick();
      });
    } else if (tries++ < 40) {
      setTimeout(boot, 500);
    }
  })();
})();
