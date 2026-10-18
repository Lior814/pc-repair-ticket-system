/* 电脑售后工单系统 - 云端后端 (Node.js / Express)
 * 数据存储于 data.json，可直接部署到 Render / Railway / Vercel / Fly.io 等 Node 托管平台。
 * 启动：node server.js   （默认端口 8765，可用 PORT 环境变量覆盖）
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8765;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json({ limit: '10mb' }));

/* ---------- 数据读写 ---------- */
const DEFAULT_STATE = {
  orders: [], customers: [], parts: [],
  settings: {
    dailySeqDate: '', dailySeq: 0,
    shopName: '极速电脑维修中心',
    warrantyDefaultMonths: 24,
    inited: false, lastExportAt: ''
  }
};

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      return Object.assign({}, DEFAULT_STATE, data);
    }
  } catch (e) { console.error('loadState error', e); }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();
let writeTimer = null;
function persist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8'); }
    catch (e) { console.error('persist error', e); }
  }, 120);
}

/* ---------- 中间件：跨域（开发时方便） ---------- */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------- 整体状态 ---------- */
app.get('/api/state', (req, res) => res.json(state));
app.put('/api/state', (req, res) => {
  const body = req.body || {};
  state = {
    orders: Array.isArray(body.orders) ? body.orders : [],
    customers: Array.isArray(body.customers) ? body.customers : [],
    parts: Array.isArray(body.parts) ? body.parts : [],
    settings: Object.assign({}, DEFAULT_STATE.settings, body.settings || {})
  };
  persist();
  res.json({ ok: true });
});

/* ---------- 通用 CRUD 工厂 ---------- */
function crud(route, listKey) {
  app.get(route, (req, res) => res.json(state[listKey] || []));
  app.post(route, (req, res) => {
    const item = req.body || {};
    (state[listKey] = state[listKey] || []).unshift(item);
    persist();
    res.json(item);
  });
  app.put(route + '/:id', (req, res) => {
    const list = state[listKey] || [];
    const i = list.findIndex(x => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'not found' });
    list[i] = req.body || {};
    persist();
    res.json(list[i]);
  });
  app.delete(route + '/:id', (req, res) => {
    state[listKey] = (state[listKey] || []).filter(x => x.id !== req.params.id);
    persist();
    res.json({ ok: true });
  });
}
crud('/api/orders', 'orders');
crud('/api/customers', 'customers');
crud('/api/parts', 'parts');

/* 配件库存调整 */
app.put('/api/parts/:id/stock', (req, res) => {
  const list = state.parts || [];
  const p = list.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const delta = Number(req.body && req.body.delta) || 0;
  p.stock = Math.max(0, Number(p.stock || 0) + delta);
  p.updatedAt = new Date().toISOString();
  persist();
  res.json(p);
});

/* 设置 */
app.get('/api/settings', (req, res) => res.json(state.settings || {}));
app.put('/api/settings', (req, res) => {
  state.settings = Object.assign({}, state.settings || {}, req.body || {});
  persist();
  res.json(state.settings);
});

/* ---------- 静态文件 + SPA 回退 ---------- */
app.use(express.static(__dirname));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`售后工单系统已启动: http://localhost:${PORT}`);
});
