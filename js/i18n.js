/* =============================================================
 * LINGER — i18n.js
 * -------------------------------------------------------------
 * 全站語言狀態：zh = 繁體中文、en = English。
 *
 * 設計
 *   - 預設繁體中文；顧客切換後存入 localStorage，下次沿用。
 *   - 只用 classic script（file:// 可直接開啟，不用 ES module）。
 *   - ui.js / app.js 以 LingerI18n.pick(中文, English) 取得目前語言文字。
 *   - html[lang] 同步為 zh-Hant / en，CSS 可據此調整英文排版。
 *
 * API
 *   get()            目前語言 "zh" / "en"
 *   isZh()           是否繁體中文
 *   pick(zh, en)     依目前語言回傳字串
 *   set(lang)        切換語言並記住
 * ============================================================= */

const LingerI18n = (function () {
  "use strict";

  var KEY = "linger.lang.v1";
  var current = "zh";

  function normalize(lang) {
    return lang === "en" ? "en" : "zh";
  }

  function applyDocumentLang() {
    document.documentElement.lang = current === "en" ? "en" : "zh-Hant";
  }

  function init() {
    try {
      var saved = window.localStorage.getItem(KEY);
      if (saved === "zh" || saved === "en") current = saved;
    } catch (err) {
      /* 無痕模式或停用 localStorage：使用預設繁中 */
    }
    applyDocumentLang();
  }

  function get() {
    return current;
  }

  function isZh() {
    return current === "zh";
  }

  function pick(zh, en) {
    return current === "zh" ? zh : en;
  }

  function set(lang) {
    var next = normalize(lang);
    if (next === current) return current;

    current = next;

    try {
      window.localStorage.setItem(KEY, current);
    } catch (err) {
      /* 記憶體狀態仍可切換 */
    }

    applyDocumentLang();

    try {
      document.dispatchEvent(
        new CustomEvent("linger:langchange", { detail: { lang: current } })
      );
    } catch (err) {
      /* 舊瀏覽器沒有 CustomEvent 時不影響切換 */
    }

    return current;
  }

  init();

  return {
    KEY: KEY,
    get: get,
    isZh: isZh,
    pick: pick,
    set: set,
  };
})();
