// 树洞谷游戏主引擎：静态层构建、渲染循环、玩家/NPC 移动、寻路、交互
// 世界数据由 /api/world 获取（grid/tiles/buildings/residents）

import { paintTile, paintBuilding, makeCharacterSheet, shade } from './sprite.js';

export const TILE = 16, SCALE = 3;
const WALK_MS = 170; // 每 tile 行走耗时

export function createGame(canvas, world, opts) {
  const { onPrompt, onFragment } = opts;
  const { grid, tiles, W, H } = world;
  const g = grid;

  const walkable = (tx, ty) => {
    const t = g[ty] && g[ty][tx];
    return t !== undefined && t !== tiles.TREE && t !== tiles.WALL && t !== tiles.WATER;
  };

  // ---------- 静态层（整图一次绘制） ----------
  const staticCv = document.createElement('canvas');
  staticCv.width = W * TILE; staticCv.height = H * TILE;
  {
    const c = staticCv.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(c, g[y][x], x, y, tiles);
    for (const b of Object.values(world.buildings)) paintBuilding(c, b.key ?? b.sign ?? 'farm', b.x, b.y);
    // 公告栏（广场北）
    const bx = 22 * TILE, by = 14 * TILE;
    c.fillStyle = '#6B4A2B'; c.fillRect(bx + 2, by + 6, 12, 10);
    c.fillStyle = '#F2E7C8'; c.fillRect(bx + 3, by + 7, 10, 7);
    c.fillStyle = '#C4553B'; c.fillRect(bx + 4, by + 8, 6, 2);
    c.fillStyle = '#4A6FA5'; c.fillRect(bx + 4, by + 11, 8, 2);
    c.fillStyle = '#6B4A2B'; c.fillRect(bx + 3, by + 16, 2, 6); c.fillRect(bx + 11, by + 16, 2, 6);
  }

  // ---------- 实体 ----------
  const npcs = world.residents.map((r) => ({
    ...r,
    sheet: makeCharacterSheet(r),
    tx: r.schedule.morning.x, ty: r.schedule.morning.y,
    fx: r.schedule.morning.x, fy: r.schedule.morning.y, // 像素插值位置（tile 浮点）
    dir: 'down', frame: 0, animT: 0,
    moving: null, // {fx0,fy0,fx1,fy1,t0}
    path: [], wanderT: 0, greetedT: 0
  }));

  const player = {
    name: '', tx: Math.round(world.spawn.x), ty: Math.round(world.spawn.y),
    fx: Math.round(world.spawn.x), fy: Math.round(world.spawn.y),
    dir: 'down', frame: 0, animT: 0, moving: null, path: [],
    sheet: null, hair: '#2B2B3A'
  };

  // 灵感碎片
  const FRAG_SPOTS = [[15, 13], [25, 12], [13, 24], [33, 25], [9, 13], [24, 24], [35, 21], [7, 17], [28, 20], [21, 25]];
  const collected = new Set(JSON.parse(localStorage.getItem('sv_frags') || '[]'));
  const frags = FRAG_SPOTS.map(([x, y], i) => ({ i, x, y, taken: collected.has(i) }));

  // ---------- 寻路（BFS） ----------
  function findPath(sx, sy, gx, gy) {
    if (!walkable(gx, gy)) return null;
    const key = (x, y) => y * W + x;
    const prev = new Map();
    const q = [[sx, sy]];
    prev.set(key(sx, sy), null);
    while (q.length) {
      const [x, y] = q.shift();
      if (x === gx && y === gy) {
        const path = [];
        let k = key(x, y);
        while (k !== null) { path.push([k % W, Math.floor(k / W)]); k = prev.get(k); }
        return path.reverse().slice(1);
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (walkable(nx, ny) && !prev.has(k)) { prev.set(k, key(x, y)); q.push([nx, ny]); }
      }
    }
    return null;
  }

  function stepAlong(e, dt) {
    if (!e.moving) return;
    const t = Math.min(1, (performance.now() - e.moving.t0) / WALK_MS);
    e.fx = e.moving.fx0 + (e.moving.fx1 - e.moving.fx0) * t;
    e.fy = e.moving.fy0 + (e.moving.fy1 - e.moving.fy0) * t;
    e.tx = e.moving.fx1; e.ty = e.moving.fy1;
    e.animT += dt;
    e.frame = e.animT % 300 < 150 ? 1 : 2;
    if (t >= 1) { e.moving = null; e.frame = 0; }
  }

  function startStep(e, nx, ny) {
    e.dir = nx > e.tx ? 'right' : nx < e.tx ? 'left' : ny > e.ty ? 'down' : 'up';
    e.moving = { fx0: e.fx, fy0: e.fy, fx1: nx, fy1: ny, t0: performance.now() };
    e.tx = nx; e.ty = ny;
  }

  function walkPath(e) {
    if (e.moving || !e.path.length) return false;
    const [nx, ny] = e.path[0];
    if ((nx === e.tx && ny === e.ty)) { e.path.shift(); return walkPath(e); }
    if (!walkable(nx, ny)) { e.path = []; return false; }
    e.path.shift();
    startStep(e, nx, ny);
    return true;
  }

  // ---------- 输入 ----------
  const keys = {};
  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys[k] = down; e.preventDefault();
    }
  };
  const keyDown = (e) => onKey(e, true);
  const keyUp = (e) => onKey(e, false);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  function heldDir() {
    if (keys['w'] || keys['arrowup']) return [0, -1];
    if (keys['s'] || keys['arrowdown']) return [0, 1];
    if (keys['a'] || keys['arrowleft']) return [-1, 0];
    if (keys['d'] || keys['arrowright']) return [1, 0];
    return null;
  }

  // 点击移动
  function clickMove(evt) {
    if (opts.dialogOpen()) return;
    const rect = canvas.getBoundingClientRect();
    const sx = evt.clientX - rect.left, sy = evt.clientY - rect.top;
    const wx = camX + sx / SCALE, wy = camY + sy / SCALE;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    // 点到居民：走近并开口
    const npc = npcs.find((n) => Math.abs(n.fx - tx) < 0.6 && Math.abs(n.fy - ty) < 0.9);
    if (npc) { opts.onNpcClick(npc); return; }
    const path = findPath(player.tx, player.ty, tx, ty);
    if (path) player.path = path;
  }

  // ---------- NPC 日程 ----------
  let lastPhase = world.serverPhase;
  function scheduleCheck(phase) {
    if (phase === lastPhase) return;
    lastPhase = phase;
    for (const n of npcs) {
      const anchor = n.schedule[phaseMap(phase)];
      if (anchor) n.path = findPath(n.tx, n.ty, anchor.x, anchor.y) || [];
    }
  }
  const phaseMap = (p) => ({ '清晨': 'morning', '上午': 'morning', '午后': 'noon', '黄昏': 'evening', '夜晚': 'night', '深夜': 'night' }[p] || 'morning');

  function npcAI(dt, phase) {
    for (const n of npcs) {
      stepAlong(n, dt);
      if (!n.moving) {
        walkPath(n);
        if (!n.path.length) {
          // 锚点闲逛
          n.wanderT -= dt;
          if (n.wanderT <= 0) {
            n.wanderT = 2500 + Math.random() * 3500;
            const dx = Math.round(Math.random() * 2 - 1), dy = Math.round(Math.random() * 2 - 1);
            const nx = n.tx + dx, ny = n.ty + dy;
            const anchor = n.schedule[phaseMap(phase)];
            if (walkable(nx, ny) && Math.abs(nx - anchor.x) <= 2 && Math.abs(ny - anchor.y) <= 2) startStep(n, nx, ny);
          }
        }
      }
      // 靠近玩家主动搭话
      const d = Math.hypot(n.fx - player.fx, n.fy - player.fy);
      n.greetedT -= dt;
      if (d < 3.2 && d > 0.4 && n.greetedT <= 0 && !opts.dialogOpen()) {
        n.greetedT = 50000 + Math.random() * 40000;
        n.bubble = { text: pickGreeting(n), t: 4200 };
      }
      if (n.bubble) { n.bubble.t -= dt; if (n.bubble.t <= 0) n.bubble = null; }
    }
  }
  const pickGreeting = (n) => {
    const pool = n.greeting ? [n.greeting] : (n.greetings || ['……']);
    return pool[Math.floor(Math.random() * pool.length)];
  };

  // ---------- 相机与渲染 ----------
  let camX = 0, camY = 0;
  function updateCamera() {
    const vw = canvas.width / SCALE, vh = canvas.height / SCALE;
    camX = Math.max(0, Math.min(W * TILE - vw, player.fx * TILE + TILE / 2 - vw / 2));
    camY = Math.max(0, Math.min(H * TILE - vh, player.fy * TILE + TILE / 2 - vh / 2));
  }

  function drawChar(c, sheet, fx, fy, dir, frame) {
    const dirCol = { down: 0, right: 1, up: 2, left: 3 }[dir] ?? 0;
    const px = fx * TILE, py = fy * TILE - 4; // 角色高于 tile
    // 影子
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.beginPath();
    c.ellipse(px + 8, py + 20, 5, 2, 0, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.translate(px, py);
    if (dir === 'left') {
      c.translate(16, 0);
      c.scale(-1, 1);
      c.drawImage(sheet, 1 * 16, frame * 20, 16, 20, 0, 0, 16, 20);
    } else {
      c.drawImage(sheet, dirCol * 16, frame * 20, 16, 20, 0, 0, 16, 20);
    }
    c.restore();
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    if (!player.sheet) return; // 精灵就绪前不绘制
    const phase = opts.phase();

    // 玩家移动
    stepAlong(player, dt);
    if (!player.moving && !opts.dialogOpen()) {
      walkPath(player);
      if (!player.path.length) {
        const d = heldDir();
        if (d) {
          const nx = player.tx + d[0], ny = player.ty + d[1];
          if (walkable(nx, ny)) startStep(player, nx, ny);
          else player.dir = d[0] > 0 ? 'right' : d[0] < 0 ? 'left' : d[1] > 0 ? 'down' : 'up';
        }
      }
    }
    npcAI(dt, phase);
    scheduleCheck(phase);

    // 碎片拾取
    for (const f of frags) {
      if (!f.taken && Math.abs(player.fx - f.x) < 0.6 && Math.abs(player.fy - f.y) < 0.6) {
        f.taken = true; collected.add(f.i);
        localStorage.setItem('sv_frags', JSON.stringify([...collected]));
        onFragment(f);
      }
    }

    updateCamera();

    // 绘制
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    const vw = canvas.width / SCALE, vh = canvas.height / SCALE;
    c.fillStyle = PAL_DARKBG;
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(staticCv, camX, camY, vw, vh, 0, 0, canvas.width, canvas.height);
    c.save();
    c.scale(SCALE, SCALE);
    c.translate(-camX, -camY);

    // 碎片
    const tw = Math.sin(now / 300) * 0.5 + 0.5;
    for (const f of frags) {
      if (f.taken) continue;
      const fxp = f.x * TILE + 8, fyp = f.y * TILE + 6 - tw * 2;
      c.fillStyle = '#F7D14C';
      star(c, fxp, fyp, 3 + tw, 1.6);
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.fillRect(fxp - 1, fyp - 1, 1, 1);
    }

    // 居民（按 y 排序与玩家合层）
    const drawables = [...npcs.map((n) => ({ e: n, sheet: n.sheet })), { e: player, sheet: player.sheet }];
    drawables.sort((a, b) => a.e.fy - b.e.fy);
    for (const { e, sheet } of drawables) {
      drawChar(c, sheet, e.fx, e.fy, e.dir, e.frame);
      if (e.name) {
        c.font = '5px sans-serif';
        c.textAlign = 'center';
        c.fillStyle = 'rgba(0,0,0,.45)';
        const tw2 = c.measureText(e.name).width;
        c.fillRect(e.fx * TILE + 8 - tw2 / 2 - 2, e.fy * TILE - 10, tw2 + 4, 7);
        c.fillStyle = e === player ? '#FFE27A' : '#FFFFFF';
        c.fillText(e.name, e.fx * TILE + 8, e.fy * TILE - 4.5);
      }
      // 交互提示与气泡
      const d = Math.hypot(e.fx - player.fx, e.fy - player.fy);
      if (e !== player && d < 1.8 && !opts.dialogOpen()) {
        c.fillStyle = '#FFF6DE';
        c.font = '5px sans-serif';
        c.textAlign = 'center';
        c.fillText('E', e.fx * TILE + 8, e.fy * TILE - 13);
      }
      if (e.bubble) drawBubble(c, e.fx * TILE + 8, e.fy * TILE - 14, e.bubble.text);
    }

    // 夜晚光照
    const ph = phase;
    if (ph === '黄昏') { c.fillStyle = 'rgba(255,140,60,.16)'; c.fillRect(camX, camY, vw, vh); }
    if (ph === '夜晚' || ph === '深夜') {
      c.fillStyle = 'rgba(20,30,80,.38)';
      c.fillRect(camX, camY, vw, vh);
      // 窗光
      c.fillStyle = 'rgba(255,230,150,.55)';
      for (const b of Object.values(world.buildings)) {
        c.fillRect(b.x * 16 + 10, b.y * 16 + 23, 8, 6);
        c.fillRect(b.x * 16 + 62, b.y * 16 + 23, 8, 6);
      }
    }
    c.restore();
  }
  function loop(now) { tick(now); raf = requestAnimationFrame(loop); }
  const PAL_DARKBG = '#1E2430';
  let raf = requestAnimationFrame(loop);
  // 后台兜底：标签页不可见时 rAF 暂停，用 interval 保持世界运转（约 12fps）
  const bgTimer = setInterval(() => {
    if (performance.now() - last > 220) tick(performance.now());
  }, 80);

  function drawBubble(c, x, y, text) {
    c.font = '5px sans-serif';
    const w = Math.min(120, c.measureText(text).width + 8);
    c.fillStyle = 'rgba(255,252,240,.95)';
    roundRect(c, x - w / 2, y - 12, w, 12, 3);
    c.fill();
    c.strokeStyle = '#B8A98C';
    c.lineWidth = 0.6;
    roundRect(c, x - w / 2, y - 12, w, 12, 3);
    c.stroke();
    c.fillStyle = '#4A3B28';
    c.textAlign = 'center';
    c.fillText(ellipsis(c, text, w - 6), x, y - 3.5);
  }

  return {
    player,
    setPlayer(p) { player.name = p.name; player.hair = p.hair; player.sheet = makeCharacterSheet({ hair: p.hair, cloth: '#EAF0FF', skin: '#F2C9A0' }); },
    addNpc(r) {
      const n = { ...r, sheet: makeCharacterSheet(r), tx: r.schedule.morning.x, ty: r.schedule.morning.y, fx: r.schedule.morning.x, fy: r.schedule.morning.y, dir: 'down', frame: 0, animT: 0, moving: null, path: [], wanderT: 0, greetedT: 0 };
      npcs.push(n);
      return n;
    },
    npcs,
    frags,
    nearNpc() {
      let best = null, bd = 2.2;
      for (const n of npcs) {
        const d = Math.hypot(n.fx - player.fx, n.fy - player.fy);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    },
    clickMove,
    stop() { cancelAnimationFrame(raf); clearInterval(bgTimer); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); },
    walkable
  };
}

function star(c, x, y, r, r2) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const rr = i % 2 === 0 ? r : r2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
  c.fill();
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function ellipsis(c, text, maxW) {
  let t = String(text);
  while (c.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -1);
  return t + (t.length < String(text).length ? '…' : '');
}
export { shade };
