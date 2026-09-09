// 树洞谷前端：入住流程 → 游戏循环 → 对话/面板/SSE
import { createGame, TILE, SCALE } from './engine/game.js';
import { createAudio } from './engine/audio.js';
import { makeCharacterSheet, makeAvatar } from './engine/sprite.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');

const state = {
  audio: null,
  token: sessionStorage.getItem('sv_token') || '',
  player: JSON.parse(sessionStorage.getItem('sv_player') || 'null'),
  world: null, game: null,
  dialogNpc: null, dialogHistory: [],
  phase: '上午'
};

async function api(path, opts = {}) {
  const resp = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await resp.json();
  if (!resp.ok) throw Object.assign(new Error(data.message || data.error || `HTTP ${resp.status}`), { data });
  return data;
}

// ================= 入住 =================

let selArch = 'kaoyan', selHair = '#2B2B3A';

function initJoin() {
  $('#joinArches').addEventListener('click', (e) => {
    const b = e.target.closest('.arch'); if (!b) return;
    selArch = b.dataset.v;
    [...$('#joinArches').children].forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#joinHairs').addEventListener('click', (e) => {
    const b = e.target.closest('.hair'); if (!b) return;
    selHair = b.dataset.v;
    [...$('#joinHairs').children].forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#joinBtn').onclick = join;
  $('#joinName').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  if (state.token && state.player) join();
}

async function join() {
  if (state.token && state.player) return enterWorld();
  const name = $('#joinName').value.trim() || '旅人';
  $('#joinBtn').disabled = true;
  $('#joinNote').textContent = '正在为你收拾行李…';
  try {
    const { token, player } = await api('/api/join', { body: { name, archetype: selArch, hair: selHair } });
    state.token = token; state.player = player;
    sessionStorage.setItem('sv_token', token);
    sessionStorage.setItem('sv_player', JSON.stringify(player));
    enterWorld();
  } catch (e) {
    $('#joinNote').textContent = `入住失败：${e.message}`;
    $('#joinBtn').disabled = false;
  }
}

// ================= 世界 =================

async function enterWorld() {
  $('#join').remove();
  try {
    state.world = await api('/api/world');
  } catch (e) {
    document.body.innerHTML = `<p style="color:#fff;padding:40px">世界加载失败：${e.message}</p>`;
    return;
  }
  $('#hud').hidden = false;
  $('#hint').hidden = false;
  state.audio = createAudio();
  const unlock = () => { state.audio.onFirstInteract(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  setTimeout(() => $('#hint').remove(), 9000);
  resize();

  state.phase = state.world.serverPhase;
  state.game = createGame(canvas, state.world, {
    dialogOpen: () => !$('#dialog').hidden,
    phase: () => state.phase,
    onNpcClick: (npc) => openDialog(npc),
    onFragment: (f) => { toast(`✨ 捡到一枚灵感碎片（${collectCount()}/${state.game.frags.length}）`); }
  });
  state.game.setPlayer(state.player);
  window.__svGame = state.game;
  const forced = new URLSearchParams(location.search).get('weather');
  if (forced === 'rain' && state.game.forceWeather) state.game.forceWeather(true);
  if (forced === 'sun' && state.game.forceWeather) state.game.forceWeather(false);
  state.game.setAudioHooks && state.game.setAudioHooks({
    step: () => state.audio.stepWhileMoving(true),
    pickup: () => state.audio.sfx.pickup()
  });

  // E 键交互（keydown 去重，避免 keydown 自动重复连续触发）
  let eHeld = false;
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'e' && !eHeld) {
      eHeld = true;
      if (!$('#dialog').hidden) return;
      const npc = state.game.nearNpc();
      if (npc) openDialog(npc);
      else {
        const near = nearBuilding();
        if (near === 'hall') openPanel('hall');
        else if (near === 'library') openPanel('library');
      }
    }
    if (e.key === 'Escape') { closeDialog(); closePanel(); }
  });
  window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'e') eHeld = false; });
  canvas.addEventListener('click', (e) => state.game.clickMove(e));

  // HUD 面板
  document.querySelectorAll('.hbtn[data-panel]').forEach((b) => { b.onclick = () => openPanel(b.dataset.panel); });
  $('#muteBtn').onclick = () => {
    const m = state.audio.toggleMute();
    $('#muteBtn').textContent = m ? '🔇' : '🔊';
  };
  $('#muteBtn').textContent = state.audio.isMuted() ? '🔇' : '🔊';
  $('#panelClose').onclick = closePanel;

  // 天气→雨声联动
  setInterval(() => {
    if (state.audio && state.game && state.game.weatherState) {
      state.audio.setRain(state.game.weatherState.raining);
    }
  }, 1500);

  // 区域与时段显示
  setInterval(() => {
    const p = state.player;
    const ax = p ? state.game.player.fx : 0, ay = p ? state.game.player.fy : 0;
    $('#hudArea').textContent = areaName(ax, ay);
    $('#hudPhase').textContent = state.phase;
  }, 500);

  // SSE
  const es = new EventSource('/api/stream');
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'hello') state.phase = msg.phase || state.phase;
      if (msg.type === 'chat') showTicker(`💬 ${msg.lines.join('　')}`);
      if (msg.type === 'sys') toast(msg.text);
    } catch {}
  };
}

function areaName(x, y) {
  const a = Object.values(state.world.areas);
  for (const ar of a) if (Math.hypot(x - ar.x, y - ar.y) <= ar.r) return ar.name;
  return '乡间小路';
}
function nearBuilding() {
  const p = state.game.player;
  for (const [k, b] of Object.entries(state.world.buildings)) {
    if (Math.hypot(p.fx - b.door[0], p.fy - b.door[1]) < 2.2) return k;
  }
  return null;
}
function collectCount() {
  return JSON.parse(localStorage.getItem('sv_frags') || '[]').length;
}

// ================= 对话 =================

const avatars = new Map();
function avatarOf(r) {
  if (!avatars.has(r.id)) avatars.set(r.id, makeAvatar(makeCharacterSheet(r)));
  return avatars.get(r.id);
}

async function openDialog(npc) {
  state.dialogNpc = npc;
  state.dialogHistory = [];
  $('#dialog').hidden = false;
  $('#dlgName').textContent = npc.name;
  $('#dlgTitle').textContent = npc.title || '';
  $('#dlgAvatar').src = avatarOf(npc);
  $('#dlgLog').innerHTML = '';
  $('#dlgMem').innerHTML = '';
  // 记忆
  api(`/api/memory?token=${state.token}&resident=${npc.id}`)
    .then(({ impressions, turns }) => {
      if (turns > 0 && impressions.length) {
        $('#dlgMem').innerHTML = `<span>🧠 记得你 · 交互 ${turns} 轮</span>` + impressions.map((i) => `<span>${i}</span>`).join('');
      }
    }).catch(() => {});
  // 开场白
  say(npc, npc.greeting || npc.greetings?.[0] || '……', true);
  $('#dlgText').focus();
}

function say(npc, text, isGreet = false) {
  const log = $('#dlgLog');
  const div = document.createElement('div');
  div.className = 'dlg-line typing';
  log.appendChild(div);
  let i = 0;
  state.dialogHistory.push({ role: 'npc', text });
  const timer = setInterval(() => {
    div.textContent = text.slice(0, ++i);
    log.scrollTop = log.scrollHeight;
    if (i >= text.length) { clearInterval(timer); div.classList.remove('typing'); }
  }, 24);
  void isGreet;
}

async function send() {
  const inp = $('#dlgText');
  const text = inp.value.trim();
  if (!text || !state.dialogNpc) return;
  inp.value = '';
  const log = $('#dlgLog');
  const me = document.createElement('div');
  me.className = 'dlg-line me';
  me.innerHTML = `<b>${state.player.name}：</b>`;
  me.appendChild(document.createTextNode(text));
  log.appendChild(me);
  log.scrollTop = log.scrollHeight;
  state.dialogHistory.push({ role: 'player', text });

  const sendBtn = $('#dlgSend'); sendBtn.disabled = true;
  const p = state.game.player;
  const thinking = document.createElement('div');
  thinking.className = 'dlg-line typing';
  thinking.textContent = '……';
  log.appendChild(thinking);
  log.scrollTop = log.scrollHeight;
  const trySend = async (tk) => api('/api/chat', {
    body: {
      token: tk, residentId: state.dialogNpc.id, message: text,
      history: state.dialogHistory.slice(-8),
      area: areaName(p.fx, p.fy)
    }
  });
  try {
    let resp;
    try {
      resp = await trySend(state.token);
    } catch (e) {
      // 会话失效（服务重启等）：自动重新入住并重试一次
      if (String(e.message).includes('BAD_REQUEST')) {
        const { token } = await api('/api/join', { body: { name: state.player.name, archetype: state.player.archetype, hair: state.player.hair } });
        state.token = token;
        sessionStorage.setItem('sv_token', token);
        resp = await trySend(token);
      } else throw e;
    }
    thinking.remove();
    say(state.dialogNpc, resp.text);
  } catch (e) {
    thinking.remove();
    say(state.dialogNpc, `（${state.dialogNpc.name}好像没听清，再说一遍？）`);
  } finally { sendBtn.disabled = false; }
}

function closeDialog() {
  if ($('#dialog').hidden) return;
  $('#dialog').hidden = true;
  if (state.dialogNpc && state.dialogHistory.length > 1) {
    api('/api/chat-end', { body: { token: state.token, residentId: state.dialogNpc.id, history: state.dialogHistory.slice(-8) } }).catch(() => {});
  }
  state.dialogNpc = null;
}

$('#dlgSend').onclick = send;
$('#dlgText').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
$('#dlgClose').onclick = closeDialog;

// ================= 面板 =================

async function openPanel(kind) {
  const body = $('#panelBody'), title = $('#panelTitle');
  $('#panel').hidden = false;
  body.innerHTML = '<p>翻找中…</p>';
  if (kind === 'hot') {
    title.textContent = '📋 公告栏 · 知乎热榜';
    try {
      const { items, live } = await api('/api/hot');
      body.innerHTML = `<p style="margin-bottom:8px;font-size:11.5px;color:#9B7B52">${live ? '实时热榜（每小时刷新）' : '离线内容（配置官方凭证后展示实时热榜）'}</p>` +
        items.map((i, n) => `<a class="hot-item" target="_blank" rel="noopener" href="${i.url}">${n + 1}. ${i.title}<i>知乎 ↗</i></a>`).join('');
    } catch (e) { body.innerHTML = `加载失败：${e.message}`; }
  }
  if (kind === 'library') {
    title.textContent = '📚 图书馆 · 知乎知识书架';
    try {
      const { items, live } = await api('/api/knowledge');
      body.innerHTML = `<p style="margin-bottom:8px;font-size:11.5px;color:#9B7B52">${live ? '来自知乎知识书架（点击借阅）' : '离线书单（接入接口后自动更新）'}</p><div class="book-grid">` +
        items.map((k) => `<div class="book" data-id="${k.work_id}"><b>${k.title}</b><p>${k.description || ''}</p></div>`).join('') + '</div>';
      body.querySelectorAll('.book').forEach((el) => {
        el.onclick = async () => {
          body.innerHTML = '<p>翻书中…</p>';
          const d = await api(`/api/knowledge/${el.dataset.id}`);
          body.innerHTML = `<p style="margin-bottom:10px"><a href="#" onclick="history.back();return false">← 返回书架</a></p><h3 style="margin-bottom:8px">${d.title}</h3><p style="white-space:pre-wrap">${d.content}</p>`;
        };
      });
    } catch (e) { body.innerHTML = `加载失败：${e.message}`; }
  }
  if (kind === 'hall') {
    title.textContent = '🏛️ 镇公所';
    body.innerHTML = `
      <div class="sec-title">镇长热线 · 问他任何事</div>
      <div class="mayor-form"><textarea id="mayorQ" rows="2" maxlength="80" placeholder="比如：我该不该裸辞？"></textarea><button class="btn" id="mayorGo">悄悄问镇长</button></div>
      <div class="resp" id="mayorAns" hidden></div>
      <div class="sec-title">邀请一位新居民（一句话设定）</div>
      <p style="font-size:11.5px;color:#9B7B52;margin-bottom:6px">描述一个你想在谷里见到的人，GLM 会为 TA 设计人设，写完就搬进来。你最多邀请 3 位。</p>
      <div class="mayor-form"><textarea id="custDesc" rows="2" maxlength="40" placeholder="比如：一个总在减肥的火锅博主"></textarea><button class="btn" id="custGo">邀请入住</button></div>
      <div class="resp" id="custAns" hidden></div>`;
    $('#mayorGo').onclick = async () => {
      const q = $('#mayorQ').value.trim(); if (!q) return;
      const box = $('#mayorAns'); box.hidden = false; box.textContent = '镇长思考中…';
      try {
        const { text, source } = await api('/api/mayor', { body: { question: q } });
        box.textContent = text || '镇长今天不在线。但他留了张字条：先睡一觉，问题会小一圈。' + (source === 'offline' ? '' : '');
      } catch (e) { box.textContent = `热线故障：${e.message}`; }
    };
    $('#custGo').onclick = async () => {
      const desc = $('#custDesc').value.trim(); if (!desc) return;
      const box = $('#custAns'); box.hidden = false; box.textContent = '正在为 TA 打点行李…';
      try {
        const { resident, source } = await api('/api/custom-resident', { body: { token: state.token, desc } });
        state.game.addNpc({ ...resident, greeting: resident.greeting, greetings: [resident.greeting] });
        box.innerHTML = `<b>${resident.name}</b>（${resident.title}）已入住树洞谷！出门找找 TA 吧。<br><small>人设来源：${source === 'glm' ? 'GLM 设计' : '模板合成（配置 GLM 后更生动）'}</small>`;
      } catch (e) { box.textContent = `邀请失败：${e.message}`; }
    };
  }
  if (kind === 'book') {
    title.textContent = '✨ 灵感碎片图鉴';
    const got = new Set(JSON.parse(localStorage.getItem('sv_frags') || '[]'));
    const all = state.game.frags;
    const quotes = ['先算最坏情况，再谈勇气。', '你住的房间窗户朝哪边？', '急，是这个时代最贵的奢侈品。', '明天的面包，今天就得发面。', '故事是现实缺的那一味维他命。', '决定做完，焦虑少一半。', '小镇的规矩：毒舌不诛心。', '路是试出来的，不是想出来的。', '纠结不可耻，可耻的是纠结完连收藏夹都不敢打开。', '自由很贵，先存够底气。'];
    body.innerHTML = `<p style="margin-bottom:8px">已收集 <b>${got.size}</b> / ${all.length} 枚。碎片散落在谷里的各个角落，走过去就能捡到。</p><div class="frag-grid">` +
      quotes.map((q, i) => `<div class="frag ${got.has(i) ? '' : 'off'}">${got.has(i) ? '✨ ' : '？？？'}${got.has(i) ? q : '尚未发现'}</div>`).join('') + '</div>';
  }
}
function closePanel() { $('#panel').hidden = true; }

// ================= 杂项 =================

let toastTimer;
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
let tickerTimer;
function showTicker(text) {
  const el = $('#ticker');
  el.hidden = false;
  el.textContent = text;
  clearTimeout(tickerTimer);
  tickerTimer = setTimeout(() => { el.hidden = true; }, 8000);
}
function resize() {
  canvas.width = Math.floor(window.innerWidth / SCALE) * SCALE;
  canvas.height = Math.floor(window.innerHeight / SCALE) * SCALE;
}
window.addEventListener('resize', resize);

// 时段跟随本地时钟（与服务端一致口径）
setInterval(() => {
  const h = new Date().getHours();
  state.phase = h < 6 ? '深夜' : h < 9 ? '清晨' : h < 12 ? '上午' : h < 16 ? '午后' : h < 19 ? '黄昏' : '夜晚';
}, 10000);

api('/api/status').then((s) => {
  if (!s.llm.startsWith('glm')) $('#joinNote').textContent = '提示：未配置 GLM_API_KEY，居民对话为离线模式（配置后更生动）';
}).catch(() => {});

initJoin();
