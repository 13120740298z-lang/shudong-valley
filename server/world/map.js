// 树洞谷地图：44×34 tile，程序化生成（边界树墙/河流/路网/八区）
// tile: 0草 1路 2水 3树(碰撞) 4墙(碰撞) 5石板 6花 7桥 8沙 9木地板

export const W = 44, H = 34;

const T = { GRASS: 0, PATH: 1, WATER: 2, TREE: 3, WALL: 4, PLAZA: 5, FLOWER: 6, BRIDGE: 7, SAND: 8, FLOOR: 9 };

export function buildMap() {
  const g = Array.from({ length: H }, () => Array(W).fill(T.GRASS));

  // 边界树林（两圈，留出视觉厚度）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) g[y][x] = T.TREE;
  }
  // 点缀树
  const trees = [[5,5],[6,6],[37,5],[38,6],[5,20],[6,21],[38,20],[37,22],[14,7],[27,26],[35,28],[9,28],[20,3],[24,30]];
  for (const [x, y] of trees) g[y][x] = T.TREE;

  // 河流：东北角向南再向西（曲线）
  const riverPath = [];
  let rx = 39, ry = 3;
  while (ry < 24) { riverPath.push([rx, ry]); ry++; if (ry % 7 === 0 && rx > 33) rx--; }
  while (rx > 27) { riverPath.push([rx, ry]); rx--; }
  for (const [x, y] of riverPath) { g[y][x] = T.WATER; if (g[y - 1] && g[y - 1][x] === T.GRASS) g[y - 1][x] = T.WATER; }
  // 沙岸
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (g[y][x] === T.WATER) {
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (g[ny] && g[ny][nx] === T.GRASS) g[ny][nx] = T.SAND;
      }
    }
  }
  // 桥（东西向主路跨河）
  const bridgeY = 22;
  for (let x = 28; x <= 40; x++) if (g[bridgeY][x] === T.WATER) g[bridgeY][x] = T.BRIDGE;

  // 路网：主十字 + 支路
  const hline = (y, x1, x2) => { for (let x = x1; x <= x2; x++) if (g[y][x] === T.GRASS || g[y][x] === T.SAND) g[y][x] = T.PATH; };
  const vline = (x, y1, y2) => { for (let y = y1; y <= y2; y++) if (g[y][x] === T.GRASS || g[y][x] === T.SAND) g[y][x] = T.PATH; };
  hline(22, 4, 40);            // 主横路（过桥）
  vline(20, 4, 28);            // 主纵路
  vline(12, 8, 22);            // 西纵路
  hline(14, 12, 32);           // 北横路
  vline(30, 10, 22);           // 东纵路
  hline(10, 12, 30);           // 建筑前路
  vline(8, 14, 22);            // 花田路
  hline(26, 20, 36);           // 湖边路

  // 中心广场（石板 7×5）与喷泉位
  for (let y = 15; y <= 19; y++) for (let x = 17; x <= 23; x++) g[y][x] = T.PLAZA;

  // 建筑占位（墙块 5×4，门朝南）；floor 表示门内概念区
  const buildings = {
    library:  { x: 10, y: 8,  door: [12, 12] },
    tavern:   { x: 28, y: 6,  door: [30, 10] },
    hall:     { x: 18, y: 3,  door: [20, 7]  },
    bakery:   { x: 8,  y: 15, door: [10, 19] },
    farm:     { x: 33, y: 15, door: [34, 19] }
  };
  for (const b of Object.values(buildings)) {
    for (let y = b.y; y < b.y + 4; y++) for (let x = b.x; x < b.x + 5; x++) g[y][x] = T.WALL;
    g[b.door[1]][b.door[0]] = T.PATH; // 门前踏面
  }

  // 花田与花点缀
  for (let y = 16; y <= 20; y++) for (let x = 5; x <= 7; x++) if (g[y][x] === T.GRASS) g[y][x] = T.FLOWER;
  const flowers = [[15,12],[24,12],[26,20],[13,24],[33,25],[9,12],[22,24],[27,14]];
  for (const [x, y] of flowers) if (g[y][x] === T.GRASS) g[y][x] = T.FLOWER;

  // 湖（西南）
  for (let y = 27; y <= 31; y++) for (let x = 30; x <= 39; x++) {
    const d = Math.hypot((x - 34.5) / 5, (y - 29) / 2.4);
    if (d < 1) g[y][x] = T.WATER; else if (d < 1.28 && g[y][x] === T.GRASS) g[y][x] = T.SAND;
  }

  // 谷口出生点清理
  for (let y = 25; y <= 27; y++) for (let x = 5; x <= 8; x++) if (g[y][x] === T.TREE || g[y][x] === T.FLOWER) g[y][x] = T.GRASS;
  for (let y = 25; y <= 26; y++) for (let x = 6; x <= 7; x++) g[y][x] = T.PATH;

  return { grid: g, tiles: T, buildings, spawn: { x: 6, y: 26 }, plaza: { x: 20, y: 17 } };
}

export const AREA_LABELS = {
  spawn: { x: 6, y: 26, r: 3, name: '谷口' },
  plaza: { x: 20, y: 17, r: 4, name: '中心广场' },
  library: { x: 12, y: 12, r: 3, name: '图书馆' },
  tavern: { x: 30, y: 10, r: 3, name: '老盐酒馆' },
  hall: { x: 20, y: 7, r: 3, name: '镇公所' },
  bakery: { x: 10, y: 19, r: 3, name: '面包房' },
  lake: { x: 34, y: 24, r: 4, name: '湖边' },
  flower: { x: 6, y: 18, r: 3, name: '花田' },
  farm: { x: 34, y: 19, r: 3, name: '菜地' }
};

export function areaAt(x, y) {
  for (const a of Object.values(AREA_LABELS)) {
    if (Math.hypot(x - a.x, y - a.y) <= a.r) return a.name;
  }
  return '乡间小路';
}

export function isWalkable(grid, tiles, tx, ty) {
  const t = grid[ty] && grid[ty][tx];
  if (t === undefined) return false;
  return !(t === tiles.TREE || t === tiles.WALL || t === tiles.WATER);
}
