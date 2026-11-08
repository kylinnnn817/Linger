/* =============================================================
 * LINGER — cart.js
 * -------------------------------------------------------------
 * LingerCart：購物車純邏輯，不碰 DOM。
 *
 * API
 *   init(table)        載入 localStorage（過濾已下架 id），回傳 { dropped }
 *   add(id, qty)       加入，回傳該品項新數量
 *   setQty(id, qty)    設定數量（<=0 即移除）
 *   remove(id) / clear()
 *   count()            總件數
 *   qty(id)            單一品項目前數量（未加入回傳 0）
 *   items()            解析後的品項 [{ item, category, qty, lineTotal }]
 *   subtotal() / serviceCharge() / total()
 *   setTable(t) / getTable()
 *   get(id)            單一品項資料 { item, category }
 *
 * 設計：購物車只存 id + qty，價格一律即時由 menu-data.js 查詢，
 *       日後調整售價，顧客手機裡的舊購物車會自動反映新價格。
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

    if (saved && saved.items && typeof saved.items === "object") {
      Object.keys(saved.items).forEach(function (id) {
        var qty = Math.floor(Number(saved.items[id]) || 0);
        var entry = lookup(id);
        if (entry && entry.item.price !== null && entry.item.price !== undefined && qty > 0) {
          state.items[id] = Math.min(qty, MAX_QTY);
        } else {
          dropped++;
        }
      });
    }

    if (!state.table && saved && saved.table) {
      state.table = String(saved.table);
    }

    return { dropped: dropped };
  }

  function add(id, qty) {
    var entry = lookup(id);
    if (!entry || entry.item.price === null || entry.item.price === undefined) return 0;
    var amount = Math.max(1, Math.floor(Number(qty) || 1));
    var next = Math.min(MAX_QTY, (state.items[id] || 0) + amount);
    state.items[id] = next;
    writeStorage();
    return next;
  }

  function setQty(id, qty) {
    var entry = lookup(id);
    if (!entry || entry.item.price === null || entry.item.price === undefined) return 0;
    var next = Math.floor(Number(qty) || 0);
    if (next <= 0) {
      delete state.items[id];
      writeStorage();
      return 0;
    }
    next = Math.min(next, MAX_QTY);
    state.items[id] = next;
    writeStorage();
    return next;
  }

  function remove(id) {
    if (!state.items[id]) return;
    delete state.items[id];
    writeStorage();
  }

  function clear() {
    state.items = {};
    writeStorage();
  }

  function count() {
    return Object.keys(state.items).reduce(function (sum, id) {
      return sum + (state.items[id] || 0);
    }, 0);
  }

  function qty(id) {
    return state.items[id] || 0;
  }

  function items() {
    var list = [];
    (LINGER_MENU.categories || []).forEach(function (category) {
      (category.items || []).forEach(function (item) {
        var qty = state.items[item.id];
        if (qty > 0 && item.price !== null && item.price !== undefined) {
          list.push({
            item: item,
            category: category,
            qty: qty,
            lineTotal: Math.round(item.price * qty * 10) / 10,
          });
        }
      });
    });
    return list;
  }

  function subtotal() {
    return Math.round(
      items().reduce(function (sum, entry) {
        return sum + entry.lineTotal;
      }, 0) * 10
    ) / 10;
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

  function get(id) {
    return lookup(id);
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
