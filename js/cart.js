/* =============================================================
 * LINGER — cart.js
 * -------------------------------------------------------------
 * LingerCart：購物車純邏輯，不碰 DOM。
 *
 * API
 *   init(table)              載入 localStorage（過濾已下架 id），回傳 { dropped }
 *   add(id, qty, options)    加入，回傳該列新數量
 *   setQty(key, qty)         設定數量（<=0 即移除）
 *   remove(key) / clear()
 *   count()                  總件數
 *   qty(key)                 單一購物車列目前數量
 *   items()                  解析後的品項
 *                            [{ key, item, category, qty, options,
 *                               toppingItems, unitPrice, lineTotal }]
 *   subtotal() / serviceCharge() / total()
 *   setTable(t) / getTable()
 *   get(key)                 單一購物車列資料
 *
 * 設計
 *   每個購物車列存 id + qty + 選項（小料／甜度／冰度）。
 *   選項只存 id，文字由 app.js 依當前語言即時翻譯；價格即時由 menu-data.js
 *   查詢，日後調整售價，顧客手機裡的舊購物車會自動反映新價格。
 *   沒有選項的舊格式 { id: qty } 會在 init() 時自動升級為新格式。
 * ============================================================= */

const LingerCart = (function () {
  "use strict";

  var KEY = "linger.cart.v1";
  var MAX_QTY = 99;

  var state = {
    table: "",
    items: {},
  };

  var index = buildIndex();

  function buildIndex() {
    var byId = {};

    (LINGER_MENU.categories || []).forEach(function (category) {
      (category.items || []).forEach(function (item) {
        byId[item.id] = { item: item, category: category };
      });
    });

    return { byId: byId };
  }

  function lookup(id) {
    return index.byId[id] || null;
  }

  function choiceList(group) {
    var config = LINGER_MENU.drinkOptions || {};
    return Array.isArray(config[group]) ? config[group] : [];
  }

  function validChoice(group, id) {
    var choices = choiceList(group);
    for (var i = 0; i < choices.length; i++) {
      if (choices[i].id === id) return choices[i].id;
    }
    return "";
  }

  function defaultChoice(group) {
    var config = LINGER_MENU.drinkOptions || {};
    var defaults = config.defaults || {};
    var wanted = validChoice(group, defaults[group]);
    if (wanted) return wanted;
    var choices = choiceList(group);
    return choices.length ? choices[0].id : "";
  }

  function itemSupports(item, group) {
    return !!(item && item.options && item.options[group]);
  }

  function normalizeOptions(item, category, options) {
    var source = options && typeof options === "object" ? options : {};
    var normalized = {
      toppings: [],
      sweetness: "",
      ice: "",
    };

    if (category && Array.isArray(category.toppings)) {
      var wanted = Array.isArray(source.toppings) ? source.toppings : [];
      category.toppings.forEach(function (topping) {
        if (wanted.indexOf(topping.id) !== -1) {
          normalized.toppings.push(topping.id);
        }
      });
    }

    if (itemSupports(item, "sweetness")) {
      normalized.sweetness =
        validChoice("sweetness", source.sweetness) || defaultChoice("sweetness");
    }

    if (itemSupports(item, "ice")) {
      normalized.ice = validChoice("ice", source.ice) || defaultChoice("ice");
    }

    return normalized;
  }

  function optionKey(options) {
    var parts = [];

    if (options.toppings.length) {
      parts.push("t." + options.toppings.slice().sort().join("+"));
    }
    if (options.sweetness) {
      parts.push("s." + options.sweetness);
    }
    if (options.ice) {
      parts.push("i." + options.ice);
    }

    return parts.join("~");
  }

  function makeKey(id, options) {
    var suffix = optionKey(options);
    return suffix ? id + "~" + suffix : id;
  }

  function toppingItemsFor(category, toppingIds) {
    var list = [];
    if (!category || !Array.isArray(category.toppings)) return list;

    category.toppings.forEach(function (topping) {
      if (toppingIds.indexOf(topping.id) !== -1) list.push(topping);
    });

    return list;
  }

  function unitPriceFor(item, category, options) {
    var total = Number(item.price) || 0;
    toppingItemsFor(category, options.toppings).forEach(function (topping) {
      total += Number(topping.price) || 0;
    });
    return Math.round(total * 10) / 10;
  }

  function resolveLine(key, line) {
    if (!line) return null;

    var entry = lookup(line.id);
    if (!entry) return null;

    var item = entry.item;
    var category = entry.category;
    if (item.price === null || item.price === undefined) return null;

    var qty = Math.floor(Number(line.qty) || 0);
    if (qty <= 0) return null;

    var options = normalizeOptions(item, category, line);
    var toppingItems = toppingItemsFor(category, options.toppings);
    var unitPrice = unitPriceFor(item, category, options);

    return {
      key: key,
      item: item,
      category: category,
      qty: qty,
      options: options,
      toppingItems: toppingItems,
      unitPrice: unitPrice,
      lineTotal: Math.round(unitPrice * qty * 10) / 10,
    };
  }

  function readStorage() {
    try {
      var raw = window.localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStorage() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      /* Safari 無痕等情況：保留記憶體狀態，功能不中斷 */
    }
  }

  function init(table) {
    state = { table: table || "", items: {} };

    var saved = readStorage();
    var dropped = 0;
    var migrated = false;

    if (saved && saved.items && typeof saved.items === "object") {
      Object.keys(saved.items).forEach(function (key) {
        var raw = saved.items[key];
        var id;
        var qty;
        var sourceOptions = null;

        if (typeof raw === "number") {
          // 舊格式：{ "sanbeiji": 2 }
          id = key;
          qty = Math.floor(Number(raw) || 0);
          migrated = true;
        } else if (raw && typeof raw === "object") {
          id = String(raw.id || key.split("~")[0]);
          qty = Math.floor(Number(raw.qty) || 0);
          sourceOptions = raw;
        } else {
          dropped++;
          return;
        }

        var entry = lookup(id);
        if (
          !entry ||
          entry.item.price === null ||
          entry.item.price === undefined ||
          qty <= 0
        ) {
          dropped++;
          return;
        }

        var options = normalizeOptions(entry.item, entry.category, sourceOptions || {});
        var lineKey = makeKey(id, options);
        var existing = state.items[lineKey];

        if (lineKey !== key) migrated = true;

        state.items[lineKey] = {
          id: id,
          qty: Math.min(MAX_QTY, (existing ? existing.qty : 0) + qty),
          toppings: options.toppings,
          sweetness: options.sweetness,
          ice: options.ice,
        };
      });
    }

    if (!state.table && saved && saved.table) {
      state.table = String(saved.table);
    }

    if (migrated) writeStorage();

    return { dropped: dropped };
  }

  function add(id, qty, options) {
    var entry = lookup(id);
    if (!entry || entry.item.price === null || entry.item.price === undefined) {
      return 0;
    }

    var amount = Math.max(1, Math.floor(Number(qty) || 1));
    var normalized = normalizeOptions(entry.item, entry.category, options || {});
    var key = makeKey(id, normalized);
    var line = state.items[key];

    if (line) {
      line.qty = Math.min(MAX_QTY, line.qty + amount);
    } else {
      state.items[key] = {
        id: id,
        qty: Math.min(MAX_QTY, amount),
        toppings: normalized.toppings,
        sweetness: normalized.sweetness,
        ice: normalized.ice,
      };
    }

    writeStorage();
    return state.items[key].qty;
  }

  function setQty(key, qty) {
    var line = state.items[key];
    if (!line) return 0;

    var entry = lookup(line.id);
    if (!entry || entry.item.price === null || entry.item.price === undefined) {
      delete state.items[key];
      writeStorage();
      return 0;
    }

    var next = Math.floor(Number(qty) || 0);
    if (next <= 0) {
      delete state.items[key];
      writeStorage();
      return 0;
    }

    line.qty = Math.min(next, MAX_QTY);
    writeStorage();
    return line.qty;
  }

  function remove(key) {
    if (!state.items[key]) return;
    delete state.items[key];
    writeStorage();
  }

  function clear() {
    state.items = {};
    writeStorage();
  }

  function count() {
    return Object.keys(state.items).reduce(function (sum, key) {
      return sum + (state.items[key].qty || 0);
    }, 0);
  }

  function qty(key) {
    var line = state.items[key];
    return line ? line.qty : 0;
  }

  function items() {
    var keysById = {};

    Object.keys(state.items).forEach(function (key) {
      var line = state.items[key];
      if (!line || !line.id) return;
      if (!keysById[line.id]) keysById[line.id] = [];
      keysById[line.id].push(key);
    });

    var list = [];

    (LINGER_MENU.categories || []).forEach(function (category) {
      (category.items || []).forEach(function (item) {
        var keys = keysById[item.id];
        if (!keys) return;

        keys.forEach(function (key) {
          var resolved = resolveLine(key, state.items[key]);
          if (resolved) list.push(resolved);
        });
      });
    });

    return list;
  }

  function subtotal() {
    return (
      Math.round(
        items().reduce(function (sum, entry) {
          return sum + entry.lineTotal;
        }, 0) * 10
      ) / 10
    );
  }

  function serviceCharge() {
    return Math.round(subtotal() * LINGER_MENU.serviceCharge * 10) / 10;
  }

  function total() {
    return Math.round((subtotal() + serviceCharge()) * 10) / 10;
  }

  function setTable(table) {
    state.table = table || "";
    writeStorage();
  }

  function getTable() {
    return state.table;
  }

  function get(key) {
    return resolveLine(key, state.items[key]);
  }

  function maxQty() {
    return MAX_QTY;
  }

  return {
    init: init,
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    count: count,
    qty: qty,
    items: items,
    subtotal: subtotal,
    serviceCharge: serviceCharge,
    total: total,
    setTable: setTable,
    getTable: getTable,
    get: get,
    maxQty: maxQty,
  };
})();
