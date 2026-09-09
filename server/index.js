// 树洞谷主服务：静态托管 + 游戏 API + SSE 广播
// 启动：node server/index.js   端口 8787

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMap, areaAt, isWalkable, AREA_LABELS, PROPS, BIG_TREES, fragSpots } from './world/map.js';
import { RESIDENTS, RESIDENT_MAP, CHAT_PAIRS } from './world/residents-data.js';
import { residentReply, reflect } from './engines/chat.js';
import { designResident, validateDesc } from './engines/custom.js';
import { llmMode, llmReady } from './services/llm.js';
import { getHotList, getKnowledge, getKnowledgeDetail, mayorHotline } from './services/zhihu.js';

const PORT = Number(process.env.PORT || 8787);
const WEB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

const WORLD_SEED = Number(process.env.WORLD_SEED || 20260913);
const world = buildMap(WORLD_SEED);
world.__seed = WORLD_SEED;
const TOWN = world.townOffset;

// ---------- 会话（JSON 落盘，服务重启不丢） ----------
const players = new Map(); // token -> {id, name, archetype, hair, cloth, skin}
const PLAYERS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'players.json');
const CUSTOM_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'custom-residents.json');
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8')))) players.set(k, v); } catch {}
function savePlayers() {
  fs.mkdirSync(path.dirname(PLAYERS_FILE), { recursive: true });
  fs.writeFileSync(PLAYERS_FILE, JSON.stringify(Object.fromEntries(players)));
}
let customResidents = [];
try { customResidents = JSON.parse(fs.readFileSync(CUSTOM_FILE, 'utf8')); } catch { /* 首次为空 */ }
function saveCustom() {
  fs.mkdirSync(path.dirname(CUSTOM_FILE), { recursive: true });
  fs.writeFileSync(CUSTOM_FILE, JSON.stringify(customResidents, null, 2));
}

// SSE 客户端（镇内广播：居民互聊/系统事件）
const sseClients = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch { sseClients.delete(res); } }
}

// ---------- 工具 ----------
function json(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
const PHASES = ['清晨', '上午', '午后', '黄昏', '夜晚'];
function phaseOf(date) {
  const h = date.getHours();
  if (h < 6) return '深夜';
  if (h < 9) return '清晨';
  if (h < 12) return '上午';
  if (h < 16) return '午后';
  if (h < 19) return '黄昏';
  return '夜晚';
}
function allResidents() {
  return [...RESIDENTS, ...customResidents];
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/world') {
    const buildings = Object.fromEntries(
      Object.entries(world.buildings).map(([k, b]) => [k, { ...b, key: k }])
    );
    return json(res, 200, {
      W: world.grid[0].length, H: world.grid.length,
      grid: world.grid, tiles: world.tiles,
      buildings, spawn: world.spawn, plaza: world.plaza,
      areas: AREA_LABELS,
      props: PROPS.map((p) => ({ ...p, x: p.x + TOWN.x, y: p.y + TOWN.y })),
      bigTrees: BIG_TREES.map(([x, y]) => [x + TOWN.x, y + TOWN.y]),
      cottages: (world.cottages || []).map((c) => ({ ...c, x: c.x + TOWN.x, y: c.y + TOWN.y })),
      fragSpots: fragSpots(world),
      residents: allResidents().map((r) => ({
        id: r.id, name: r.name, title: r.title, archetype: r.archetype,
        cloth: r.cloth, hair: r.hair, skin: r.skin,
        schedule: r.schedule, activities: r.activities || null, greeting: r.greeting || r.samples?.[0] || '', custom: Boolean(r.custom),
        avatar: r.custom ? null : `/avatars/${r.archetype}.png`
      })),
      serverPhase: phaseOf(new Date())
    });
  }

  // 入住（捏人）
  if (p === '/api/join' && req.method === 'POST') {
    const { name, archetype, hair } = await readBody(req);
    const nm = String(name || '').trim().slice(0, 8) || '旅人';
    const token = crypto.randomUUID();
    const player = {
      id: 'p_' + crypto.randomUUID().slice(0, 8),
      name: nm,
      archetype: ['kaoyan', 'dachang', 'beipiao', 'luoci'].includes(archetype) ? archetype : 'beipiao',
      hair: /^#[0-9a-fA-F]{6}$/.test(hair || '') ? hair : '#2B2B3A',
      cloth: '#EAF0FF'
    };
    players.set(token, player);
    savePlayers();
    broadcast({ type: 'sys', text: `${nm} 搬进了树洞谷。` });
    return json(res, 200, { token, player });
  }

  // 对话
  if (p === '/api/chat' && req.method === 'POST') {
    const { token, residentId, message, history, area } = await readBody(req);
    const player = players.get(token || '');
    const resident = allResidents().find((r) => r.id === residentId);
    const msg = String(message || '').trim().slice(0, 120);
    if (!player || !resident || !msg) return json(res, 400, { error: 'BAD_REQUEST' });
    const reply = await residentReply({
      resident, player, message: msg, area: area || '乡间小路', phase: phaseOf(new Date()),
      history: Array.isArray(history) ? history.slice(-8) : []
    });
    return json(res, 200, { text: reply.text, source: reply.source });
  }

  // 对话收尾 → 记忆
  if (p === '/api/chat-end' && req.method === 'POST') {
    const { token, residentId, history } = await readBody(req);
    const player = players.get(token || '');
    const resident = allResidents().find((r) => r.id === residentId);
    if (player && resident && Array.isArray(history) && history.length) {
      reflect({ resident, player, history: history.slice(-8) }).catch(() => {});
    }
    return json(res, 200, { ok: true });
  }

  // 记忆预览（对话框"TA 记得你"）
  if (p === '/api/memory') {
    const player = players.get(url.searchParams.get('token') || '');
    const residentId = url.searchParams.get('resident') || '';
    if (!player) return json(res, 404, { error: 'NO_PLAYER' });
    const { loadMemory } = await import('./services/memory.js');
    const mem = loadMemory(residentId, player.id);
    return json(res, 200, { impressions: mem.impressions.slice(-3).map((i) => i.text), turns: mem.turns });
  }

  // 自定义居民
  if (p === '/api/custom-resident' && req.method === 'POST') {
    const { token, desc } = await readBody(req);
    const player = players.get(token || '');
    if (!player) return json(res, 400, { error: 'NO_PLAYER' });
    const mine = customResidents.filter((r) => r.by === player.id);
    if (mine.length >= 3) return json(res, 429, { error: 'LIMIT', message: '你已经在谷里住进 3 位自定义居民啦，给他们一点成长时间。' });
    if (allResidents().length >= 12) return json(res, 429, { error: 'LIMIT', message: '小镇暂时住满了（12 位），等下一位搬走再来。' });
    const v = validateDesc(desc);
    if (!v.ok) return json(res, 400, { error: 'INVALID', message: v.msg });
    const { resident, source } = await designResident(v.desc, customResidents.length);
    const full = {
      ...resident,
      id: 'c_' + crypto.randomUUID().slice(0, 6),
      archetype: 'custom',
      by: player.id,
      schedule: resident.schedule
    };
    customResidents.push(full);
    saveCustom();
    broadcast({ type: 'sys', text: `${full.name}（${full.title}）搬进了树洞谷——由 ${player.name} 一句话邀请。` });
    return json(res, 200, { resident: full, source });
  }

  // 居民互聊（点播一次；另有服务端定时自动触发）
  if (p === '/api/resident-chat') {
    const pair = CHAT_PAIRS[Math.floor(Math.random() * CHAT_PAIRS.length)];
    const [a, b, topic] = pair;
    const ra = RESIDENT_MAP[a], rb = RESIDENT_MAP[b];
    const lines = [
      `${ra.name}：听说${topic}？`,
      `${rb.name}：${rb.samples[0]}`,
      `${ra.name}：${ra.samples[Math.floor(Math.random() * ra.samples.length)]}`
    ];
    const event = { type: 'chat', a: ra.name, b: rb.name, topic, lines, at: Date.now() };
    broadcast(event);
    return json(res, 200, event);
  }

  // SSE 流
  if (p === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'hello', phase: phaseOf(new Date()) })}\n\n`);
    sseClients.add(res);
    const keep = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(keep); sseClients.delete(res); });
    return;
  }

  // 知乎内容层
  if (p === '/api/hot') { const c = await getHotList(); return json(res, 200, c); }
  if (p === '/api/knowledge') { const c = await getKnowledge(); return json(res, 200, c); }
  if (p === '/api/knowledge/:id' || p.startsWith('/api/knowledge/')) {
    const id = decodeURIComponent(p.split('/').pop() || '');
    const d = await getKnowledgeDetail(id);
    return json(res, d ? 200 : 404, d || { error: 'NOT_FOUND' });
  }
  if (p === '/api/mayor' && req.method === 'POST') {
    const { question } = await readBody(req);
    const q = String(question || '').trim().slice(0, 80);
    if (!q) return json(res, 400, { error: 'EMPTY' });
    const ans = await mayorHotline(q);
    return json(res, 200, { text: ans, source: ans ? 'zhida' : 'offline' });
  }

  if (p === '/api/status') {
    return json(res, 200, { llm: llmMode(), residents: allResidents().length, players: players.size });
  }

  return json(res, 404, { error: 'NOT_FOUND' });
}

// 定时居民互聊（每 3 分钟随机一对，营造小镇活着的感觉）
setInterval(() => {
  if (!sseClients.size) return;
  const pair = CHAT_PAIRS[Math.floor(Math.random() * CHAT_PAIRS.length)];
  const [a, b, topic] = pair;
  const ra = RESIDENT_MAP[a], rb = RESIDENT_MAP[b];
  broadcast({
    type: 'chat', a: ra.name, b: rb.name, topic,
    lines: [
      `${ra.name}：诶，${topic}这事儿你怎么看？`,
      `${rb.name}：${rb.samples[0]}`,
      `${ra.name}：${ra.samples[Math.floor(Math.random() * ra.samples.length)]}`
    ],
    at: Date.now()
  });
}, 180000);

// ---------- 静态托管 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(WEB_DIR, path.normalize(rel).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(WEB_DIR, 'index.html'), (e2, buf2) => {
        if (e2) { res.writeHead(404); return res.end('not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(buf2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(res, url.pathname);
  } catch (e) {
    return json(res, 500, { error: 'INTERNAL', message: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[shudong-valley] http://localhost:${PORT}`);
  console.log(`[shudong-valley] llm=${llmMode()} residents=${allResidents().length}`);
});
