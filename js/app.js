/* =============================================================
 * LINGER — app.js
 * -------------------------------------------------------------
 * LingerApp：主控層（業務狀態 + DOM 渲染 + 事件委派）
 *
 *   1. 品牌區／頁尾文案（取自 menu-data.js）
 *   2. hash 路由 #/menu #/cart #/checkout #/success
 *   3. 分類、子分類導覽（行動版 tab / 桌機側欄同步）
 *   4. 菜單卡片網格、快速加入購物車
 *   5. 詳情彈窗（數量步進器、致敏原圖例）
 *   6. 桌號 chip 與設定彈窗
 *   7. 購物車計數、底部購物車列
 *
 * 依賴：menu-data.js → ui.js → cart.js → app.js（依序載入）
 * 注意：file:// 環境，全站不使用 ES module / fetch。
 * ============================================================= */

const LingerApp = (function () {
  "use strict";

  /* -----------------------------------------------------------
     常數 / 儲存
     ----------------------------------------------------------- */
  var KEYS = {
    table: "linger.table.v1",
    lastOrder: "linger.lastOrder.v1",
    // 購物車由 LingerCart 自己管理 linger.cart.v1
  };

  var VIEW_IDS = {
    menu: "view-menu",
    cart: "view-cart",
    checkout: "view-checkout",
    success: "view-success",
  };

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* -----------------------------------------------------------
     菜單索引（啟動時建一次）
     ----------------------------------------------------------- */
  var MENU_INDEX = (function () {
    var byId = {};
    var byCat = {};

    (LINGER_MENU.categories || []).forEach(function (category) {
      byCat[category.id] = category;

      var subIds = (category.subcategories || []).map(function (sub) {
        return sub.id;
      });

      (category.items || []).forEach(function (item) {
        byId[item.id] = { item: item, category: category };

        if (subIds.length && subIds.indexOf(item.sub) === -1) {
          // 資料防呆：飲品漏填 sub 時，仍會出現在「全部」，僅主控台提示
          console.warn(
            '[LINGER] 菜色 "' + item.id + '" 的 sub 未對應任何子分類，已歸入「全部」。'
          );
        }
      });
    });

    return { byId: byId, byCat: byCat };
  })();

  /* -----------------------------------------------------------
     狀態 / DOM
     ----------------------------------------------------------- */
  var state = {
    table: "",
    view: "menu",
    activeCat: (LINGER_MENU.categories[0] || {}).id || "",
    activeSub: "all",
    note: "",
    lastOrder: null,
  };

  var els = {};

  function cacheEls() {
    els = {
      sideBrandQuote: document.getElementById("side-brand-quote"),
      sideNav: document.getElementById("side-nav"),
      sideFoot: document.getElementById("side-foot"),
      menuHero: document.getElementById("menu-hero"),
      catNav: document.getElementById("cat-nav"),
      subNav: document.getElementById("sub-nav"),
      menuGrid: document.getElementById("menu-grid"),
      menuFoot: document.getElementById("menu-foot"),
      tableChip: document.getElementById("table-chip"),
      tableChipValue: document.getElementById("table-chip-value"),
      cartButton: document.getElementById("cart-button"),
      cartCount: document.getElementById("cart-count"),
      cartBar: document.getElementById("cart-bar"),
      views: {
        menu: document.getElementById("view-menu"),
        cart: document.getElementById("view-cart"),
        checkout: document.getElementById("view-checkout"),
        success: document.getElementById("view-success"),
      },
    };
  }

  /* -----------------------------------------------------------
     品牌區 / 頁尾
     ----------------------------------------------------------- */
  function renderBrand() {
    var brand = LINGER_MENU.brand || {};

    if (els.sideBrandQuote) {
      els.sideBrandQuote.innerHTML =
        '<p class="brand-slogan-zh">' + LingerUI.esc(brand.sloganZh) + "</p>" +
        '<p class="brand-slogan-en">' + LingerUI.esc(brand.sloganEn) + "</p>" +
        '<blockquote class="brand-quote">' +
        '<p class="brand-quote-text">' + LingerUI.esc(brand.quoteZh) + "</p>" +
        '<cite class="brand-quote-from">' + LingerUI.esc(brand.quoteFrom) + "</cite>" +
        "</blockquote>";
    }

    if (els.menuHero) {
      els.menuHero.innerHTML =
        '<p class="hero-slogan-zh">' + LingerUI.esc(brand.sloganZh) + "</p>" +
        '<p class="hero-slogan-en">' + LingerUI.esc(brand.sloganEn) + "</p>" +
        '<blockquote class="hero-quote">' +
        '<p class="hero-quote-text">' + LingerUI.esc(brand.quoteZh) + "</p>" +
        '<cite class="hero-quote-from">' + LingerUI.esc(brand.quoteFrom) + "</cite>" +
        "</blockquote>";
    }
  }

  function footHTML(withRule) {
    var foot = LINGER_MENU.footer || {};
    return (
      (withRule ? '<div class="foot-rule"></div>' : "") +
      '<div class="foot-block">' +
      '<p class="foot-block-zh">' + LingerUI.esc(foot.allergyZh) + "</p>" +
      '<p class="foot-block-en">' + LingerUI.esc(foot.allergyEn) + "</p>" +
      "</div>" +
      '<button type="button" class="foot-legend-btn" data-open-legend>' +
      '<span class="foot-legend-mark">1–16</span>' +
      "致敏原圖例 · Allergen Guide" +
      "</button>" +
      '<p class="foot-mark">LINGER · 一碟呷甘，一味流連</p>'
    );
  }

  function renderFooter() {
    if (els.menuFoot) els.menuFoot.innerHTML = footHTML(true);
    if (els.sideFoot) els.sideFoot.innerHTML = footHTML(false);
  }

  function pageFootHTML() {
    var foot = LINGER_MENU.footer || {};
    return (
      '<div class="page-foot">' +
      '<div class="foot-block">' +
      '<p class="foot-block-zh">' + LingerUI.esc(foot.allergyZh) + "</p>" +
      '<p class="foot-block-en">' + LingerUI.esc(foot.allergyEn) + "</p>" +
      "</div>" +
      '<button type="button" class="foot-legend-btn" data-open-legend>' +
      '<span class="foot-legend-mark">1–16</span>' +
      "致敏原圖例 · Allergen Guide" +
      "</button>" +
      "</div>"
    );
  }

  /* -----------------------------------------------------------
     桌號
     ----------------------------------------------------------- */
  function updateTableChip() {
    var table = LingerUI.normalizeTable(state.table);
    if (els.tableChipValue) els.tableChipValue.textContent = table || "—";
    if (els.tableChip) {
      els.tableChip.setAttribute(
        "aria-label",
        table
          ? "目前桌號 Table " + table + "，點擊更換"
          : "尚未設定桌號，點擊設定"
      );
    }
  }

  function focusTableChip() {
    if (!els.tableChip) return;
    try {
      els.tableChip.focus({ preventScroll: true });
    } catch (err) {
      els.tableChip.focus();
    }
  }

  function openTableModal(options) {
    var opts = options || {};
    var mode = opts.mode === "first" || opts.mode === "change" ? opts.mode : "set";
    var current = LingerUI.normalizeTable(state.table);
    var count = LingerCart.count();
    var isFirst = mode === "first";
    var changing = mode === "change" && !!current;
    var canChoose = changing && count > 0;

    var title = isFirst ? "請問您的桌號？" : changing ? "更換桌號" : "設定桌號";
    var kicker = isFirst ? "Welcome to LINGER" : changing ? "Change Table" : "Table Number";
    var desc = changing
      ? "請輸入新的桌號，餐點將送至該桌。"
      : "請輸入桌上 QR Code 旁的桌號，我們會將餐點送至您的桌邊。";
    var descEn = changing
      ? "Please enter your new table number."
      : "Please enter the table number shown beside your QR code.";

    var cartNote = canChoose
      ? '<p class="table-modal-cart">購物車目前有 <b>' + count + "</b> 件餐點，換桌後要保留嗎？" +
        '<span class="table-modal-cart-en">You have ' + count + " item" +
        (count === 1 ? "" : "s") + " in your cart — keep them when changing tables?</span></p>"
      : "";

    var actionsHTML = canChoose
      ? '<div class="table-modal-actions">' +
        '<button type="submit" class="btn btn--primary btn--block">保留餐點 · Keep order</button>' +
        '<button type="button" class="btn btn--ghost btn--block" data-clear-cart>' +
        "清空重來 · Start over</button>" +
        "</div>"
      : '<div class="table-modal-actions">' +
        '<button type="submit" class="btn btn--primary btn--block">確認桌號 · Confirm</button>' +
        "</div>";

    var laterHTML = isFirst
      ? '<button type="button" class="table-modal-later" data-table-later>稍後設定 · Later</button>'
      : "";

    var noteHTML = canChoose
      ? '<p class="table-modal-note table-modal-warn">清空後購物車內容無法復原。<br>' +
        "Starting over will empty your cart.</p>"
      : '<p class="table-modal-note">送出訂單前都可於右上角更換桌號。</p>';

    var modal = LingerUI.openModal({
      labelledBy: "table-modal-title",
      initialFocus: "#table-input",
      dismissible: !isFirst,
      bodyHTML:
        '<div class="table-modal-body">' +
        '<p class="modal-kicker">' + kicker + "</p>" +
        '<h2 class="table-modal-title" id="table-modal-title">' + title + "</h2>" +
        '<p class="table-modal-desc">' + desc + "<br>" + descEn + "</p>" +
        '<form data-table-form novalidate>' +
        '<label class="field">' +
        '<span class="field-label">桌號 · Table Number</span>' +
        '<input class="field-input" id="table-input" name="table" type="text" ' +
        'inputmode="text" autocomplete="off" maxlength="8" placeholder="如 12 或 A3" ' +
        'value="' + LingerUI.esc(current) + '">' +
        "</label>" +
        cartNote +
        actionsHTML +
        "</form>" +
        laterHTML +
        noteHTML +
        "</div>",
    });

    if (!modal) return;

    var form = modal.dialog.querySelector("[data-table-form]");
    var input = modal.dialog.querySelector("#table-input");
    if (!form || !input) return;

    function applyTable(clearCart) {
      var value = LingerUI.normalizeTable(input.value);

      if (!value) {
        LingerUI.toast("請輸入桌號 · Please enter a table number");
        input.focus();
        return;
      }

      state.table = value;
      storageSet(KEYS.table, value);
      LingerCart.setTable(value);

      if (clearCart) {
        LingerCart.clear();
      }

      updateTableChip();
      syncCartUI();
      modal.close();
      focusTableChip();

      if (clearCart) {
        LingerUI.toast("已清空購物車 · Table " + value);
      } else {
        LingerUI.toast("桌號已設定 · Table " + value);
      }
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      applyTable(false);
    });

    var clearBtn = modal.dialog.querySelector("[data-clear-cart]");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        applyTable(true);
      });
    }

    var laterBtn = modal.dialog.querySelector("[data-table-later]");
    if (laterBtn) {
      laterBtn.addEventListener("click", function () {
        modal.close();
        focusTableChip();
      });
    }
  }

  /* -----------------------------------------------------------
     導覽
     ----------------------------------------------------------- */
  function subTabsHTML(category, isSide) {
    var list = [{ id: "all", zh: "全部", en: "All" }].concat(
      category.subcategories || []
    );

    return list
      .map(function (sub) {
        var active = state.activeSub === sub.id;
        if (isSide) {
          return (
            '<button type="button" class="side-sublink' +
            (active ? " is-active" : "") +
            '" data-sub="' + LingerUI.esc(sub.id) + '"' +
            (active ? ' aria-current="true"' : "") +
            ">" + LingerUI.esc(sub.zh) + "</button>"
          );
        }
        return (
          '<button type="button" class="sub-tab' +
          (active ? " is-active" : "") +
          '" data-sub="' + LingerUI.esc(sub.id) + '"' +
          (active ? ' aria-current="true"' : "") +
          ">" + LingerUI.esc(sub.zh) + "</button>"
        );
      })
      .join("");
  }

  function renderNav() {
    var categories = LINGER_MENU.categories || [];

    if (els.catNav) {
      els.catNav.innerHTML = categories
        .map(function (category) {
          var active = category.id === state.activeCat;
          return (
            '<button type="button" class="cat-tab' +
            (active ? " is-active" : "") +
            '" data-cat="' + LingerUI.esc(category.id) + '"' +
            (active ? ' aria-current="true"' : "") +
            ">" +
            '<span class="cat-tab-zh">' + LingerUI.esc(category.zh) + "</span>" +
            '<span class="cat-tab-en">' + LingerUI.esc(category.en) + "</span>" +
            "</button>"
          );
        })
        .join("");
    }

    if (els.sideNav) {
      var sideHTML = "";
      categories.forEach(function (category) {
        var active = category.id === state.activeCat;
        sideHTML +=
          '<button type="button" class="side-link' +
          (active ? " is-active" : "") +
          '" data-cat="' + LingerUI.esc(category.id) + '"' +
          (active ? ' aria-current="true"' : "") +
          ">" +
          '<span class="side-link-zh">' + LingerUI.esc(category.zh) + "</span>" +
          '<span class="side-link-en">' + LingerUI.esc(category.en) + "</span>" +
          "</button>";

        if (active && category.subcategories && category.subcategories.length) {
          sideHTML +=
            '<div class="side-subnav">' + subTabsHTML(category, true) + "</div>";
        }
      });
      els.sideNav.innerHTML = sideHTML;
    }

    var activeCategory = MENU_INDEX.byCat[state.activeCat];

    if (els.subNav) {
      if (
        activeCategory &&
        activeCategory.subcategories &&
        activeCategory.subcategories.length
      ) {
        els.subNav.hidden = false;
        els.subNav.innerHTML = subTabsHTML(activeCategory, false);
      } else {
        els.subNav.hidden = true;
        els.subNav.innerHTML = "";
      }
    }
  }

  function syncSubTabs() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-sub]"),
      function (button) {
        var active = button.getAttribute("data-sub") === state.activeSub;
        button.classList.toggle("is-active", active);
        if (active) {
          button.setAttribute("aria-current", "true");
        } else {
          button.removeAttribute("aria-current");
        }
      }
    );
  }

  function focusVisible(selector) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].offsetParent !== null) {
        try {
          nodes[i].focus({ preventScroll: true });
        } catch (err) {
          nodes[i].focus();
        }
        return;
      }
    }
  }

  function setActiveCategory(id, restoreFocus) {
    if (!MENU_INDEX.byCat[id] || state.activeCat === id) return;
    state.activeCat = id;
    state.activeSub = "all";
    renderNav();
    renderMenu();
    // 只有鍵盤操作（click detail = 0）才把焦點接回新分頁，避免滑鼠點擊出現焦點框
    if (restoreFocus) focusVisible('[data-cat="' + id + '"]');
  }

  function setActiveSub(id) {
    var category = MENU_INDEX.byCat[state.activeCat];
    if (!category) return;

    var valid =
      id === "all" ||
      (category.subcategories || []).some(function (sub) {
        return sub.id === id;
      });

    if (!valid || state.activeSub === id) return;

    state.activeSub = id;
    syncSubTabs();
    renderMenu();
  }

  /* -----------------------------------------------------------
     菜單卡片
     ----------------------------------------------------------- */
  function cardHTML(item, category) {
    var badge = item.badge
      ? '<span class="card-badge">' + LingerUI.esc(item.badge.zh) + "</span>"
      : "";
    var tbc = item.price === null || item.price === undefined;
    var actionHTML = tbc
      ? '<span class="card-tbc">洽詢</span>'
      : '<button type="button" class="card-add" data-add="' + LingerUI.esc(item.id) + '" ' +
        'aria-label="加入購物車：' + LingerUI.esc(item.zh) + '">' +
        LingerUI.icons.plus +
        "</button>";

    return (
      '<article class="menu-card" data-item-id="' + LingerUI.esc(item.id) + '" ' +
      'tabindex="0" role="button" aria-haspopup="dialog" ' +
      'aria-label="' + LingerUI.esc(item.zh + " " + item.en + "，" + LingerUI.money(item.price)) + '">' +
      '<div class="card-thumb">' + LingerUI.mediaHTML(item, category) + "</div>" +
      '<div class="card-body">' +
      '<h3 class="card-name-zh">' + LingerUI.esc(item.zh) + "</h3>" +
      '<p class="card-name-en">' + LingerUI.esc(item.en) + "</p>" +
      '<p class="card-desc">' + LingerUI.esc(item.descZh) + "</p>" +
      '<div class="card-foot">' +
      '<span class="card-price' + (tbc ? " card-price--tbc" : "") + '">' + LingerUI.money(item.price) + "</span>" +
      '<span class="card-allergens">' + LingerUI.allergenDots(item.allergens) + "</span>" +
      actionHTML +
      "</div>" +
      "</div>" +
      badge +
      "</article>"
    );
  }

  function visibleItems() {
    var category = MENU_INDEX.byCat[state.activeCat];
    if (!category) return [];

    return (category.items || []).filter(function (item) {
      return state.activeSub === "all" || item.sub === state.activeSub;
    });
  }

  function renderMenu() {
    if (!els.menuGrid) return;
    var category = MENU_INDEX.byCat[state.activeCat];
    if (!category) {
      els.menuGrid.innerHTML = "";
      return;
    }

    var items = visibleItems();
    if (!items.length) {
      els.menuGrid.innerHTML =
        '<p class="page-sub" style="padding:28px 4px;">此分類暫無餐點 · No items in this category.</p>';
      return;
    }

    els.menuGrid.innerHTML = items
      .map(function (item) {
        return cardHTML(item, category);
      })
      .join("");
  }

  /* -----------------------------------------------------------
     加入購物車
     ----------------------------------------------------------- */
  function updateCartChrome() {
    var count = LingerCart.count();

    if (els.cartCount) {
      els.cartCount.textContent = String(count);
      els.cartCount.hidden = count === 0;
    }

    if (els.cartButton) {
      els.cartButton.setAttribute(
        "aria-label",
        count > 0 ? "查看購物車，共 " + count + " 件" : "查看購物車，目前是空的"
      );
    }

    updateCartBar();
  }

  function updateCartBar() {
    if (!els.cartBar) return;

    var count = LingerCart.count();
    var show = state.view === "menu" && count > 0;

    els.cartBar.hidden = !show;

    if (show) {
      els.cartBar.innerHTML =
        '<div class="cart-bar-inner">' +
        '<div class="cart-bar-info">' +
        '<span class="cart-bar-count">' +
        count + " 項 · " + LingerUI.esc(LingerUI.fmtTable(state.table)) +
        "</span>" +
        '<b class="cart-bar-total">' + LingerUI.money(LingerCart.subtotal()) + "</b>" +
        "</div>" +
        '<button type="button" class="btn btn--primary" data-cart-open>查看購物車</button>' +
        "</div>";
    } else {
      els.cartBar.innerHTML = "";
    }

    document.body.classList.toggle("has-cart-bar", show);
  }

  function syncCartUI(focusSelector) {
    updateCartChrome();

    if (state.view === "checkout") {
      renderCheckout();
      return;
    }

    if (state.view !== "cart") return;

    renderCart();

    if (focusSelector) {
      var target = els.views.cart.querySelector(focusSelector);
      if (target && !target.disabled) {
        try {
          target.focus({ preventScroll: true });
        } catch (err) {
          target.focus();
        }
        return;
      }
    }

    focusCartTitle();
  }

  function focusCartTitle() {
    var title = els.views.cart && els.views.cart.querySelector(".page-title");
    if (!title) return;
    title.setAttribute("tabindex", "-1");
    try {
      title.focus({ preventScroll: true });
    } catch (err) {
      title.focus();
    }
  }

  function quickAdd(id) {
    var entry = MENU_INDEX.byId[id];
    if (!entry) return;

    if (entry.item.price === null || entry.item.price === undefined) {
      LingerUI.toast("此品項價格待定，請洽服務人員");
      return;
    }

    LingerCart.add(id, 1);
    syncCartUI();

    LingerUI.toast("已加入購物車 · " + entry.item.zh, {
      actionLabel: "查看",
      onAction: function () {
        go("cart");
      },
    });
  }

  /* -----------------------------------------------------------
     購物車視圖
     ----------------------------------------------------------- */
  var EMPTY_ART_SVG =
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M8 22h32a16 16 0 0 1-32 0Z"/>' +
    '<path d="M20 16c0-2.4 1.8-3.4 2.4-4.8M28 16c0-2.4 1.8-3.4 2.4-4.8"/>' +
    "</svg>";

  function cartItemHTML(entry) {
    var item = entry.item;
    var category = entry.category;
    var max = LingerCart.maxQty();

    return (
      '<div class="cart-item" data-cart-id="' + LingerUI.esc(item.id) + '">' +
      '<div class="cart-thumb">' + LingerUI.mediaHTML(item, category) + "</div>" +
      '<div class="cart-item-body">' +
      '<div class="cart-item-head">' +
      '<span class="cart-item-name">' + LingerUI.esc(item.zh) + "</span>" +
      '<span class="cart-item-name-en">' + LingerUI.esc(item.en) + "</span>" +
      "</div>" +
      '<div class="cart-item-controls">' +
      '<div class="qty-stepper">' +
      '<button type="button" class="qty-btn" data-cart-minus="' + LingerUI.esc(item.id) + '" ' +
      'aria-label="減少 ' + LingerUI.esc(item.zh) + ' 數量"' +
      (entry.qty <= 1 ? " disabled" : "") +
      ">" + LingerUI.icons.minus + "</button>" +
      '<span class="qty-value" aria-live="polite">' + entry.qty + "</span>" +
      '<button type="button" class="qty-btn" data-cart-plus="' + LingerUI.esc(item.id) + '" ' +
      'aria-label="增加 ' + LingerUI.esc(item.zh) + ' 數量"' +
      (entry.qty >= max ? " disabled" : "") +
      ">" + LingerUI.icons.plus + "</button>" +
      "</div>" +
      '<span class="cart-line-price">' + LingerUI.money(entry.lineTotal) + "</span>" +
      "</div>" +
      "</div>" +
      '<button type="button" class="cart-remove" data-cart-remove="' + LingerUI.esc(item.id) + '" ' +
      'aria-label="移除 ' + LingerUI.esc(item.zh) + '">' +
      LingerUI.icons.trash +
      "</button>" +
      "</div>"
    );
  }

  function cartSummaryHTML() {
    return (
      '<div class="cart-summary">' +
      '<div class="sum-row"><span>小計 · Subtotal</span><b>' +
      LingerUI.money(LingerCart.subtotal()) + "</b></div>" +
      '<div class="sum-row sum-row--total"><span>總計 · Total</span><b>' +
      LingerUI.money(LingerCart.total()) + "</b></div>" +
      "</div>" +
      '<div class="cart-actions">' +
      '<button type="button" class="btn btn--ghost" data-go-menu>繼續點餐 · Add more</button>' +
      '<button type="button" class="btn btn--primary" data-checkout>前往結帳 · ' +
      LingerUI.money(LingerCart.total()) + "</button>" +
      "</div>"
    );
  }

  function cartHeadHTML(subtitle) {
    var table = LingerUI.normalizeTable(state.table);
    return (
      '<div class="page-head">' +
      '<p class="page-kicker">' +
      (table ? "TABLE " + LingerUI.esc(table) + " · " : "") +
      "YOUR ORDER</p>" +
      '<h1 class="page-title">購物車</h1>' +
      '<p class="page-sub">' + subtitle + "</p>" +
      "</div>"
    );
  }

  function emptyCartHTML() {
    return (
      cartHeadHTML("Cart · 0 項餐點") +
      '<div class="page-body">' +
      '<div class="empty-state">' +
      '<div class="empty-art">' + EMPTY_ART_SVG + "</div>" +
      '<p class="empty-title">購物車還是空的</p>' +
      '<p class="empty-sub">先挑幾道想吃的，讓這一餐慢慢開始。<br>' +
      "Your cart is empty — take your time, choose something good.</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>回到菜單 · View Menu</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderCart() {
    var el = els.views.cart;
    if (!el) return;

    var entries = LingerCart.items();

    if (!entries.length) {
      el.innerHTML = emptyCartHTML();
      return;
    }

    el.innerHTML =
      cartHeadHTML("Cart · " + LingerCart.count() + " 項餐點") +
      '<div class="page-body">' +
      '<div class="cart-list">' +
      entries.map(cartItemHTML).join("") +
      "</div>" +
      cartSummaryHTML() +
      pageFootHTML() +
      "</div>";
  }

  function onCartClick(event) {
    var plus = event.target.closest("[data-cart-plus]");
    if (plus) {
      var plusId = plus.getAttribute("data-cart-plus");
      var max = LingerCart.maxQty();
      var next = LingerCart.qty(plusId) + 1;

      if (next > max) {
        LingerUI.toast("單品最多 " + max + " 份");
        return;
      }

      LingerCart.setQty(plusId, next);
      syncCartUI(
        next >= max
          ? '[data-cart-minus="' + plusId + '"]'
          : '[data-cart-plus="' + plusId + '"]'
      );
      return;
    }

    var minus = event.target.closest("[data-cart-minus]");
    if (minus) {
      var minusId = minus.getAttribute("data-cart-minus");
      var current = LingerCart.qty(minusId);

      if (current <= 1) return;

      LingerCart.setQty(minusId, current - 1);
      syncCartUI('[data-cart-minus="' + minusId + '"]');
      return;
    }

    var remove = event.target.closest("[data-cart-remove]");
    if (remove) {
      var removeId = remove.getAttribute("data-cart-remove");
      var entry = LingerCart.get(removeId);
      var removedQty = LingerCart.qty(removeId);

      LingerCart.remove(removeId);
      syncCartUI(null);

      if (entry) {
        LingerUI.toast("已移除 · " + entry.item.zh, {
          actionLabel: "復原",
          onAction: function () {
            LingerCart.add(removeId, removedQty);
            syncCartUI(null);
          },
        });
      }
      return;
    }

    if (event.target.closest("[data-checkout]")) {
      go("checkout");
    }
  }

  /* -----------------------------------------------------------
     結帳視圖
     ----------------------------------------------------------- */
  function checkoutHeadHTML() {
    var table = LingerUI.normalizeTable(state.table);
    return (
      '<div class="page-head">' +
      '<p class="page-kicker">' +
      (table ? "TABLE " + LingerUI.esc(table) + " · " : "") +
      "CHECKOUT</p>" +
      '<h1 class="page-title">結帳</h1>' +
      '<p class="page-sub">Checkout · 請確認餐點與桌號</p>' +
      "</div>"
    );
  }

  function checkoutItemHTML(entry) {
    return (
      '<div class="checkout-item">' +
      '<span class="checkout-item-name">' + LingerUI.esc(entry.item.zh) +
      '<span class="checkout-item-qty">× ' + entry.qty + "</span></span>" +
      '<span class="checkout-item-price">' + LingerUI.money(entry.lineTotal) + "</span>" +
      "</div>"
    );
  }

  function emptyCheckoutHTML() {
    return (
      checkoutHeadHTML() +
      '<div class="page-body">' +
      '<div class="empty-state">' +
      '<div class="empty-art">' + EMPTY_ART_SVG + "</div>" +
      '<p class="empty-title">購物車還是空的</p>' +
      '<p class="empty-sub">先挑幾道想吃的，再回來結帳。<br>' +
      "Your cart is empty — choose something first.</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>回到菜單 · View Menu</button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderCheckout() {
    var el = els.views.checkout;
    if (!el) return;

    var entries = LingerCart.items();

    if (!entries.length) {
      el.innerHTML = emptyCheckoutHTML();
      return;
    }

    var table = LingerUI.normalizeTable(state.table);

    el.innerHTML =
      checkoutHeadHTML() +
      '<div class="page-body">' +
      '<div class="checkout-table-row">' +
      '<div>' +
      '<span class="checkout-table-label">桌號 · Table</span>' +
      '<span class="checkout-table-value">' +
      (table ? "Table " + LingerUI.esc(table) : "尚未設定") +
      "</span>" +
      "</div>" +
      '<button type="button" class="text-link" data-change-table>' +
      (table ? "更換 · Change" : "設定桌號 · Set table") +
      "</button>" +
      "</div>" +
      '<div class="checkout-list">' +
      entries.map(checkoutItemHTML).join("") +
      "</div>" +
      '<label class="field note-field">' +
      '<span class="field-label">備註 · Special requests</span>' +
      '<textarea class="field-textarea" id="checkout-note" maxlength="200" ' +
      'placeholder="例如：不要辣、對花生過敏…">' +
      LingerUI.esc(state.note) +
      "</textarea>" +
      "</label>" +
      '<div class="fee-table">' +
      '<div class="sum-row"><span>小計 · Subtotal</span><b>' +
      LingerUI.money(LingerCart.subtotal()) + "</b></div>" +
      '<div class="sum-row sum-row--total"><span>總計 · Total</span><b>' +
      LingerUI.money(LingerCart.total()) + "</b></div>" +
      "</div>" +
      '<div class="cart-actions">' +
      '<button type="button" class="btn btn--ghost" data-go-cart>返回購物車 · Edit cart</button>' +
      '<button type="button" class="btn btn--primary" data-submit-order>送出訂單 · ' +
      LingerUI.money(LingerCart.total()) + "</button>" +
      "</div>" +
      '<p class="submit-note">送出後訂單將直接進入廚房，恕無法修改。<br>' +
      "Once sent, your order goes straight to the kitchen.</p>" +
      pageFootHTML() +
      "</div>";
  }

  function onCheckoutClick(event) {
    if (event.target.closest("[data-change-table]")) {
      openTableModal({
        mode: LingerUI.normalizeTable(state.table) ? "change" : "set",
      });
      return;
    }

    if (event.target.closest("[data-go-cart]")) {
      go("cart");
      return;
    }

    if (event.target.closest("[data-submit-order]")) {
      submitOrder();
    }
  }

  function onCheckoutInput(event) {
    if (event.target && event.target.id === "checkout-note") {
      state.note = String(event.target.value || "").slice(0, 200);
    }
  }

  /* -----------------------------------------------------------
     送單與成功頁
     ----------------------------------------------------------- */
  var submitting = false;

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function generateOrderNo() {
    var now = new Date();
    var date =
      String(now.getFullYear()).slice(-2) +
      pad2(now.getMonth() + 1) +
      pad2(now.getDate());
    var rand = ("0000" + Math.floor(Math.random() * 10000)).slice(-4);
    return "L-" + date + "-" + rand;
  }

  function buildOrder() {
    var entries = LingerCart.items();
    return {
      no: generateOrderNo(),
      table: LingerUI.normalizeTable(state.table),
      items: entries.map(function (entry) {
        return {
          id: entry.item.id,
          zh: entry.item.zh,
          en: entry.item.en,
          price: entry.item.price,
          qty: entry.qty,
          lineTotal: entry.lineTotal,
        };
      }),
      subtotal: LingerCart.subtotal(),
      total: LingerCart.total(),
      note: String(state.note || "").trim().slice(0, 200),
      ts: Date.now(),
    };
  }

  // ★ 接真實 POS／後端時，只需改寫這個函式（把模擬計時器換成 API 呼叫）
  function submitOrder() {
    if (submitting) return;

    if (!LingerCart.count()) {
      LingerUI.toast("購物車是空的 · Your cart is empty");
      go("menu");
      return;
    }

    if (!LingerUI.normalizeTable(state.table)) {
      LingerUI.toast("請先設定桌號 · Please set your table");
      openTableModal();
      return;
    }

    var order = buildOrder();
    var submitBtn = els.views.checkout.querySelector("[data-submit-order]");

    submitting = true;
    if (submitBtn) submitBtn.disabled = true;

    LingerUI.showSending("正在將訂單送往廚房…");

    window.setTimeout(function () {
      try {
        finishOrder(order);
      } finally {
        LingerUI.hideSending();
        submitting = false;
        if (submitBtn && submitBtn.isConnected) submitBtn.disabled = false;
      }
    }, 1200);
  }

  function finishOrder(order) {
    state.lastOrder = order;
    storageSet(KEYS.lastOrder, JSON.stringify(order));

    LingerCart.clear();
    state.note = "";
    updateCartChrome();
    go("success");
  }

  function readLastOrder() {
    var raw = storageGet(KEYS.lastOrder);
    if (!raw) return null;

    try {
      var order = JSON.parse(raw);
      if (
        !order ||
        typeof order !== "object" ||
        !Array.isArray(order.items) ||
        typeof order.total !== "number"
      ) {
        return null;
      }
      return order;
    } catch (err) {
      return null;
    }
  }

  function successItemHTML(line) {
    return (
      '<div class="checkout-item">' +
      '<span class="checkout-item-name">' + LingerUI.esc(line.zh) +
      '<span class="checkout-item-qty">× ' + LingerUI.esc(line.qty) + "</span></span>" +
      '<span class="checkout-item-price">' + LingerUI.money(line.lineTotal) + "</span>" +
      "</div>"
    );
  }

  function noOrderHTML() {
    return (
      '<div class="success-wrap">' +
      '<p class="success-kicker">No Order</p>' +
      '<h1 class="success-title" tabindex="-1">還沒有訂單</h1>' +
      '<p class="success-sub">目前沒有可顯示的訂單。<br>No order to display right now.</p>' +
      '<button type="button" class="btn btn--primary" data-go-menu>回到菜單 · View Menu</button>' +
      "</div>"
    );
  }

  function renderSuccess() {
    var el = els.views.success;
    if (!el) return;

    var order = state.lastOrder;

    if (!order) {
      el.innerHTML = noOrderHTML();
      return;
    }

    var noteHTML = order.note
      ? "<br>備註 · Note：" + LingerUI.esc(order.note)
      : "";

    el.innerHTML =
      '<div class="success-wrap">' +
      '<svg class="success-check" viewBox="0 0 76 76" aria-hidden="true">' +
      '<circle class="check-circle" cx="38" cy="38" r="26.5"/>' +
      '<path class="check-mark" d="M25.5 39.5l8.5 8.5L51 30"/>' +
      "</svg>" +
      '<p class="success-kicker">Order Received</p>' +
      '<h1 class="success-title" tabindex="-1">餐點製作中</h1>' +
      '<p class="success-sub">謝謝您的點餐，廚房已收到，請稍候片刻。<br>' +
      "Thank you — our kitchen has received your order.</p>" +
      '<div class="success-meta">' +
      '<div><span class="success-meta-label">Order No.</span>' +
      '<span class="success-meta-value">' + LingerUI.esc(order.no) + "</span></div>" +
      '<div><span class="success-meta-label">Table</span>' +
      '<span class="success-meta-value">' +
      LingerUI.esc(LingerUI.normalizeTable(order.table) || "—") +
      "</span></div>" +
      "</div>" +
      '<div class="success-items">' +
      (order.items || []).map(successItemHTML).join("") +
      "</div>" +
      '<p class="success-note">' +
      "<strong>總計 " + LingerUI.money(order.total) + "</strong>" +
      noteHTML +
      "<br>餐點送出後恕無法修改，如需協助請告知服務人員。<br>" +
      "Please speak to our staff if you need any assistance.</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>回到菜單 · View Menu</button>' +
      "</div>";
  }

  /* -----------------------------------------------------------
     詳情彈窗
     ----------------------------------------------------------- */
  function openDetail(id) {
    var entry = MENU_INDEX.byId[id];
    if (!entry) return;

    var item = entry.item;
    var category = entry.category;
    var qty = 1;
    var tbc = item.price === null || item.price === undefined;

    var storyHTML = item.story
      ? '<blockquote class="modal-story">' +
        LingerUI.esc(item.story) +
        (item.storyEn
          ? '<span class="modal-story-en">' + LingerUI.esc(item.storyEn) + "</span>"
          : "") +
        "</blockquote>"
      : "";

    var allergenHTML =
      item.allergens && item.allergens.length
        ? LingerUI.allergenChips(item.allergens)
        : '<span class="allergen-empty">未標示致敏原 · No listed allergens</span>';

    var footHTML = tbc
      ? '<div class="modal-foot">' +
        '<p class="modal-tbc">此品項價格待定，請向服務人員查詢。<br>Price to be confirmed — please ask our staff.</p>' +
        "</div>"
      : '<div class="modal-foot">' +
        '<div class="qty-stepper">' +
        '<button type="button" class="qty-btn" data-detail-minus aria-label="減少數量">' +
        LingerUI.icons.minus +
        "</button>" +
        '<span class="qty-value" data-detail-qty aria-live="polite">1</span>' +
        '<button type="button" class="qty-btn" data-detail-plus aria-label="增加數量">' +
        LingerUI.icons.plus +
        "</button>" +
        "</div>" +
        '<button type="button" class="btn btn--primary" data-detail-add>' +
        "加入購物車 · " + LingerUI.money(item.price) +
        "</button>" +
        "</div>";

    var bodyHTML =
      '<div class="modal-scroll">' +
      '<div class="modal-media">' + LingerUI.mediaHTML(item, category, { lg: true }) + "</div>" +
      '<div class="modal-body">' +
      '<p class="modal-kicker">' + LingerUI.esc(category.zh) + " · " + LingerUI.esc(category.en) + "</p>" +
      '<h2 class="modal-title" id="detail-modal-title">' + LingerUI.esc(item.zh) + "</h2>" +
      '<p class="modal-title-en">' + LingerUI.esc(item.en) + "</p>" +
      '<p class="modal-price">' + LingerUI.money(item.price) + "</p>" +
      storyHTML +
      '<p class="modal-desc">' + LingerUI.esc(item.descZh) + "</p>" +
      (item.descEn
        ? '<p class="modal-desc-en">' + LingerUI.esc(item.descEn) + "</p>"
        : "") +
      '<section class="modal-section">' +
      '<h3 class="modal-section-title">配料 · Ingredients</h3>' +
      '<ul class="chip-list">' + LingerUI.chipList(item.ingredients) + "</ul>" +
      "</section>" +
      '<section class="modal-section">' +
      '<h3 class="modal-section-title">致敏原 · Allergens</h3>' +
      '<div class="allergen-row">' + allergenHTML + "</div>" +
      '<p class="modal-desc">點擊代碼可查看 1–16 致敏原圖例。<br>Tap a code to view the full allergen guide.</p>' +
      "</section>" +
      "</div>" +
      "</div>" +
      footHTML;

    var modal = LingerUI.openModal({
      bodyHTML: bodyHTML,
      labelledBy: "detail-modal-title",
    });

    if (!modal) return;

    var dialog = modal.dialog;
    var qtyEl = dialog.querySelector("[data-detail-qty]");
    var minusBtn = dialog.querySelector("[data-detail-minus]");
    var plusBtn = dialog.querySelector("[data-detail-plus]");
    var addBtn = dialog.querySelector("[data-detail-add]");

    function refreshQty() {
      if (qtyEl) qtyEl.textContent = String(qty);
      if (minusBtn) minusBtn.disabled = qty <= 1;
      if (plusBtn) plusBtn.disabled = qty >= LingerCart.maxQty();
      if (addBtn) {
        addBtn.textContent = "加入購物車 · " + LingerUI.money(item.price * qty);
      }
    }

    if (minusBtn) {
      minusBtn.addEventListener("click", function () {
        if (qty > 1) {
          qty--;
          refreshQty();
        }
      });
    }

    if (plusBtn) {
      plusBtn.addEventListener("click", function () {
        if (qty >= LingerCart.maxQty()) {
          LingerUI.toast("單品最多 " + LingerCart.maxQty() + " 份");
          return;
        }
        qty++;
        refreshQty();
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        LingerCart.add(item.id, qty);
        syncCartUI();
        modal.close();
        LingerUI.toast("已加入購物車 · " + item.zh, {
          actionLabel: "查看",
          onAction: function () {
            go("cart");
          },
        });
      });
    }

    dialog.addEventListener("click", function (event) {
      var chip = event.target.closest("[data-allergen]");
      if (chip) {
        LingerUI.openAllergenLegend(item.allergens || []);
      }
    });

    refreshQty();
  }

  /* -----------------------------------------------------------
     路由與視圖
     ----------------------------------------------------------- */
  function currentRoute() {
    var hash = String(window.location.hash || "").replace(/^#\/?/, "");
    // 非路由 fragment（例如 skip link 的 #main-content）不觸發視圖切換
    return Object.prototype.hasOwnProperty.call(VIEW_IDS, hash) ? hash : null;
  }

  function go(view) {
    var target = Object.prototype.hasOwnProperty.call(VIEW_IDS, view) ? view : "menu";
    var hash = "#/" + target;

    // 先切換視圖再更新 hash：畫面立即反應，hashchange 僅作為上一頁/手動輸入的入口
    setView(target);

    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }

  function setView(view) {
    state.view = view;

    Object.keys(VIEW_IDS).forEach(function (key) {
      var el = els.views[key];
      if (!el) return;
      var active = key === view;
      el.classList.toggle("view--active", active);
      el.hidden = !active;
    });

    updateCartBar();

    if (view === "cart") {
      renderCart();
    } else if (view === "checkout") {
      renderCheckout();
    } else if (view === "success") {
      renderSuccess();
    }

    window.scrollTo(0, 0);

    var activeEl = els.views[view];
    if (activeEl) {
      var title = activeEl.querySelector(".page-title, .success-title");
      if (title) {
        title.setAttribute("tabindex", "-1");
        try {
          title.focus({ preventScroll: true });
        } catch (err) {
          title.focus();
        }
      }
    }
  }

  /* -----------------------------------------------------------
     事件
     ----------------------------------------------------------- */
  function onDocumentClick(event) {
    var catButton = event.target.closest("[data-cat]");
    if (catButton) {
      setActiveCategory(catButton.getAttribute("data-cat"), event.detail === 0);
      return;
    }

    var subButton = event.target.closest("[data-sub]");
    if (subButton) {
      setActiveSub(subButton.getAttribute("data-sub"));
      return;
    }

    if (event.target.closest("[data-open-legend]")) {
      LingerUI.openAllergenLegend([]);
      return;
    }

    if (event.target.closest("[data-go-menu]")) {
      go("menu");
      return;
    }

    if (event.target.closest("#cart-button") || event.target.closest("[data-cart-open]")) {
      go("cart");
      return;
    }

    if (event.target.closest("#table-chip")) {
      openTableModal({
        mode: LingerUI.normalizeTable(state.table) ? "change" : "set",
      });
    }
  }

  function onGridClick(event) {
    var addButton = event.target.closest("[data-add]");
    if (addButton) {
      event.preventDefault();
      quickAdd(addButton.getAttribute("data-add"));
      return;
    }

    var card = event.target.closest(".menu-card");
    if (card) {
      openDetail(card.getAttribute("data-item-id"));
    }
  }

  function onGridKeydown(event) {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
      return;
    }
    if (event.target.closest("[data-add]")) return;

    var card = event.target.closest(".menu-card");
    if (card) {
      event.preventDefault();
      openDetail(card.getAttribute("data-item-id"));
    }
  }

  function bindEvents() {
    document.addEventListener("click", onDocumentClick);

    if (els.menuGrid) {
      els.menuGrid.addEventListener("click", onGridClick);
      els.menuGrid.addEventListener("keydown", onGridKeydown);
    }

    if (els.views.cart) {
      els.views.cart.addEventListener("click", onCartClick);
    }

    if (els.views.checkout) {
      els.views.checkout.addEventListener("click", onCheckoutClick);
      els.views.checkout.addEventListener("input", onCheckoutInput);
    }

    var skipLink = document.querySelector(".skip-link");
    if (skipLink) {
      skipLink.addEventListener("click", function (event) {
        var main = document.getElementById("main-content");
        if (!main) return;
        event.preventDefault();
        try {
          main.focus({ preventScroll: true });
        } catch (err) {
          main.focus();
        }
        main.scrollIntoView({ block: "start" });
      });
    }

    window.addEventListener("hashchange", function () {
      var route = currentRoute();
      if (route && route !== state.view) setView(route);
    });
  }

  /* -----------------------------------------------------------
     啟動
     ----------------------------------------------------------- */
  function init() {
    cacheEls();

    state.table = LingerUI.normalizeTable(storageGet(KEYS.table));

    var cartInit = LingerCart.init(state.table);

    // 極端情況：桌號 key 遺失但購物車仍綁著舊桌號 → 以購物車為準補回
    if (!state.table && LingerCart.getTable()) {
      state.table = LingerCart.getTable();
      storageSet(KEYS.table, state.table);
    }

    state.lastOrder = readLastOrder();

    var route = currentRoute() || "menu";

    renderBrand();
    renderFooter();
    updateTableChip();
    renderNav();
    renderMenu();
    bindEvents();
    setView(route);
    updateCartChrome();

    // 首訪：尚未設定桌號時主動詢問（可低調選「稍後設定」）
    if (!state.table && route !== "success") {
      openTableModal({ mode: "first" });
    }

    if (cartInit.dropped > 0) {
      LingerUI.toast(
        "部分餐點已更新，已從購物車移除 " + cartInit.dropped + " 項"
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    go: go,
    openDetail: openDetail,
    openTableModal: openTableModal,
    refreshCartChrome: updateCartChrome,
  };
})();
