// 程序化像素美术：全部由代码逐像素绘制，无外部素材
// 坐标体系：1 tile = 16px，角色 16×20

// 稳定伪随机（同格纹理一致）
function rnd(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

export const PAL = {
  grass: ['#79B850', '#6FAE48', '#84C25A', '#639F41'],
  path: ['#D9A868', '#CE9C5E', '#E2B47A', '#C08F54'],
  plaza: ['#BFB6A6', '#B3AA9A', '#CBC2B2'],
  water: ['#4E96D8', '#4189CC', '#5CA4E4'],
  waterDeep: ['#3B7FC4', '#3272B5'],
  sand: ['#E7D7A4', '#DECd98'.toUpperCase(), '#EFE0B0'],
  bridge: ['#A97C4F', '#98703F', '#B98A5C'],
  tree: ['#3E7C3A', '#2F6830', '#4C9046'],
  trunk: '#6B4A2B',
  wall: ['#EFE3C2', '#E4D6B2'],
  beam: '#8A6A44',
  door: '#7A5230',
  roofRed: '#C4553B', roofBlue: '#4A6FA5', roofGreen: '#5F8A4E', roofPink: '#C76B84', roofBrown: '#8A6244',
  dark: '#1E2430'
};

// ---------- 地表瓦片 ----------
export function paintTile(ctx, t, x, y, T) {
  const px = x * 16, py = y * 16;
  const base = (colors) => {
    ctx.fillStyle = colors[0]; ctx.fillRect(px, py, 16, 16);
    for (let i = 0; i < 5; i++) {
      const rx = px + Math.floor(rnd(x, y, i) * 16), ry = py + Math.floor(rnd(x, y, i + 9) * 16);
      ctx.fillStyle = colors[1 + (i % (colors.length - 1))];
      ctx.fillRect(rx, ry, 2, 2);
    }
  };
  if (t === T.GRASS) {
    base(PAL.grass);
    // 草丛
    if (rnd(x, y, 99) > 0.86) {
      ctx.fillStyle = PAL.grass[3];
      ctx.fillRect(px + 4, py + 10, 1, 3); ctx.fillRect(px + 6, py + 9, 1, 4); ctx.fillRect(px + 8, py + 10, 1, 3);
    }
  } else if (t === T.PATH) {
    base(PAL.path);
    ctx.fillStyle = PAL.path[3];
    if (rnd(x, y, 5) > 0.7) ctx.fillRect(px + Math.floor(rnd(x, y, 6) * 12) + 2, py + Math.floor(rnd(x, y, 7) * 12) + 2, 2, 1);
  } else if (t === T.PLAZA) {
    base(PAL.plaza);
    ctx.fillStyle = 'rgba(0,0,0,.08)';
    ctx.fillRect(px, py + 15, 16, 1); ctx.fillRect(px + 15, py, 1, 16);
  } else if (t === T.WATER) {
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(px, py, 16, 16);
    ctx.fillStyle = PAL.waterDeep[0];
    ctx.fillRect(px + 2, py + 3, 5, 1); ctx.fillRect(px + 9, py + 10, 5, 1);
    ctx.fillStyle = PAL.water[2];
    ctx.fillRect(px + 6, py + 6, 4, 1);
  } else if (t === T.SAND) {
    base(PAL.sand);
  } else if (t === T.BRIDGE) {
    ctx.fillStyle = PAL.water[0]; ctx.fillRect(px, py, 16, 16);
    ctx.fillStyle = PAL.bridge[0]; ctx.fillRect(px, py + 2, 16, 12);
    ctx.fillStyle = PAL.bridge[1];
    for (let i = 0; i < 3; i++) ctx.fillRect(px, py + 3 + i * 4, 16, 1);
    ctx.fillStyle = PAL.bridge[2]; ctx.fillRect(px, py + 2, 16, 1);
  } else if (t === T.FLOWER) {
    base(PAL.grass);
    const cols = ['#F2E14C', '#F08AA4', '#FFFFFF', '#D9822B'];
    for (let i = 0; i < 3; i++) {
      const fx = px + 2 + Math.floor(rnd(x, y, i + 20) * 12), fy = py + 2 + Math.floor(rnd(x, y, i + 30) * 12);
      ctx.fillStyle = cols[Math.floor(rnd(x, y, i + 40) * cols.length)];
      ctx.fillRect(fx, fy, 2, 2);
      ctx.fillStyle = '#F7C873';
      ctx.fillRect(fx, fy, 1, 1);
    }
  } else if (t === T.TREE) {
    base(PAL.grass);
    // 树冠
    ctx.fillStyle = PAL.tree[0];
    ctx.fillRect(px + 2, py, 12, 4); ctx.fillRect(px, py + 2, 16, 6);
    ctx.fillStyle = PAL.tree[1];
    ctx.fillRect(px + 3, py + 6, 10, 4);
    ctx.fillStyle = PAL.tree[2];
    ctx.fillRect(px + 4, py + 1, 3, 2); ctx.fillRect(px + 10, py + 3, 3, 2);
    // 树干
    ctx.fillStyle = PAL.trunk;
    ctx.fillRect(px + 6, py + 10, 4, 5);
    ctx.fillStyle = 'rgba(0,0,0,.15)';
    ctx.fillRect(px + 4, py + 15, 8, 1);
  } else if (t === T.WALL) {
    // 建筑墙基（会被建筑精灵覆盖大部分）
    ctx.fillStyle = PAL.wall[0]; ctx.fillRect(px, py, 16, 16);
  } else if (t === T.FLOOR) {
    ctx.fillStyle = '#D8C9A8'; ctx.fillRect(px, py, 16, 16);
  } else {
    base(PAL.grass);
  }
}

// ---------- 建筑（画在静态层，5×4 tile） ----------
const BUILDING_STYLE = {
  library: { roof: PAL.roofBlue, sign: 'LIB' },
  tavern: { roof: PAL.roofRed, sign: 'INN' },
  hall: { roof: PAL.roofGreen, sign: 'HALL' },
  bakery: { roof: PAL.roofPink, sign: 'BAKE' },
  farm: { roof: PAL.roofBrown, sign: 'FARM' }
};

export function paintBuilding(ctx, key, bx, by) {
  const style = BUILDING_STYLE[key] || { roof: PAL.roofBrown };
  const px = bx * 16, py = by * 16, w = 5 * 16, h = 4 * 16;
  // 屋顶（梯形，占上两排）
  ctx.fillStyle = style.roof;
  ctx.beginPath();
  ctx.moveTo(px - 3, py + 18);
  ctx.lineTo(px + 6, py - 2);
  ctx.lineTo(px + w - 6, py - 2);
  ctx.lineTo(px + w + 3, py + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(px - 3, py + 16, w + 6, 3);
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(px + 6, py, w - 12, 2);
  // 墙
  ctx.fillStyle = PAL.wall[0];
  ctx.fillRect(px + 2, py + 19, w - 4, 13);
  ctx.fillStyle = PAL.wall[1];
  ctx.fillRect(px + 2, py + 19, w - 4, 2);
  // 木梁
  ctx.fillStyle = PAL.beam;
  ctx.fillRect(px + 2, py + 19, 2, 13); ctx.fillRect(px + w - 4, py + 19, 2, 13); ctx.fillRect(px + 2, py + 30, w - 4, 2);
  // 门（中下）
  ctx.fillStyle = PAL.door;
  ctx.fillRect(px + Math.floor(w / 2) - 5, py + 24, 10, 10);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(px + Math.floor(w / 2) - 5, py + 24, 10, 2);
  // 窗（两扇，夜晚会发光）
  ctx.fillStyle = '#F7E9B0';
  ctx.fillRect(px + 10, py + 23, 8, 6);
  ctx.fillRect(px + w - 18, py + 23, 8, 6);
  ctx.strokeStyle = PAL.beam;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 10.5, py + 23.5, 7, 5);
  ctx.strokeRect(px + w - 17.5, py + 23.5, 7, 5);
}

// ---------- 角色精灵（四方向 × 三帧，合成表 12 格 16×20） ----------
const DIRS = ['down', 'right', 'up', 'left']; // left 由 right 镜像，占位

export function makeCharacterSheet({ skin = '#F2C9A0', hair = '#2B2B3A', cloth = '#EAF0FF' }) {
  const cw = 16, ch = 20;
  const sheet = document.createElement('canvas');
  sheet.width = cw * 4; sheet.height = ch * 3;
  const c = sheet.getContext('2d');
  const hairDark = shade(hair, -0.25);
  const clothDark = shade(cloth, -0.2);

  function drawAt(cellX, cellY, dir, frame) {
    const ox = cellX * cw, oy = cellY * ch;
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(ox + x, oy + y, w, h); };
    // 腿（frame: 0 立,1 左前,2 右前）
    const legOff = frame === 0 ? 0 : (frame === 1 ? 1 : -1);
    px(4 + (frame === 1 ? -1 : 0), 16, 3, 4, clothDark);
    px(9 + (frame === 2 ? 1 : 0), 16, 3, 4, clothDark);
    px(4 + (frame === 1 ? -1 : 0), 19, 3, 1, PAL.dark);
    px(9 + (frame === 2 ? 1 : 0), 19, 3, 1, PAL.dark);
    // 身体
    px(3, 9, 10, 7, cloth);
    px(3, 9, 10, 2, shade(cloth, 0.12));
    px(2, 10, 2, 5, clothDark); // 左臂
    px(12, 10, 2, 5, clothDark); // 右臂
    // 头
    px(4, 2, 8, 7, skin);
    px(4, 8, 8, 1, shade(skin, -0.12));
    // 头发
    px(3, 1, 10, 3, hair);
    px(3, 3, 2, 3, hair);
    px(11, 3, 2, 3, hair);
    if (dir === 'up') {
      px(4, 4, 8, 4, hair); // 后脑全发
      px(5, 5, 6, 2, hairDark);
    } else if (dir === 'down') {
      px(5, 1, 6, 1, hairDark);
      px(6, 5, 1, 2, PAL.dark); px(9, 5, 1, 2, PAL.dark); // 眼
      px(7, 7, 2, 1, shade(skin, -0.2)); // 腮/嘴
    } else {
      const fx = dir === 'right' ? 1 : -1;
      px(dir === 'right' ? 8 : 7, 5, 1, 2, PAL.dark); // 单眼
      px(dir === 'right' ? 11 : 4, 3, 1, 3, hairDark); // 鬓角
      void fx;
    }
  }

  // 行序 frame，列序 dir: down,right,up,left（left 画成 right 再调用处镜像）
  for (let f = 0; f < 3; f++) {
    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d];
      drawAt(d, f, dir === 'left' ? 'right' : dir, f);
    }
  }
  return sheet;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// 头像（对话框用）：取精灵头部放大
export function makeAvatar(sheet) {
  const cv = document.createElement('canvas');
  cv.width = 48; cv.height = 48;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(sheet, 0, 0, 16, 9, 0, 8, 48, 30);
  return cv.toDataURL();
}
