// 树洞谷游戏主引擎 v2：静态地表层 + 动态遮挡排序层（建筑/树/装饰/角色）
// 世界数据由 /api/world 获取

import {
  paintTile, makeTree, makeBuilding, makeLantern, makeBench, makeWell, makeSign, makeRock, makeBush, makeFountain,
  makeCharacterSheet, CHAR_W, CHAR_H
} from './sprite.js';
import { createWeather } from './weather.js';

export const TILE = 16;
export let SCALE = 3; // fitScreen 按窗口动态设定（整数倍，保像素锐利）
const WALK_MS = 170;
// 电脑端显示工程：锁定视野约 26×15 tile，整数倍缩放，画面居中（四周留黑边）
const VIEW_W_TILES = 26, VIEW_H_TILES = 15;
export function fitScreen(canvas) {
  SCALE = Math.max(1, Math.min(
    Math.floor(window.innerWidth / (VIEW_W_TILES * TILE)),
    Math.floor(window.innerHeight / (VIEW_H_TILES * TILE))
  ));
  canvas.width = VIEW_W_TILES * TILE * SCALE;
  canvas.height = VIEW_H_TILES * TILE * SCALE;
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
}

export function createGame(canvas, world, opts) {
  let audioHooks = null;
  let lastWeather = { raining: false, intensity: 0 };
  const { onFragment } = opts;
  const { grid, tiles, W, H } = world;
  const g = grid;

  const walkable = (tx, ty) => {
    const t = g[ty] && g[ty][tx];
    return t !== undefined && t !== tiles.TREE && t !== tiles.WALL && t !== tiles.WATER;
  };

  // ---------- 精灵预渲染 ----------
  const treeSprites = [makeTree(1), makeTree(2), makeTree(3)];
  const buildingSprites = Object.fromEntries(
    Object.entries(world.buildings).map(([k, b]) => [k, { ...b, key: k, sp: makeBuilding(k) }])
  );
  const propSprites = {
    lantern: makeLantern(), bench: makeBench(), well: makeWell(), fountain: makeFountain(),
    sign: makeSign(), rock: makeRock(), bush: makeBush()
  };
  // AI 生成小屋精灵（96px 高 ≈ 6 tile，占地 3×3 碰撞）
  const cottageSprites = {};
  for (const c of world.cottages || []) {
    const img = new Image();
    img.src = `/cottages/${c.id}.png`;
    cottageSprites[c.id] = img;
  }

  // ---------- 静态地表层 ----------
  const staticCv = document.createElement('canvas');
  staticCv.width = W * TILE; staticCv.height = H * TILE;
  const sc = staticCv.getContext('2d');
  let waterFrame = 0;
  function paintStatic() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(sc, g[y][x], x, y, tiles, waterFrame);
    // 公告栏（广场北，贴地，随镇区偏移）
    const TN = world.townOffset || { x: 0, y: 0 };
    const bx = (TN.x + 22) * TILE, by = (TN.y + 14) * TILE;
    sc.fillStyle = '#6B4A2B'; sc.fillRect(bx + 2, by + 6, 12, 10);
    sc.fillStyle = '#F2E7C8'; sc.fillRect(bx + 3, by + 7, 10, 7);
    sc.fillStyle = '#C4553B'; sc.fillRect(bx + 4, by + 8, 6, 2);
    sc.fillStyle = '#4A6FA5'; sc.fillRect(bx + 4, by + 11, 8, 2);
    sc.fillStyle = '#6B4A2B'; sc.fillRect(bx + 3, by + 16, 2, 6); sc.fillRect(bx + 11, by + 16, 2, 6);
    // 边界树墙（静态：角色永远不会到其后方）
    const borderTree = treeSprites[0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x] === tiles.TREE && (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) {
        sc.drawImage(borderTree.cv, x * TILE - 8, y * TILE - 24);
      }
    }
  }
  paintStatic();
  // 水面两帧动画
  setInterval(() => {
    waterFrame = 1 - waterFrame;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x] === tiles.WATER || g[y][x] === tiles.BRIDGE || g[y][x] === tiles.SAND) paintTile(sc, g[y][x], x, y, tiles, waterFrame);
    }
  }, 900);

  // ---------- 实体 ----------
  const npcs = world.residents.map((r) => ({
    ...r,
    sheet: makeCharacterSheet(r),
    tx: r.schedule.morning.x, ty: r.schedule.morning.y,
    fx: r.schedule.morning.x, fy: r.schedule.morning.y,
    dir: 'down', frame: 0, animT: 0,
    moving: null, path: [], wanderT: 0, greetedT: 0, activityT: 8000 + Math.random() * 12000, bubble: null
  }));

  const player = {
    name: '', tx: Math.round(world.spawn.x), ty: Math.round(world.spawn.y),
    fx: Math.round(world.spawn.x), fy: Math.round(world.spawn.y),
    dir: 'down', frame: 0, animT: 0, moving: null, path: [],
    sheet: null, hair: '#2B2B3A'
  };

  const FRAG_SPOTS = world.fragSpots && world.fragSpots.length >= 10 ? world.fragSpots : [[15, 13], [25, 12], [13, 24], [33, 25], [9, 13], [24, 24], [35, 21], [7, 17], [28, 20], [21, 25]];
  const collected = new Set(JSON.parse(localStorage.getItem('sv_frags') || '[]'));
  const frags = FRAG_SPOTS.map(([x, y], i) => ({ i, x, y, taken: collected.has(i) }));

  // ---------- 寻路 ----------
  function findPath(sx, sy, gx, gy) {
    sx = Math.round(sx); sy = Math.round(sy);
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
    e.animT += dt;
    e.frame = Math.floor(e.animT / 130) % 4;
    if (t >= 1) { e.moving = null; e.frame = 0; }
  }

  function startStep(e, nx, ny) {
    e.dir = nx > e.tx ? 'right' : nx < e.tx ? 'left' : ny > e.ty ? 'down' : 'up';
    e.moving = { fx0: e.fx, fy0: e.fy, fx1: nx, fy1: ny, t0: performance.now() };
    e.tx = nx; e.ty = ny;
    if (e === player && audioHooks && audioHooks.step) audioHooks.step();
  }

  function walkPath(e) {
    if (e.moving || !e.path.length) return false;
    const [nx, ny] = e.path[0];
    if (nx === e.tx && ny === e.ty) { e.path.shift(); return walkPath(e); }
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

  function clickMove(evt) {
    if (opts.dialogOpen()) return;
    const rect = canvas.getBoundingClientRect();
    const sx = evt.clientX - rect.left, sy = evt.clientY - rect.top;
    const wx = camX + sx / SCALE, wy = camY + sy / SCALE;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    // 点击命中：点击点 1.2 tile 内最近居民直接对话（脚底判定更宽容）
    let hit = null, hd = 1.2;
    for (const n of npcs) {
      const d = Math.hypot(n.fx - tx, (n.fy + 0.4) - ty);
      if (d < hd) { hd = d; hit = n; }
    }
    if (hit) { opts.onNpcClick(hit); return; }
    const path = findPath(player.tx, player.ty, tx, ty);
    if (path) player.path = path;
  }

  // ---------- NPC 日程 ----------
  let lastPhase = world.serverPhase;
  const phaseMap = (p) => ({ '清晨': 'morning', '上午': 'morning', '午后': 'noon', '黄昏': 'evening', '夜晚': 'night', '深夜': 'night' }[p] || 'morning');
  function scheduleCheck(phase) {
    if (phase === lastPhase) return;
    lastPhase = phase;
    for (const n of npcs) {
      const anchor = n.schedule[phaseMap(phase)];
      if (anchor) n.path = findPath(n.tx, n.ty, anchor.x, anchor.y) || [];
    }
  }

  function npcAI(dt, phase) {
    for (const n of npcs) {
      stepAlong(n, dt);
      if (!n.moving) {
        walkPath(n);
        if (!n.path.length) {
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
      const d = Math.hypot(n.fx - player.fx, n.fy - player.fy);
      n.greetedT -= dt;
      if (d < 3.2 && d > 0.4 && n.greetedT <= 0 && !opts.dialogOpen()) {
        n.greetedT = 50000 + Math.random() * 40000;
        const pool = n.greeting ? [n.greeting] : (n.greetings || ['……']);
        n.bubble = { text: pool[Math.floor(Math.random() * pool.length)], t: 4200 };
      }
      // 行为气泡：AI 小镇式的"正在做什么"
      n.activityT -= dt;
      if (n.activityT <= 0 && !n.bubble && !opts.dialogOpen()) {
        n.activityT = 16000 + Math.random() * 20000;
        const acts = n.activities && n.activities[phaseMap(phase)];
        if (acts) n.bubble = { text: '· ' + acts + ' ·', t: 5000 };
      }
      if (n.bubble) { n.bubble.t -= dt; if (n.bubble.t <= 0) n.bubble = null; }
    }
  }

  // ---------- 相机 ----------
  let camX = 0, camY = 0;
  function updateCamera() {
    const vw = canvas.width / SCALE, vh = canvas.height / SCALE;
    const worldW = W * TILE, worldH = H * TILE;
    camX = worldW <= vw ? (worldW - vw) / 2 : Math.max(0, Math.min(worldW - vw, player.fx * TILE + TILE / 2 - vw / 2));
    camY = worldH <= vh ? (worldH - vh) / 2 : Math.max(0, Math.min(worldH - vh, player.fy * TILE + TILE / 2 - vh / 2));
  }

  // ---------- 绘制 ----------
  function drawChar(c, sheet, fx, fy, dir, frame) {
    const dirCol = { down: 0, right: 1, up: 2, left: 3 }[dir] ?? 0;
    const px = Math.round(fx * TILE + 8 - CHAR_W / 2);
    const py = Math.round(fy * TILE + 16 - CHAR_H - 1);
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.beginPath(); c.ellipse(fx * TILE + 8, fy * TILE + 15, 6, 2.4, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(px, py);
    if (dir === 'left') {
      c.translate(CHAR_W, 0); c.scale(-1, 1);
      c.drawImage(sheet, 1 * CHAR_W, frame * CHAR_H, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
    } else {
      c.drawImage(sheet, dirCol * CHAR_W, frame * CHAR_H, CHAR_W, CHAR_H, 0, 0, CHAR_W, CHAR_H);
    }
    c.restore();
  }

  // 黑猫（广场彩蛋）：慢速游荡，偶尔坐下
  const cat = { x: world.plaza.x + 2, y: world.plaza.y - 1, dir: 1, t: 0, sit: 0 };
  function drawCat(c, now) {
    const px = cat.x * TILE, py = cat.y * TILE;
    c.save();
    c.translate(px, py);
    if (cat.dir < 0) { c.scale(-1, 1); }
    const bob = cat.sit > 0 ? 0 : Math.sin(now / 180) * 0.6;
    // 身体
    c.fillStyle = '#26232B';
    c.fillRect(-5, -6 + bob, 10, 5);
    // 头
    c.fillRect(-4, -11 + bob, 7, 6);
    // 耳朵
    c.fillRect(-4, -13 + bob, 2, 2); c.fillRect(1, -13 + bob, 2, 2);
    // 眼睛（黄）
    c.fillStyle = '#F2C14E'; c.fillRect(-2, -9 + bob, 1, 1); c.fillRect(1, -9 + bob, 1, 1);
    // 尾巴
    c.fillStyle = '#26232B';
    const tw = Math.sin(now / 300) * 2;
    c.fillRect(4, -4 + bob, 1, 4 + tw * 0.5); c.fillRect(5, -6 + bob + tw * 0.4, 1, 3);
    c.restore();
  }

  const chimneys = Object.values(buildingSprites).flatMap((b) => {
    const dx = b.x * TILE - 12, dy = b.y * TILE - 46;
    return ((b.sp && b.sp.chimneys) || b.chimneys || []).map(([cx2, cy2]) => ({ wx: dx + cx2 + 5, wy: dy + cy2 }));
  });
  let smokeT = 0;
  const smokes = [];
  const fireflies = Array.from({ length: 8 }, (_, i) => ({ x: 6 + rnd01(i, 1) * 30, y: 6 + rnd01(i, 2) * 22, ph: i * 1.7 }));
  const weather = createWeather(canvas);
  function rnd01(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

  function drawSorted(c, now) {
    const items = [];
    for (const b of Object.values(buildingSprites)) {
      items.push({
        ay: b.y * TILE + 64,
        draw: () => c.drawImage(b.sp.cv, b.x * TILE - 12, b.y * TILE - 46)
      });
    }
    for (const co of world.cottages || []) {
      const img = cottageSprites[co.id];
      if (!img || !img.complete) continue;
      // 锚点：占地 3×3 tile，精灵底边对齐占地底边，水平居中
      const px = co.x * TILE + 24 - img.width / 2;
      const py = (co.y + 3) * TILE - img.height;
      items.push({ ay: (co.y + 3) * TILE - 2, draw: () => c.drawImage(img, Math.round(px), Math.round(py)) });
    }
    for (const [tx, ty] of world.bigTrees || []) {
      const sp = treeSprites[(tx * 7 + ty * 3) % 3];
      items.push({ ay: ty * TILE + 16, draw: () => c.drawImage(sp.cv, tx * TILE - 8, ty * TILE - 24) });
    }
    for (const p of world.props || []) {
      const sp = propSprites[p.kind];
      if (!sp) continue;
      const px = p.x * TILE, py = p.y * TILE;
      items.push({
        ay: p.y * TILE + 14,
        draw: () => c.drawImage(sp.cv, Math.round(px - sp.ax), Math.round(py - sp.ay))
      });
    }
    const tw = Math.sin(now / 300) * 0.5 + 0.5;
    for (const f of frags) {
      if (f.taken) continue;
      items.push({
        ay: f.y * TILE + 8,
        draw: () => {
          const fxp = f.x * TILE + 8, fyp = f.y * TILE + 6 - tw * 2;
          c.fillStyle = '#F7D14C';
          star(c, fxp, fyp, 3.4 + tw, 1.8);
          c.fillStyle = 'rgba(255,255,255,.95)';
          c.fillRect(fxp - 1, fyp - 1, 1, 1);
        }
      });
    }
    for (const n of npcs) items.push({ ay: n.fy * TILE + 15, draw: () => drawChar(c, n.sheet, n.fx, n.fy, n.dir, n.moving ? n.frame : 0) });
    items.push({ ay: player.fy * TILE + 15, draw: () => drawChar(c, player.sheet, player.fx, player.fy, player.dir, player.moving ? player.frame : 0) });

    items.sort((a, b) => a.ay - b.ay);
    for (const it of items) it.draw();
  }

  function drawBubblesAndLabels(c) {
    c.font = '5px sans-serif';
    c.textAlign = 'center';
    for (const n of npcs) {
      const sx = n.fx * TILE + 8, sy = n.fy * TILE + 16 - CHAR_H - 6;
      const nw = c.measureText(n.name).width;
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.fillRect(sx - nw / 2 - 2, sy - 7, nw + 4, 7);
      c.fillStyle = '#FFFFFF';
      c.fillText(n.name, sx, sy - 2);
      const d = Math.hypot(n.fx - player.fx, n.fy - player.fy);
      if (d < 1.8 && !opts.dialogOpen()) {
        c.fillStyle = '#FFF6DE';
        c.fillText('E', sx, sy - 10);
      }
      if (n.bubble) drawBubble(c, sx, sy - 12, n.bubble.text);
    }
    const sx = player.fx * TILE + 8, sy = player.fy * TILE + 16 - CHAR_H - 6;
    const pw = c.measureText(player.name).width;
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.fillRect(sx - pw / 2 - 2, sy - 7, pw + 4, 7);
    c.fillStyle = '#FFE27A';
    c.fillText(player.name, sx, sy - 2);
  }

  function drawBubble(c, x, y, text) {
    c.font = '5px sans-serif';
    const w = Math.min(130, c.measureText(text).width + 8);
    c.fillStyle = 'rgba(255,252,240,.96)';
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

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    if (!player.sheet) return;
    const phase = opts.phase();

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

    for (const f of frags) {
      if (!f.taken && Math.abs(player.fx - f.x) < 0.6 && Math.abs(player.fy - f.y) < 0.6) {
        f.taken = true; collected.add(f.i);
        localStorage.setItem('sv_frags', JSON.stringify([...collected]));
        audioHooks && audioHooks.pickup && audioHooks.pickup();
        onFragment(f);
      }
    }

    updateCamera();

    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    const vw = canvas.width / SCALE, vh = canvas.height / SCALE;
    c.fillStyle = '#1E2430';
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(staticCv, camX, camY, vw, vh, 0, 0, canvas.width, canvas.height);

    c.save();
    c.scale(SCALE, SCALE);
    c.translate(-camX, -camY);

    drawSorted(c, now);

    // 烟囱烟
    smokeT += dt;
    if (smokeT > 500 && chimneys.length) {
      smokeT = 0;
      const src = chimneys[Math.floor(Math.random() * chimneys.length)];
      smokes.push({ x: src.wx, y: src.wy, t: 0, drift: (Math.random() - 0.5) * 3 });
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.t += dt;
      const a = Math.max(0, 0.5 - s.t / 4000);
      if (a <= 0) { smokes.splice(i, 1); continue; }
      c.fillStyle = `rgba(235,235,225,${a})`;
      const r = 1.5 + s.t / 900;
      c.beginPath(); c.arc(s.x + s.drift * (s.t / 1000), s.y - s.t / 90, r, 0, Math.PI * 2); c.fill();
    }

    // 夜晚：路灯 + 窗光 + 萤火虫
    var night = phase === '夜晚' || phase === '深夜';
    if (phase === '黄昏') { c.fillStyle = 'rgba(255,140,60,.15)'; c.fillRect(camX, camY, vw, vh); }
    if (night) {
      c.fillStyle = 'rgba(18,28,72,.42)';
      c.fillRect(camX, camY, vw, vh);
      for (const p of world.props || []) {
        if (p.kind !== 'lantern') continue;
        const lx = p.x * TILE, ly = p.y * TILE - 24;
        const gr = c.createRadialGradient(lx, ly, 2, lx, ly, 34);
        gr.addColorStop(0, 'rgba(255,214,110,.5)');
        gr.addColorStop(1, 'rgba(255,214,110,0)');
        c.fillStyle = gr;
        c.fillRect(lx - 34, ly - 34, 68, 68);
        c.fillStyle = '#FFF0B8';
        c.beginPath(); c.arc(lx, ly, 2.4, 0, Math.PI * 2); c.fill();
      }
      for (const b of Object.values(buildingSprites)) {
        const cx = b.x * TILE + 40, cy = b.y * TILE + 8;
        const gr = c.createRadialGradient(cx, cy, 4, cx, cy, 46);
        gr.addColorStop(0, 'rgba(255,214,130,.22)');
        gr.addColorStop(1, 'rgba(255,214,130,0)');
        c.fillStyle = gr;
        c.fillRect(cx - 46, cy - 46, 92, 92);
      }
      for (const ff of fireflies) {
        const t = now / 1000;
        const fxp = (ff.x + Math.sin(t * 0.7 + ff.ph) * 2.5) * TILE;
        const fyp = (ff.y + Math.cos(t * 0.5 + ff.ph) * 1.8) * TILE;
        const blink = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + ff.ph * 3));
        c.fillStyle = `rgba(220,255,140,${0.75 * blink})`;
        c.beginPath(); c.arc(fxp, fyp, 1.2, 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgba(220,255,140,${0.25 * blink})`;
        c.beginPath(); c.arc(fxp, fyp, 3, 0, Math.PI * 2); c.fill();
      }
    }

    drawBubblesAndLabels(c);
    c.restore();

    // 天气层（屏幕空间）
    const wres = weather.updateAndDraw(c, now, dt, night);
    lastWeather = wres;
    opts.onWeather && opts.onWeather(wres);
  }
  function loop(now) { tick(now); raf = requestAnimationFrame(loop); }
  let raf = requestAnimationFrame(loop);
  const bgTimer = setInterval(() => { if (performance.now() - last > 220) tick(performance.now()); }, 80);

  return {
    player,
    setPlayer(p) { player.name = p.name; player.hair = p.hair; player.sheet = makeCharacterSheet({ hair: p.hair, cloth: '#EAF0FF', skin: '#F2C9A0' }); },
    addNpc(r) {
      const n = { ...r, sheet: makeCharacterSheet(r), tx: r.schedule.morning.x, ty: r.schedule.morning.y, fx: r.schedule.morning.x, fy: r.schedule.morning.y, dir: 'down', frame: 0, animT: 0, moving: null, path: [], wanderT: 0, greetedT: 0, activityT: 8000 + Math.random() * 12000, bubble: null };
      npcs.push(n);
      return n;
    },
    npcs,
    frags,
    setAudioHooks(h) { audioHooks = h; },
    showResidentChat(aName, bName, lines) {
      const a = npcs.find((n) => n.name === aName), b = npcs.find((n) => n.name === bName);
      if (!a || !b) return;
      const msg = lines.slice(0, 3);
      msg.forEach((text, i) => {
        const who = i % 2 === 0 ? a : b;
        setTimeout(() => { who.bubble = { text, t: 3400 }; }, i * 2200);
      });
      a.path = b.path = [];
    },
    forceWeather(rain) { weather.force(rain); },
    get weatherState() { return lastWeather; },
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
