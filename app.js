/* ============================================================
 * 电脑售后工单管理系统
 * 纯前端实现 · localStorage 持久化 · 零依赖
 * ============================================================ */
(function () {
  'use strict';

  /* ================= 常量定义 ================= */
  var LS = {
    VERSION: 'asws_version',
    ORDERS: 'asws_orders',
    CUSTOMERS: 'asws_customers',
    PARTS: 'asws_parts',
    SETTINGS: 'asws_settings'
  };
  var DATA_VERSION = 1;

  var STATUS = {
    pending:       { label: '待受理',  cls: 'st-pending',       color: '#8a96a9' },
    accepted:      { label: '已受理',  cls: 'st-accepted',      color: '#2f6fed' },
    repairing:     { label: '维修中',  cls: 'st-repairing',     color: '#e8890c' },
    waiting_parts: { label: '待配件',  cls: 'st-waiting_parts', color: '#7c3aed' },
    qc:            { label: '待质检',  cls: 'st-qc',            color: '#0d9488' },
    finished:      { label: '已完成',  cls: 'st-finished',      color: '#2fa84f' },
    closed:        { label: '已取机',  cls: 'st-closed',        color: '#45526b' },
    cancelled:     { label: '已取消',  cls: 'st-cancelled',     color: '#e5484d' }
  };
  var TERMINAL = ['closed', 'cancelled'];

  /* 状态机：当前状态 → 允许流转的目标状态 */
  var STATUS_FLOW = {
    pending:       ['accepted', 'cancelled'],
    accepted:      ['repairing', 'cancelled'],
    repairing:     ['waiting_parts', 'qc', 'cancelled'],
    waiting_parts: ['repairing', 'cancelled'],
    qc:            ['repairing', 'finished'],
    finished:      ['closed'],
    closed:        [],
    cancelled:     []
  };
  /* 流转按钮文案：from->to */
  var FLOW_LABEL = {
    'pending->accepted': '受理工单',
    'pending->cancelled': '取消工单',
    'accepted->repairing': '开始维修',
    'accepted->cancelled': '取消工单',
    'repairing->waiting_parts': '等待配件',
    'repairing->qc': '送质检',
    'repairing->cancelled': '取消工单',
    'waiting_parts->repairing': '配件到货，继续维修',
    'waiting_parts->cancelled': '取消工单',
    'qc->repairing': '质检不通过，返修',
    'qc->finished': '质检通过，完成',
    'finished->closed': '客户取机，关闭'
  };

  var PRIORITY = {
    low:    { label: '低',  cls: 'pr-low' },
    medium: { label: '中',  cls: 'pr-medium' },
    high:   { label: '高',  cls: 'pr-high' },
    urgent: { label: '紧急', cls: 'pr-urgent' }
  };
  var FAULT_CATEGORY = {
    hardware:   { label: '硬件故障' },
    software:   { label: '软件故障' },
    peripheral: { label: '外设故障' },
    network:    { label: '网络故障' },
    other:      { label: '其他' }
  };
  var SERVICE_TYPE = {
    warranty_free: { label: '保内免费' },
    paid:          { label: '保外收费' },
    upgrade:       { label: '升级服务' }
  };
  var WARRANTY = {
    in:      { label: '保内', cls: 'ws-in' },
    expired: { label: '过保', cls: 'ws-expired' },
    out:     { label: '保外', cls: 'ws-out' }
  };

  var PAGE_TITLES = {
    dashboard: '仪表盘',
    orders: '工单管理',
    orderDetail: '工单详情',
    customers: '客户管理',
    parts: '配件库存',
    settings: '设置'
  };

  /* ================= 工具函数 ================= */
  function uuid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayCompact() {
    var d = new Date();
    return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }
  function fmtDate(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (isNaN(d)) return String(ts).slice(0, 10);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDateTime(ts) {
    if (!ts) return '-';
    var d = new Date(ts);
    if (isNaN(d)) return '-';
    return fmtDate(ts) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function fmtMoney(n) {
    return '¥' + Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function byId(id) { return document.getElementById(id); }
  function nowISO() { return new Date().toISOString(); }

  /* ================= 数据层 Store（云端 REST API） ================= */
  var API = '/api';
  var Store = {
    state: { orders: [], customers: [], parts: [], settings: {} },
    _saveTimer: null,

    _defaultState: function () {
      return {
        orders: [], customers: [], parts: [],
        settings: {
          dailySeqDate: '', dailySeq: 0,
          shopName: '极速电脑维修中心',
          warrantyDefaultMonths: 24,
          inited: false, lastExportAt: ''
        }
      };
    },

    init: async function () {
      try {
        var res = await fetch(API + '/state');
        if (res.ok) {
          var data = await res.json();
          if (data && Array.isArray(data.orders)) {
            this.state = data;
            return true;
          }
        }
      } catch (e) { /* 后端无数据时落到默认值 */ }
      this.state = this._defaultState();
      this.saveAll();
      return false;
    },
    load: function () { /* 向后兼容空实现，数据已由 init 从云端加载 */ },

    saveAll: function () {
      var self = this;
      if (self._saveTimer) clearTimeout(self._saveTimer);
      self._saveTimer = setTimeout(function () {
        fetch(API + '/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(self.state)
        }).catch(function (e) { toast('云端保存失败：' + e.message, 'error'); });
      }, 150);
    },
    save: function () { this.saveAll(); },

    _req: function (url, method, body) {
      var opt = { method: method, headers: { 'Content-Type': 'application/json' } };
      if (body !== undefined) opt.body = JSON.stringify(body);
      return fetch(API + url, opt).catch(function (e) {
        toast('网络错误：' + e.message, 'error'); throw e;
      });
    },

    /* 工单 */
    getOrder: function (id) {
      return this.state.orders.find(function (o) { return o.id === id; });
    },
    addOrder: function (o) { this.state.orders.unshift(o); this._req('/orders', 'POST', o); },
    updateOrder: function (o) {
      var i = this.state.orders.findIndex(function (x) { return x.id === o.id; });
      if (i >= 0) { this.state.orders[i] = o; this._req('/orders/' + o.id, 'PUT', o); }
    },
    deleteOrder: function (id) {
      this.state.orders = this.state.orders.filter(function (o) { return o.id !== id; });
      this._req('/orders/' + id, 'DELETE');
    },

    /* 客户 */
    getCustomer: function (id) {
      return this.state.customers.find(function (c) { return c.id === id; });
    },
    findCustomerByPhone: function (phone) {
      return this.state.customers.find(function (c) { return c.phone === phone; });
    },
    addCustomer: function (c) { this.state.customers.unshift(c); this._req('/customers', 'POST', c); },
    updateCustomer: function (c) {
      var i = this.state.customers.findIndex(function (x) { return x.id === c.id; });
      if (i >= 0) { this.state.customers[i] = c; this._req('/customers/' + c.id, 'PUT', c); }
    },
    deleteCustomer: function (id) {
      this.state.customers = this.state.customers.filter(function (c) { return c.id !== id; });
      this._req('/customers/' + id, 'DELETE');
    },

    /* 配件 */
    getPart: function (id) {
      return this.state.parts.find(function (p) { return p.id === id; });
    },
    addPart: function (p) { this.state.parts.unshift(p); this._req('/parts', 'POST', p); },
    updatePart: function (p) {
      var i = this.state.parts.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) { this.state.parts[i] = p; this._req('/parts/' + p.id, 'PUT', p); }
    },
    deletePart: function (id) {
      this.state.parts = this.state.parts.filter(function (p) { return p.id !== id; });
      this._req('/parts/' + id, 'DELETE');
    },
    adjustStock: function (partId, delta) {
      var p = this.getPart(partId);
      if (p) {
        p.stock = Math.max(0, Number(p.stock || 0) + delta);
        p.updatedAt = nowISO();
        this._req('/parts/' + partId + '/stock', 'PUT', { delta: delta });
      }
    }
  };

  /* ================= Toast ================= */
  function toast(msg, type) {
    type = type || 'success';
    var root = byId('toast-root');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  }

  /* ================= 模态框 ================= */
  var Modal = {
    _onMask: null,
    open: function (opts) {
      var html =
        '<div class="modal-mask" id="modal-mask">' +
          '<div class="modal' + (opts.wide ? ' modal-lg' : '') + '">' +
            '<div class="modal-header"><h3>' + esc(opts.title) + '</h3>' +
              '<button class="modal-close" id="modal-x">&times;</button></div>' +
            '<div class="modal-body">' + opts.body + '</div>' +
            (opts.footer ? '<div class="modal-footer">' + opts.footer + '</div>' : '') +
          '</div>' +
        '</div>';
      byId('modal-root').innerHTML = html;
      byId('modal-x').onclick = function () {
        if (Modal._onMask) Modal._onMask();
        Modal.close();
      };
      byId('modal-mask').addEventListener('mousedown', function (e) {
        if (e.target === this) {
          if (Modal._onMask) Modal._onMask();
          Modal.close();
        }
      });
      Modal._onMask = null;
    },
    close: function () {
      byId('modal-root').innerHTML = '';
    }
  };

  /* 通用确认对话框，返回 Promise<boolean> */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      Modal._onMask = function () { finish(false); };
      Modal.open({
        title: opts.title || '确认操作',
        body: '<p style="line-height:1.8">' + opts.message + '</p>' + (opts.extra || ''),
        footer:
          '<button class="btn btn-outline" id="cf-cancel">取消</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" id="cf-ok">' + esc(opts.okText || '确定') + '</button>'
      });
      byId('cf-cancel').onclick = function () { Modal.close(); finish(false); };
      byId('cf-ok').onclick = function () {
        if (opts.validate && !opts.validate()) return; // 校验不通过则不关闭
        Modal.close(); finish(true);
      };
    });
  }

  /* ================= 业务逻辑 ================= */

  /* 生成工单号：WO + YYYYMMDD + '-' + 三位序号（每日重置） */
  function nextOrderNo() {
    var s = Store.state.settings;
    var t = todayCompact();
    if (s.dailySeqDate !== t) { s.dailySeqDate = t; s.dailySeq = 0; }
    s.dailySeq = (s.dailySeq || 0) + 1;
    Store.save();
    return 'WO' + t + '-' + String(s.dailySeq).padStart(3, '0');
  }

  /* 保修自动判定：购买日期 + 保修月数 >= 今天 → 保内，否则过保 */
  function calcWarranty(purchaseDate, months) {
    if (!purchaseDate) return null;
    var p = new Date(purchaseDate);
    if (isNaN(p)) return null;
    p.setMonth(p.getMonth() + (Number(months) || 0));
    var today = new Date(todayStr());
    return p >= today ? 'in' : 'expired';
  }

  /* 费用计算：保内免费合计为 0（成本仍记录） */
  function calcCosts(order) {
    var partsCost = (order.partsUsed || []).reduce(function (s, p) {
      return s + (Number(p.qty) || 0) * (Number(p.unitPrice) || 0);
    }, 0);
    order.partsCost = partsCost;
    if (order.serviceType === 'warranty_free') {
      order.totalCost = 0;
    } else {
      order.totalCost = partsCost + (Number(order.laborCost) || 0);
    }
  }

  /* 配件库存 diff：oldArr/newArr 为 partsUsed 数组。
   * 返回 { ok:true } 或 { ok:false, msg }；成功时已应用库存变更。 */
  function applyPartsDelta(oldArr, newArr) {
    var map = {}; // partId -> delta(正=需扣减)
    (oldArr || []).forEach(function (p) {
      map[p.partId] = (map[p.partId] || 0) - (Number(p.qty) || 0);
    });
    (newArr || []).forEach(function (p) {
      map[p.partId] = (map[p.partId] || 0) + (Number(p.qty) || 0);
    });
    // 先校验
    var partId, delta, part;
    for (partId in map) {
      delta = map[partId];
      if (delta > 0) {
        part = Store.getPart(partId);
        if (!part) return { ok: false, msg: '所选配件不存在，请刷新后重试' };
        if (Number(part.stock) < delta) {
          return { ok: false, msg: '配件「' + part.name + '」库存不足：需要 ' + delta + '，仅剩 ' + part.stock };
        }
      }
    }
    // 再应用（delta>0 扣减，delta<0 回补）
    for (partId in map) {
      delta = map[partId];
      if (delta !== 0) Store.adjustStock(partId, -delta);
    }
    Store.save();
    return { ok: true };
  }

  /* 回补工单全部配件（取消/删除时调用） */
  function restoreParts(order) {
    (order.partsUsed || []).forEach(function (p) {
      Store.adjustStock(p.partId, Number(p.qty) || 0);
    });
    Store.save();
  }

  /* ================= 徽章与选项辅助 ================= */
  function statusBadge(s) {
    var m = STATUS[s] || { label: s, cls: '' };
    return '<span class="badge ' + m.cls + '">' + m.label + '</span>';
  }
  function priorityBadge(p) {
    var m = PRIORITY[p] || { label: p, cls: '' };
    return '<span class="badge ' + m.cls + '">' + m.label + '</span>';
  }
  function warrantyBadge(w) {
    var m = WARRANTY[w] || { label: w || '-', cls: '' };
    return '<span class="badge ' + m.cls + '">' + m.label + '</span>';
  }
  function options(map, selected, withEmpty) {
    var h = withEmpty ? '<option value="">全部</option>' : '';
    Object.keys(map).forEach(function (k) {
      h += '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + map[k].label + '</option>';
    });
    return h;
  }

  /* ================= 仪表盘 ================= */
  function renderDashboard() {
    var orders = Store.state.orders;
    var today = todayStr();
    var monthPrefix = today.slice(0, 7);

    var todayNew = orders.filter(function (o) { return fmtDate(o.createdAt) === today; }).length;
    var active = orders.filter(function (o) { return TERMINAL.indexOf(o.status) < 0; }).length;
    var monthOrders = orders.filter(function (o) { return fmtDate(o.createdAt).slice(0, 7) === monthPrefix; });
    var monthRevenue = orders
      .filter(function (o) { return o.closedAt && fmtDate(o.closedAt).slice(0, 7) === monthPrefix; })
      .reduce(function (s, o) { return s + (Number(o.totalCost) || 0); }, 0);

    /* 状态分布 */
    var dist = {};
    Object.keys(STATUS).forEach(function (k) { dist[k] = 0; });
    orders.forEach(function (o) { if (dist[o.status] !== undefined) dist[o.status]++; });
    var maxDist = Math.max(1, Math.max.apply(null, Object.keys(dist).map(function (k) { return dist[k]; })));
    var barHTML = Object.keys(STATUS).map(function (k) {
      var pct = Math.round(dist[k] / maxDist * 100);
      return '<div class="bar-row">' +
        '<span class="bar-label">' + STATUS[k].label + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + STATUS[k].color + '"></div></div>' +
        '<span class="bar-count">' + dist[k] + '</span></div>';
    }).join('');

    /* 紧急/高优先级未关闭提醒 */
    var prWeight = { urgent: 0, high: 1 };
    var alerts = orders
      .filter(function (o) { return TERMINAL.indexOf(o.status) < 0 && (o.priority === 'urgent' || o.priority === 'high'); })
      .sort(function (a, b) { return prWeight[a.priority] - prWeight[b.priority]; })
      .slice(0, 6);
    var alertHTML = alerts.length ? alerts.map(function (o) {
      return '<tr class="clickable' + (o.priority === 'urgent' ? ' row-urgent' : '') + '" data-id="' + o.id + '">' +
        '<td class="num">' + esc(o.orderNo) + '</td>' +
        '<td>' + esc(o.customerName) + '</td>' +
        '<td>' + esc(o.deviceBrand) + ' ' + esc(o.deviceModel) + '</td>' +
        '<td>' + priorityBadge(o.priority) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td>' + fmtDate(o.createdAt) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="empty">暂无紧急工单</td></tr>';

    /* 最近工单 */
    var recent = orders.slice(0, 6).map(function (o) {
      return '<tr class="clickable" data-id="' + o.id + '">' +
        '<td class="num">' + esc(o.orderNo) + '</td>' +
        '<td>' + esc(o.customerName) + '</td>' +
        '<td>' + esc(o.deviceBrand) + ' ' + esc(o.deviceModel) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="num">' + fmtMoney(o.totalCost) + '</td>' +
        '<td>' + fmtDateTime(o.createdAt) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">暂无工单，点击右上角「新建工单」开始</td></tr>';

    byId('view').innerHTML =
      '<div class="stat-grid">' +
        '<div class="stat-card accent-blue"><span class="label">今日新建工单</span><span class="value">' + todayNew + '</span><span class="sub">' + today + '</span></div>' +
        '<div class="stat-card accent-orange"><span class="label">进行中工单</span><span class="value">' + active + '</span><span class="sub">未关闭 / 未取消</span></div>' +
        '<div class="stat-card"><span class="label">本月工单量</span><span class="value">' + monthOrders.length + '</span><span class="sub">' + monthPrefix + '</span></div>' +
        '<div class="stat-card accent-green"><span class="label">本月营收（已关闭）</span><span class="value">' + fmtMoney(monthRevenue) + '</span><span class="sub">保内免费工单不计入</span></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">工单状态分布</div>' + barHTML + '</div>' +
      '<div class="card"><div class="card-title">紧急 / 高优先级提醒</div>' +
        '<div class="table-wrap"><table><thead><tr><th>工单号</th><th>客户</th><th>设备</th><th>优先级</th><th>状态</th><th>创建日期</th></tr></thead>' +
        '<tbody id="alert-tbody">' + alertHTML + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-title">最近工单</div>' +
        '<div class="table-wrap"><table><thead><tr><th>工单号</th><th>客户</th><th>设备</th><th>状态</th><th>费用</th><th>创建时间</th></tr></thead>' +
        '<tbody id="recent-tbody">' + recent + '</tbody></table></div></div>';

    bindRowNav('alert-tbody');
    bindRowNav('recent-tbody');
  }

  function bindRowNav(tbodyId) {
    var tb = byId(tbodyId);
    if (!tb) return;
    tb.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) location.hash = '#/orders/' + tr.dataset.id;
    });
  }

  /* ================= 工单列表 ================= */
  var orderFilter = {};
  try { orderFilter = JSON.parse(sessionStorage.getItem('asws_order_filter') || '{}'); } catch (e) { orderFilter = {}; }

  function saveFilter() {
    sessionStorage.setItem('asws_order_filter', JSON.stringify(orderFilter));
  }

  function filteredOrders() {
    var list = Store.state.orders.slice();
    var q = (orderFilter.q || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (o) {
        return (o.orderNo || '').toLowerCase().indexOf(q) >= 0 ||
               (o.customerName || '').toLowerCase().indexOf(q) >= 0 ||
               (o.phone || '').toLowerCase().indexOf(q) >= 0 ||
               (o.deviceBrand || '').toLowerCase().indexOf(q) >= 0 ||
               (o.deviceModel || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    if (orderFilter.status) list = list.filter(function (o) { return o.status === orderFilter.status; });
    if (orderFilter.priority) list = list.filter(function (o) { return o.priority === orderFilter.priority; });
    if (orderFilter.dateFrom) list = list.filter(function (o) { return fmtDate(o.createdAt) >= orderFilter.dateFrom; });
    if (orderFilter.dateTo) list = list.filter(function (o) { return fmtDate(o.createdAt) <= orderFilter.dateTo; });
    /* 紧急置顶，其余按创建时间倒序 */
    list.sort(function (a, b) {
      var au = a.priority === 'urgent' && TERMINAL.indexOf(a.status) < 0 ? 0 : 1;
      var bu = b.priority === 'urgent' && TERMINAL.indexOf(b.status) < 0 ? 0 : 1;
      if (au !== bu) return au - bu;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return list;
  }

  function renderOrders() {
    byId('view').innerHTML =
      '<div class="card">' +
        '<div class="filter-bar">' +
          '<input type="search" id="f-q" placeholder="搜索工单号 / 客户 / 电话 / 品牌 / 型号" value="' + esc(orderFilter.q || '') + '">' +
          '<select id="f-status">' + options(STATUS, orderFilter.status || '', true) + '</select>' +
          '<select id="f-priority">' + options(PRIORITY, orderFilter.priority || '', true) + '</select>' +
          '<input type="date" id="f-from" value="' + esc(orderFilter.dateFrom || '') + '" title="创建日期起">' +
          '<input type="date" id="f-to" value="' + esc(orderFilter.dateTo || '') + '" title="创建日期止">' +
          '<button class="btn btn-outline btn-sm" id="f-reset">重置</button>' +
          '<span class="filter-spacer"></span>' +
          '<button class="btn btn-outline btn-sm" id="f-csv">导出 CSV</button>' +
          '<button class="btn btn-primary btn-sm" id="f-new">+ 新建工单</button>' +
        '</div>' +
        '<div id="orders-table-wrap"></div>' +
      '</div>';
    renderOrdersTable();

    byId('f-q').addEventListener('input', debounce(function () {
      orderFilter.q = this.value; saveFilter(); renderOrdersTable();
    }, 200));
    byId('f-status').addEventListener('change', function () {
      orderFilter.status = this.value; saveFilter(); renderOrdersTable();
    });
    byId('f-priority').addEventListener('change', function () {
      orderFilter.priority = this.value; saveFilter(); renderOrdersTable();
    });
    byId('f-from').addEventListener('change', function () {
      orderFilter.dateFrom = this.value; saveFilter(); renderOrdersTable();
    });
    byId('f-to').addEventListener('change', function () {
      orderFilter.dateTo = this.value; saveFilter(); renderOrdersTable();
    });
    byId('f-reset').addEventListener('click', function () {
      orderFilter = {}; saveFilter(); renderOrders();
    });
    byId('f-csv').addEventListener('click', exportCSV);
    byId('f-new').addEventListener('click', function () { openOrderModal(); });
  }

  function renderOrdersTable() {
    var list = filteredOrders();
    var rows = list.map(function (o) {
      var urgent = o.priority === 'urgent' && TERMINAL.indexOf(o.status) < 0;
      return '<tr class="clickable' + (urgent ? ' row-urgent' : '') + '" data-id="' + o.id + '">' +
        '<td class="num">' + esc(o.orderNo) + '</td>' +
        '<td>' + esc(o.customerName) + '</td>' +
        '<td class="num">' + esc(o.phone) + '</td>' +
        '<td>' + esc(o.deviceBrand) + ' ' + esc(o.deviceModel) + '</td>' +
        '<td>' + esc((FAULT_CATEGORY[o.faultCategory] || {}).label || '-') + '</td>' +
        '<td>' + priorityBadge(o.priority) + '</td>' +
        '<td>' + warrantyBadge(o.warrantyStatus) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="num">' + fmtMoney(o.totalCost) + '</td>' +
        '<td>' + fmtDateTime(o.createdAt) + '</td></tr>';
    }).join('');
    var html =
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>工单号</th><th>客户</th><th>电话</th><th>设备</th><th>故障分类</th>' +
        '<th>优先级</th><th>保修</th><th>状态</th><th>费用</th><th>创建时间</th>' +
      '</tr></thead><tbody id="orders-tbody">' +
        (rows || '<tr><td colspan="10" class="empty">没有符合条件的工单</td></tr>') +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;font-size:13px;color:var(--text-3)">共 ' + list.length + ' 条记录</div>';
    byId('orders-table-wrap').innerHTML = html;
    bindRowNav('orders-tbody');
  }

  /* ================= 工单详情 ================= */
  function renderOrderDetail(id) {
    var o = Store.getOrder(id);
    if (!o) {
      byId('view').innerHTML = '<div class="card empty">工单不存在或已删除<br><br><a href="#/orders" style="color:var(--primary)">返回工单列表</a></div>';
      return;
    }

    /* 状态推进按钮 */
    var flowBtns = (STATUS_FLOW[o.status] || []).map(function (to) {
      var danger = to === 'cancelled';
      var success = to === 'finished' || to === 'closed';
      return '<button class="btn ' + (danger ? 'btn-danger' : success ? 'btn-success' : 'btn-primary') + ' btn-sm flow-btn" data-to="' + to + '">' +
        esc(FLOW_LABEL[o.status + '->' + to] || STATUS[to].label) + '</button>';
    }).join('');

    /* 配件明细行 */
    var partRows = (o.partsUsed || []).map(function (p) {
      return '<tr><td>' + esc(p.name) + '</td><td class="num">' + p.qty + '</td>' +
        '<td class="num">' + fmtMoney(p.unitPrice) + '</td>' +
        '<td class="num">' + fmtMoney(p.qty * p.unitPrice) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="empty" style="padding:16px">未使用配件</td></tr>';

    /* 状态历史时间线（倒序） */
    var timeline = (o.statusHistory || []).slice().reverse().map(function (h) {
      var fromTxt = h.from ? STATUS[h.from].label + ' → ' : '';
      return '<div class="timeline-item">' +
        '<div class="t-status">' + fromTxt + STATUS[h.to].label + '</div>' +
        '<div class="t-time">' + fmtDateTime(h.at) + '</div>' +
        (h.note ? '<div class="t-note">' + esc(h.note) + '</div>' : '') +
      '</div>';
    }).join('') || '<div class="empty" style="padding:16px">暂无记录</div>';

    var isFree = o.serviceType === 'warranty_free';

    byId('view').innerHTML =
      '<div class="detail-header">' +
        '<span class="back" id="btn-back">← 返回</span>' +
        '<h2>' + esc(o.orderNo) + '</h2>' + statusBadge(o.status) + priorityBadge(o.priority) +
        '<span class="spacer"></span>' +
        '<div class="actions">' + flowBtns +
          '<button class="btn btn-outline btn-sm" id="btn-edit">编辑</button>' +
          '<button class="btn btn-outline btn-sm" id="btn-print">打印维修单</button>' +
          '<button class="btn btn-danger btn-sm" id="btn-del">删除</button>' +
        '</div>' +
      '</div>' +
      '<div class="info-grid">' +
        '<div class="info-card"><h4>客户信息</h4>' +
          '<div class="kv"><span class="k">姓名</span><span class="v">' + esc(o.customerName) + '</span></div>' +
          '<div class="kv"><span class="k">电话</span><span class="v num">' + esc(o.phone) + '</span></div>' +
          '<div class="kv"><span class="k">地址</span><span class="v">' + esc(o.address || '-') + '</span></div>' +
        '</div>' +
        '<div class="info-card"><h4>设备信息</h4>' +
          '<div class="kv"><span class="k">品牌</span><span class="v">' + esc(o.deviceBrand) + '</span></div>' +
          '<div class="kv"><span class="k">型号</span><span class="v">' + esc(o.deviceModel || '-') + '</span></div>' +
          '<div class="kv"><span class="k">序列号</span><span class="v num">' + esc(o.serialNo || '-') + '</span></div>' +
          '<div class="kv"><span class="k">购买日期</span><span class="v">' + esc(o.purchaseDate || '-') + '</span></div>' +
          '<div class="kv"><span class="k">保修状态</span><span class="v">' + warrantyBadge(o.warrantyStatus) + ' <span style="color:var(--text-3);font-size:12px">(' + (o.warrantyMonths || 0) + ' 个月)</span></span></div>' +
        '</div>' +
        '<div class="info-card"><h4>故障信息</h4>' +
          '<div class="kv"><span class="k">故障分类</span><span class="v">' + esc((FAULT_CATEGORY[o.faultCategory] || {}).label || '-') + '</span></div>' +
          '<div class="kv"><span class="k">维修类型</span><span class="v">' + esc((SERVICE_TYPE[o.serviceType] || {}).label || '-') + '</span></div>' +
          '<div class="kv"><span class="k">故障描述</span><span class="v">' + esc(o.faultDesc || '-') + '</span></div>' +
          (o.remark ? '<div class="kv"><span class="k">备注</span><span class="v">' + esc(o.remark) + '</span></div>' : '') +
        '</div>' +
        '<div class="info-card"><h4>维修记录</h4>' +
          '<div class="kv"><span class="k">故障诊断</span><span class="v">' + esc(o.diagnosis || '待填写') + '</span></div>' +
          '<div class="kv"><span class="k">维修措施</span><span class="v">' + esc(o.repairActions || '待填写') + '</span></div>' +
          '<div class="kv"><span class="k">创建时间</span><span class="v">' + fmtDateTime(o.createdAt) + '</span></div>' +
          '<div class="kv"><span class="k">最近更新</span><span class="v">' + fmtDateTime(o.updatedAt) + '</span></div>' +
          (o.closedAt ? '<div class="kv"><span class="k">关闭时间</span><span class="v">' + fmtDateTime(o.closedAt) + '</span></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">费用明细</div>' +
        '<div class="table-wrap"><table><thead><tr><th>配件名称</th><th>数量</th><th>单价</th><th>小计</th></tr></thead>' +
        '<tbody>' + partRows + '</tbody></table></div>' +
        '<div class="cost-total">' +
          '<div class="row"><span>配件费</span><strong class="num">' + fmtMoney(o.partsCost) + '</strong></div>' +
          '<div class="row"><span>人工费</span><strong class="num">' + fmtMoney(o.laborCost) + '</strong></div>' +
          '<div class="row"><span>应收合计</span><span class="grand">' + fmtMoney(o.totalCost) + '</span></div>' +
          (isFree ? '<div class="row"><span class="cost-free">保内免费</span></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">状态历史</div><div class="timeline">' + timeline + '</div></div>';

    byId('btn-back').onclick = function () { location.hash = '#/orders'; };
    byId('btn-edit').onclick = function () { openOrderModal(o.id); };
    byId('btn-print').onclick = function () { printOrder(o); };
    byId('btn-del').onclick = function () { deleteOrderFlow(o); };
    Array.prototype.forEach.call(document.querySelectorAll('.flow-btn'), function (btn) {
      btn.onclick = function () { openStatusModal(o, btn.dataset.to); };
    });
  }

  /* ================= 工单新建 / 编辑模态 ================= */
  function partSelectOptions(selectedId) {
    var h = '<option value="">选择配件…</option>';
    Store.state.parts.forEach(function (p) {
      h += '<option value="' + p.id + '" data-price="' + p.unitPrice + '" data-stock="' + p.stock + '"' +
        (p.id === selectedId ? ' selected' : '') + '>' +
        esc(p.name) + '（库存 ' + p.stock + '）</option>';
    });
    return h;
  }

  function openOrderModal(orderId) {
    var isEdit = !!orderId;
    var o = isEdit ? Store.getOrder(orderId) : null;
    var d = o || {
      customerName: '', phone: '', address: '',
      deviceBrand: '', deviceModel: '', serialNo: '',
      purchaseDate: '', warrantyMonths: Store.state.settings.warrantyDefaultMonths || 24,
      warrantyStatus: '', faultDesc: '', faultCategory: 'hardware',
      priority: 'medium', serviceType: 'paid', diagnosis: '', repairActions: '',
      partsUsed: [], laborCost: 0, remark: ''
    };
    /* 编辑中配件副本 */
    var modalParts = (d.partsUsed || []).map(function (p) {
      return { partId: p.partId, qty: p.qty, unitPrice: p.unitPrice };
    });

    var body =
      '<div class="form-grid">' +
        '<div class="form-section">客户信息</div>' +
        '<div class="form-item"><label>客户姓名<span class="req">*</span></label><input id="mo-name" value="' + esc(d.customerName) + '" placeholder="客户姓名"></div>' +
        '<div class="form-item"><label>联系电话<span class="req">*</span></label><input id="mo-phone" value="' + esc(d.phone) + '" placeholder="11 位手机号"><div class="hint" id="mo-phone-hint"></div></div>' +
        '<div class="form-item full"><label>地址</label><input id="mo-address" value="' + esc(d.address || '') + '" placeholder="送修 / 取机地址"></div>' +

        '<div class="form-section">设备与保修</div>' +
        '<div class="form-item"><label>设备品牌<span class="req">*</span></label><input id="mo-brand" value="' + esc(d.deviceBrand) + '" placeholder="如：联想 / 华硕 / 苹果"></div>' +
        '<div class="form-item"><label>设备型号</label><input id="mo-model" value="' + esc(d.deviceModel || '') + '" placeholder="如：小新 Pro 14"></div>' +
        '<div class="form-item"><label>序列号 SN</label><input id="mo-sn" value="' + esc(d.serialNo || '') + '" placeholder="设备序列号"></div>' +
        '<div class="form-item"><label>购买日期</label><input type="date" id="mo-pdate" value="' + esc(d.purchaseDate || '') + '"></div>' +
        '<div class="form-item"><label>保修时长（月）</label><input type="number" id="mo-wmonths" min="0" value="' + (d.warrantyMonths || 24) + '"></div>' +
        '<div class="form-item"><label>保修状态</label><select id="mo-wstatus">' +
          '<option value="in"' + (d.warrantyStatus === 'in' ? ' selected' : '') + '>保内</option>' +
          '<option value="expired"' + (d.warrantyStatus === 'expired' ? ' selected' : '') + '>过保</option>' +
          '<option value="out"' + (d.warrantyStatus === 'out' ? ' selected' : '') + '>保外（人为/无凭证）</option>' +
        '</select><div class="hint" id="mo-whint"></div></div>' +

        '<div class="form-section">故障与服务</div>' +
        '<div class="form-item"><label>故障分类</label><select id="mo-fcat">' + options(FAULT_CATEGORY, d.faultCategory) + '</select></div>' +
        '<div class="form-item"><label>优先级</label><select id="mo-priority">' + options(PRIORITY, d.priority) + '</select></div>' +
        '<div class="form-item"><label>维修类型</label><select id="mo-stype">' + options(SERVICE_TYPE, d.serviceType) + '</select><div class="hint">保内免费时应收合计为 0</div></div>' +
        '<div class="form-item full"><label>故障描述<span class="req">*</span></label><textarea id="mo-fdesc" placeholder="客户描述的故障现象">' + esc(d.faultDesc) + '</textarea></div>' +
        '<div class="form-item full"><label>故障诊断</label><textarea id="mo-diag" placeholder="工程师检测结果（可稍后补充）">' + esc(d.diagnosis || '') + '</textarea></div>' +
        '<div class="form-item full"><label>维修措施</label><textarea id="mo-actions" placeholder="维修过程与处理措施（可稍后补充）">' + esc(d.repairActions || '') + '</textarea></div>' +

        '<div class="form-section">配件使用</div>' +
        '<div class="form-item full">' +
          '<table class="parts-table"><thead><tr><th>配件</th><th style="width:76px">数量</th><th style="width:110px">单价</th><th style="width:96px">小计</th><th style="width:44px"></th></tr></thead>' +
          '<tbody id="mo-parts-tbody"></tbody></table>' +
          '<button class="btn btn-outline btn-sm" id="mo-add-part" style="margin-top:8px">+ 添加配件</button>' +
          '<div class="hint warn" id="mo-parts-hint"></div>' +
        '</div>' +

        '<div class="form-section">费用与备注</div>' +
        '<div class="form-item"><label>人工费（元）</label><input type="number" id="mo-labor" min="0" step="0.01" value="' + (d.laborCost || 0) + '"></div>' +
        '<div class="form-item"><label>费用预览</label><div style="padding-top:8px" id="mo-cost-preview"></div></div>' +
        '<div class="form-item full"><label>备注</label><input id="mo-remark" value="' + esc(d.remark || '') + '" placeholder="其他补充信息"></div>' +
      '</div>';

    Modal.open({
      title: isEdit ? '编辑工单 ' + d.orderNo : '新建工单',
      wide: true,
      body: body,
      footer:
        '<button class="btn btn-outline" id="mo-cancel">取消</button>' +
        '<button class="btn btn-primary" id="mo-save">' + (isEdit ? '保存修改' : '创建工单') + '</button>'
    });

    /* ---- 配件行动态渲染 ---- */
    function renderPartRows() {
      var tb = byId('mo-parts-tbody');
      tb.innerHTML = modalParts.map(function (p, i) {
        return '<tr data-i="' + i + '">' +
          '<td><select class="mp-part">' + partSelectOptions(p.partId) + '</select></td>' +
          '<td><input type="number" class="mp-qty" min="1" value="' + p.qty + '"></td>' +
          '<td><input type="number" class="mp-price" min="0" step="0.01" value="' + p.unitPrice + '"></td>' +
          '<td class="num mp-sub">' + fmtMoney(p.qty * p.unitPrice) + '</td>' +
          '<td><button class="link-btn danger mp-del" title="删除行">✕</button></td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="5" style="color:var(--text-3);padding:10px;text-align:center">未使用配件，点击下方按钮添加</td></tr>';
      updateCostPreview();
    }

    function syncPartsFromDOM() {
      var rows = byId('mo-parts-tbody').querySelectorAll('tr[data-i]');
      var next = [];
      rows.forEach(function (tr) {
        var i = Number(tr.dataset.i);
        var sel = tr.querySelector('.mp-part');
        var qty = Number(tr.querySelector('.mp-qty').value) || 0;
        var price = Number(tr.querySelector('.mp-price').value) || 0;
        if (sel.value && qty > 0) {
          next.push({ partId: sel.value, qty: qty, unitPrice: price, _i: i });
        }
      });
      /* 保留原索引映射回 modalParts */
      modalParts = next.map(function (p) { return { partId: p.partId, qty: p.qty, unitPrice: p.unitPrice }; });
    }

    byId('mo-parts-tbody').addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      var i = Number(tr.dataset.i);
      if (e.target.classList.contains('mp-part')) {
        var opt = e.target.selectedOptions[0];
        modalParts[i].partId = e.target.value;
        if (opt && opt.dataset.price !== undefined) modalParts[i].unitPrice = Number(opt.dataset.price) || 0;
      } else if (e.target.classList.contains('mp-qty')) {
        modalParts[i].qty = Math.max(1, Number(e.target.value) || 1);
      } else if (e.target.classList.contains('mp-price')) {
        modalParts[i].unitPrice = Math.max(0, Number(e.target.value) || 0);
      }
      renderPartRows();
    });
    byId('mo-parts-tbody').addEventListener('click', function (e) {
      if (!e.target.classList.contains('mp-del')) return;
      var tr = e.target.closest('tr[data-i]');
      if (tr) { modalParts.splice(Number(tr.dataset.i), 1); renderPartRows(); }
    });
    byId('mo-add-part').addEventListener('click', function () {
      syncPartsFromDOM();
      modalParts.push({ partId: '', qty: 1, unitPrice: 0 });
      renderPartRows();
    });

    /* ---- 费用预览 ---- */
    function updateCostPreview() {
      var partsCost = modalParts.reduce(function (s, p) { return s + p.qty * p.unitPrice; }, 0);
      var labor = Number(byId('mo-labor').value) || 0;
      var free = byId('mo-stype').value === 'warranty_free';
      var total = free ? 0 : partsCost + labor;
      byId('mo-cost-preview').innerHTML =
        '配件 ' + fmtMoney(partsCost) + ' + 人工 ' + fmtMoney(labor) +
        ' = <strong style="color:var(--danger)">' + fmtMoney(total) + '</strong>' +
        (free ? ' <span class="cost-free">保内免费</span>' : '');
    }
    byId('mo-labor').addEventListener('input', updateCostPreview);
    byId('mo-stype').addEventListener('change', updateCostPreview);

    /* ---- 保修自动判定提示（force=true 时才联动修改下拉值，避免覆盖编辑时的手工选择） ---- */
    function updateWarrantyHint(force) {
      var pd = byId('mo-pdate').value;
      var months = Number(byId('mo-wmonths').value) || 0;
      var hint = byId('mo-whint');
      var auto = calcWarranty(pd, months);
      if (!auto) { hint.textContent = '填写购买日期后自动判定'; hint.className = 'hint'; return; }
      var txt = auto === 'in' ? '自动判定：保内' : '自动判定：已过保';
      hint.textContent = txt + '（可手动改为保外）';
      hint.className = 'hint ' + (auto === 'in' ? 'ok' : '');
      if (force) byId('mo-wstatus').value = auto;
    }
    byId('mo-pdate').addEventListener('change', function () { updateWarrantyHint(true); });
    byId('mo-wmonths').addEventListener('change', function () { updateWarrantyHint(true); });

    /* ---- 电话匹配老客户 ---- */
    byId('mo-phone').addEventListener('blur', function () {
      var phone = this.value.trim();
      if (!phone || isEdit) return;
      var c = Store.findCustomerByPhone(phone);
      var hint = byId('mo-phone-hint');
      if (c) {
        if (!byId('mo-name').value) byId('mo-name').value = c.name;
        if (!byId('mo-address').value) byId('mo-address').value = c.address || '';
        hint.textContent = '已匹配老客户：' + c.name;
        hint.className = 'hint ok';
      } else {
        hint.textContent = '';
      }
    });

    renderPartRows();
    updateWarrantyHint(!isEdit);

    byId('mo-cancel').onclick = function () { Modal.close(); };
    byId('mo-save').onclick = function () { saveOrder(); };

    function saveOrder() {
      var name = byId('mo-name').value.trim();
      var phone = byId('mo-phone').value.trim();
      var brand = byId('mo-brand').value.trim();
      var fdesc = byId('mo-fdesc').value.trim();
      if (!name) return toast('请填写客户姓名', 'error');
      if (!phone) return toast('请填写联系电话', 'error');
      if (!brand) return toast('请填写设备品牌', 'error');
      if (!fdesc) return toast('请填写故障描述', 'error');

      syncPartsFromDOM();
      /* 过滤未选配件的空行并校验 */
      var partsUsed = [];
      for (var i = 0; i < modalParts.length; i++) {
        var p = modalParts[i];
        if (!p.partId) continue;
        var part = Store.getPart(p.partId);
        if (!part) return toast('所选配件不存在', 'error');
        if (p.qty <= 0) return toast('配件数量必须大于 0', 'error');
        partsUsed.push({ partId: p.partId, name: part.name, qty: p.qty, unitPrice: p.unitPrice });
      }

      var oldParts = isEdit ? (o.partsUsed || []) : [];
      var check = applyPartsDelta(oldParts, partsUsed);
      if (!check.ok) {
        byId('mo-parts-hint').textContent = check.msg;
        return;
      }

      var now = nowISO();
      var order;
      if (isEdit) {
        order = o;
      } else {
        order = {
          id: uuid(),
          orderNo: nextOrderNo(),
          createdAt: now,
          status: 'pending',
          statusHistory: [{ from: null, to: 'pending', at: now, note: '创建工单' }],
          closedAt: null
        };
      }
      order.customerName = name;
      order.phone = phone;
      order.address = byId('mo-address').value.trim();
      order.deviceBrand = brand;
      order.deviceModel = byId('mo-model').value.trim();
      order.serialNo = byId('mo-sn').value.trim();
      order.purchaseDate = byId('mo-pdate').value;
      order.warrantyMonths = Number(byId('mo-wmonths').value) || 0;
      order.warrantyStatus = byId('mo-wstatus').value;
      order.faultCategory = byId('mo-fcat').value;
      order.priority = byId('mo-priority').value;
      order.serviceType = byId('mo-stype').value;
      order.faultDesc = fdesc;
      order.diagnosis = byId('mo-diag').value.trim();
      order.repairActions = byId('mo-actions').value.trim();
      order.laborCost = Number(byId('mo-labor').value) || 0;
      order.remark = byId('mo-remark').value.trim();
      order.partsUsed = partsUsed;
      calcCosts(order);
      order.updatedAt = now;

      /* 关联客户档案（新建或补全） */
      var cus = Store.findCustomerByPhone(phone);
      if (!cus) {
        cus = { id: uuid(), name: name, phone: phone, address: order.address, remark: '', createdAt: now };
        Store.addCustomer(cus);
      } else if (order.address && !cus.address) {
        cus.address = order.address;
        Store.updateCustomer(cus);
      }
      order.customerId = cus.id;

      if (isEdit) Store.updateOrder(order); else Store.addOrder(order);
      Modal.close();
      toast(isEdit ? '工单已保存' : '工单 ' + order.orderNo + ' 创建成功');
      renderRoute();
    }
  }

  /* ================= 状态推进模态 ================= */
  function openStatusModal(order, to) {
    var label = FLOW_LABEL[order.status + '->' + to] || STATUS[to].label;
    var isCancel = to === 'cancelled';
    var hasParts = (order.partsUsed || []).length > 0;

    var body =
      '<p style="margin-bottom:12px">' + statusBadge(order.status) +
      ' <span style="margin:0 6px;color:var(--text-3)">→</span> ' + statusBadge(to) + '</p>' +
      '<div class="form-item"><label>' + (isCancel ? '取消原因（必填）' : '备注说明') + '</label>' +
      '<textarea id="st-note" placeholder="' + (isCancel ? '请填写取消原因' : '可填写进度说明，便于追踪') + '"></textarea></div>';
    if (isCancel && hasParts) {
      body += '<div class="form-item"><label style="display:flex;align-items:center;gap:8px;font-weight:400">' +
        '<input type="checkbox" id="st-restore" checked style="width:auto"> 取消后回补已占用配件库存</label></div>';
    }
    if (to === 'closed') {
      body += '<p class="hint" style="margin-top:6px">确认客户已取走设备？关闭后工单进入终态。</p>';
    }
    if (to === 'finished') {
      body += '<p class="hint" style="margin-top:6px">确认质检通过？完成后将通知客户取机。</p>';
    }

    Modal.open({
      title: label,
      body: body,
      footer:
        '<button class="btn btn-outline" id="st-cancel">取消</button>' +
        '<button class="btn ' + (isCancel ? 'btn-danger' : 'btn-primary') + '" id="st-ok">确认' + (isCancel ? '取消工单' : '') + '</button>'
    });

    byId('st-cancel').onclick = function () { Modal.close(); };
    byId('st-ok').onclick = function () {
      var note = byId('st-note').value.trim();
      if (isCancel && !note) return toast('请填写取消原因', 'error');
      if (isCancel && hasParts && byId('st-restore') && byId('st-restore').checked) {
        restoreParts(order);
        order.partsUsed = [];
        calcCosts(order);
      }
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({ from: order.status, to: to, at: nowISO(), note: note });
      order.status = to;
      order.updatedAt = nowISO();
      if (to === 'closed') order.closedAt = nowISO();
      Store.updateOrder(order);
      Modal.close();
      toast('已' + label);
      renderRoute();
    };
  }

  /* ================= 删除工单 ================= */
  function deleteOrderFlow(order) {
    var hasParts = (order.partsUsed || []).length > 0;
    var restoreChecked = true; // 默认回补
    var extra = hasParts
      ? '<div class="form-item" style="margin-top:10px"><label style="display:flex;align-items:center;gap:8px;font-weight:400">' +
        '<input type="checkbox" id="del-restore" checked style="width:auto"> 回补该工单占用的配件库存</label></div>'
      : '';
    confirmDialog({
      title: '删除工单',
      message: '确定删除工单 <strong class="num">' + esc(order.orderNo) + '</strong> 吗？该操作不可恢复。',
      okText: '确认删除',
      danger: true,
      extra: extra,
      /* validate 在模态关闭前执行，此处读取复选框状态 */
      validate: function () {
        var cb = byId('del-restore');
        restoreChecked = cb ? cb.checked : false;
        return true;
      }
    }).then(function (ok) {
      if (!ok) return;
      if (hasParts && restoreChecked) restoreParts(order);
      Store.deleteOrder(order.id);
      toast('工单已删除');
      location.hash = '#/orders';
    });
  }

  /* ================= 客户管理 ================= */
  var customerQuery = '';

  function renderCustomers() {
    byId('view').innerHTML =
      '<div class="card">' +
        '<div class="filter-bar">' +
          '<input type="search" id="c-q" placeholder="搜索姓名 / 电话" value="' + esc(customerQuery) + '">' +
          '<span class="filter-spacer"></span>' +
          '<button class="btn btn-primary btn-sm" id="c-new">+ 新建客户</button>' +
        '</div>' +
        '<div id="customers-table-wrap"></div>' +
      '</div>';
    renderCustomersTable();
    byId('c-q').addEventListener('input', debounce(function () {
      customerQuery = this.value; renderCustomersTable();
    }, 200));
    byId('c-new').addEventListener('click', function () { openCustomerModal(); });
  }

  function customerOrders(customerId, phone) {
    return Store.state.orders.filter(function (o) {
      return o.customerId === customerId || o.phone === phone;
    });
  }

  function renderCustomersTable() {
    var q = customerQuery.trim().toLowerCase();
    var list = Store.state.customers.filter(function (c) {
      if (!q) return true;
      return (c.name || '').toLowerCase().indexOf(q) >= 0 || (c.phone || '').toLowerCase().indexOf(q) >= 0;
    });
    var rows = list.map(function (c) {
      var orders = customerOrders(c.id, c.phone);
      var last = orders.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
      return '<tr>' +
        '<td>' + esc(c.name) + '</td>' +
        '<td class="num">' + esc(c.phone) + '</td>' +
        '<td>' + esc(c.address || '-') + '</td>' +
        '<td class="num">' + orders.length + '</td>' +
        '<td>' + (last ? fmtDate(last.createdAt) : '-') + '</td>' +
        '<td>' +
          '<button class="link-btn c-view" data-id="' + c.id + '">详情</button>' +
          '<button class="link-btn c-edit" data-id="' + c.id + '">编辑</button>' +
          '<button class="link-btn danger c-del" data-id="' + c.id + '">删除</button>' +
        '</td></tr>';
    }).join('');
    byId('customers-table-wrap').innerHTML =
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>姓名</th><th>电话</th><th>地址</th><th>工单数</th><th>最近工单</th><th>操作</th>' +
      '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" class="empty">暂无客户，新建工单时会自动创建客户档案</td></tr>') +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;font-size:13px;color:var(--text-3)">共 ' + list.length + ' 位客户</div>';

    byId('customers-table-wrap').querySelectorAll('.c-view').forEach(function (b) {
      b.onclick = function () { openCustomerDetail(b.dataset.id); };
    });
    byId('customers-table-wrap').querySelectorAll('.c-edit').forEach(function (b) {
      b.onclick = function () { openCustomerModal(b.dataset.id); };
    });
    byId('customers-table-wrap').querySelectorAll('.c-del').forEach(function (b) {
      b.onclick = function () { deleteCustomerFlow(b.dataset.id); };
    });
  }

  function openCustomerModal(id) {
    var isEdit = !!id;
    var c = isEdit ? Store.getCustomer(id) : { name: '', phone: '', address: '', remark: '' };
    Modal.open({
      title: isEdit ? '编辑客户' : '新建客户',
      body:
        '<div class="form-grid">' +
          '<div class="form-item"><label>姓名<span class="req">*</span></label><input id="cu-name" value="' + esc(c.name) + '"></div>' +
          '<div class="form-item"><label>电话<span class="req">*</span></label><input id="cu-phone" value="' + esc(c.phone) + '"></div>' +
          '<div class="form-item full"><label>地址</label><input id="cu-address" value="' + esc(c.address || '') + '"></div>' +
          '<div class="form-item full"><label>备注</label><input id="cu-remark" value="' + esc(c.remark || '') + '"></div>' +
        '</div>',
      footer:
        '<button class="btn btn-outline" id="cu-cancel">取消</button>' +
        '<button class="btn btn-primary" id="cu-save">保存</button>'
    });
    byId('cu-cancel').onclick = function () { Modal.close(); };
    byId('cu-save').onclick = function () {
      var name = byId('cu-name').value.trim();
      var phone = byId('cu-phone').value.trim();
      if (!name) return toast('请填写姓名', 'error');
      if (!phone) return toast('请填写电话', 'error');
      var dup = Store.state.customers.find(function (x) { return x.phone === phone && x.id !== id; });
      if (dup) return toast('该电话已存在于客户：' + dup.name, 'error');
      c.name = name; c.phone = phone;
      c.address = byId('cu-address').value.trim();
      c.remark = byId('cu-remark').value.trim();
      if (isEdit) {
        Store.updateCustomer(c);
      } else {
        c.id = uuid(); c.createdAt = nowISO();
        Store.addCustomer(c);
      }
      Modal.close();
      toast('客户已保存');
      renderCustomersTable();
    };
  }

  function openCustomerDetail(id) {
    var c = Store.getCustomer(id);
    if (!c) return;
    var orders = customerOrders(c.id, c.phone).sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    var rows = orders.map(function (o) {
      return '<tr class="clickable" data-id="' + o.id + '">' +
        '<td class="num">' + esc(o.orderNo) + '</td>' +
        '<td>' + esc(o.deviceBrand) + ' ' + esc(o.deviceModel) + '</td>' +
        '<td>' + statusBadge(o.status) + '</td>' +
        '<td class="num">' + fmtMoney(o.totalCost) + '</td>' +
        '<td>' + fmtDate(o.createdAt) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty" style="padding:16px">暂无工单记录</td></tr>';

    Modal.open({
      title: '客户详情',
      wide: true,
      body:
        '<div class="kv"><span class="k">姓名</span><span class="v">' + esc(c.name) + '</span></div>' +
        '<div class="kv"><span class="k">电话</span><span class="v num">' + esc(c.phone) + '</span></div>' +
        '<div class="kv"><span class="k">地址</span><span class="v">' + esc(c.address || '-') + '</span></div>' +
        (c.remark ? '<div class="kv"><span class="k">备注</span><span class="v">' + esc(c.remark) + '</span></div>' : '') +
        '<div class="kv"><span class="k">建档时间</span><span class="v">' + fmtDate(c.createdAt) + '</span></div>' +
        '<h4 style="margin:16px 0 8px;font-size:14px">历史工单（' + orders.length + '）</h4>' +
        '<div class="table-wrap"><table><thead><tr><th>工单号</th><th>设备</th><th>状态</th><th>费用</th><th>日期</th></tr></thead>' +
        '<tbody id="cu-orders-tbody">' + rows + '</tbody></table></div>',
      footer: '<button class="btn btn-outline" id="cu-close">关闭</button>'
    });
    byId('cu-close').onclick = function () { Modal.close(); };
    byId('cu-orders-tbody').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) { Modal.close(); location.hash = '#/orders/' + tr.dataset.id; }
    });
  }

  function deleteCustomerFlow(id) {
    var c = Store.getCustomer(id);
    if (!c) return;
    var n = customerOrders(c.id, c.phone).length;
    var msg = n > 0
      ? '客户 <strong>' + esc(c.name) + '</strong> 名下有 <strong>' + n + '</strong> 条工单记录。删除客户不会删除工单，但会丢失档案关联。确定删除？'
      : '确定删除客户 <strong>' + esc(c.name) + '</strong> 吗？';
    confirmDialog({ title: '删除客户', message: msg, okText: '确认删除', danger: true }).then(function (ok) {
      if (!ok) return;
      Store.deleteCustomer(id);
      toast('客户已删除');
      renderCustomersTable();
    });
  }

  /* ================= 配件库存 ================= */
  var partQuery = '';

  function renderParts() {
    byId('view').innerHTML =
      '<div class="card">' +
        '<div class="filter-bar">' +
          '<input type="search" id="p-q" placeholder="搜索配件名称" value="' + esc(partQuery) + '">' +
          '<span class="filter-spacer"></span>' +
          '<button class="btn btn-primary btn-sm" id="p-new">+ 新建配件</button>' +
        '</div>' +
        '<div id="parts-table-wrap"></div>' +
      '</div>';
    renderPartsTable();
    byId('p-q').addEventListener('input', debounce(function () {
      partQuery = this.value; renderPartsTable();
    }, 200));
    byId('p-new').addEventListener('click', function () { openPartModal(); });
  }

  function renderPartsTable() {
    var q = partQuery.trim().toLowerCase();
    var list = Store.state.parts.filter(function (p) {
      return !q || (p.name || '').toLowerCase().indexOf(q) >= 0;
    });
    var rows = list.map(function (p) {
      var low = Number(p.stock) <= 3;
      return '<tr>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td class="num' + (low ? ' stock-low' : '') + '">' + p.stock + (low ? '（低库存）</td>' : '</td>') +
        '<td class="num">' + fmtMoney(p.unitPrice) + '</td>' +
        '<td>' + esc(p.remark || '-') + '</td>' +
        '<td>' + fmtDateTime(p.updatedAt) + '</td>' +
        '<td>' +
          '<button class="link-btn p-in" data-id="' + p.id + '">入库</button>' +
          '<button class="link-btn p-edit" data-id="' + p.id + '">编辑</button>' +
          '<button class="link-btn danger p-del" data-id="' + p.id + '">删除</button>' +
        '</td></tr>';
    }).join('');
    byId('parts-table-wrap').innerHTML =
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>配件名称</th><th>库存</th><th>单价</th><th>备注</th><th>更新时间</th><th>操作</th>' +
      '</tr></thead><tbody>' +
        (rows || '<tr><td colspan="6" class="empty">暂无配件，点击右上角「新建配件」添加</td></tr>') +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;font-size:13px;color:var(--text-3)">共 ' + list.length + ' 种配件</div>';

    byId('parts-table-wrap').querySelectorAll('.p-in').forEach(function (b) {
      b.onclick = function () { openStockInModal(b.dataset.id); };
    });
    byId('parts-table-wrap').querySelectorAll('.p-edit').forEach(function (b) {
      b.onclick = function () { openPartModal(b.dataset.id); };
    });
    byId('parts-table-wrap').querySelectorAll('.p-del').forEach(function (b) {
      b.onclick = function () { deletePartFlow(b.dataset.id); };
    });
  }

  function openPartModal(id) {
    var isEdit = !!id;
    var p = isEdit ? Store.getPart(id) : { name: '', stock: 0, unitPrice: 0, remark: '' };
    Modal.open({
      title: isEdit ? '编辑配件' : '新建配件',
      body:
        '<div class="form-grid">' +
          '<div class="form-item full"><label>配件名称<span class="req">*</span></label><input id="pt-name" value="' + esc(p.name) + '" placeholder="如：DDR4 内存条 16G"></div>' +
          '<div class="form-item"><label>库存数量</label><input type="number" id="pt-stock" min="0" value="' + (p.stock || 0) + '"></div>' +
          '<div class="form-item"><label>单价（元）</label><input type="number" id="pt-price" min="0" step="0.01" value="' + (p.unitPrice || 0) + '"></div>' +
          '<div class="form-item full"><label>备注</label><input id="pt-remark" value="' + esc(p.remark || '') + '"></div>' +
        '</div>',
      footer:
        '<button class="btn btn-outline" id="pt-cancel">取消</button>' +
        '<button class="btn btn-primary" id="pt-save">保存</button>'
    });
    byId('pt-cancel').onclick = function () { Modal.close(); };
    byId('pt-save').onclick = function () {
      var name = byId('pt-name').value.trim();
      if (!name) return toast('请填写配件名称', 'error');
      p.name = name;
      p.stock = Math.max(0, Number(byId('pt-stock').value) || 0);
      p.unitPrice = Math.max(0, Number(byId('pt-price').value) || 0);
      p.remark = byId('pt-remark').value.trim();
      p.updatedAt = nowISO();
      if (isEdit) {
        Store.updatePart(p);
      } else {
        p.id = uuid();
        Store.addPart(p);
      }
      Modal.close();
      toast('配件已保存');
      renderPartsTable();
    };
  }

  function openStockInModal(id) {
    var p = Store.getPart(id);
    if (!p) return;
    Modal.open({
      title: '配件入库',
      body:
        '<p style="margin-bottom:12px">配件：<strong>' + esc(p.name) + '</strong>（当前库存 ' + p.stock + '）</p>' +
        '<div class="form-item"><label>入库数量</label><input type="number" id="si-qty" min="1" value="1"></div>',
      footer:
        '<button class="btn btn-outline" id="si-cancel">取消</button>' +
        '<button class="btn btn-primary" id="si-ok">确认入库</button>'
    });
    byId('si-cancel').onclick = function () { Modal.close(); };
    byId('si-ok').onclick = function () {
      var qty = Number(byId('si-qty').value) || 0;
      if (qty <= 0) return toast('入库数量必须大于 0', 'error');
      Store.adjustStock(p.id, qty);
      Store.save();
      Modal.close();
      toast('已入库 ' + qty + ' 件「' + p.name + '」');
      renderPartsTable();
    };
  }

  function deletePartFlow(id) {
    var p = Store.getPart(id);
    if (!p) return;
    confirmDialog({
      title: '删除配件',
      message: '确定删除配件 <strong>' + esc(p.name) + '</strong> 吗？历史工单中的配件记录不受影响。',
      okText: '确认删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      Store.deletePart(id);
      toast('配件已删除');
      renderPartsTable();
    });
  }

  /* ================= 设置（数据管理） ================= */
  function renderSettings() {
    var s = Store.state.settings;
    byId('view').innerHTML =
      '<div class="card"><div class="card-title">基本设置</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">门店名称</div><div class="d">显示在打印维修单抬头</div></div>' +
          '<input type="text" id="set-shop" value="' + esc(s.shopName || '') + '">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">默认保修时长（月）</div><div class="d">新建工单时的默认保修月数</div></div>' +
          '<input type="number" id="set-wmonths" min="0" value="' + (s.warrantyDefaultMonths || 24) + '" style="width:120px">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">保存设置</div></div>' +
          '<button class="btn btn-primary btn-sm" id="set-save">保存设置</button>' +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">数据管理</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">导出数据备份（JSON）</div><div class="d">导出全部工单、客户、配件数据，可用于迁移或恢复' +
            (s.lastExportAt ? '　·　最近导出：' + fmtDateTime(s.lastExportAt) : '　·　<span style="color:var(--warning)">尚未导出过，建议立即备份</span>') + '</div></div>' +
          '<button class="btn btn-outline btn-sm" id="set-export">导出 JSON</button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">导入数据备份（JSON）</div><div class="d">从备份文件恢复数据，可选择覆盖或合并</div></div>' +
          '<button class="btn btn-outline btn-sm" id="set-import">导入 JSON</button>' +
          '<input type="file" id="set-import-file" accept=".json,application/json" style="display:none">' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">导出工单 CSV</div><div class="d">导出当前筛选条件下的工单列表，Excel 可直接打开</div></div>' +
          '<button class="btn btn-outline btn-sm" id="set-csv">导出 CSV</button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="desc"><div class="t">清空全部数据</div><div class="d">删除所有工单、客户、配件数据，不可恢复，请先导出备份</div></div>' +
          '<button class="btn btn-danger btn-sm" id="set-clear">清空数据</button>' +
        '</div>' +
      '</div>' +
      '<div class="card"><div class="card-title">数据统计</div>' +
        '<div class="kv"><span class="k">工单总数</span><span class="v num">' + Store.state.orders.length + '</span></div>' +
        '<div class="kv"><span class="k">客户总数</span><span class="v num">' + Store.state.customers.length + '</span></div>' +
        '<div class="kv"><span class="k">配件种类</span><span class="v num">' + Store.state.parts.length + '</span></div>' +
      '</div>';

    byId('set-save').onclick = function () {
      s.shopName = byId('set-shop').value.trim() || '电脑维修中心';
      s.warrantyDefaultMonths = Math.max(0, Number(byId('set-wmonths').value) || 0);
      Store.save();
      toast('设置已保存');
      renderSettings();
    };
    byId('set-export').onclick = exportJSON;
    byId('set-import').onclick = function () { byId('set-import-file').click(); };
    byId('set-import-file').addEventListener('change', function () {
      if (this.files && this.files[0]) importJSON(this.files[0]);
      this.value = '';
    });
    byId('set-csv').onclick = exportCSV;
    byId('set-clear').onclick = clearAllFlow;
  }

  function downloadFile(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    var data = {
      version: DATA_VERSION,
      exportedAt: nowISO(),
      orders: Store.state.orders,
      customers: Store.state.customers,
      parts: Store.state.parts,
      settings: Store.state.settings
    };
    downloadFile('售后工单备份_' + todayCompact() + '.json', JSON.stringify(data, null, 2), 'application/json');
    Store.state.settings.lastExportAt = nowISO();
    Store.save();
    toast('备份文件已导出');
    if (parseRoute().name === 'settings') renderSettings();
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        return toast('导入失败：文件不是有效的 JSON', 'error');
      }
      if (!data || !Array.isArray(data.orders) || !Array.isArray(data.customers) || !Array.isArray(data.parts)) {
        return toast('导入失败：文件格式不正确', 'error');
      }
      Modal.open({
        title: '导入数据',
        body:
          '<p style="margin-bottom:14px">备份文件包含：工单 <strong class="num">' + data.orders.length + '</strong> 条、' +
          '客户 <strong class="num">' + data.customers.length + '</strong> 位、' +
          '配件 <strong class="num">' + data.parts.length + '</strong> 种。</p>' +
          '<div class="form-item"><label>导入方式</label>' +
          '<select id="im-mode"><option value="merge">合并（保留现有数据，同 ID 覆盖）</option>' +
          '<option value="overwrite">覆盖（清空现有数据后导入）</option></select></div>',
        footer:
          '<button class="btn btn-outline" id="im-cancel">取消</button>' +
          '<button class="btn btn-primary" id="im-ok">开始导入</button>'
      });
      byId('im-cancel').onclick = function () { Modal.close(); };
      byId('im-ok').onclick = function () {
        var mode = byId('im-mode').value;
        if (mode === 'overwrite') {
          Store.state.orders = data.orders;
          Store.state.customers = data.customers;
          Store.state.parts = data.parts;
          if (data.settings) {
            Store.state.settings.shopName = data.settings.shopName || Store.state.settings.shopName;
            Store.state.settings.warrantyDefaultMonths = data.settings.warrantyDefaultMonths != null ? data.settings.warrantyDefaultMonths : Store.state.settings.warrantyDefaultMonths;
          }
        } else {
          mergeById(Store.state.orders, data.orders);
          mergeById(Store.state.customers, data.customers);
          mergeById(Store.state.parts, data.parts);
        }
        Store.state.settings.inited = true;
        Store.save();
        Modal.close();
        toast('导入完成');
        renderRoute();
      };
    };
    reader.readAsText(file);
  }

  function mergeById(target, incoming) {
    incoming.forEach(function (item) {
      if (!item.id) item.id = uuid();
      var i = target.findIndex(function (x) { return x.id === item.id; });
      if (i >= 0) target[i] = item; else target.push(item);
    });
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV() {
    var list = filteredOrders();
    if (!list.length) return toast('当前筛选条件下没有工单可导出', 'error');
    var header = ['工单号', '客户姓名', '电话', '地址', '设备品牌', '设备型号', '序列号', '购买日期', '保修状态',
      '故障分类', '故障描述', '优先级', '维修类型', '状态', '故障诊断', '维修措施',
      '配件费', '人工费', '应收合计', '创建时间', '关闭时间'];
    var lines = [header.map(csvCell).join(',')];
    list.forEach(function (o) {
      lines.push([
        o.orderNo, o.customerName, o.phone, o.address || '', o.deviceBrand, o.deviceModel || '', o.serialNo || '',
        o.purchaseDate || '', (WARRANTY[o.warrantyStatus] || {}).label || '',
        (FAULT_CATEGORY[o.faultCategory] || {}).label || '', o.faultDesc || '',
        (PRIORITY[o.priority] || {}).label || '', (SERVICE_TYPE[o.serviceType] || {}).label || '',
        (STATUS[o.status] || {}).label || '', o.diagnosis || '', o.repairActions || '',
        Number(o.partsCost || 0).toFixed(2), Number(o.laborCost || 0).toFixed(2), Number(o.totalCost || 0).toFixed(2),
        fmtDateTime(o.createdAt), o.closedAt ? fmtDateTime(o.closedAt) : ''
      ].map(csvCell).join(','));
    });
    /* 加 BOM 防止 Excel 打开中文乱码 */
    downloadFile('工单导出_' + todayCompact() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('已导出 ' + list.length + ' 条工单');
  }

  function clearAllFlow() {
    confirmDialog({
      title: '清空全部数据',
      message: '此操作将删除<strong>所有工单、客户、配件数据</strong>，且不可恢复！<br>如确认继续，请在下方输入「<strong>确认清空</strong>」：',
      okText: '永久清空',
      danger: true,
      extra: '<div class="form-item" style="margin-top:10px"><input id="clear-confirm" placeholder="确认清空" autocomplete="off"></div>',
      validate: function () {
        var v = byId('clear-confirm').value.trim();
        if (v !== '确认清空') {
          toast('请输入「确认清空」四个字', 'error');
          return false;
        }
        return true;
      }
    }).then(function (ok) {
      if (!ok) return;
      localStorage.removeItem(LS.ORDERS);
      localStorage.removeItem(LS.CUSTOMERS);
      localStorage.removeItem(LS.PARTS);
      localStorage.removeItem(LS.SETTINGS);
      sessionStorage.removeItem('asws_order_filter');
      Store.init();
      Store.state.settings.inited = true;
      Store.save();
      toast('数据已清空');
      location.hash = '#/dashboard';
      renderRoute();
    });
  }

  /* ================= 打印维修单 ================= */
  function printOrder(o) {
    var s = Store.state.settings;
    var partRows = (o.partsUsed || []).map(function (p, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td style="text-align:right">' + p.qty + '</td>' +
        '<td style="text-align:right">' + fmtMoney(p.unitPrice) + '</td>' +
        '<td style="text-align:right">' + fmtMoney(p.qty * p.unitPrice) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" style="text-align:center">未使用配件</td></tr>';

    var historySummary = (o.statusHistory || []).map(function (h) {
      return fmtDateTime(h.at) + ' ' + (h.from ? STATUS[h.from].label + '→' : '') + STATUS[h.to].label + (h.note ? '（' + h.note + '）' : '');
    }).join('；');

    byId('print-root').innerHTML =
      '<div class="print-sheet">' +
        '<h1>' + esc(s.shopName || '电脑维修中心') + '</h1>' +
        '<div class="p-sub">电脑维修服务单 · 单号 ' + esc(o.orderNo) + ' · 打印时间 ' + fmtDateTime(nowISO()) + '</div>' +

        '<div class="p-sec">客户信息</div>' +
        '<table><tr><th style="width:16%">姓名</th><td style="width:34%">' + esc(o.customerName) + '</td>' +
        '<th style="width:16%">电话</th><td>' + esc(o.phone) + '</td></tr>' +
        '<tr><th>地址</th><td colspan="3">' + esc(o.address || '-') + '</td></tr></table>' +

        '<div class="p-sec">设备信息</div>' +
        '<table><tr><th style="width:16%">品牌 / 型号</th><td style="width:34%">' + esc(o.deviceBrand) + ' ' + esc(o.deviceModel || '') + '</td>' +
        '<th style="width:16%">序列号</th><td>' + esc(o.serialNo || '-') + '</td></tr>' +
        '<tr><th>购买日期</th><td>' + esc(o.purchaseDate || '-') + '</td>' +
        '<th>保修状态</th><td>' + ((WARRANTY[o.warrantyStatus] || {}).label || '-') + '（保修 ' + (o.warrantyMonths || 0) + ' 个月）</td></tr></table>' +

        '<div class="p-sec">故障与维修</div>' +
        '<table>' +
        '<tr><th style="width:16%">故障分类</th><td>' + ((FAULT_CATEGORY[o.faultCategory] || {}).label || '-') + '　·　' + ((SERVICE_TYPE[o.serviceType] || {}).label || '-') + '　·　优先级：' + ((PRIORITY[o.priority] || {}).label || '-') + '</td></tr>' +
        '<tr><th>故障描述</th><td>' + esc(o.faultDesc || '-') + '</td></tr>' +
        '<tr><th>故障诊断</th><td>' + esc(o.diagnosis || '-') + '</td></tr>' +
        '<tr><th>维修措施</th><td>' + esc(o.repairActions || '-') + '</td></tr>' +
        '<tr><th>当前状态</th><td>' + STATUS[o.status].label + '</td></tr></table>' +

        '<div class="p-sec">费用明细</div>' +
        '<table><thead><tr><th style="width:8%">序号</th><th>配件名称</th><th style="width:12%">数量</th><th style="width:16%">单价</th><th style="width:16%">小计</th></tr></thead>' +
        '<tbody>' + partRows + '</tbody></table>' +
        '<div class="p-total">配件费 ' + fmtMoney(o.partsCost) + ' + 人工费 ' + fmtMoney(o.laborCost) + ' = 应收合计 ' + fmtMoney(o.totalCost) +
        (o.serviceType === 'warranty_free' ? '（保内免费）' : '') + '</div>' +

        (o.remark ? '<div class="p-sec">备注</div><table><tr><td>' + esc(o.remark) + '</td></tr></table>' : '') +

        '<div class="p-sign"><div class="s">客户签字</div><div class="s">工程师签字</div><div class="s">日期</div></div>' +
        '<div class="p-note">维修记录：' + esc(historySummary) + '<br>注：本单为维修凭证，请妥善保管。同一故障 90 天内免费返修（人为损坏及耗材除外）。数据存于云端，多设备共享。</div>' +
      '</div>';

    window.print();
  }

  /* ================= 路由 ================= */
  function parseRoute() {
    var h = location.hash || '#/dashboard';
    var seg = h.replace(/^#\//, '').split('/');
    var name = seg[0] || 'dashboard';
    if (name === 'orders' && seg[1]) return { name: 'orderDetail', param: seg[1] };
    if (PAGE_TITLES[name] === undefined) name = 'dashboard';
    return { name: name, param: seg[1] };
  }

  function renderRoute() {
    var r = parseRoute();
    byId('page-title').textContent = PAGE_TITLES[r.name] || '仪表盘';
    /* 导航高亮 */
    var navMap = { dashboard: 'dashboard', orders: 'orders', orderDetail: 'orders', customers: 'customers', parts: 'parts', settings: 'settings' };
    document.querySelectorAll('#nav a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.route === navMap[r.name]);
    });
    /* 关闭移动端抽屉 */
    byId('sidebar').classList.remove('open');
    byId('sidebar-mask').classList.remove('show');

    switch (r.name) {
      case 'dashboard': renderDashboard(); break;
      case 'orders': renderOrders(); break;
      case 'orderDetail': renderOrderDetail(r.param); break;
      case 'customers': renderCustomers(); break;
      case 'parts': renderParts(); break;
      case 'settings': renderSettings(); break;
    }
  }

  /* ================= 首次使用引导 ================= */
  function welcomeIfFirst(useInited) {
    if (useInited && Store.state.settings.inited) return;
    Modal.open({
      title: '欢迎使用电脑售后工单管理系统',
      body:
        '<p style="line-height:2">系统已就绪。所有数据均保存在<strong>云端服务器</strong>，任何设备打开同一链接均可查看与编辑。</p>' +
        '<p style="line-height:2;margin-top:6px">是否载入<strong>示例数据</strong>（6 位客户、8 种配件、8 张示例工单），便于快速了解系统功能？载入后可在「设置」中随时清空。</p>',
      footer:
        '<button class="btn btn-outline" id="wc-skip">直接开始（空数据）</button>' +
        '<button class="btn btn-primary" id="wc-seed">载入示例数据</button>'
    });
    byId('wc-skip').onclick = function () {
      Store.state.settings.inited = true;
      Store.save();
      Modal.close();
      renderRoute();
    };
    byId('wc-seed').onclick = function () {
      var seed = window.SEED_DATA || { orders: [], customers: [], parts: [] };
      Store.state.customers = seed.customers;
      Store.state.parts = seed.parts;
      Store.state.orders = seed.orders;
      /* 工单号序号校准：避免与示例工单冲突 */
      Store.state.settings.dailySeqDate = todayCompact();
      Store.state.settings.dailySeq = 1;
      Store.state.settings.inited = true;
      Store.save();
      Modal.close();
      toast('示例数据已载入');
      renderRoute();
    };
  }

  /* ================= 初始化 ================= */
  async function init() {
    var existed = await Store.init();

    /* 全局事件 */
    window.addEventListener('hashchange', renderRoute);
    byId('btn-new-order').addEventListener('click', function () { openOrderModal(); });
    byId('hamburger').addEventListener('click', function () {
      byId('sidebar').classList.toggle('open');
      byId('sidebar-mask').classList.toggle('show');
    });
    byId('sidebar-mask').addEventListener('click', function () {
      byId('sidebar').classList.remove('open');
      byId('sidebar-mask').classList.remove('show');
    });

    renderRoute();
    welcomeIfFirst(existed);
  }

  init();
})();
