// 树洞谷程序化像素美术 v2 —— 立体建筑 / 大角色 / 环境装饰 / 光效
// 坐标体系：1 tile = 16px；角色 20×28；所有精灵预渲染为离屏 canvas
// 全部由代码逐像素绘制，无外部素材

// 稳定伪随机
export function rnd(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.max(0, Math.min(255, Math.round(b + 255 * amt))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const PAL = {
  grass: ['#79B850', '#6FAE48', '#84C25A', '#639F41'],
  path: ['#D9A868', '#CE9C5E', '#E2B47A', '#C08F54'],
  plaza: ['#C7BEAE', '#BBB2A2', '#D2C9B9'],
  water: ['#4E96D8', '#4189CC', '#5CA4E4', '#7FC0F0'],
  sand: ['#E7D7A4', '#DECD98', '#EFE0B0'],
  bridge: ['#A97C4F', '#98703F', '#B98A5C'],
  tree: ['#3E7C3A', '#2F6830', '#4C9046', '#5CA854'],
  trunk: '#6B4A2B',
  wallC: '#F2E6C4', wallC2: '#E6D7B0', beam: '#8A6A44',
  wood: '#9A7448', woodDark: '#7A5A34', woodLight: '#B99264',
  stone: '#9C968A', stoneDark: '#7E7869', stoneLight: '#B8B2A4',
  dark: '#1E2430'
};

// ============================================================
// 地表瓦片（静态层）
// ============================================================

export function paintTile(ctx, t, x, y, T, frame = 0) {
  const px = x * 16, py = y * 16;
  const base = (colors, density = 5) => {
    ctx.fillStyle = colors[0]; ctx.fillRect(px, py, 16, 16);
    for (let i = 0; i < density; i++) {
      const rx = px + Math.floor(rnd(x, y, i) * 15), ry = py + Math.floor(rnd(x, y, i + 9) * 15);
      ctx.fillStyle = colors[1 + (i % (colors.length - 1))];
      ctx.fillRect(rx, ry, 2, 2);
    }
  };
  if (t === T.GRASS) {
    base(PAL.grass);
    if (rnd(x, y, 99) > 0.84) {
      ctx.fillStyle = PAL.grass[3];
      const gx = px + 4 + Math.floor(rnd(x, y, 55) * 7), gy = py + 9;
      ctx.fillRect(gx, gy, 1, 3); ctx.fillRect(gx + 2, gy - 1, 1, 4); ctx.fillRect(gx + 4, gy, 1, 3);
    }
  } else if (t === T.PATH) {
    base(PAL.path, 4);
    // 石子
    if (rnd(x, y, 5) > 0.55) {
      const cx = px + 2 + Math.floor(rnd(x, y, 6) * 11), cy = py + 2 + Math.floor(rnd(x, y, 7) * 11);
      ctx.fillStyle = PAL.path[3]; ctx.fillRect(cx, cy, 3, 2);
      ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(cx, cy, 2, 1);
    }
  } else if (t === T.PLAZA) {
    base(PAL.plaza, 3);
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(px, py + 15, 16, 1); ctx.fillRect(px + 15, py, 1, 16);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(px, py, 16, 1); ctx.fillRect(px, py, 1, 16);
    // 中间砖纹
    if (rnd(x, y, 77) > 0.7) { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px + 4, py + 8, 8, 1); }
  } else if (t === T.WATER) {
    // 两帧水波
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(px, py, 16, 16);
    const off = frame === 1 ? 3 : 0;
    ctx.fillStyle = PAL.water[1];
    ctx.fillRect(px + 1, py + 3 + off, 6, 1); ctx.fillRect(px + 9, py + 10 - off, 5, 1);
    ctx.fillStyle = PAL.water[2];
    ctx.fillRect(px + 5, py + 7 - off, 4, 1);
    ctx.fillStyle = PAL.water[3];
    ctx.fillRect(px + 3 + off, py + 12, 3, 1);
  } else if (t === T.SAND) {
    base(PAL.sand, 4);
  } else if (t === T.BRIDGE) {
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(px, py, 16, 16);
    ctx.fillStyle = PAL.bridge[0]; ctx.fillRect(px, py + 1, 16, 14);
    ctx.fillStyle = PAL.bridge[1];
    for (let i = 0; i < 3; i++) ctx.fillRect(px, py + 2 + i * 5, 16, 1);
    ctx.fillStyle = PAL.bridge[2]; ctx.fillRect(px, py + 1, 16, 1);
    ctx.fillStyle = PAL.woodDark;
    ctx.fillRect(px, py, 16, 1); ctx.fillRect(px, py + 15, 16, 1);
  } else if (t === T.FLOWER) {
    base(PAL.grass);
    const cols = ['#F2E14C', '#F08AA4', '#FFFFFF', '#D9822B', '#B57FDB'];
    for (let i = 0; i < 3; i++) {
      const fx = px + 2 + Math.floor(rnd(x, y, i + 20) * 11), fy = py + 2 + Math.floor(rnd(x, y, i + 30) * 11);
      const col = cols[Math.floor(rnd(x, y, i + 40) * cols.length)];
      ctx.fillStyle = '#4C8A38'; ctx.fillRect(fx, fy + 2, 1, 2);
      ctx.fillStyle = col;
      ctx.fillRect(fx - 1, fy, 3, 3);
      ctx.fillStyle = '#FFF6D8';
      ctx.fillRect(fx, fy, 1, 1);
    }
  } else if (t === T.TREE || t === T.WALL || t === T.FLOOR) {
    base(PAL.grass); // 高物/建筑由精灵覆盖
  } else {
    base(PAL.grass);
  }
}

// ============================================================
// 高物精灵（预渲染，动态排序层）
// ============================================================

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

// --- 树 v2：双层树冠 + 高光 + 立影 ---
export function makeTree(seed = 0) {
  const { cv, c } = makeCanvas(32, 40);
  const bx = 16, by = 38; // 树干基部（排序锚点）
  // 投影
  c.fillStyle = 'rgba(0,0,0,.2)';
  c.beginPath(); c.ellipse(bx, by, 9, 3, 0, 0, Math.PI * 2); c.fill();
  // 树干（带纹理）
  c.fillStyle = PAL.trunk; c.fillRect(bx - 3, by - 12, 6, 12);
  c.fillStyle = shade(PAL.trunk, -0.2); c.fillRect(bx + 1, by - 12, 2, 12);
  c.fillStyle = shade(PAL.trunk, 0.18); c.fillRect(bx - 3, by - 12, 1, 12);
  // 枝
  c.fillRect(bx - 6, by - 13, 4, 2); c.fillRect(bx + 2, by - 14, 4, 2);
  // 树冠（三团）
  const crown = (cx, cy, w, h, col) => {
    c.fillStyle = col;
    c.beginPath(); c.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2); c.fill();
  };
  crown(16, 12, 13, 10, PAL.tree[0]);
  crown(9, 16, 8, 7, PAL.tree[0]);
  crown(23, 16, 8, 7, PAL.tree[0]);
  crown(16, 8, 9, 7, PAL.tree[2]);
  // 高光斑
  c.fillStyle = PAL.tree[3];
  for (let i = 0; i < 6; i++) {
    const hx = 8 + Math.floor(rnd(seed, i, 3) * 15), hy = 5 + Math.floor(rnd(seed, i, 4) * 9);
    c.fillRect(hx, hy, 3, 2);
  }
  // 底部暗缘
  c.fillStyle = PAL.tree[1];
  c.beginPath(); c.ellipse(16, 19, 12, 4, 0, 0, Math.PI); c.fill();
  return { cv, ax: bx, ay: by };
}

// --- 建筑参数化：w×h tile 占地，屋顶样式分款 ---
// 返回 {cv, ax, ay}：ax/ay 为碰撞盒左下角（排序锚点），绘制时 cv 左上角 = (bx*16 - overhang, by*16 - heightAbove)
// 约定：占地 tile 区 bx..bx+w-1, by..by+h-1；屋顶向上超出 hAbove 像素

const ROOF_PATTERNS = null; // 瓦纹直接内联在各屋顶绘制函数中

export function makeBuilding(kind, seed = 0) {
  // 统一：占地 5×4 tile（80×64），画布 104×110（含向上出檐 46px + 左右出檐 12px）
  const CW = 104, CH = 110;
  const { cv, c } = makeCanvas(CW, CH);
  const bx = 12, groundY = CH; // 建筑底边
  const w = 80; // 墙宽
  const wallY = 62; // 墙顶起
  const chimneys = [];
  const X = (u) => bx + u;

  // —— 公共墙体（立体：左亮右暗 + 底部踢脚 + 木梁）——
  function walls(color) {
    const c1 = shade(color, 0.1), c2 = shade(color, -0.12), c3 = shade(color, -0.25);
    c.fillStyle = color; c.fillRect(X(0), wallY, w, groundY - wallY);
    c.fillStyle = c1; c.fillRect(X(0), wallY, w, 3);
    c.fillStyle = c2; c.fillRect(X(0), groundY - 8, w, 8);
    // 左右立柱
    c.fillStyle = PAL.beam; c.fillRect(X(0), wallY, 3, groundY - wallY); c.fillRect(X(w - 3), wallY, 3, groundY - wallY);
    c.fillStyle = c3; c.fillRect(X(w - 6), wallY, 3, groundY - wallY);
    // 踢脚石
    c.fillStyle = PAL.stoneDark; c.fillRect(X(0), groundY - 3, w, 3);
    for (let i = 0; i < 8; i++) { c.fillStyle = PAL.stone; c.fillRect(X(4 + i * 10), groundY - 3, 6, 3); }
  }

  // —— 常用部件 ——
  function windowAt(u, vy, lit = false) {
    c.fillStyle = PAL.woodDark; c.fillRect(X(u) - 2, vy - 2, 18, 16);
    c.fillStyle = lit ? '#FFE9A8' : '#BCD9EE';
    c.fillRect(X(u), vy, 14, 12);
    if (!lit) {
      c.fillStyle = '#E8F4FC'; c.fillRect(X(u) + 1, vy + 1, 5, 4);
      c.fillStyle = '#9CC3DE'; c.fillRect(X(u) + 8, vy + 6, 6, 6);
    }
    c.fillStyle = PAL.woodDark;
    c.fillRect(X(u) + 6, vy, 2, 12); c.fillRect(X(u), vy + 5, 14, 2);
    // 窗台
    c.fillStyle = PAL.woodLight; c.fillRect(X(u) - 3, vy + 14, 20, 3);
  }

  function doorAt(u, { arch = false, color = '#7A5230' } = {}) {
    const dh = arch ? 22 : 20, dy = groundY - dh - 3;
    const dc = color;
    c.fillStyle = shade(dc, -0.35); c.fillRect(X(u) - 1, dy - 1, 16, dh + 2);
    c.fillStyle = dc; c.fillRect(X(u), dy, 14, dh);
    // 门板竖纹
    c.fillStyle = shade(dc, -0.15);
    c.fillRect(X(u) + 4, dy, 1, dh); c.fillRect(X(u) + 9, dy, 1, dh);
    // 门框
    c.fillStyle = shade(dc, 0.25); c.fillRect(X(u), dy, 14, 2);
    // 把手
    c.fillStyle = '#F2D06B'; c.fillRect(X(u) + 10, dy + Math.floor(dh / 2), 2, 2);
    // 台阶
    c.fillStyle = PAL.stone; c.fillRect(X(u) - 4, groundY - 3, 22, 3);
    c.fillStyle = PAL.stoneLight; c.fillRect(X(u) - 4, groundY - 3, 22, 1);
  }

  function chimneyAt(u, topY) {
    c.fillStyle = '#8E8578'; c.fillRect(X(u), topY, 10, 26);
    c.fillStyle = '#7A7266'; c.fillRect(X(u) + 7, topY, 3, 26);
    c.fillStyle = '#5E574C'; c.fillRect(X(u) - 1, topY - 2, 12, 3);
    c.fillStyle = '#A79D8E'; c.fillRect(X(u), topY, 10, 2);
    chimneys.push([u + 5, topY - 2]); // 登记烟粒子源（画布内坐标）
  }

  function roofGable(roofC, { peakY = 6, overhang = 6 } = {}) {
    // 双坡屋顶（正面视角三角山墙）
    c.fillStyle = shade(roofC, -0.28);
    c.beginPath();
    c.moveTo(X(-overhang), wallY + 2);
    c.lineTo(X(Math.floor(w / 2)), peakY);
    c.lineTo(X(w + overhang), wallY + 2);
    c.closePath(); c.fill();
    c.fillStyle = roofC;
    c.beginPath();
    c.moveTo(X(-overhang), wallY);
    c.lineTo(X(Math.floor(w / 2)), peakY - 2);
    c.lineTo(X(w + overhang), wallY);
    c.closePath(); c.fill();
    // 瓦纹
    c.fillStyle = shade(roofC, -0.14);
    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const yy = wallY - (wallY - peakY) * t;
      const halfW = (w / 2 + overhang) * (1 - t) + 4;
      c.fillRect(X(Math.floor(w / 2) - halfW), yy, halfW * 2, 2);
    }
    // 屋脊高光
    c.fillStyle = shade(roofC, 0.22);
    c.fillRect(X(Math.floor(w / 2) - 14), peakY, 28, 2);
  }

  function roofSlant(roofC, { overhang = 6 } = {}) {
    // 单坡屋顶：左低右高，实体填充+亮顶缘+檐口收边
    const yl = wallY - 4;
    const yr = wallY - 30;
    c.fillStyle = shade(roofC, -0.28);
    c.beginPath();
    c.moveTo(X(-overhang), yl + 6);
    c.lineTo(X(w + overhang), yr + 6);
    c.lineTo(X(w + overhang), yr);
    c.lineTo(X(-overhang), yl);
    c.closePath(); c.fill();
    c.fillStyle = roofC;
    c.beginPath();
    c.moveTo(X(-overhang), yl);
    c.lineTo(X(w + overhang), yr);
    c.lineTo(X(w + overhang), yr - 5);
    c.lineTo(X(-overhang), yl - 5);
    c.closePath(); c.fill();
    c.fillStyle = shade(roofC, 0.24);
    c.beginPath();
    c.moveTo(X(-overhang), yl - 5);
    c.lineTo(X(w + overhang), yr - 5);
    c.lineTo(X(w + overhang), yr - 8);
    c.lineTo(X(-overhang), yl - 8);
    c.closePath(); c.fill();
    c.fillStyle = shade(roofC, -0.2);
    c.fillRect(X(-overhang), yl, w + overhang * 2, 2);
    c.fillRect(X(w + overhang) - 2, yr - 8, 3, yl - yr + 8);
  }

  function barnRoof(roofC) {
    // 谷仓折面顶
    c.fillStyle = shade(roofC, -0.24);
    c.beginPath();
    c.moveTo(X(-4), wallY);
    c.lineTo(X(6), wallY - 22);
    c.lineTo(X(w - 6), wallY - 22);
    c.lineTo(X(w + 4), wallY);
    c.closePath(); c.fill();
    c.fillStyle = roofC;
    c.beginPath();
    c.moveTo(X(-4), wallY - 2);
    c.lineTo(X(6), wallY - 24);
    c.lineTo(X(w - 6), wallY - 24);
    c.lineTo(X(w + 4), wallY - 2);
    c.closePath(); c.fill();
    c.fillStyle = shade(roofC, -0.14);
    for (let i = 0; i < 5; i++) c.fillRect(X(2 + i * 16), wallY - 18, 2, 16);
    c.fillStyle = shade(roofC, 0.2);
    c.fillRect(X(6), wallY - 24, w - 12, 2);
  }

  // —— 五栋建筑 ——
  const build = {
    library() {
      walls(PAL.wallC);
      roofGable('#4A6FA5');
      // 山墙圆窗
      c.fillStyle = PAL.woodDark; c.beginPath(); c.arc(X(40), 30, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#BCD9EE'; c.beginPath(); c.arc(X(40), 30, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = PAL.woodDark; c.fillRect(X(39), 22, 2, 16); c.fillRect(X(32), 29, 16, 2);
      // 排窗 + 大拱门
      windowAt(8, 68); windowAt(56, 68);
      doorAt(33, { arch: true, color: '#5F4630' });
      // 招牌：书
      c.fillStyle = '#2F4A75'; c.fillRect(X(24), wallY + 8, 32, 10);
      c.fillStyle = '#FFF3D6'; c.fillRect(X(28), wallY + 10, 10, 6); c.fillRect(X(40), wallY + 10, 10, 6);
      c.fillStyle = '#C4553B'; c.fillRect(X(30), wallY + 12, 6, 1); c.fillRect(X(42), wallY + 12, 6, 1);
      // 石阶
      c.fillStyle = PAL.stone; c.fillRect(X(28), groundY, 24, 3);
      c.fillStyle = PAL.stoneDark; c.fillRect(X(28), groundY + 2, 24, 1);
    },
    tavern() {
      walls('#EFDDB4');
      roofSlant('#C4553B');
      chimneyAt(58, 30);
      // 二层排窗
      windowAt(10, 52, true); windowAt(58, 52, true);
      // 条纹雨棚
      for (let i = 0; i < 6; i++) {
        c.fillStyle = i % 2 ? '#F6E8C8' : '#C4553B';
        c.fillRect(X(14 + i * 9), 74, 9, 10);
      }
      c.fillStyle = shade('#C4553B', -0.25); c.fillRect(X(14), 83, 54, 2);
      c.fillStyle = PAL.woodDark; c.fillRect(X(16), 84, 2, 6); c.fillRect(X(62), 84, 2, 6);
      // 门 + 挂灯
      doorAt(34);
      c.fillStyle = PAL.woodDark; c.fillRect(X(8), 70, 2, 8);
      c.fillStyle = '#F2C14E'; c.beginPath(); c.arc(X(9), 80, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FFF0B8'; c.beginPath(); c.arc(X(9), 79, 2, 0, Math.PI * 2); c.fill();
      // 酒桶
      barrel(X(72), groundY - 14);
      barrel(X(62), groundY - 12, true);
      // 招牌
      c.fillStyle = '#6B3A2A'; c.fillRect(X(30), wallY + 6, 20, 8);
      c.fillStyle = '#F2C14E'; c.fillRect(X(36), wallY + 8, 8, 4);
    },
    hall() {
      // 镇公所：石基座 + 绿顶 + 山墙徽章 + 石柱门廊
      walls('#E3D9C2');
      roofGable('#5F8A4E', { peakY: 2 });
      // 三角山墙徽章
      c.fillStyle = '#EFE3C2';
      c.beginPath();
      c.moveTo(X(26), 44); c.lineTo(X(40), 18); c.lineTo(X(54), 44); c.closePath(); c.fill();
      c.strokeStyle = PAL.beam; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(26), 44); c.lineTo(X(40), 18); c.lineTo(X(54), 44); c.stroke();
      c.fillStyle = '#C4553B'; c.fillRect(X(37), 26, 6, 6);
      c.fillStyle = '#4A6FA5'; c.fillRect(X(35), 32, 10, 3); c.fillRect(X(37), 35, 6, 3);
      // 石柱门廊
      for (const u of [6, 66]) {
        c.fillStyle = PAL.stone; c.fillRect(X(u), wallY, 8, groundY - wallY - 3);
        c.fillStyle = PAL.stoneLight; c.fillRect(X(u), wallY, 3, groundY - wallY - 3);
        c.fillStyle = PAL.stoneDark; c.fillRect(X(u), wallY, 8, 3);
      }
      // 门 + 排窗
      doorAt(33, { arch: true, color: '#4E3A26' });
      windowAt(16, 66); windowAt(56, 66);
      // 旗帜
      c.fillStyle = PAL.woodDark; c.fillRect(X(70), 6, 2, 26);
      c.fillStyle = '#C4553B'; c.fillRect(X(72), 8, 16, 10);
      c.fillStyle = '#FFF3D6'; c.fillRect(X(72), 12, 16, 2);
    },
    bakery() {
      walls('#F4E4C0');
      roofSlant('#C76B84');
      chimneyAt(60, 14);
      // 橱窗（面包展示）
      c.fillStyle = PAL.woodDark; c.fillRect(X(10) - 2, 74, 30, 20);
      c.fillStyle = '#FFE9A8'; c.fillRect(X(10), 76, 26, 16);
      c.fillStyle = '#E8A33D'; c.beginPath(); c.ellipse(X(16), 84, 5, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#C97B2D'; c.beginPath(); c.ellipse(X(28), 85, 5, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FFF3D6'; c.fillRect(X(14), 80, 4, 2);
      // 斜纹遮阳棚
      for (let i = 0; i < 7; i++) {
        c.fillStyle = i % 2 ? '#FFF3D6' : '#E8A33D';
        c.fillRect(X(44 + i * 6), 76, 6, 9);
      }
      c.fillStyle = shade('#E8A33D', -0.25); c.fillRect(X(44), 84, 42, 2);
      doorAt(20, { color: '#8A5A28' });
      // 挂牌：羊角包
      c.fillStyle = '#FFF3D6'; c.fillRect(X(30), wallY + 6, 20, 9);
      c.fillStyle = '#E8A33D'; c.beginPath(); c.arc(X(40), wallY + 10, 4, 0.5, Math.PI * 1.6); c.fill();
    },
    farm() {
      // 谷仓：棕红墙 + 折面顶 + X 型大门
      walls('#B8714E');
      barnRoof('#8A5A34');
      // 大谷仓门（X 木条）
      c.fillStyle = '#7A4A30'; c.fillRect(X(26), wallY + 8, 28, groundY - wallY - 11);
      c.fillStyle = '#96603E';
      c.fillRect(X(28), wallY + 10, 24, groundY - wallY - 14);
      c.strokeStyle = '#6B3E26'; c.lineWidth = 2;
      c.beginPath();
      c.moveTo(X(28), wallY + 10); c.lineTo(X(52), groundY - 5);
      c.moveTo(X(52), wallY + 10); c.lineTo(X(28), groundY - 5);
      c.stroke();
      c.fillStyle = '#6B3E26'; c.fillRect(X(28), wallY + 10, 24, 2);
      // 侧窗
      windowAt(8, 70, false);
      // 干草垛
      c.fillStyle = '#D9B44A'; c.beginPath(); c.arc(X(68), groundY - 8, 9, Math.PI, 0); c.fill();
      c.fillStyle = '#C4A038'; c.fillRect(X(59), groundY - 8, 18, 8);
      c.fillStyle = '#E5C45E'; c.fillRect(X(61), groundY - 12, 3, 2); c.fillRect(X(68), groundY - 14, 3, 2);
      // 篱笆
      fence(X(0), groundY, 26);
    }
  };

  function barrel(px, py, small = false) {
    const h = small ? 12 : 16, w = small ? 9 : 11;
    c.fillStyle = '#8A6244'; c.fillRect(px, py, w, h);
    c.fillStyle = '#6E4C32'; c.fillRect(px + w - 3, py, 3, h);
    c.fillStyle = '#B98A5C'; c.fillRect(px, py, 2, h);
    c.fillStyle = '#4E4640'; c.fillRect(px - 1, py + 2, w + 2, 2); c.fillRect(px - 1, py + h - 4, w + 2, 2);
    c.fillStyle = '#C49058'; c.beginPath(); c.ellipse(px + w / 2, py, w / 2, 2, 0, 0, Math.PI * 2); c.fill();
  }
  function fence(px, py, len) {
    for (let i = 0; i < len; i += 10) {
      c.fillStyle = PAL.wood; c.fillRect(px + i, py - 12, 3, 12);
      c.fillStyle = PAL.woodDark; c.fillRect(px + i + 2, py - 12, 1, 12);
    }
    c.fillStyle = PAL.woodLight; c.fillRect(px, py - 10, len, 2); c.fillRect(px, py - 5, len, 2);
  }

  (build[kind] || build.farm)();

  // 整体投影（建筑底边一条软影）
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.fillRect(bx - 4, groundY, w + 8, 3);

  return { cv, ax: bx, ay: groundY, chimneys };
}

// --- 路灯 ---
export function makeLantern() {
  const { cv, c } = makeCanvas(16, 40);
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.beginPath(); c.ellipse(8, 38, 5, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3E3A34'; c.fillRect(7, 12, 2, 26);
  c.fillStyle = '#4E4640'; c.fillRect(4, 38, 8, 2);
  c.fillStyle = '#3E3A34'; c.fillRect(5, 8, 6, 4);
  // 灯罩（夜光在渲染层叠加）
  c.fillStyle = '#2E2A24'; c.fillRect(4, 4, 8, 5);
  c.fillStyle = '#F2D06B'; c.fillRect(5, 5, 6, 3);
  return { cv, ax: 8, ay: 39 };
}

// --- 长椅 ---
export function makeBench() {
  const { cv, c } = makeCanvas(28, 18);
  c.fillStyle = 'rgba(0,0,0,.15)';
  c.beginPath(); c.ellipse(14, 16, 12, 2.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.wood; c.fillRect(2, 6, 24, 4);
  c.fillStyle = PAL.woodLight; c.fillRect(2, 6, 24, 1);
  c.fillStyle = PAL.wood; c.fillRect(2, 12, 24, 3);
  c.fillStyle = PAL.woodDark; c.fillRect(3, 9, 2, 7); c.fillRect(23, 9, 2, 7);
  c.fillStyle = PAL.woodDark; c.fillRect(2, 10, 24, 1);
  return { cv, ax: 14, ay: 17 };
}

// --- 喷泉（广场 C 位，参考 AI 星露谷同款）：石基双层水池+中央喷柱+水花 ---
export function makeFountain() {
  const { cv, c } = makeCanvas(48, 44);
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.beginPath(); c.ellipse(24, 41, 20, 4, 0, 0, Math.PI * 2); c.fill();
  // 外池
  c.fillStyle = PAL.stoneDark; c.beginPath(); c.ellipse(24, 33, 21, 9, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.stone; c.beginPath(); c.ellipse(24, 31, 21, 9, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.stoneLight; c.beginPath(); c.ellipse(24, 30, 19, 7, 0, 0, Math.PI * 2); c.fill();
  // 池水
  c.fillStyle = PAL.water[0]; c.beginPath(); c.ellipse(24, 31, 17, 6, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.water[2]; c.fillRect(14, 29, 6, 1); c.fillRect(28, 32, 6, 1);
  // 中池
  c.fillStyle = PAL.stone; c.beginPath(); c.ellipse(24, 24, 9, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.water[0]; c.beginPath(); c.ellipse(24, 23, 7, 3.5, 0, 0, Math.PI * 2); c.fill();
  // 喷柱
  c.fillStyle = PAL.stoneDark; c.fillRect(22, 12, 4, 12);
  c.fillStyle = PAL.stoneLight; c.fillRect(22, 12, 2, 12);
  c.fillStyle = PAL.water[3];
  // 顶珠
  c.beginPath(); c.arc(24, 10, 3.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#FFFFFF'; c.fillRect(23, 8, 2, 2);
  return { cv, ax: 24, ay: 42 };
}

// --- 水井 ---
export function makeWell() {
  const { cv, c } = makeCanvas(26, 34);
  c.fillStyle = 'rgba(0,0,0,.2)';
  c.beginPath(); c.ellipse(13, 32, 11, 3, 0, 0, Math.PI * 2); c.fill();
  // 支架与顶
  c.fillStyle = PAL.woodDark; c.fillRect(3, 4, 2, 18); c.fillRect(21, 4, 2, 18);
  c.fillStyle = PAL.roofRed || '#C4553B';
  c.beginPath(); c.moveTo(0, 6); c.lineTo(13, 0); c.lineTo(26, 6); c.closePath(); c.fill();
  c.fillStyle = shade('#C4553B', -0.15); c.fillRect(4, 5, 18, 2);
  // 石圈 + 水面
  c.fillStyle = PAL.stone; c.beginPath(); c.ellipse(13, 26, 10, 5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.water[0]; c.beginPath(); c.ellipse(13, 25, 7, 3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.water[3]; c.fillRect(10, 24, 4, 1);
  // 绳桶
  c.fillStyle = '#D9CDB4'; c.fillRect(12, 6, 1, 12);
  c.fillStyle = PAL.wood; c.fillRect(9, 18, 7, 5);
  return { cv, ax: 13, ay: 33 };
}

// --- 指示牌 ---
export function makeSign() {
  const { cv, c } = makeCanvas(22, 26);
  c.fillStyle = 'rgba(0,0,0,.15)';
  c.beginPath(); c.ellipse(11, 24, 7, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.woodDark; c.fillRect(10, 10, 2, 14);
  c.fillStyle = PAL.wood; c.fillRect(1, 2, 20, 10);
  c.fillStyle = PAL.woodLight; c.fillRect(1, 2, 20, 2);
  c.fillStyle = '#6B4A2B'; c.fillRect(3, 5, 12, 1); c.fillRect(3, 8, 16, 1);
  return { cv, ax: 11, ay: 25 };
}

// --- 石头/灌木（贴地） ---
export function makeRock() {
  const { cv, c } = makeCanvas(14, 10);
  c.fillStyle = 'rgba(0,0,0,.15)';
  c.beginPath(); c.ellipse(7, 8, 6, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.stone;
  c.beginPath(); c.moveTo(2, 8); c.lineTo(4, 3); c.lineTo(9, 2); c.lineTo(12, 7); c.lineTo(10, 8); c.closePath(); c.fill();
  c.fillStyle = PAL.stoneLight; c.fillRect(4, 3, 4, 2);
  c.fillStyle = PAL.stoneDark; c.fillRect(9, 5, 3, 3);
  return { cv, ax: 7, ay: 9 };
}
export function makeBush() {
  const { cv, c } = makeCanvas(18, 14);
  c.fillStyle = 'rgba(0,0,0,.12)';
  c.beginPath(); c.ellipse(9, 12, 8, 2, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.tree[0];
  c.beginPath(); c.ellipse(6, 8, 5, 5, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(12, 9, 5, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = PAL.tree[2];
  c.beginPath(); c.ellipse(9, 5, 4, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#E86A8A'; c.fillRect(5, 7, 2, 2); c.fillRect(12, 6, 2, 2);
  return { cv, ax: 9, ay: 13 };
}

// ============================================================
// 角色 v2：20×28，四方向×四帧（含 idle 呼吸），合成表 20×28 格
// ============================================================

export const CHAR_W = 20, CHAR_H = 28;

export function makeCharacterSheet({ skin = '#F2C9A0', hair = '#2B2B3A', cloth = '#EAF0FF' }) {
  const sheet = document.createElement('canvas');
  sheet.width = CHAR_W * 4; sheet.height = CHAR_H * 4;
  const c = sheet.getContext('2d');
  c.imageSmoothingEnabled = false;
  const hairHi = shade(hair, 0.25), hairDk = shade(hair, -0.22);
  const clothDk = shade(cloth, -0.18), clothHi = shade(cloth, 0.14);
  const skinDk = shade(skin, -0.14);

  function drawAt(cx, cy, dir, frame) {
    const ox = cx * CHAR_W, oy = cy * CHAR_H;
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(ox + x, oy + y, w, h); };
    // frame: 0 idle(呼吸) 1/3 交替步 2 过渡
    const step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    const bob = frame === 0 ? 1 : 0; // idle 微沉

    // 腿（前后交叉步）
    const legY = 21 + bob;
    px(6, legY + (step > 0 ? -1 : 0), 3, 7 - (step > 0 ? 1 : 0), shade(cloth, -0.35));
    px(11, legY + (step < 0 ? -1 : 0), 3, 7 - (step < 0 ? 1 : 0), shade(cloth, -0.35));
    // 鞋
    px(6 - (step > 0 ? 1 : 0), 27, 4, 1, '#3A3226');
    px(11 - (step < 0 ? 1 : 0), 27, 4, 1, '#3A3226');
    // 身体
    const bodyY = 13 + bob;
    px(5, bodyY, 10, 8, cloth);
    px(5, bodyY, 10, 2, clothHi);          // 肩部高光
    px(5, bodyY + 6, 10, 2, clothDk);      // 下摆
    px(9, bodyY + 3, 2, 5, clothDk);       // 中缝
    // 手臂（随步摆）
    const armSwing = step * 1;
    px(3, bodyY + 1 + armSwing, 2, 6, clothDk);
    px(15, bodyY + 1 - armSwing, 2, 6, clothDk);
    px(3, bodyY + 6 + armSwing, 2, 2, skinDk);  // 手
    px(15, bodyY + 6 - armSwing, 2, 2, skin);
    // 头（大 Q 版）
    const headY = 4 + bob;
    px(5, headY, 10, 9, skin);
    px(5, headY + 8, 10, 1, skinDk);
    // 耳朵
    px(4, headY + 4, 1, 2, skin); px(15, headY + 4, 1, 2, skin);
    // 头发：顶部 + 侧发
    px(4, headY - 2, 12, 4, hair);
    px(4, headY + 1, 2, 4, hair); px(14, headY + 1, 2, 4, hair);
    px(5, headY - 2, 12, 1, hairHi);       // 发顶高光
    px(6, headY - 1, 3, 1, hairHi);
    // 后脑/侧发按方向
    if (dir === 'up') {
      px(5, headY + 2, 10, 6, hair);
      px(6, headY + 3, 8, 3, hairDk);
    } else if (dir === 'down') {
      px(7, headY + 3, 1, 2, '#2A2620'); px(12, headY + 3, 1, 2, '#2A2620'); // 眼
      px(9, headY + 6, 2, 1, '#D98A6A'); // 嘴
      px(6, headY + 5, 1, 1, '#F0A88A'); px(13, headY + 5, 1, 1, '#F0A88A'); // 腮红
    } else {
      const ex = dir === 'right' ? 11 : 8;
      px(ex, headY + 3, 1, 2, '#2A2620');
      px(dir === 'right' ? 14 : 5, headY + 1, 1, 4, hairDk); // 鬓角
    }
    // 衣领
    px(8, bodyY - 1, 4, 1, shade(cloth, -0.3));
  }

  for (let f = 0; f < 4; f++) {
    for (let d = 0; d < 4; d++) {
      drawAt(d, f, ['down', 'right', 'up', 'left'][d] === 'left' ? 'right' : ['down', 'right', 'up', 'left'][d], f);
    }
  }
  return sheet;
}

export function makeAvatar(sheet) {
  const cv = document.createElement('canvas');
  cv.width = 52; cv.height = 52;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.fillStyle = '#EFE0BE'; c.fillRect(0, 0, 52, 52);
  c.drawImage(sheet, 0, 0, CHAR_W, 14, 6, 2, 40, 28); // 头+肩
  return cv.toDataURL();
}
