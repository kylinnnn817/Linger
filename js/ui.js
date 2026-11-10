/* =============================================================
 * LINGER — ui.js
 * -------------------------------------------------------------
 * LingerUI：DOM 工具層（不讀寫業務狀態）
 *
 * API
 *   esc(str)                           HTML 轉義
 *   fmtPrice(n) / money(n)             價格格式（整數不帶小數）
 *   normalizeTable(raw) / fmtTable(t)  桌號正規化與顯示
 *   placeholderHTML(item, cat, opts)   水彩佔位圖
 *   mediaHTML(item, cat, opts)         照片或佔位圖
 *   allergenDots(codes)                卡片用小圓碼
 *   allergenChips(codes)               彈窗用可按 chip
 *   chipList(list)                     配料 chip 列表
 *   toast(message, opts)               頂部提示（最多 3 條）
 *   openModal(opts) / closeTopModal()  彈窗（focus trap / Esc / 背景關閉）
 *   openAllergenLegend(codes)          致敏原 1–16 圖例
 *   showSending(msg) / hideSending()   送單遮罩
 *   icons                              共用 SVG 圖示
 * ============================================================= */

const LingerUI = (function () {
  "use strict";

  function L(zh, en) {
    return LingerI18n.pick(zh, en);
  }

  var modalRoot = document.getElementById("modal-root");
  var toastRoot = document.getElementById("toast-root");
  var sendingOverlay = document.getElementById("sending-overlay");

  var ESC_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  /* -----------------------------------------------------------
     基本工具
     ----------------------------------------------------------- */
  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ESC_MAP[ch];
    });
  }

  function fmtPrice(n) {
    var v = Math.round((Number(n) || 0) * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function money(n) {
    if (n === null || n === undefined || n === "") return L("價格待定", "Price TBC");
    return "MOP " + fmtPrice(n);
  }

  function normalizeTable(raw) {
    return String(raw === null || raw === undefined ? "" : raw)
      .replace(/^\s*(table|桌號|桌号|桌)\s*[:：#]?\s*/i, "")
      .trim()
      .toUpperCase()
      .slice(0, 8);
  }

  function fmtTable(table) {
    var t = normalizeTable(table);
    return t ? L("桌號 " + t, "Table " + t) : L("未設定", "Not set");
  }

  /* -----------------------------------------------------------
     圖示
     ----------------------------------------------------------- */
  var ICON_ATTRS =
    'fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var icons = {
    close:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M12 5v14M5 12h14"/></svg>',
    minus:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M5 12h14"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>',
    arrowRight:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
    cart:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M6 7h12l-1.2 12.2a1.6 1.6 0 0 1-1.6 1.4H8.8a1.6 1.6 0 0 1-1.6-1.4L6 7Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M4 12.5l5 5L20 6.5"/></svg>',
  };

  /* 分類線稿圖示（用於水彩佔位圖） */
  var CATEGORY_ICONS = {
    mains:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M4 10h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4Z"/><path d="M4 10c1.5-1 3-1 4.5 0M19 10c-1.5-1-3-1-4.5 0"/><path d="M9 6h6"/></svg>',
    staples:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 8c0-1.4 1-2 1.4-2.8M13.5 8c0-1.4 1-2 1.4-2.8"/></svg>',
    snacks:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14Z"/><path d="M5 19c3-5 7-9 12-11"/></svg>',
    desserts:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M9 8.5c0-2 1.5-2.5 3-2.5s3 .5 3 2.5"/></svg>',
    drinks:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><path d="M7 4h10l-1.2 15a2 2 0 0 1-2 1.8h-3.6a2 2 0 0 1-2-1.8L7 4Z"/><path d="M8.6 9h6.8"/></svg>',
    _default:
      '<svg class="wc-ph-icon" viewBox="0 0 24 24" ' + ICON_ATTRS +
      '><circle cx="12" cy="12" r="8"/></svg>',
  };

  /* -----------------------------------------------------------
     佔位圖 / 照片
     ----------------------------------------------------------- */
  function hueFor(item, category) {
    if (item && typeof item.hue === "number") {
      return ((item.hue % 360) + 360) % 360;
    }
    var base = category && typeof category.hue === "number" ? category.hue : 30;
    var id = String((item && item.id) || "");
    var sum = 0;
    for (var i = 0; i < id.length; i++) {
      sum = (sum * 31 + id.charCodeAt(i)) % 1000;
    }
    var offset = (sum % 41) - 20; // ±20 度，讓同分類每道菜色調略異
    return ((base + offset) % 360 + 360) % 360;
  }

  function placeholderHTML(item, category, opts) {
    var options = opts || {};
    var sizeClass = options.lg ? " wc-ph--lg" : "";
    var icon =
      CATEGORY_ICONS[(category && category.id) || ""] || CATEGORY_ICONS._default;
    return (
      '<div class="wc-ph' +
      sizeClass +
      '" style="--wc-h:' +
      hueFor(item, category) +
      '" aria-hidden="true">' +
      '<span class="wc-ph-name">' +
      esc(item ? L(item.zh, item.en) : "") +
      "</span>" +
      icon +
      "</div>"
    );
  }

  function mediaHTML(item, category, opts) {
    var image = "";
    if (item) {
      image =
        LingerI18n.get() === "en" && item.imgEn ? item.imgEn : item.img;
    }
    if (image) {
      return (
        '<img src="' +
        esc(image) +
        '" alt="' +
        esc(L(item.zh, item.en)) +
        '" loading="lazy" decoding="async">'
      );
    }
    return placeholderHTML(item, category, opts);
  }

  /* -----------------------------------------------------------
     致敏原 / 配料
     ----------------------------------------------------------- */
  function allergenDots(codes) {
    if (!codes || !codes.length) return "";
    return codes
      .map(function (code) {
        var a = LINGER_ALLERGENS[code];
        var title = a ? L(a.zh, a.en) : "";
        return (
          '<span class="alg-dot" title="' +
          esc(title) +
          '" aria-label="' +
          esc(title) +
          '">' +
          esc(code) +
          "</span>"
        );
      })
      .join("");
  }

  function allergenChips(codes) {
    if (!codes || !codes.length) return "";
    return codes
      .map(function (code) {
        var a = LINGER_ALLERGENS[code] || { zh: "", en: "" };
        return (
          '<button type="button" class="allergen-chip" data-allergen="' +
          esc(code) +
          '"><span class="allergen-chip-code">' +
          esc(code) +
          "</span>" +
          esc(L(a.zh, a.en)) +
          "</button>"
        );
      })
      .join("");
  }

  function chipList(list) {
    if (!list || !list.length) return "";
    return list
      .map(function (text) {
        return '<li class="chip">' + esc(text) + "</li>";
      })
      .join("");
  }

  /* -----------------------------------------------------------
     Toast
     ----------------------------------------------------------- */
  var MAX_TOASTS = 3;

  function toast(message, options) {
    if (!toastRoot) return;
    var opts = options || {};

    while (toastRoot.children.length >= MAX_TOASTS) {
      toastRoot.removeChild(toastRoot.firstElementChild);
    }

    var el = document.createElement("div");
    el.className = "toast";
    el.setAttribute("role", "status");

    var label = document.createElement("span");
    label.textContent = message === null || message === undefined ? "" : String(message);
    el.appendChild(label);

    var timer = null;

    function dismiss() {
      if (el.classList.contains("is-leaving")) return;
      el.classList.add("is-leaving");
      window.setTimeout(function () {
        el.remove();
      }, 240);
      if (timer) window.clearTimeout(timer);
    }

    function schedule() {
      timer = window.setTimeout(dismiss, opts.duration || 2200);
    }

    if (opts.actionLabel) {
      var action = document.createElement("button");
      action.type = "button";
      action.className = "toast-action";
      action.textContent = opts.actionLabel;
      action.addEventListener("click", function () {
        dismiss();
        if (typeof opts.onAction === "function") opts.onAction();
      });
      el.appendChild(action);
    }

    el.addEventListener("pointerenter", function () {
      if (timer) window.clearTimeout(timer);
    });
    el.addEventListener("pointerleave", schedule);

    toastRoot.appendChild(el);
    schedule();
  }

  function clearToasts() {
    if (!toastRoot) return;
    while (toastRoot.firstElementChild) {
      toastRoot.removeChild(toastRoot.firstElementChild);
    }
  }

  /* -----------------------------------------------------------
     Modal 管理器（堆疊 + focus trap）
     ----------------------------------------------------------- */
  var modalStack = [];

  function getFocusable(root) {
    var selector =
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'textarea:not([disabled]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])';
    var list = Array.prototype.slice.call(root.querySelectorAll(selector));
    return list.filter(function (el) {
      return el.offsetParent !== null && !el.hasAttribute("hidden");
    });
  }

  function trapFocus(event, dialog) {
    var list = getFocusable(dialog);
    if (!list.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    var first = list[0];
    var last = list[list.length - 1];
    var active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || active === dialog) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* 行動版底部 sheet：按住頂部把手下滑即可關閉 */
  function enableSheetDrag(dialog, close) {
    var drag = dialog.querySelector("[data-sheet-drag]");
    if (!drag) return;

    var startY = 0;
    var delta = 0;
    var dragging = false;

    function isMobileSheet() {
      return window.matchMedia("(max-width: 639px)").matches;
    }

    function onMove(event) {
      if (!dragging) return;
      delta = event.clientY - startY;
      if (delta < 0) delta = 0;
      if (event.cancelable) event.preventDefault();
      dialog.style.transform = "translateY(" + delta + "px)";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);

      dialog.style.transition = "transform 0.22s var(--ease)";

      if (delta > 88) {
        dialog.style.transform = "translateY(110%)";
        window.setTimeout(close, 180);
      } else {
        dialog.style.transform = "";
      }
    }

    drag.addEventListener("pointerdown", function (event) {
      if (!isMobileSheet() || event.pointerType === "mouse" || event.button !== 0) {
        return;
      }

      dragging = true;
      startY = event.clientY;
      delta = 0;
      dialog.style.animation = "none";
      dialog.style.transition = "none";
      event.preventDefault();

      document.addEventListener("pointermove", onMove, { passive: false });
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function openModal(options) {
    if (!modalRoot) return null;
    var opts = options || {};
    var dismissible = opts.dismissible !== false;

    var layer = document.createElement("div");
    layer.className = "modal-layer";
    layer.innerHTML =
      '<div class="modal-backdrop"' + (dismissible ? " data-modal-close" : "") + "></div>" +
      '<div class="modal' +
      (opts.modalClass ? " " + opts.modalClass : "") +
      '" role="dialog" aria-modal="true" tabindex="-1"' +
      (opts.labelledBy ? ' aria-labelledby="' + esc(opts.labelledBy) + '"' : "") +
      ">" +
      (dismissible
        ? '<button type="button" class="modal-close" data-modal-close aria-label="' +
          esc(L("關閉", "Close")) + '">' +
          icons.close +
          "</button>"
        : "") +
      (dismissible
        ? '<div class="modal-drag" data-sheet-drag aria-hidden="true"></div>'
        : "") +
      opts.bodyHTML +
      "</div>";

    modalRoot.appendChild(layer);

    var dialog = layer.querySelector(".modal");
    var prevFocus = document.activeElement;
    var state = {
      layer: layer,
      dialog: dialog,
      closed: false,
      onKeydown: null,
    };

    function close() {
      if (state.closed) return;
      state.closed = true;
      var index = modalStack.indexOf(state);
      if (index >= 0) modalStack.splice(index, 1);
      if (state.onKeydown) {
        document.removeEventListener("keydown", state.onKeydown);
      }
      layer.remove();
      if (!modalStack.length) {
        document.documentElement.classList.remove("modal-open");
      }
      if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === "function") {
        try {
          prevFocus.focus({ preventScroll: true });
        } catch (err) {
          prevFocus.focus();
        }
      }
      if (typeof opts.onClose === "function") opts.onClose();
    }

    state.close = close;

    if (dismissible) {
      enableSheetDrag(dialog, close);
    }

    state.onKeydown = function (event) {
      if (modalStack[modalStack.length - 1] !== state) return;
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        trapFocus(event, dialog);
      }
    };

    layer.addEventListener("click", function (event) {
      if (event.target.closest("[data-modal-close]")) {
        close();
      }
    });

    document.addEventListener("keydown", state.onKeydown);
    modalStack.push(state);
    document.documentElement.classList.add("modal-open");

    function focusInitial() {
      var target = null;
      if (opts.initialFocus) {
        target = dialog.querySelector(opts.initialFocus);
      }
      if (!target) {
        var list = getFocusable(dialog);
        target = list[0] || dialog;
      }
      if (target && typeof target.focus === "function") {
        try {
          target.focus({ preventScroll: true });
        } catch (err) {
          target.focus();
        }
      }
    }

    // 立即聚焦（鍵盤／螢幕閱讀器可馬上進入對話框；同步聚焦在 iOS 亦較可靠）；
    // 下一幀再保險重試一次，避免元素尚未可聚焦時漏掉。
    focusInitial();
    window.requestAnimationFrame(function () {
      if (!dialog.contains(document.activeElement)) focusInitial();
    });

    return {
      close: close,
      dialog: dialog,
    };
  }

  function closeTopModal() {
    if (!modalStack.length) return false;
    var top = modalStack[modalStack.length - 1];
    if (top && typeof top.close === "function") {
      top.close();
    } else {
      // 保險：直接移除
      var layer = top.layer;
      modalStack.pop();
      if (layer) layer.remove();
      if (!modalStack.length) {
        document.documentElement.classList.remove("modal-open");
      }
    }
    return true;
  }

  function isModalOpen() {
    return modalStack.length > 0;
  }

  /* -----------------------------------------------------------
     致敏原圖例
     ----------------------------------------------------------- */
  function openAllergenLegend(highlightCodes) {
    var highlights = {};
    (highlightCodes || []).forEach(function (code) {
      highlights[code] = true;
    });

    var rows = Object.keys(LINGER_ALLERGENS)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (code) {
        var a = LINGER_ALLERGENS[code];
        return (
          '<div class="legend-item' +
          (highlights[code] ? " is-highlight" : "") +
          '">' +
          '<span class="legend-code">' +
          esc(code) +
          "</span>" +
          '<span class="legend-name">' +
          esc(L(a.zh, a.en)) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    return openModal({
      labelledBy: "legend-title",
      bodyHTML:
        '<div class="modal-scroll"><div class="modal-body">' +
        '<p class="modal-kicker">' +
        esc(L("致敏原及飲食禁忌", "Allergen & Dietary Codes")) +
        "</p>" +
        '<h2 class="modal-title" id="legend-title">' +
        esc(L("致敏原圖例", "Allergen Guide")) +
        "</h2>" +
        '<p class="legend-sub">' +
        esc(L("代碼 1–16", "Codes 1–16")) +
        "</p>" +
        '<div class="legend-list">' +
        rows +
        "</div>" +
        '<p class="modal-desc">' +
        esc(L(
          "代碼僅供參考，食材可能因季節或供應商調整；如對特定食材嚴重過敏，請於點餐時告知服務人員。",
          "Codes are for reference only; ingredients may change with season or supplier. Please inform our staff of any severe allergies."
        )) +
        "</p>" +
        "</div></div>",
    });
  }

  /* -----------------------------------------------------------
     送單遮罩
     ----------------------------------------------------------- */
  function showSending(message) {
    if (!sendingOverlay) return;
    sendingOverlay.innerHTML =
      '<svg class="sending-art" viewBox="0 0 64 64" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="10" y="19" width="44" height="30" rx="3"/>' +
      '<path d="M11 21l21 16 21-16"/>' +
      '<circle cx="32" cy="49" r="5.5" fill="#FAF6EE"/>' +
      '<path d="M32 46.5v5M29.5 49h5"/>' +
      "</svg>" +
      '<p class="sending-text">' +
      esc(message || L("送單中…", "Sending…")) +
      "</p>";
    sendingOverlay.setAttribute("role", "status");
    sendingOverlay.hidden = false;
  }

  function hideSending() {
    if (!sendingOverlay) return;
    sendingOverlay.hidden = true;
    sendingOverlay.innerHTML = "";
  }

  /* -----------------------------------------------------------
     對外 API
     ----------------------------------------------------------- */
  return {
    esc: esc,
    fmtPrice: fmtPrice,
    money: money,
    normalizeTable: normalizeTable,
    fmtTable: fmtTable,
    icons: icons,
    placeholderHTML: placeholderHTML,
    mediaHTML: mediaHTML,
    allergenDots: allergenDots,
    allergenChips: allergenChips,
    chipList: chipList,
    toast: toast,
    clearToasts: clearToasts,
    openModal: openModal,
    closeTopModal: closeTopModal,
    isModalOpen: isModalOpen,
    openAllergenLegend: openAllergenLegend,
    showSending: showSending,
    hideSending: hideSending,
  };
})();
