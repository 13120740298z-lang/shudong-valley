// 树洞谷世界生成器 v3：柏林噪声郊野 + 手工镇区
// 世界 72×56 tile：中心镇区（原 44×34 布局）保持手工设计，四周旷野由 Perlin FBM 生成
// 森林密度、草地色变异、花丛、湖岸线均由噪声驱动；同 seed 同世界
// tile: 0草 1路 2水 3树(碰撞) 4墙(碰撞) 5石板 6花 7桥 8沙 9木地板

import { Perlin } from './perlin.js';

export const W = 72, H = 56;
// 镇区在在世界中的偏移（原 44×34 地图整体置于中心）
const TX = 14, TY = 11;

const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, WALL: 4, PLAZA: 5, FLOWER: 6, BRIDGE: 7, SAND: 8, FLOOR: 9 };

export function buildMap(seed = 20260913) {
  const perlin = new Perlin(seed);
  const g = Array.from({ length: H }, () => Array(W).fill(T.GRASS));

  // ---------- 1) 郊野噪声地形 ----------
  const NOISE_SCALE = 0.09;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inTown = x >= TX && x < TX + 44 && y >= TY && y < TY + 34;
      if (inTown) continue; // 镇区稍后手工覆盖
      const n = perlin.fbm(x * NOISE_SCALE, y * NOISE_SCALE, { octaves: 4 });
      const m = perlin.fbm(x * NOISE_SCALE + 100, y * NOISE_SCALE - 100, { octaves: 3 }); // 第二通道：湿度
      // 湖泊：低洼处成水
      if (n < -0.34) { g[y][x] = T.WATER; continue; }
      if (n < -0.28) { g[y][x] = T.SAND; continue; }
      // 森林：高地+湿度高 → 密树
      const forest = m * 0.5 + n * 0.5;
      if (n > 0.08 && forest > 0.04) { g[y][x] = T.TREE; continue; }
      // 花丛：湿度高但地势平
      if (m > 0.3 && n > -0.05 && n < 0.12) { g[y][x] = T.FLOWER; continue; }
      g[y][x] = T.GRASS;
    }
  }
  // 水边沙化
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] === T.WATER) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (g[ny] && (g[ny][nx] === T.GRASS || g[ny][nx] === T.TREE || g[ny][nx] === T.FLOWER)) g[ny][nx] = T.SAND;
      }
    }
  }

  // ---------- 2) 镇区（原手工 44×34 布局） ----------
  const town = buildTown(seed);
  for (let y = 0; y < 34; y++) for (let x = 0; x < 44; x++) {
    g[TY + y][TX + x] = town.grid[y][x];
  }
  // 建筑门牌坐标平移到世界
  const buildings = Object.fromEntries(
    Object.entries(town.buildings).map(([k, b]) => [k, { ...b, x: b.x + TX, y: b.y + TY, door: [b.door[0] + TX, b.door[1] + TY] }])
  );

  // ---------- 3) 镇区出口接郊野道路（噪声簇中开路） ----------
  const carve = (x, y) => { if (g[y] && g[y][x] !== undefined && g[y][x] !== T.WATER) g[y][x] = T.PATH; };
  // 西侧谷口向西
  for (let x = TX - 1; x >= TX - 5; x--) carve(x, TY + 26);
  // 北侧library路向北
  for (let y = TY - 1; y >= TY - 4; y--) carve(TX + 12, y);
  // 东侧主路向东
  for (let x = TX + 44; x < TX + 49; x++) carve(x, TY + 22);
  // 南侧
  for (let y = TY + 34; y < TY + 38; y++) carve(TX + 20, y);

  // ---------- 4) 郊野清理：保证镇区边界外一圈无树墙堵路 ----------
  for (let y = TY - 2; y < TY + 36; y++) for (let x = TX - 2; x < TX + 46; x++) {
    if (g[y] && g[y][x] === T.TREE && (x < TX || x >= TX + 44 || y < TY || y >= TY + 34)) {
      // 镇区紧邻的树稀疏化，留出散步空间
      const n = perlin.noise(x * 0.3, y * 0.3);
      if (n > -0.2) g[y][x] = T.GRASS;
    }
  }

  // 草地色变异信息（供前端渲染微调）：
  const grassVariation = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(Math.round((perlin.fbm(x * 0.13 + 500, y * 0.13 + 500, { octaves: 2 }) + 1) * 50));
    grassVariation.push(row);
  }

  return { grid: g, tiles: T, buildings, grassVariation, spawn: { x: TX + 6, y: TY + 26 }, plaza: { x: TX + 20, y: TY + 17 }, townOffset: { x: TX, y: TY } };
}

// ---------- 镇区手工布局（原逻辑平移，不再含边界树墙） ----------
function buildTown(seed) {
  const perlin = new Perlin(seed + 777);
  const g = Array.from({ length: 34 }, () => Array(44).fill(T.GRASS));
  // 点缀树（噪声驱动的位置微移）
  const trees = [[5, 5], [6, 6], [37, 5], [38, 6], [5, 20], [6, 21], [38, 20], [37, 22], [14, 7], [27, 26], [35, 28], [9, 28], [20, 3], [24, 30]];
  for (const [x, y] of trees) g[y][x] = T.TREE;

  const riverPath = [];
  let rx = 39, ry = 3;
  while (ry < 24) { riverPath.push([rx, ry]); ry++; if (ry % 7 === 0 && rx > 33) rx--; }
  while (rx > 27) { riverPath.push([rx, ry]); rx--; }
  for (const [x, y] of riverPath) { g[y][x] = T.WATER; if (g[y - 1] && g[y - 1][x] === T.GRASS) g[y - 1][x] = T.WATER; }
  for (let y = 1; y < 33; y++) for (let x = 1; x < 43; x++) {
    if (g[y][x] === T.WATER) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (g[ny] && (g[ny][nx] === T.GRASS)) g[ny][nx] = T.SAND;
      }
    }
  }
  const bridgeY = 22;
  for (let x = 28; x <= 40; x++) if (g[bridgeY][x] === T.WATER) g[bridgeY][x] = T.BRIDGE;

  const hline = (y, x1, x2) => { for (let x = x1; x <= x2; x++) if (g[y][x] === T.GRASS || g[y][x] === T.SAND) g[y][x] = T.PATH; };
  const vline = (x, y1, y2) => { for (let y = y1; y <= y2; y++) if (g[y][x] === T.GRASS || g[y][x] === T.SAND) g[y][x] = T.PATH; };
  hline(22, 4, 40);
  vline(20, 4, 28);
  vline(12, 8, 22);
  hline(14, 12, 32);
  vline(30, 10, 22);
  hline(10, 12, 30);
  vline(8, 14, 22);
  hline(26, 20, 36);

  for (let y = 15; y <= 19; y++) for (let x = 17; x <= 23; x++) g[y][x] = T.PLAZA;

  const buildings = {
    library: { x: 10, y: 8, door: [12, 12] },
    tavern: { x: 28, y: 6, door: [30, 10] },
    hall: { x: 18, y: 3, door: [20, 7] },
    bakery: { x: 8, y: 15, door: [10, 19] },
    farm: { x: 33, y: 15, door: [34, 19] }
  };
  for (const b of Object.values(buildings)) {
    for (let y = b.y; y < b.y + 4; y++) for (let x = b.x; x < b.x + 5; x++) g[y][x] = T.WALL;
    g[b.door[1]][b.door[0]] = T.PATH;
  }

  for (let y = 16; y <= 20; y++) for (let x = 5; x <= 7; x++) if (g[y][x] === T.GRASS) g[y][x] = T.FLOWER;
  const flowers = [[15, 12], [24, 12], [26, 20], [13, 24], [33, 25], [9, 12], [22, 24], [27, 14]];
  for (const [x, y] of flowers) if (g[y][x] === T.GRASS) g[y][x] = T.FLOWER;
  // 噪声花丛（镇区内）
  for (let y = 2; y < 32; y++) for (let x = 2; x < 42; x++) {
    if (g[y][x] === T.GRASS) {
      const m = perlin.fbm(x * 0.16 + 300, y * 0.16 + 300, { octaves: 2 });
      if (m > 0.42) g[y][x] = T.FLOWER;
    }
  }

  for (let y = 27; y <= 31; y++) for (let x = 30; x <= 39; x++) {
    const d = Math.hypot((x - 34.5) / 5, (y - 29) / 2.4);
    if (d < 1) g[y][x] = T.WATER; else if (d < 1.28 && g[y][x] === T.GRASS) g[y][x] = T.SAND;
  }

  for (let y = 25; y <= 27; y++) for (let x = 5; x <= 8; x++) if (g[y][x] === T.TREE || g[y][x] === T.FLOWER) g[y][x] = T.GRASS;
  for (let y = 25; y <= 26; y++) for (let x = 6; x <= 7; x++) g[y][x] = T.PATH;

  return { grid: g, buildings };
}

export const AREA_LABELS = {
  spawn: { x: TX + 6, y: TY + 26, r: 3, name: '谷口' },
  plaza: { x: TX + 20, y: TY + 17, r: 4, name: '中心广场' },
  library: { x: TX + 12, y: TY + 12, r: 3, name: '图书馆' },
  tavern: { x: TX + 30, y: TY + 10, r: 3, name: '老盐酒馆' },
  hall: { x: TX + 20, y: TY + 7, r: 3, name: '镇公所' },
  bakery: { x: TX + 10, y: TY + 19, r: 3, name: '面包房' },
  lake: { x: TX + 34, y: TY + 24, r: 4, name: '镇湖' },
  flower: { x: TX + 6, y: TY + 18, r: 3, name: '花田' },
  farm: { x: TX + 34, y: TY + 19, r: 3, name: '菜地' },
  wild: { x: 4, y: 4, r: 99, name: '树洞旷野' }
};

// 灵感碎片：镇区 10 枚 + 郊野 8 枚（噪声选择可走格）

export function areaAt(x, y) {
  for (const a of Object.values(AREA_LABELS)) {
    if (Math.hypot(x - a.x, y - a.y) <= a.r) return a.name;
  }
  return '树洞旷野';
}

export function fragSpots(world) {
  const { grid, tiles } = world;
  const townSpots = [[15, 13], [25, 12], [13, 24], [33, 25], [9, 13], [24, 24], [35, 21], [7, 17], [28, 20], [21, 25]];
  const spots = townSpots.map(([x, y]) => [TX + x, TY + y]);
  const perlin = new Perlin(seedOf(world));
  let placed = 0, guard = 0;
  while (placed < 8 && guard < 500) {
    guard++;
    const x = 3 + Math.floor(Math.abs(perlin.noise(placed * 3.7 + 11, 5.2)) * (W - 6));
    const y = 3 + Math.floor(Math.abs(perlin.noise(placed * 2.9 - 7, 9.1)) * (H - 6));
    const t = grid[y] && grid[y][x];
    const inTown = x >= TX && x < TX + 44 && y >= TY && y < TY + 34;
    if ((t === T.GRASS || t === T.FLOWER || t === T.SAND) && !inTown) {
      spots.push([x, y]);
      placed++;
    }
  }
  return spots;
}
function seedOf(world) { return world.__seed || 20260913; }

export function isWalkable(grid, tiles, tx, ty) {
  const t = grid[ty] && grid[ty][tx];
  if (t === undefined) return false;
  return !(t === tiles.TREE || t === tiles.WALL || t === tiles.WATER);
}

// 环境装饰（镇区局部坐标，server 平移到世界坐标）
export const PROPS = [
  { kind: 'lantern', x: 16.5, y: 15 }, { kind: 'lantern', x: 23.5, y: 15 },
  { kind: 'lantern', x: 16.5, y: 20 }, { kind: 'lantern', x: 23.5, y: 20 },
  { kind: 'lantern', x: 14, y: 14 }, { kind: 'lantern', x: 26, y: 14 },
  { kind: 'bench', x: 18.5, y: 16 }, { kind: 'bench', x: 21.5, y: 16 },
  { kind: 'well', x: 20, y: 17 },
  { kind: 'sign', x: 8, y: 24 }, { kind: 'sign', x: 30, y: 21 },
  { kind: 'rock', x: 10.5, y: 11.5 }, { kind: 'rock', x: 25.5, y: 22.5 }, { kind: 'rock', x: 36.5, y: 13.5 },
  { kind: 'bush', x: 13.5, y: 24.5 }, { kind: 'bush', x: 31.5, y: 8.5 }, { kind: 'bush', x: 7.5, y: 13.5 },
  { kind: 'bush', x: 26.5, y: 25.5 }, { kind: 'bush', x: 37.5, y: 26.5 }
];

// 独立大树（镇区局部坐标）
export const BIG_TREES = [
  [4, 10], [9, 6], [26, 5], [35, 8], [40, 12],
  [4, 30], [12, 30], [25, 30], [41, 28], [16, 10]
];
