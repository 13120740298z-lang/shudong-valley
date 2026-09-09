// 树洞谷 3D 版高精细像素美术：有机地面（世界坐标噪声、边缘融合、水湾泡沫）
// —— 对标参考图（尘之回声 / 剑与远征启程风）：草地成片变色、小路边缘自然磨损、
// 水岸有泡沫线、花丛簇状分布。所有绘制一次烘焙成大贴图（24px/tile）。
import { rnd } from './sprite.js';

// —— 值噪声（世界坐标，可平铺无缝） ——
function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => {
    let n = (a | 0) * 374761393 + (b | 0) * 668265263 + seed * 1442695041;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  };
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) +
         h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
}
function fbm(x, y, seed = 0) {
  return vnoise(x, y, seed) * 0.55 + vnoise(x * 2.13, y * 2.13, seed + 7) * 0.28 + vnoise(x * 4.41, y * 4.41, seed + 13) * 0.17;
}
const mix = (a, b, t) => a + (b - a) * t;
function lerpC(c1, c2, t) {
  return [mix(c1[0], c2[0], t) | 0, mix(c1[1], c2[1], t) | 0, mix(c1[2], c2[2], t) | 0];
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// 草地调色板（由噪声带产生成片色斑，像参考图的草甸层次）
const GRASS_BANDS = [
  [92, 156, 64],   // 深草 #5C9C40
  [110, 174, 72],  // 主草 #6EAE48
  [126, 191, 84],  // 亮草 #7EBF54
  [142, 203, 96]   // 高光草 #8ECB60
];
const PATH_C = [
  [214, 168, 104], [203, 156, 94], [226, 180, 122], [190, 143, 84]
];
const PLAZA_C = [
  [199, 190, 174], [210, 201, 185], [187, 178, 162]
];
const SAND_C = [
  [231, 215, 164], [222, 205, 152], [239, 224, 176]
];
const FLOWER_COLS = [[242, 225, 76], [240, 138, 164], [255, 255, 255], [181, 127, 219], [240, 138, 90], [130, 200, 249]];

function grassPixel(wx, wy) {
  // 大尺度色斑 + 细抖动
  const band = fbm(wx * 0.045, wy * 0.045, 1);
  const bi = band < 0.36 ? 0 : band < 0.56 ? 1 : band < 0.78 ? 2 : 3;
  let c = GRASS_BANDS[bi].slice();
  const fine = (vnoise(wx * 0.6, wy * 0.6, 3) - 0.5) * 22;
  c[0] += fine; c[1] += fine; c[2] += fine * 0.6;
  // 草叶簇：轻微变暗（避免大块深斑）
  if (vnoise(wx * 0.5, wy * 0.5, 9) > 0.88) { c = lerpC(c, [72, 126, 52], 0.3); }
  return c;
}

// 水深图（到岸边距离，用于深浅渐变与泡沫）
function waterDepthMap(world) {
  const { grid, tiles, W, H } = world;
  const depth = new Int16Array(W * H).fill(-1);
  const q = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] !== tiles.WATER) { depth[y * W + x] = 0; q.push([x, y]); }
  }
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx;
      if (grid[ny][nx] === tiles.WATER && depth[i] === -1) {
        depth[i] = depth[y * W + x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  return depth;
}

export function paintGround(world, P = 24) {
  const { grid, tiles, W, H } = world;
  const cv = document.createElement('canvas');
  cv.width = W * P; cv.height = H * P;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, cv.height);
  const d = img.data;

  const mask = document.createElement('canvas');
  mask.width = cv.width; mask.height = cv.height;
  const mc = mask.getContext('2d');
  const mimg = mc.createImageData(mask.width, mask.height);
  const md = mimg.data;

  const depth = waterDepthMap(world);
  const isPathish = (t) => t === tiles.PATH || t === tiles.PLAZA;
  const pathAt = (x, y) => x >= 0 && y >= 0 && x < W && y < H && isPathish(grid[y][x]);

  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const t = grid[ty][tx];
      for (let py = 0; py < P; py++) {
        for (let px = 0; px < P; px++) {
          const wx = tx * P + px, wy = ty * P + py;
          const o = (wy * cv.width + wx) * 4;
          let col;

          if (t === tiles.WATER) {
            const dp = Math.min(4, depth[ty * W + tx]);
            const shoreN = fbm(wx * 0.12, wy * 0.12, 31);
            // 深浅：岸边浅蓝 → 深处蓝
            const shallow = [108, 186, 236], mid = [78, 150, 216], deepC = [52, 108, 178];
            col = dp <= 1 ? lerpC(shallow, mid, shoreN * 0.5)
                : dp === 2 ? lerpC(mid, deepC, 0.45)
                : lerpC(mid, deepC, 0.75);
            // 岸线泡沫：靠岸且噪声出挑
            if (dp === 1 && shoreN > 0.52) col = lerpC(col, [226, 246, 252], 0.55 + shoreN * 0.3);
            if (dp === 1 && shoreN > 0.72) col = lerpC(col, [255, 255, 255], 0.5);
            // 细波纹
            const rip = vnoise(wx * 0.35 + wy * 0.12, wy * 0.3, 41);
            if (rip > 0.86) col = lerpC(col, [190, 228, 250], 0.35);
            md[o] = md[o + 1] = md[o + 2] = 255; md[o + 3] = 255; // 水罩（供波光层用）
          } else if (t === tiles.SAND) {
            const n = fbm(wx * 0.2, wy * 0.2, 51);
            col = lerpC(SAND_C[(n * 3) | 0] || SAND_C[0], SAND_C[1], (vnoise(wx * 0.7, wy * 0.7, 52) - 0.5) * 0.6 + 0.5);
            if (vnoise(wx * 0.9, wy * 0.9, 53) > 0.93) col = lerpC(col, [180, 160, 120], 0.5); // 碎石
          } else if (t === tiles.BRIDGE) {
            // 木栈道：横板条 + 板缝 + 底缘水色
            const seam = (py % 7) === 0;
            const plankN = vnoise(wx * 0.5, ty * 3 + (py / 7 | 0), 61);
            col = seam ? [122, 90, 52] : lerpC([169, 124, 79], [146, 106, 63], plankN);
            if (px < 2 || px > P - 3) col = lerpC(col, [60, 110, 170], 0.35); // 边缘见水
            if (vnoise(wx * 0.8, wy * 0.8, 62) > 0.94) col = lerpC(col, [92, 66, 38], 0.6); // 木结
          } else if (isPathish(t)) {
            const n = fbm(wx * 0.16, wy * 0.16, 71);
            if (t === tiles.PLAZA) {
              // 石板：8px 网格 + 勾缝
              const gx = px % 12, gy = py % 12;
              if (gx < 1 || gy < 1) col = [158, 150, 136];
              else col = lerpC(PLAZA_C[(n * 3) | 0] || PLAZA_C[0], PLAZA_C[2], (vnoise(wx * 0.8, wy * 0.8, 72) - 0.5) * 0.5 + 0.5);
              if (vnoise(wx * 0.5, wy * 0.5, 73) > 0.965) col = lerpC(col, [140, 128, 112], 0.55); // 裂纹黑点
            } else {
              col = lerpC(PATH_C[(n * 4) | 0] || PATH_C[0], PATH_C[3], (vnoise(wx * 0.65, wy * 0.65, 74) - 0.5) * 0.7 + 0.5);
              // 土路被踩实的亮纹
              if (vnoise(wx * 0.45, wy * 0.45, 75) > 0.9) col = lerpC(col, [238, 205, 150], 0.4);
            }
            // 小路边缘与草地有机融合：靠近非路邻边 → 按噪声抖动画回草色
            const edge = edgeDist(tx, ty, px, py, P, pathAt);
            if (edge < 6) {
              const th = fbm(wx * 0.28, wy * 0.28, 81) * 0.7 + 0.1;
              if (th > edge / 6) col = grassPixel(wx, wy);
            }
            if (vnoise(wx * 1.1, wy * 1.1, 76) > 0.985) col = [168, 158, 142]; // 小石子
          } else {
            // 草地 / TREE/WALL/FLOOR 底层
            col = grassPixel(wx, wy);
            // 花丛：稀疏 + 成簇（噪声阈值）
            const cl = fbm(wx * 0.09, wy * 0.09, 91);
            if (t === tiles.FLOWER) {
              if (vnoise(wx * 0.55, wy * 0.55, 92) > 0.62) {
                const fi = (vnoise(wx * 0.2, wy * 0.2, 93) * FLOWER_COLS.length) | 0;
                col = FLOWER_COLS[fi % FLOWER_COLS.length];
              }
            } else if (cl > 0.62 && vnoise(wx * 0.8, wy * 0.8, 94) > 0.972) {
              col = FLOWER_COLS[(vnoise(wx * 0.3, wy * 0.3, 95) * FLOWER_COLS.length) | 0];
            }
          }

          d[o] = Math.max(0, Math.min(255, col[0] | 0));
          d[o + 1] = Math.max(0, Math.min(255, col[1] | 0));
          d[o + 2] = Math.max(0, Math.min(255, col[2] | 0));
          d[o + 3] = 255;
        }
      }
    }
  }
  c.putImageData(img, 0, 0);
  mc.putImageData(mimg, 0, 0);
  return { cv, mask };
  // —— 像素到“最近非路邻边”的距离（仅用于路缘融合） ——
  function edgeDist(tx, ty, px, py, P2, pathAtFn) {
    let e = 99;
    if (!pathAtFn(tx, ty - 1)) e = Math.min(e, py);            // 上邻非路：距上边
    if (!pathAtFn(tx, ty + 1)) e = Math.min(e, P2 - 1 - py);   // 下
    if (!pathAtFn(tx - 1, ty)) e = Math.min(e, px);            // 左
    if (!pathAtFn(tx + 1, ty)) e = Math.min(e, P2 - 1 - px);   // 右
    return e;
  }
}

// —— 精细树：层叠树冠 + 树影斑驳 + 返回树冠半径（供地面影子尺寸） ——
export function makeTree3d(seed = 0) {
  const cv = document.createElement('canvas');
  cv.width = 72; cv.height = 96;
  const c = cv.getContext('2d');
  const bx = 36, by = 92;
  // 树干（带树皮纹理与根脚）
  c.fillStyle = '#5E4023'; c.fillRect(bx - 5, by - 26, 10, 26);
  c.fillStyle = '#74522E'; c.fillRect(bx - 5, by - 26, 3, 26);
  c.fillStyle = '#4A3119'; c.fillRect(bx + 2, by - 26, 3, 26);
  c.fillStyle = '#5E4023'; c.fillRect(bx - 8, by - 4, 5, 4); c.fillRect(bx + 3, by - 4, 5, 4);
  // 枝干
  c.fillStyle = '#5E4023';
  c.fillRect(bx - 12, by - 30, 8, 3); c.fillRect(bx + 5, by - 33, 8, 3);
  // 树冠：5 团错落
  const blob = (x, y, w, h, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI * 2); c.fill(); };
  blob(bx, 30, 26, 20, '#2E6A2E');
  blob(bx - 16, 42, 16, 13, '#2E6A2E');
  blob(bx + 16, 42, 16, 13, '#2E6A2E');
  blob(bx - 9, 22, 15, 12, '#3E7C3A');
  blob(bx + 10, 24, 14, 12, '#3E7C3A');
  blob(bx, 14, 16, 12, '#4C9046');
  // 冠底阴影缘
  c.fillStyle = 'rgba(30,60,26,.55)';
  c.beginPath(); c.ellipse(bx, 46, 27, 8, 0, 0, Math.PI); c.fill();
  // 斑驳高光（叶隙光斑）
  for (let i = 0; i < 14; i++) {
    const hx = bx - 20 + Math.floor(rnd(seed, i, 3) * 40);
    const hy = 8 + Math.floor(rnd(seed, i, 4) * 34);
    c.fillStyle = i % 3 ? 'rgba(150,214,110,.5)' : 'rgba(210,240,150,.6)';
    c.fillRect(hx, hy, 3, 2); c.fillRect(hx + 2, hy - 2, 2, 2);
  }
  return { cv, ax: bx, ay: by, shadowR: 1.9 };
}

// —— 共享：柔和贴地影子贴图 ——
export function makeShadowTex() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(20,26,18,.42)');
  g.addColorStop(0.7, 'rgba(20,26,18,.22)');
  g.addColorStop(1, 'rgba(20,26,18,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return cv;
}

// —— 体积光柱（晨昏斜射光，加色混合） ——
export function makeGodrayTex() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,236,190,.85)');
  g.addColorStop(0.55, 'rgba(255,230,170,.30)');
  g.addColorStop(1, 'rgba(255,225,160,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 256);
  // 横向柔边
  const g2 = c.createLinearGradient(0, 0, 64, 0);
  g2.addColorStop(0, 'rgba(0,0,0,1)');
  g2.addColorStop(0.25, 'rgba(0,0,0,0)');
  g2.addColorStop(0.75, 'rgba(0,0,0,0)');
  g2.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = g2;
  c.fillRect(0, 0, 64, 256);
  return cv;
}

// —— 水面波光贴图（可平铺斜纹光斑，scroll 动画用） ——
export function makeShimmerTex() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const w = 8 + Math.random() * 26, h = 1.4 + Math.random() * 2.2;
    const a = 0.16 + Math.random() * 0.3;
    c.fillStyle = `rgba(235,250,255,${a})`;
    // 平铺无缝：四角复制
    for (const [ox, oy] of [[0, 0], [-128, 0], [0, -128], [-128, -128]]) {
      c.save(); c.translate(ox, oy); c.rotate(-0.35);
      c.fillRect(x, y, w, h);
      c.restore();
    }
  }
  return cv;
}
