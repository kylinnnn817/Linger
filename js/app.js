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

  function L(zh, en) {
    return LingerI18n.pick(zh, en);
  }

  function isZh() {
    return LingerI18n.isZh();
  }

  /* -----------------------------------------------------------
     飲品／甜品選項文字
     ----------------------------------------------------------- */
  function drinkConfig() {
    return LINGER_MENU.drinkOptions || {};
  }

  function choiceList(group) {
    var config = drinkConfig();
    return Array.isArray(config[group]) ? config[group] : [];
  }

  function findChoice(group, id) {
    var choices = choiceList(group);
    for (var i = 0; i < choices.length; i++) {
      if (choices[i].id === id) return choices[i];
    }
    return null;
  }

  function choiceLabel(group, id, lang) {
    var choice = findChoice(group, id);
    if (!choice) return "";
    return lang === "en" ? choice.en : choice.zh;
  }

  function defaultChoice(group) {
    var defaults = drinkConfig().defaults || {};
    var wanted = defaults[group];
    if (findChoice(group, wanted)) return wanted;
    var choices = choiceList(group);
    return choices.length ? choices[0].id : "";
  }

  function itemSupports(item, group) {
    return !!(item && item.options && item.options[group]);
  }

  function categoryToppings(category) {
    return category && Array.isArray(category.toppings) ? category.toppings : [];
  }

  function hasCustomOptions(entry) {
    return (
      categoryToppings(entry.category).length > 0 ||
      itemSupports(entry.item, "sweetness") ||
      itemSupports(entry.item, "ice")
    );
  }

  function optionText(entry, lang) {
    if (!entry || !entry.options) return "";

    var isEn = lang === "en";
    var parts = [];

    if (entry.options.sweetness) {
      parts.push(choiceLabel("sweetness", entry.options.sweetness, lang));
    }
    if (entry.options.ice) {
      parts.push(choiceLabel("ice", entry.options.ice, lang));
    }
    if (entry.toppingItems && entry.toppingItems.length) {
      var names = entry.toppingItems.map(function (topping) {
        return isEn ? topping.en : topping.zh;
      });
      parts.push((isEn ? "Add " : "加") + names.join(isEn ? ", " : "、"));
    }

    return parts.filter(Boolean).join(" · ");
  }

  function entryOptionText(entry) {
    return optionText(entry, LingerI18n.get());
  }

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
    var slogan = L(brand.sloganZh, brand.sloganEn);
    var quote = L(brand.quoteZh, brand.quoteEn);
    var quoteFrom = L(brand.quoteFrom, brand.quoteFromEn);
    var langClass = isZh() ? "zh" : "en";

    if (els.sideBrandQuote) {
      els.sideBrandQuote.innerHTML =
        '<p class="brand-slogan brand-slogan--' + langClass + '">' +
        LingerUI.esc(slogan) + "</p>" +
        '<blockquote class="brand-quote">' +
        '<p class="brand-quote-text">' + LingerUI.esc(quote) + "</p>" +
        '<cite class="brand-quote-from">' + LingerUI.esc(quoteFrom) + "</cite>" +
        "</blockquote>";
    }

    if (els.menuHero) {
      els.menuHero.innerHTML =
        '<p class="hero-slogan hero-slogan--' + langClass + '">' +
        LingerUI.esc(slogan) + "</p>" +
        '<blockquote class="hero-quote">' +
        '<p class="hero-quote-text">' + LingerUI.esc(quote) + "</p>" +
        '<cite class="hero-quote-from">' + LingerUI.esc(quoteFrom) + "</cite>" +
        "</blockquote>";
    }

    var brandSub = document.getElementById("brand-name-sub");
    if (brandSub) {
      brandSub.textContent = L(brand.subZh, brand.subEn);
    }
  }

  function footHTML(withRule) {
    var foot = LINGER_MENU.footer || {};
    return (
      (withRule ? '<div class="foot-rule"></div>' : "") +
      '<div class="foot-block">' +
      '<p class="foot-block-text">' +
      LingerUI.esc(L(foot.allergyZh, foot.allergyEn)) +
      "</p>" +
      "</div>" +
      '<button type="button" class="foot-legend-btn" data-open-legend>' +
      '<span class="foot-legend-mark">1–16</span>' +
      LingerUI.esc(L("致敏原圖例", "Allergen Guide")) +
      "</button>" +
      '<p class="foot-mark">' +
      LingerUI.esc(L("LINGER · 一碟呷甘，一味流連", "LINGER · A plate of lingering sweetness")) +
      "</p>"
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
      '<p class="foot-block-text">' +
      LingerUI.esc(L(foot.allergyZh, foot.allergyEn)) +
      "</p>" +
      "</div>" +
      '<button type="button" class="foot-legend-btn" data-open-legend>' +
      '<span class="foot-legend-mark">1–16</span>' +
      LingerUI.esc(L("致敏原圖例", "Allergen Guide")) +
      "</button>" +
      "</div>"
    );
  }

  /* -----------------------------------------------------------
     語言切換 / 靜態文案
     ----------------------------------------------------------- */
  function langSwitchHTML() {
    return (
      '<div class="lang-switch lang-switch--inline" role="group" aria-label="' +
      LingerUI.esc(L("語言切換", "Language")) +
      '">' +
      '<button type="button" data-lang="zh" aria-pressed="' +
      (isZh() ? "true" : "false") +
      '">' +
      LingerUI.esc(L("繁中", "ZH")) +
      "</button>" +
      '<button type="button" data-lang="en" aria-pressed="' +
      (isZh() ? "false" : "true") +
      '">EN</button>' +
      "</div>"
    );
  }

  function renderLangSwitch() {
    var wrap = document.getElementById("lang-switch");
    if (!wrap) return;

    wrap.setAttribute("aria-label", L("語言切換", "Language"));

    var zhBtn = wrap.querySelector('[data-lang="zh"]');
    var enBtn = wrap.querySelector('[data-lang="en"]');

    if (zhBtn) {
      zhBtn.textContent = L("繁中", "ZH");
      zhBtn.setAttribute("aria-pressed", isZh() ? "true" : "false");
    }
    if (enBtn) {
      enBtn.textContent = "EN";
      enBtn.setAttribute("aria-pressed", isZh() ? "false" : "true");
    }
  }

  function renderStaticTexts() {
    document.title = L(
      "LINGER · 一碟呷甘，一味流連",
      "LINGER · A plate of lingering sweetness"
    );

    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute(
        "content",
        L(
          "LINGER 一碟呷甘，一味流連 — 內用掃碼點餐。",
          "LINGER — A plate of lingering sweetness, a flavor that keeps you staying. QR-code dine-in ordering."
        )
      );
    }

    var skip = document.getElementById("skip-link");
    if (skip) skip.textContent = L("跳至主要內容", "Skip to content");

    var brandSub = document.getElementById("brand-name-sub");
    var brand = LINGER_MENU.brand || {};
    if (brandSub) brandSub.textContent = L(brand.subZh, brand.subEn);

    var tableLabel = document.getElementById("table-chip-label");
    if (tableLabel) tableLabel.textContent = L("桌號", "Table");

    var sideNav = document.getElementById("side-nav");
    var catNav = document.getElementById("cat-nav");
    if (sideNav) sideNav.setAttribute("aria-label", L("菜單分類", "Menu categories"));
    if (catNav) catNav.setAttribute("aria-label", L("菜單分類", "Menu categories"));

    var viewMenu = document.getElementById("view-menu");
    if (viewMenu) viewMenu.setAttribute("aria-label", L("菜單", "Menu"));
    var viewCart = document.getElementById("view-cart");
    if (viewCart) viewCart.setAttribute("aria-label", L("購物車", "Cart"));
    var viewCheckout = document.getElementById("view-checkout");
    if (viewCheckout) viewCheckout.setAttribute("aria-label", L("結帳", "Checkout"));
    var viewSuccess = document.getElementById("view-success");
    if (viewSuccess) {
      viewSuccess.setAttribute("aria-label", L("訂單確認", "Order confirmation"));
    }
  }

  function setLanguage(lang) {
    var next = lang === "en" ? "en" : "zh";
    if (next === LingerI18n.get()) return;

    var openForm = document.querySelector("[data-table-form]");
    var draft = null;
    var tableMode = "set";
    if (openForm) {
      var openInput = openForm.querySelector("#table-input");
      draft = openInput ? openInput.value : "";
      tableMode = openForm.getAttribute("data-table-mode") || "set";
    }

    LingerI18n.set(next);
    // 避免切換語言後，畫面上還留著另一種語言的提示
    LingerUI.clearToasts();

    renderStaticTexts();
    renderLangSwitch();
    renderBrand();
    renderFooter();
    renderNav();
    renderMenu();
    updateTableChip();
    updateCartChrome();

    if (state.view === "cart") {
      renderCart();
    } else if (state.view === "checkout") {
      renderCheckout();
    } else if (state.view === "success") {
      renderSuccess();
    }

    if (openForm) {
      LingerUI.closeTopModal();
      openTableModal({ mode: tableMode, initialValue: draft });
    }
  }

  /* -----------------------------------------------------------
     桌號
     ----------------------------------------------------------- */
  function updateTableChip() {
    var table = LingerUI.normalizeTable(state.table);
    if (els.tableChipValue) els.tableChipValue.textContent = table || "—";

    var label = document.getElementById("table-chip-label");
    if (label) label.textContent = L("桌號", "Table");

    if (els.tableChip) {
      els.tableChip.setAttribute(
        "aria-label",
        table
          ? L("目前桌號 " + table + "，點擊更換", "Current table " + table + ". Tap to change.")
          : L("尚未設定桌號，點擊設定", "No table set. Tap to set your table.")
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
    var initialValue =
      opts.initialValue !== undefined ? String(opts.initialValue) : current;

    var title = isFirst
      ? L("請問您的桌號？", "What is your table number?")
      : changing
        ? L("更換桌號", "Change Table")
        : L("設定桌號", "Set Your Table");
    var kicker = isFirst
      ? L("歡迎光臨 LINGER", "Welcome to LINGER")
      : changing
        ? L("更換桌號", "Change Table")
        : L("桌號", "Table Number");
    var desc = changing
      ? L(
          "請輸入新的桌號，餐點將送至該桌。",
          "Please enter your new table number. Your food will be served there."
        )
      : L(
          "請輸入桌上二維碼旁的桌號，我們會將餐點送至您的桌邊。",
          "Please enter the table number shown beside your QR code. We will serve your food at your table."
        );

    var cartNote = canChoose
      ? '<p class="table-modal-cart">' +
        LingerUI.esc(L("購物車目前有 ", "You have ")) +
        "<b>" + count + "</b>" +
        LingerUI.esc(
          L(
            " 件餐點，換桌後要保留嗎？",
            count === 1
              ? " item in your cart — keep it when changing tables?"
              : " items in your cart — keep them when changing tables?"
          )
        ) +
        "</p>"
      : "";

    var actionsHTML = canChoose
      ? '<div class="table-modal-actions">' +
        '<button type="submit" class="btn btn--primary btn--block">' +
        LingerUI.esc(L("保留餐點", "Keep my order")) +
        "</button>" +
        '<button type="button" class="btn btn--ghost btn--block" data-clear-cart>' +
        LingerUI.esc(L("清空重來", "Start over")) +
        "</button>" +
        "</div>"
      : '<div class="table-modal-actions">' +
        '<button type="submit" class="btn btn--primary btn--block">' +
        LingerUI.esc(L("確認桌號", "Confirm")) +
        "</button>" +
        "</div>";

    var laterHTML = isFirst
      ? '<button type="button" class="table-modal-later" data-table-later>' +
        LingerUI.esc(L("稍後設定", "Set later")) +
        "</button>"
      : "";

    var noteHTML = canChoose
      ? '<p class="table-modal-note table-modal-warn">' +
        LingerUI.esc(L("清空後購物車內容無法復原。", "Starting over will empty your cart.")) +
        "</p>"
      : '<p class="table-modal-note">' +
        LingerUI.esc(
          L(
            "送出訂單前都可於右上角更換桌號。",
            "You can change your table from the top bar before sending your order."
          )
        ) +
        "</p>";

    var modal = LingerUI.openModal({
      labelledBy: "table-modal-title",
      initialFocus: "#table-input",
      dismissible: !isFirst,
      bodyHTML:
        '<div class="table-modal-body">' +
        '<div class="table-modal-lang">' + langSwitchHTML() + "</div>" +
        '<p class="modal-kicker">' + LingerUI.esc(kicker) + "</p>" +
        '<h2 class="table-modal-title" id="table-modal-title">' +
        LingerUI.esc(title) + "</h2>" +
        '<p class="table-modal-desc">' + LingerUI.esc(desc) + "</p>" +
        '<form data-table-form data-table-mode="' + mode + '" novalidate>' +
        '<label class="field">' +
        '<span class="field-label">' +
        LingerUI.esc(L("桌號", "Table Number")) +
        "</span>" +
        '<input class="field-input" id="table-input" name="table" type="text" ' +
        'inputmode="text" autocomplete="off" maxlength="8" placeholder="' +
        LingerUI.esc(L("如 12 或 A3", "e.g. 12 or A3")) + '" ' +
        'value="' + LingerUI.esc(initialValue) + '">' +
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
        LingerUI.toast(L("請輸入桌號", "Please enter a table number"));
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
        LingerUI.toast(L("已清空購物車 · 桌號 " + value, "Cart cleared · Table " + value));
      } else {
        LingerUI.toast(L("桌號已設定 · " + value, "Table set · " + value));
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
            ">" + LingerUI.esc(L(sub.zh, sub.en)) + "</button>"
          );
        }
        return (
          '<button type="button" class="sub-tab' +
          (active ? " is-active" : "") +
          '" data-sub="' + LingerUI.esc(sub.id) + '"' +
          (active ? ' aria-current="true"' : "") +
          ">" + LingerUI.esc(L(sub.zh, sub.en)) + "</button>"
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
            '<span class="cat-tab-label">' +
            LingerUI.esc(L(category.zh, category.en)) +
            "</span>" +
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
          '<span class="side-link-label">' +
          LingerUI.esc(L(category.zh, category.en)) +
          "</span>" +
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
    var name = L(item.zh, item.en);
    var badge = item.badge
      ? '<span class="card-badge">' +
        LingerUI.esc(L(item.badge.zh, item.badge.en)) +
        "</span>"
      : "";
    var tbc = item.price === null || item.price === undefined;
    var custom = hasCustomOptions({ item: item, category: category });
    var addLabel = custom
      ? L("選擇選項：", "Choose options: ")
      : L("加入購物車：", "Add to cart: ");
    var actionHTML = tbc
      ? '<span class="card-tbc">' + LingerUI.esc(L("洽詢", "Ask staff")) + "</span>"
      : '<button type="button" class="card-add" data-add="' + LingerUI.esc(item.id) + '" ' +
        'aria-label="' +
        LingerUI.esc(addLabel + name) +
        '">' +
        LingerUI.icons.plus +
        "</button>";

    var aria = L(
      name + "，" + LingerUI.money(item.price),
      name + ", " + LingerUI.money(item.price)
    );

    return (
      '<article class="menu-card" data-item-id="' + LingerUI.esc(item.id) + '" ' +
      'tabindex="0" role="button" aria-haspopup="dialog" ' +
      'aria-label="' + LingerUI.esc(aria) + '">' +
      '<div class="card-thumb">' + LingerUI.mediaHTML(item, category) + "</div>" +
      '<div class="card-body">' +
      '<h3 class="card-name">' + LingerUI.esc(name) + "</h3>" +
      '<p class="card-desc">' +
      LingerUI.esc(L(item.descZh, item.descEn)) +
      "</p>" +
      '<div class="card-foot">' +
      '<span class="card-price' + (tbc ? " card-price--tbc" : "") + '">' +
      LingerUI.money(item.price) +
      "</span>" +
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
        '<p class="page-sub" style="padding:28px 4px;">' +
        LingerUI.esc(L("此分類暫無餐點。", "No items in this category.")) +
        "</p>";
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
        count > 0
          ? L(
              "查看購物車，共 " + count + " 件",
              "View cart, " + count + (count === 1 ? " item" : " items")
            )
          : L("查看購物車，目前是空的", "View cart, currently empty")
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
        count +
        LingerUI.esc(L(" 項 · ", count === 1 ? " item · " : " items · ")) +
        LingerUI.esc(LingerUI.fmtTable(state.table)) +
        "</span>" +
        '<b class="cart-bar-total">' + LingerUI.money(LingerCart.subtotal()) + "</b>" +
        "</div>" +
        '<button type="button" class="btn btn--primary" data-cart-open>' +
        LingerUI.esc(L("查看購物車", "View Cart")) +
        "</button>" +
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
      LingerUI.toast(
        L("此品項價格待定，請洽服務人員", "Price to be confirmed — please ask our staff")
      );
      return;
    }

    // 有甜度／冰度或小料可選的品項，先打開詳情讓顧客選擇。
    if (hasCustomOptions(entry)) {
      openDetail(id);
      return;
    }

    LingerCart.add(id, 1);
    syncCartUI();

    LingerUI.toast(
      L("已加入購物車 · ", "Added to cart · ") + L(entry.item.zh, entry.item.en),
      {
        actionLabel: L("查看", "View"),
        onAction: function () {
          go("cart");
        },
      }
    );
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
    var name = L(item.zh, item.en);
    var optionsText = entryOptionText(entry);
    var ariaName = optionsText ? name + " · " + optionsText : name;
    var key = entry.key;

    return (
      '<div class="cart-item" data-cart-id="' + LingerUI.esc(key) + '">' +
      '<div class="cart-thumb">' + LingerUI.mediaHTML(item, category) + "</div>" +
      '<div class="cart-item-body">' +
      '<div class="cart-item-head">' +
      '<span class="cart-item-name">' + LingerUI.esc(name) + "</span>" +
      "</div>" +
      (optionsText
        ? '<p class="cart-item-options">' + LingerUI.esc(optionsText) + "</p>"
        : "") +
      '<div class="cart-item-controls">' +
      '<div class="qty-stepper">' +
      '<button type="button" class="qty-btn" data-cart-minus="' + LingerUI.esc(key) + '" ' +
      'aria-label="' +
      LingerUI.esc(L("減少 " + ariaName + " 數量", "Decrease " + ariaName + " quantity")) +
      '"' +
      (entry.qty <= 1 ? " disabled" : "") +
      ">" + LingerUI.icons.minus + "</button>" +
      '<span class="qty-value" aria-live="polite">' + entry.qty + "</span>" +
      '<button type="button" class="qty-btn" data-cart-plus="' + LingerUI.esc(key) + '" ' +
      'aria-label="' +
      LingerUI.esc(L("增加 " + ariaName + " 數量", "Increase " + ariaName + " quantity")) +
      '"' +
      (entry.qty >= max ? " disabled" : "") +
      ">" + LingerUI.icons.plus + "</button>" +
      "</div>" +
      '<span class="cart-line-price">' + LingerUI.money(entry.lineTotal) + "</span>" +
      "</div>" +
      "</div>" +
      '<button type="button" class="cart-remove" data-cart-remove="' + LingerUI.esc(key) + '" ' +
      'aria-label="' +
      LingerUI.esc(L("移除 " + ariaName, "Remove " + ariaName)) +
      '">' +
      LingerUI.icons.trash +
      "</button>" +
      "</div>"
    );
  }

  function cartSummaryHTML() {
    return (
      '<div class="cart-summary">' +
      '<div class="sum-row"><span>' + LingerUI.esc(L("小計", "Subtotal")) + "</span><b>" +
      LingerUI.money(LingerCart.subtotal()) + "</b></div>" +
      '<div class="sum-row sum-row--total"><span>' +
      LingerUI.esc(L("總計", "Total")) + "</span><b>" +
      LingerUI.money(LingerCart.total()) + "</b></div>" +
      "</div>" +
      '<div class="cart-actions">' +
      '<button type="button" class="btn btn--ghost" data-go-menu>' +
      LingerUI.esc(L("繼續點餐", "Add more")) + "</button>" +
      '<button type="button" class="btn btn--primary" data-checkout>' +
      LingerUI.esc(L("前往結帳", "Checkout")) + " · " +
      LingerUI.money(LingerCart.total()) + "</button>" +
      "</div>"
    );
  }

  function cartHeadHTML(subtitle) {
    var table = LingerUI.normalizeTable(state.table);
    return (
      '<div class="page-head">' +
      '<p class="page-kicker">' +
      (table ? LingerUI.esc(L("桌號 " + table, "TABLE " + table)) + " · " : "") +
      LingerUI.esc(L("您的點單", "YOUR ORDER")) +
      "</p>" +
      '<h1 class="page-title">' + LingerUI.esc(L("購物車", "Cart")) + "</h1>" +
      '<p class="page-sub">' + subtitle + "</p>" +
      "</div>"
    );
  }

  function emptyCartHTML() {
    return (
      cartHeadHTML(LingerUI.esc(L("0 項餐點", "0 items"))) +
      '<div class="page-body">' +
      '<div class="empty-state">' +
      '<div class="empty-art">' + EMPTY_ART_SVG + "</div>" +
      '<p class="empty-title">' +
      LingerUI.esc(L("購物車還是空的", "Your cart is empty")) +
      "</p>" +
      '<p class="empty-sub">' +
      LingerUI.esc(
        L(
          "先挑幾道想吃的，讓這一餐慢慢開始。",
          "Take your time — choose something good to begin."
        )
      ) +
      "</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>' +
      LingerUI.esc(L("回到菜單", "View Menu")) +
      "</button>" +
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
      cartHeadHTML(
        LingerUI.esc(
          L(
            LingerCart.count() + " 項餐點",
            LingerCart.count() + (LingerCart.count() === 1 ? " item" : " items")
          )
        )
      ) +
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
        LingerUI.toast(
          L("單品最多 " + max + " 份", "Maximum " + max + " per item")
        );
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
        var removedName = L(entry.item.zh, entry.item.en);
        var removedOptions = entryOptionText(entry);
        if (removedOptions) removedName += " · " + removedOptions;

        LingerUI.toast(
          L("已移除 · ", "Removed · ") + removedName,
          {
            actionLabel: L("復原", "Undo"),
            onAction: function () {
              LingerCart.add(entry.item.id, removedQty, entry.options);
              syncCartUI(null);
            },
          }
        );
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
      (table ? LingerUI.esc(L("桌號 " + table, "TABLE " + table)) + " · " : "") +
      LingerUI.esc(L("確認訂單", "CHECKOUT")) +
      "</p>" +
      '<h1 class="page-title">' + LingerUI.esc(L("結帳", "Checkout")) + "</h1>" +
      '<p class="page-sub">' +
      LingerUI.esc(L("請確認餐點與桌號。", "Please confirm your dishes and table.")) +
      "</p>" +
      "</div>"
    );
  }

  function checkoutItemHTML(entry) {
    var optionsText = entryOptionText(entry);

    return (
      '<div class="checkout-item">' +
      '<span class="checkout-item-name">' +
      LingerUI.esc(L(entry.item.zh, entry.item.en)) +
      '<span class="checkout-item-qty">× ' + entry.qty + "</span>" +
      (optionsText
        ? '<span class="checkout-item-options">' +
          LingerUI.esc(optionsText) +
          "</span>"
        : "") +
      "</span>" +
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
      '<p class="empty-title">' +
      LingerUI.esc(L("購物車還是空的", "Your cart is empty")) +
      "</p>" +
      '<p class="empty-sub">' +
      LingerUI.esc(
        L(
          "先挑幾道想吃的，再回來結帳。",
          "Choose something first, then come back to checkout."
        )
      ) +
      "</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>' +
      LingerUI.esc(L("回到菜單", "View Menu")) +
      "</button>" +
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
      "<div>" +
      '<span class="checkout-table-label">' +
      LingerUI.esc(L("桌號", "Table")) +
      "</span>" +
      '<span class="checkout-table-value">' +
      (table ? LingerUI.esc(table) : LingerUI.esc(L("尚未設定", "Not set"))) +
      "</span>" +
      "</div>" +
      '<button type="button" class="text-link" data-change-table>' +
      LingerUI.esc(table ? L("更換", "Change") : L("設定桌號", "Set table")) +
      "</button>" +
      "</div>" +
      '<div class="checkout-list">' +
      entries.map(checkoutItemHTML).join("") +
      "</div>" +
      '<label class="field note-field">' +
      '<span class="field-label">' +
      LingerUI.esc(L("備註", "Special requests")) +
      "</span>" +
      '<textarea class="field-textarea" id="checkout-note" maxlength="200" ' +
      'placeholder="' +
      LingerUI.esc(L("例如：不要辣、對花生過敏…", "e.g. no chili, peanut allergy…")) +
      '">' +
      LingerUI.esc(state.note) +
      "</textarea>" +
      "</label>" +
      '<div class="fee-table">' +
      '<div class="sum-row"><span>' +
      LingerUI.esc(L("小計", "Subtotal")) +
      "</span><b>" +
      LingerUI.money(LingerCart.subtotal()) + "</b></div>" +
      '<div class="sum-row sum-row--total"><span>' +
      LingerUI.esc(L("總計", "Total")) +
      "</span><b>" +
      LingerUI.money(LingerCart.total()) + "</b></div>" +
      "</div>" +
      '<div class="cart-actions">' +
      '<button type="button" class="btn btn--ghost" data-go-cart>' +
      LingerUI.esc(L("返回購物車", "Edit cart")) +
      "</button>" +
      '<button type="button" class="btn btn--primary" data-submit-order>' +
      LingerUI.esc(L("送出訂單", "Place Order")) + " · " +
      LingerUI.money(LingerCart.total()) + "</button>" +
      "</div>" +
      '<p class="submit-note">' +
      LingerUI.esc(
        L(
          "送出後訂單將直接進入廚房，恕無法修改。",
          "Once sent, your order goes straight to the kitchen and cannot be changed."
        )
      ) +
      "</p>" +
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
          unitPrice: entry.unitPrice,
          qty: entry.qty,
          options: entry.options,
          optionsZh: optionText(entry, "zh"),
          optionsEn: optionText(entry, "en"),
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
      LingerUI.toast(L("購物車是空的", "Your cart is empty"));
      go("menu");
      return;
    }

    if (!LingerUI.normalizeTable(state.table)) {
      LingerUI.toast(L("請先設定桌號", "Please set your table first"));
      openTableModal();
      return;
    }

    var order = buildOrder();
    var submitBtn = els.views.checkout.querySelector("[data-submit-order]");

    submitting = true;
    if (submitBtn) submitBtn.disabled = true;

    LingerUI.showSending(
      L("正在將訂單送往廚房…", "Sending your order to the kitchen…")
    );

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
    var optionsText = L(line.optionsZh || "", line.optionsEn || "");

    return (
      '<div class="checkout-item">' +
      '<span class="checkout-item-name">' +
      LingerUI.esc(L(line.zh, line.en)) +
      '<span class="checkout-item-qty">× ' + LingerUI.esc(line.qty) + "</span>" +
      (optionsText
        ? '<span class="checkout-item-options">' +
          LingerUI.esc(optionsText) +
          "</span>"
        : "") +
      "</span>" +
      '<span class="checkout-item-price">' + LingerUI.money(line.lineTotal) + "</span>" +
      "</div>"
    );
  }

  function noOrderHTML() {
    return (
      '<div class="success-wrap">' +
      '<p class="success-kicker">' +
      LingerUI.esc(L("尚無訂單", "NO ORDER")) +
      "</p>" +
      '<h1 class="success-title" tabindex="-1">' +
      LingerUI.esc(L("還沒有訂單", "No order yet")) +
      "</h1>" +
      '<p class="success-sub">' +
      LingerUI.esc(L("目前沒有可顯示的訂單。", "There is no order to display right now.")) +
      "</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>' +
      LingerUI.esc(L("回到菜單", "View Menu")) +
      "</button>" +
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
      ? "<br>" + LingerUI.esc(L("備註：", "Note: ")) + LingerUI.esc(order.note)
      : "";

    el.innerHTML =
      '<div class="success-wrap">' +
      '<svg class="success-check" viewBox="0 0 76 76" aria-hidden="true">' +
      '<circle class="check-circle" cx="38" cy="38" r="26.5"/>' +
      '<path class="check-mark" d="M25.5 39.5l8.5 8.5L51 30"/>' +
      "</svg>" +
      '<p class="success-kicker">' +
      LingerUI.esc(L("訂單已收到", "ORDER RECEIVED")) +
      "</p>" +
      '<h1 class="success-title" tabindex="-1">' +
      LingerUI.esc(L("餐點製作中", "Your order is being prepared")) +
      "</h1>" +
      '<p class="success-sub">' +
      LingerUI.esc(
        L(
          "謝謝您的點餐，廚房已收到，請稍候片刻。",
          "Thank you — our kitchen has received your order."
        )
      ) +
      "</p>" +
      '<div class="success-meta">' +
      "<div>" +
      '<span class="success-meta-label">' +
      LingerUI.esc(L("訂單編號", "Order No.")) +
      "</span>" +
      '<span class="success-meta-value">' + LingerUI.esc(order.no) + "</span></div>" +
      "<div>" +
      '<span class="success-meta-label">' +
      LingerUI.esc(L("桌號", "Table")) +
      "</span>" +
      '<span class="success-meta-value">' +
      LingerUI.esc(LingerUI.normalizeTable(order.table) || "—") +
      "</span></div>" +
      "</div>" +
      '<div class="success-items">' +
      (order.items || []).map(successItemHTML).join("") +
      "</div>" +
      '<p class="success-note">' +
      "<strong>" +
      LingerUI.esc(L("總計 ", "Total ")) +
      LingerUI.money(order.total) +
      "</strong>" +
      noteHTML +
      "<br>" +
      LingerUI.esc(
        L(
          "餐點送出後恕無法修改，如需協助請告知服務人員。",
          "Please speak to our staff if you need any assistance."
        )
      ) +
      "</p>" +
      '<button type="button" class="btn btn--primary" data-go-menu>' +
      LingerUI.esc(L("回到菜單", "View Menu")) +
      "</button>" +
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
    var name = L(item.zh, item.en);
    var story = L(item.story || "", item.storyEn || "");
    var desc = L(item.descZh, item.descEn);
    var ingredients = L(item.ingredients || [], item.ingredientsEn || []);
    var toppingOptions = categoryToppings(category);
    var hasToppings = toppingOptions.length > 0;
    var hasSweetness = itemSupports(item, "sweetness");
    var hasIce = itemSupports(item, "ice");
    var selectedToppings = [];
    var selectedSweetness = hasSweetness ? defaultChoice("sweetness") : "";
    var selectedIce = hasIce ? defaultChoice("ice") : "";

    var storyHTML = story
      ? '<blockquote class="modal-story">' + LingerUI.esc(story) + "</blockquote>"
      : "";

    var allergenHTML =
      item.allergens && item.allergens.length
        ? LingerUI.allergenChips(item.allergens)
        : '<span class="allergen-empty">' +
          LingerUI.esc(L("未標示致敏原", "No listed allergens")) +
          "</span>";

    var toppingsHTML = hasToppings
      ? '<section class="modal-section modal-section--options">' +
        '<h3 class="modal-section-title">' +
        LingerUI.esc(L("加配料（可選）", "Add Toppings (Optional)")) +
        "</h3>" +
        '<p class="modal-option-note">' +
        LingerUI.esc(
          L(
            "每份甜品均可加選，可選多項。",
            "Available with any dessert; choose as many as you like."
          )
        ) +
        "</p>" +
        '<div class="option-grid" role="group" aria-label="' +
        LingerUI.esc(L("加配料", "Add toppings")) +
        '">' +
        toppingOptions
          .map(function (topping) {
            return (
              '<button type="button" class="option-pill option-pill--topping" ' +
              'data-topping="' + LingerUI.esc(topping.id) + '" aria-pressed="false">' +
              '<span class="option-pill-label">' +
              LingerUI.esc(L(topping.zh, topping.en)) +
              "</span>" +
              '<span class="option-pill-price">+ ' +
              LingerUI.money(topping.price) +
              "</span>" +
              "</button>"
            );
          })
          .join("") +
        "</div>" +
        "</section>"
      : "";

    var drinkOptionsHTML =
      hasSweetness || hasIce
        ? '<section class="modal-section modal-section--options">' +
          '<h3 class="modal-section-title">' +
          LingerUI.esc(L("飲品選項", "Drink Options")) +
          "</h3>" +
          (hasSweetness
            ? '<p class="modal-option-label">' +
              LingerUI.esc(L("甜度", "Sweetness")) +
              "</p>" +
              '<div class="option-row" role="group" aria-label="' +
              LingerUI.esc(L("甜度", "Sweetness")) +
              '">' +
              choiceList("sweetness")
                .map(function (choice) {
                  var active = choice.id === selectedSweetness;
                  return (
                    '<button type="button" class="option-pill option-pill--choice' +
                    (active ? " is-selected" : "") +
                    '" data-sweetness="' +
                    LingerUI.esc(choice.id) +
                    '" aria-pressed="' +
                    (active ? "true" : "false") +
                    '">' +
                    LingerUI.esc(L(choice.zh, choice.en)) +
                    "</button>"
                  );
                })
                .join("") +
              "</div>"
            : "") +
          (hasIce
            ? '<p class="modal-option-label">' +
              LingerUI.esc(L("冰度", "Ice Level")) +
              "</p>" +
              '<div class="option-row" role="group" aria-label="' +
              LingerUI.esc(L("冰度", "Ice Level")) +
              '">' +
              choiceList("ice")
                .map(function (choice) {
                  var active = choice.id === selectedIce;
                  return (
                    '<button type="button" class="option-pill option-pill--choice' +
                    (active ? " is-selected" : "") +
                    '" data-ice="' +
                    LingerUI.esc(choice.id) +
                    '" aria-pressed="' +
                    (active ? "true" : "false") +
                    '">' +
                    LingerUI.esc(L(choice.zh, choice.en)) +
                    "</button>"
                  );
                })
                .join("") +
              "</div>"
            : "") +
          "</section>"
        : "";

    var footHTML = tbc
      ? '<div class="modal-foot">' +
        '<p class="modal-tbc">' +
        LingerUI.esc(
          L(
            "此品項價格待定，請向服務人員查詢。",
            "Price to be confirmed — please ask our staff."
          )
        ) +
        "</p>" +
        "</div>"
      : '<div class="modal-foot">' +
        '<div class="qty-stepper">' +
        '<button type="button" class="qty-btn" data-detail-minus aria-label="' +
        LingerUI.esc(L("減少數量", "Decrease quantity")) +
        '">' +
        LingerUI.icons.minus +
        "</button>" +
        '<span class="qty-value" data-detail-qty aria-live="polite">1</span>' +
        '<button type="button" class="qty-btn" data-detail-plus aria-label="' +
        LingerUI.esc(L("增加數量", "Increase quantity")) +
        '">' +
        LingerUI.icons.plus +
        "</button>" +
        "</div>" +
        '<button type="button" class="btn btn--primary" data-detail-add>' +
        LingerUI.esc(L("加入購物車", "Add to Cart")) + " · " +
        LingerUI.money(item.price) +
        "</button>" +
        "</div>";

    var bodyHTML =
      '<div class="modal-scroll">' +
      '<div class="modal-media">' + LingerUI.mediaHTML(item, category, { lg: true }) + "</div>" +
      '<div class="modal-body">' +
      '<p class="modal-kicker">' +
      LingerUI.esc(L(category.zh, category.en)) +
      "</p>" +
      '<h2 class="modal-title" id="detail-modal-title">' +
      LingerUI.esc(name) +
      "</h2>" +
      '<p class="modal-price">' + LingerUI.money(item.price) + "</p>" +
      storyHTML +
      '<p class="modal-desc">' + LingerUI.esc(desc) + "</p>" +
      toppingsHTML +
      drinkOptionsHTML +
      (hasToppings || hasSweetness || hasIce
        ? '<p class="modal-option-summary" data-detail-summary aria-live="polite" hidden></p>'
        : "") +
      '<section class="modal-section">' +
      '<h3 class="modal-section-title">' +
      LingerUI.esc(L("食材", "Ingredients")) +
      "</h3>" +
      '<ul class="chip-list">' + LingerUI.chipList(ingredients) + "</ul>" +
      "</section>" +
      '<section class="modal-section">' +
      '<h3 class="modal-section-title">' +
      LingerUI.esc(L("致敏原", "Allergens")) +
      "</h3>" +
      '<div class="allergen-row">' + allergenHTML + "</div>" +
      '<p class="modal-desc">' +
      LingerUI.esc(
        L("點擊代碼可查看 1–16 致敏原圖例。", "Tap a code to view the full allergen guide.")
      ) +
      "</p>" +
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
    var summaryEl = dialog.querySelector("[data-detail-summary]");
    var toppingButtons = dialog.querySelectorAll("[data-topping]");

    function toppingsPrice() {
      var total = 0;
      toppingOptions.forEach(function (topping) {
        if (selectedToppings.indexOf(topping.id) !== -1) {
          total += Number(topping.price) || 0;
        }
      });
      return Math.round(total * 10) / 10;
    }

    function unitPrice() {
      return Math.round(((Number(item.price) || 0) + toppingsPrice()) * 10) / 10;
    }

    function currentOptions() {
      return {
        toppings: selectedToppings.slice(),
        sweetness: selectedSweetness,
        ice: selectedIce,
      };
    }

    function optionSummary() {
      var parts = [];
      var lang = LingerI18n.get();
      var isEn = lang === "en";

      if (selectedSweetness) {
        parts.push(choiceLabel("sweetness", selectedSweetness, lang));
      }
      if (selectedIce) {
        parts.push(choiceLabel("ice", selectedIce, lang));
      }
      if (selectedToppings.length) {
        var names = toppingOptions
          .filter(function (topping) {
            return selectedToppings.indexOf(topping.id) !== -1;
          })
          .map(function (topping) {
            return isEn ? topping.en : topping.zh;
          });
        parts.push(
          (isEn ? "Add " : "加") +
            names.join(isEn ? ", " : "、") +
            " · +" +
            LingerUI.money(toppingsPrice())
        );
      }

      return parts.filter(Boolean).join(" · ");
    }

    function refreshAddButton() {
      if (addBtn) {
        addBtn.textContent =
          L("加入購物車", "Add to Cart") + " · " + LingerUI.money(unitPrice() * qty);
      }
    }

    function refreshOptionUI() {
      for (var i = 0; i < toppingButtons.length; i++) {
        var button = toppingButtons[i];
        var toppingId = button.getAttribute("data-topping");
        var selected = selectedToppings.indexOf(toppingId) !== -1;
        button.setAttribute("aria-pressed", selected ? "true" : "false");
        button.classList.toggle("is-selected", selected);
      }

      var sweetnessButtons = dialog.querySelectorAll("[data-sweetness]");
      for (var j = 0; j < sweetnessButtons.length; j++) {
        var sweetButton = sweetnessButtons[j];
        var sweetSelected =
          sweetButton.getAttribute("data-sweetness") === selectedSweetness;
        sweetButton.setAttribute("aria-pressed", sweetSelected ? "true" : "false");
        sweetButton.classList.toggle("is-selected", sweetSelected);
      }

      var iceButtons = dialog.querySelectorAll("[data-ice]");
      for (var k = 0; k < iceButtons.length; k++) {
        var iceButton = iceButtons[k];
        var iceSelected = iceButton.getAttribute("data-ice") === selectedIce;
        iceButton.setAttribute("aria-pressed", iceSelected ? "true" : "false");
        iceButton.classList.toggle("is-selected", iceSelected);
      }

      if (summaryEl) {
        var text = optionSummary();
        summaryEl.textContent = text;
        summaryEl.hidden = !text;
      }

      refreshAddButton();
    }

    function refreshQty() {
      if (qtyEl) qtyEl.textContent = String(qty);
      if (minusBtn) minusBtn.disabled = qty <= 1;
      if (plusBtn) plusBtn.disabled = qty >= LingerCart.maxQty();
      refreshAddButton();
    }

    for (var t = 0; t < toppingButtons.length; t++) {
      toppingButtons[t].addEventListener("click", function () {
        var toppingId = this.getAttribute("data-topping");
        var index = selectedToppings.indexOf(toppingId);

        if (index === -1) {
          selectedToppings.push(toppingId);
        } else {
          selectedToppings.splice(index, 1);
        }

        // 依菜單順序保存，讓同組合的小料產生同一個購物車列。
        var chosen = selectedToppings.slice();
        selectedToppings = toppingOptions
          .map(function (topping) {
            return topping.id;
          })
          .filter(function (id) {
            return chosen.indexOf(id) !== -1;
          });

        refreshOptionUI();
      });
    }

    var sweetnessButtons = dialog.querySelectorAll("[data-sweetness]");
    for (var s = 0; s < sweetnessButtons.length; s++) {
      sweetnessButtons[s].addEventListener("click", function () {
        selectedSweetness = this.getAttribute("data-sweetness");
        refreshOptionUI();
      });
    }

    var iceButtons = dialog.querySelectorAll("[data-ice]");
    for (var c = 0; c < iceButtons.length; c++) {
      iceButtons[c].addEventListener("click", function () {
        selectedIce = this.getAttribute("data-ice");
        refreshOptionUI();
      });
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
          LingerUI.toast(
            L(
              "單品最多 " + LingerCart.maxQty() + " 份",
              "Maximum " + LingerCart.maxQty() + " per item"
            )
          );
          return;
        }
        qty++;
        refreshQty();
      });
    }

    if (addBtn) {
      addBtn.addEventListener("click", function () {
        LingerCart.add(item.id, qty, currentOptions());
        syncCartUI();
        modal.close();
        LingerUI.toast(L("已加入購物車 · ", "Added to cart · ") + name, {
          actionLabel: L("查看", "View"),
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

    refreshOptionUI();
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
    // 語言按鈕只認切換器內的 [data-lang]，避免其他帶同屬性的元素
    // 被誤判成切換語言而吞掉點擊。
    var langButton = event.target.closest(".lang-switch [data-lang]");
    if (langButton) {
      setLanguage(langButton.getAttribute("data-lang"));
      return;
    }

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

    renderStaticTexts();
    renderLangSwitch();
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
        L(
          "部分餐點已更新，已從購物車移除 " + cartInit.dropped + " 項",
          cartInit.dropped === 1
            ? "Some items were updated; 1 item was removed from your cart."
            : "Some items were updated; " + cartInit.dropped + " items were removed from your cart."
        )
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
