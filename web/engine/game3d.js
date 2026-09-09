// 树洞谷 3D 引擎 v2（HD-2D 精细版）：对标参考图（尘之回声/剑与远征启程风）
// —— 24px/tile 有机像素地面（噪声色斑+路缘融合+水湾泡沫）
// —— 精细树/建筑 billboard + 贴地柔影 + 晨昏体积光柱 + 波光水面 + 3D 斜雨
// —— 八方向移动（相机相对，可对角走）；玩法层复用 2D 引擎数据接口
import * as THREE from './three.module.min.js';
import { EffectComposer } from './postprocessing.min.js';
import { RenderPass } from './renderpass.min.js';
import { ShaderPass } from './shaderpass.min.js';
import { UnrealBloomPass } from './bloompass.min.js';
import { OutputPass } from './outputpass.min.js';

import { createGame as createGame2D, TILE as TILE2D } from './game.js';
import {
  paintTile, makeBuilding, makeLantern, makeBench, makeWell,
  makeSign, makeRock, makeBush, makeFountain
} from './sprite.js';
import { paintGround, makeTree3d, makeShadowTex, makeGodrayTex, makeShimmerTex } from './sprite3d.js';
import { createRain3d } from './rain3d.js';

export const TILE = TILE2D;
const WALK_MS = 170;
const PX = 1 / 16;

const CAM = { pitch0: 0.95, pitchMin: 0.42, pitchMax: 1.45, dist0: 14, distMin: 6.5, distMax: 26 };

const PHASE_LIGHT = {
  '清晨': { sun: 0xffd2a0, sunI: 2.2, amb: 0xa8c0e8, ambI: 0.85, fog: 0xc4d8ee, bloom: 0.34, elev: 0.35 },
  '上午': { sun: 0xfff0d0, sunI: 2.9, amb: 0xd8eaff, ambI: 1.05, fog: 0xdcecf6, bloom: 0.2, elev: 0.9 },
  '午后': { sun: 0xffe8bc, sunI: 2.7, amb: 0xd2e4f4, ambI: 1.0, fog: 0xd8e8f2, bloom: 0.22, elev: 0.65 },
  '黄昏': { sun: 0xff8f42, sunI: 2.4, amb: 0x9a80c8, ambI: 0.8, fog: 0xd4a89e, bloom: 0.46, elev: 0.22 },
  '夜晚': { sun: 0x8aa0e8, sunI: 0.42, amb: 0x46548e, ambI: 0.7, fog: 0x16203e, bloom: 0.72, elev: 0.5 },
  '深夜': { sun: 0x7a90dc, sunI: 0.3, amb: 0x3c4878, ambI: 0.62, fog: 0x101731, bloom: 0.8, elev: 0.4 }
};

export function fitScreen(canvas) {
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGame(canvas, world, opts) {
  // ============ 玩法层 ============
  const ghost = document.createElement('canvas');
  ghost.width = 416; ghost.height = 240;
  const g2 = createGame2D(ghost, world, { ...opts, _headless: true });
  g2.stop && g2.stop();
  const { walkable } = g2;
  const { grid, tiles, W, H } = world;

  // ============ 3D 基础 ============
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 320);
  scene.fog = new THREE.Fog(0xdcecf6, 40, 95);
  scene.background = new THREE.Color(0xdcecf6);

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 90;
  const SH = 26;
  sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
  sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
  sun.shadow.bias = -0.0012;
  sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd8eaff, 0x67883f, 1.05);
  scene.add(hemi);

  // ============ 地面：24px/tile 有机烘焙 ============
  const P = 24;
  const { cv: groundCv, mask: waterMaskCv } = paintGround(world, P);
  const groundTex = new THREE.CanvasTexture(groundCv);
  groundTex.magFilter = THREE.NearestFilter;
  groundTex.minFilter = THREE.NearestMipmapLinearFilter;
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  groundTex.generateMipmaps = true;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshLambertMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, H / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // ============ 水面层：半透明波光面（在所有水 tile 上方 0.02） ============
  const waterTex = new THREE.CanvasTexture(makeShimmerTex());
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.magFilter = THREE.LinearFilter;
  // 生成水 tile 的合并几何（UV 用世界坐标，滚动时光斑流动）
  const waterTiles = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] === tiles.WATER || grid[y][x] === tiles.BRIDGE) waterTiles.push([x, y]);
  }
  let waterMesh = null;
  if (waterTiles.length) {
    const verts = [], uvs = [], idx = [];
    for (const [x, y] of waterTiles) {
      const b = verts.length / 3;
      verts.push(x, 0.045, y, x + 1, 0.045, y, x, 0.045, y + 1, x + 1, 0.045, y + 1);
      uvs.push(x / 6, y / 6, (x + 1) / 6, y / 6, x / 6, (y + 1) / 6, (x + 1) / 6, (y + 1) / 6);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    wg.setIndex(idx);
    const wmat = new THREE.MeshBasicMaterial({
      map: waterTex, transparent: true, opacity: 0.5, depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    waterMesh = new THREE.Mesh(wg, wmat);
    scene.add(waterMesh);
  }

  // ============ billboard 基建 ============
  const texCache = new Map();
  function canvasTex(cv) {
    if (!texCache.has(cv)) {
      const t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      texCache.set(cv, t);
    }
    return texCache.get(cv);
  }
  const quadGeo = new THREE.PlaneGeometry(1, 1);
  const billboards = [];
  const shadowTex = new THREE.CanvasTexture(makeShadowTex());
  const godrayTex = new THREE.CanvasTexture(makeGodrayTex());

  function addSprite(cv, hUnits, { ax = null, ay = null, alphaTest = 0.5, shadow = true, shadowScale = 1 } = {}) {
    const wUnits = hUnits * (cv.width / cv.height);
    const mat = new THREE.MeshLambertMaterial({ map: canvasTex(cv), transparent: true, alphaTest, side: THREE.DoubleSide });
    const m = new THREE.Mesh(quadGeo, mat);
    m.scale.set(wUnits, hUnits, 1);
    const baseUp = ay == null ? 0 : ((cv.height - ay) / cv.height) * hUnits;
    const axOff = ax == null ? 0 : ((cv.width / 2 - ax) / cv.width) * wUnits;
    m.userData.bill = { wUnits, hUnits, baseUp, axOff };
    billboards.push(m);
    scene.add(m);
    if (shadow) {
      const sh = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 }));
      sh.rotation.x = -Math.PI / 2;
      sh.scale.set(wUnits * 0.62 * shadowScale, wUnits * 0.62 * shadowScale, 1);
      sh.renderOrder = 1;
      m.userData.groundShadow = sh;
      scene.add(sh);
    }
    return m;
  }
  function placeSprite(m, wx, wz) {
    const b = m.userData.bill;
    m.position.set(wx - b.axOff, b.hUnits / 2 - b.baseUp, wz);
    if (m.userData.groundShadow) m.userData.groundShadow.position.set(wx, 0.025, wz + 0.12);
  }

  // ============ 建筑 ============
  for (const [k, b] of Object.entries(world.buildings)) {
    const sp = makeBuilding(k);
    const m = addSprite(sp.cv, 110 * PX, { ax: sp.ax, ay: sp.ay, shadowScale: 1.5 });
    placeSprite(m, b.x + 2.5, b.y + 4);
  }
  // ============ AI 小屋 PNG（抠残留背景色） ============
  for (const co of world.cottages || []) {
    const img = new Image();
    img.src = `/cottages/${co.id}.png`;
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const c2 = cv.getContext('2d');
      c2.drawImage(img, 0, 0);
      const d = c2.getImageData(0, 0, cv.width, cv.height);
      const px = d.data;
      const corners = [0, (cv.width - 1) * 4, (cv.height - 1) * cv.width * 4, ((cv.height - 1) * cv.width + cv.width - 1) * 4];
      const bgKeys = new Set();
      for (const o of corners) {
        if (px[o + 3] > 20) bgKeys.add(`${px[o] >> 4},${px[o + 1] >> 4},${px[o + 2] >> 4}`);
      }
      if (bgKeys.size) {
        for (let i = 0; i < px.length; i += 4) {
          if (bgKeys.has(`${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`)) px[i + 3] = 0;
        }
        c2.putImageData(d, 0, 0);
      }
      const clean = new Image();
      clean.src = cv.toDataURL();
      clean.onload = () => {
        const m = addSprite(clean, clean.height * PX, { shadowScale: 1.3 });
        placeSprite(m, co.x + 1.5, co.y + 3);
      };
    };
  }
  // ============ 树 ============
  const trees3 = [makeTree3d(1), makeTree3d(2), makeTree3d(3)];
  function addTree(tx, ty, idx) {
    const sp = trees3[idx % 3];
    const m = addSprite(sp.cv, 2.9, { ax: sp.ax, ay: sp.ay, shadowScale: sp.shadowR });
    placeSprite(m, tx + 0.5, ty + 0.55);
    return m;
  }
  for (const [tx, ty] of world.bigTrees || []) addTree(tx, ty, tx * 7 + ty * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (grid[y][x] === tiles.TREE && (x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) addTree(x, y, x + y);
  }
  // ============ 装饰 ============
  const propDefs = {
    lantern: { fn: makeLantern, h: 2.5 }, bench: { fn: makeBench, h: 1.15 },
    well: { fn: makeWell, h: 2.1 }, fountain: { fn: makeFountain, h: 2.75 },
    sign: { fn: makeSign, h: 1.6 }, rock: { fn: makeRock, h: 0.62 }, bush: { fn: makeBush, h: 0.9 }
  };
  const lanterns = [];
  for (const p of world.props || []) {
    const def = propDefs[p.kind];
    if (!def) continue;
    const sp = def.fn();
    const m = addSprite(sp.cv, def.h, { ax: sp.ax, ay: sp.ay });
    placeSprite(m, p.x + 0.5, p.y + 0.5);
    if (p.kind === 'lantern') lanterns.push({ x: p.x + 0.5, z: p.y + 0.5 });
  }
  const lampPool = [];
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight(0xffd670, 0, 10, 2);
    pl.visible = false;
    scene.add(pl);
    lampPool.push(pl);
  }

  // ============ 体积光柱（晨昏） ============
  const rays = new THREE.Group();
  rays.visible = false;
  scene.add(rays);
  const RAY_N = 7;
  for (let i = 0; i < RAY_N; i++) {
    const m = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
      map: godrayTex, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    m.scale.set(1.6 + Math.random() * 2, 7 + Math.random() * 3, 1);
    m.position.set(8 + Math.random() * 28, m.scale.y / 2, 14 + Math.random() * 16);
    m.rotation.y = Math.random() * Math.PI;
    m.rotation.z = 0.16;
    rays.add(m);
  }

  // ============ 角色 billboard ============
  function makeCharMesh(sheetCv) {
    const tex = canvasTex(sheetCv).clone();
    tex.needsUpdate = true;
    tex.repeat.set(0.25, 0.25);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const m = new THREE.Mesh(quadGeo, mat);
    const hU = 1.7, wU = hU * (20 / 28);
    m.scale.set(wU, hU, 1);
    m.userData.char = { tex };
    const sh = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.scale.set(0.8, 0.8, 1);
    sh.renderOrder = 1;
    m.userData.groundShadow = sh;
    scene.add(sh);
    billboards.push(m);
    scene.add(m);
    return m;
  }
  const npcMesh = new Map();
  for (const n of g2.npcs) npcMesh.set(n, makeCharMesh(n.sheet));
  let playerMesh = null;
  function bindPlayerMesh() {
    if (g2.player.sheet && !playerMesh) playerMesh = makeCharMesh(g2.player.sheet);
  }
  bindPlayerMesh();
  const dirCol = { down: 0, right: 1, up: 2, left: 3 };

  // ============ 灵感碎片 ============
  const fragMeshes = [];
  for (const f of g2.frags) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    m.position.set(f.x + 0.5, 0.55, f.y + 0.5);
    scene.add(m);
    fragMeshes.push({ m, f });
  }

  // ============ 雨 ============
  const rain = createRain3d(scene);

  // ============ 相机轨道 ============
  const cam = { yaw: 0, pitch: CAM.pitch0, dist: CAM.dist0 };
  let dragging = false, lastX = 0, lastY = 0;
  function pd(e) {
    if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; e.preventDefault();
    }
  }
  function pm(e) {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    cam.yaw -= dx * 0.005;
    cam.pitch = clamp(cam.pitch + dy * 0.004, CAM.pitchMin, CAM.pitchMax);
  }
  function pu() { dragging = false; }
  function wh(e) { e.preventDefault(); cam.dist = clamp(cam.dist + e.deltaY * 0.012, CAM.distMin, CAM.distMax); }
  function cm(e) { e.preventDefault(); }
  window.addEventListener('pointerdown', pd);
  window.addEventListener('pointermove', pm);
  window.addEventListener('pointerup', pu);
  window.addEventListener('wheel', wh, { passive: false });
  canvas.addEventListener('contextmenu', cm);

  // ============ 输入：相机相对 + 八方向自由移动 ============
  // 用连续坐标 fx/fy 直接位移，碰撞用 walkable 对四角采样；不再锁 4 正方向
  const keysDown = new Set();
  function kd(e) {
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keysDown.add(k); e.preventDefault(); }
  }
  function ku(e) { keysDown.delete(e.key.toLowerCase()); }
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  function moveVec() {
    let vx = 0, vz = 0;
    const f = { x: -Math.sin(cam.yaw), z: -Math.cos(cam.yaw) };
    if (keysDown.has('w') || keysDown.has('arrowup')) { vx += f.x; vz += f.z; }
    if (keysDown.has('s') || keysDown.has('arrowdown')) { vx -= f.x; vz -= f.z; }
    if (keysDown.has('d') || keysDown.has('arrowright')) { vx += -f.z; vz += f.x; }
    if (keysDown.has('a') || keysDown.has('arrowleft')) { vx -= -f.z; vz -= f.x; }
    const len = Math.hypot(vx, vz);
    return len > 0 ? { x: vx / len, z: vz / len, mag: 1 } : null;
  }
  // 八方向行走碰撞：把玩家当作 0.6×0.6 方块，采样四角
  function trySlide(e, vx, vz, dist) {
    const r = 0.28;
    const free = (nx, nz) => {
      for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
        if (!walkable(Math.floor(nx + ox), Math.floor(nz + oz))) return false;
      }
      return true;
    };
    let nx = e.fx + vx * dist, nz = e.fy + vz * dist;
    if (free(nx, nz)) { e.fx = nx; e.fy = nz; return true; }
    if (free(nx, e.fy)) { e.fx = nx; return true; }
    if (free(e.fx, nz)) { e.fy = nz; return true; }
    return false;
  }

  // ============ 寻路 ============
  function findPath(sx, sy, gx, gy) {
    sx |= 0; sy |= 0;
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
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickTile(evt) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((evt.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((evt.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(ground, false)[0];
    return hit ? { tx: Math.floor(hit.point.x), ty: Math.floor(hit.point.z) } : null;
  }
  function clickMove(evt) {
    if (opts.dialogOpen()) return;
    const t = pickTile(evt);
    if (!t) return;
    let hit = null, hd = 1.2;
    for (const n of g2.npcs) {
      const d = Math.hypot(n.fx - t.tx, (n.fy + 0.4) - t.ty);
      if (d < hd) { hd = d; hit = n; }
    }
    if (hit) { opts.onNpcClick(hit); return; }
    const path = findPath(Math.round(g2.player.fx - 0.5 + 0.0), Math.round(g2.player.fy), t.tx, t.ty);
    if (path) g2.player.path = path;
  }

  // ============ NPC AI（复刻 game.js 逻辑层） ============
  function stepTo(e, nx, ny) {
    e.dir = nx > e.tx ? 'right' : nx < e.tx ? 'left' : ny > e.ty ? 'down' : 'up';
    e.moving = { fx0: e.fx, fy0: e.fy, fx1: nx, fy1: ny, t0: performance.now() };
    e.tx = nx; e.ty = ny;
  }
  function stepMove(e, dt) {
    if (!e.moving) return;
    const t = Math.min(1, (performance.now() - e.moving.t0) / WALK_MS);
    e.fx = e.moving.fx0 + (e.moving.fx1 - e.moving.fx0) * t;
    e.fy = e.moving.fy0 + (e.moving.fy1 - e.moving.fy0) * t;
    e.animT += dt;
    e.frame = Math.floor(e.animT / 130) % 4;
    if (t >= 1) { e.moving = null; e.frame = 0; }
  }
  function walkPath(e) {
    if (e.moving || !e.path || !e.path.length) return;
    const [nx, ny] = e.path[0];
    if (nx === e.tx && ny === e.ty) { e.path.shift(); return walkPath(e); }
    if (!walkable(nx, ny)) { e.path = []; return; }
    e.path.shift();
    stepTo(e, nx, ny);
  }
  let lastPhase = world.serverPhase;
  const phaseMap = (p) => ({ '清晨': 'morning', '上午': 'morning', '午后': 'noon', '黄昏': 'evening', '夜晚': 'night', '深夜': 'night' }[p] || 'morning');
  function scheduleCheck(phase) {
    if (phase === lastPhase) return;
    lastPhase = phase;
    for (const n of g2.npcs) {
      const anchor = n.schedule[phaseMap(phase)];
      if (anchor) n.path = findPath(n.tx, n.ty, anchor.x, anchor.y) || [];
    }
  }
  function npcAI(dt, phase) {
    for (const n of g2.npcs) {
      stepMove(n, dt);
      if (!n.moving) {
        walkPath(n);
        if (!n.path || !n.path.length) {
          n.wanderT -= dt;
          if (n.wanderT <= 0) {
            n.wanderT = 2500 + Math.random() * 3500;
            const dx = Math.round(Math.random() * 2 - 1), dy = Math.round(Math.random() * 2 - 1);
            const nx = n.tx + dx, ny = n.ty + dy;
            const anchor = n.schedule[phaseMap(phase)];
            if (walkable(nx, ny) && Math.abs(nx - anchor.x) <= 2 && Math.abs(ny - anchor.y) <= 2) stepTo(n, nx, ny);
          }
        }
      }
      const d = Math.hypot(n.fx - g2.player.fx, n.fy - g2.player.fy);
      n.greetedT -= dt;
      if (d < 3.2 && d > 0.4 && n.greetedT <= 0 && !opts.dialogOpen()) {
        n.greetedT = 50000 + Math.random() * 40000;
        const pool = n.greeting ? [n.greeting] : (n.greetings || ['……']);
        n.bubble = { text: pool[Math.floor(Math.random() * pool.length)], t: 4200 };
      }
      n.activityT -= dt;
      if (n.activityT <= 0 && !n.bubble && !opts.dialogOpen()) {
        n.activityT = 16000 + Math.random() * 20000;
        const acts = n.activities && n.activities[phaseMap(phase)];
        if (acts) n.bubble = { text: '· ' + acts + ' ·', t: 5000 };
      }
      if (n.bubble) { n.bubble.t -= dt; if (n.bubble.t <= 0) n.bubble = null; }
    }
  }
  function fragPick() {
    const p = g2.player;
    for (const f of g2.frags) {
      if (!f.taken && Math.abs(p.fx - f.x) < 0.6 && Math.abs(p.fy - f.y) < 0.6) {
        f.taken = true;
        const col = new Set(JSON.parse(localStorage.getItem('sv_frags') || '[]'));
        col.add(f.i);
        localStorage.setItem('sv_frags', JSON.stringify([...col]));
        opts.onFragment && opts.onFragment(f);
      }
    }
  }

  // ============ 昼夜光照 ============
  const tmpC = new THREE.Color();
  let nightMix = 0;
  function applyPhase(phase, dt) {
    const L = PHASE_LIGHT[phase] || PHASE_LIGHT['上午'];
    const k = Math.min(1, dt * 0.0025);
    sun.color.lerp(tmpC.set(L.sun), k);
    sun.intensity += (L.sunI - sun.intensity) * k;
    hemi.color.lerp(tmpC.set(L.amb), k);
    hemi.intensity += (L.ambI - hemi.intensity) * k;
    scene.fog.color.lerp(tmpC.set(L.fog), k);
    scene.background.lerp(tmpC.set(L.fog), k);
    bloomPass.strength += (L.bloom - bloomPass.strength) * k;
    // 太阳方位：随相位升降（elev 0~1）
    const el = 0.15 + L.elev * 0.85;
    const p = g2.player;
    sun.position.set(p.fx + 0.5 + (1 - el) * 26, 4 + el * 30, p.fy + 0.5 + 10);
    sun.target.position.set(p.fx + 0.5, 0, p.fy + 0.5);
    // 体积光柱只在晨昏
    const rayAmt = phase === '黄昏' || phase === '清晨' ? 1 : 0;
    rays.visible = rayAmt > 0;
    if (rays.visible) {
      for (const r of rays.children) {
        r.material.opacity = 0.13 * (0.6 + 0.4 * Math.sin(performance.now() / 900 + r.position.x));
      }
    }
    // 雨：雨天雾更近、光更弱
    if (rain.intensity > 0.02) {
      scene.fog.near = 40 - rain.intensity * 22;
      scene.fog.far = 95 - rain.intensity * 40;
      sun.intensity *= (1 - rain.intensity * 0.45);
      hemi.intensity *= (1 - rain.intensity * 0.2);
    } else {
      scene.fog.near += (40 - scene.fog.near) * k * 4;
      scene.fog.far += (95 - scene.fog.far) * k * 4;
    }
    // 夜晚路灯
    const isNight = phase === '夜晚' || phase === '深夜';
    if (isNight) {
      const sorted = lanterns
        .map((l) => ({ l, d: Math.hypot(l.x - p.fx, l.z - p.fy) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, lampPool.length);
      lampPool.forEach((pl, i) => {
        if (i < sorted.length) {
          pl.position.set(sorted[i].l.x, 2.0, sorted[i].l.z);
          pl.intensity = 7;
          pl.visible = true;
        } else pl.visible = false;
      });
    } else lampPool.forEach((pl) => (pl.visible = false));
  }

  // ============ 角色朝向（八方向 → 四列贴图取最近） ============
  function visDir(e) {
    let vx = 0, vz = 0;
    if (e.moving) { vx = e.moving.fx1 - e.moving.fx0; vz = e.moving.fy1 - e.moving.fy0; }
    else if (e.freeDir) { vx = e.freeDir.x; vz = e.freeDir.z; }
    else return e.dir || 'down';
    const f = { x: -Math.sin(cam.yaw), z: -Math.cos(cam.yaw) };
    const alongF = vx * f.x + vz * f.z;
    const r = { x: -f.z, z: f.x };
    const alongR = vx * r.x + vz * r.z;
    let d;
    if (Math.abs(alongF) >= Math.abs(alongR)) d = alongF >= 0 ? 'down' : 'up';
    else d = alongR >= 0 ? 'right' : 'left';
    e._vd = d;
    return d;
  }
  function syncChar(m, e) {
    if (!m) return;
    const col = dirCol[visDir(e)] ?? 0;
    const walking = e.moving || e._freeMoving;
    const frame = walking ? (e.frame || 0) : 0;
    m.userData.char.tex.offset.set(col * 0.25, 1 - (frame + 1) * 0.25);
    m.position.set(e.fx + 0.5, 0.85, e.fy + 0.5);
    if (m.userData.groundShadow) m.userData.groundShadow.position.set(e.fx + 0.5, 0.028, e.fy + 0.55);
  }

  // ============ 后处理 ============
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.5, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  // ============ 2D 覆盖层 ============
  // HUD 同步也在 rAF 内做（后台标签 interval 被节流，rAF 恢复即同步）
  function syncHud() {
    const areaEl = document.querySelector('#hudArea');
    const phaseEl = document.querySelector('#hudPhase');
    if (areaEl && opts.areaName) areaEl.textContent = opts.areaName(g2.player.fx, g2.player.fy);
    if (phaseEl) phaseEl.textContent = phase;
  }
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:5';
  document.body.appendChild(overlay);
  const oc = overlay.getContext('2d');
  const proj = new THREE.Vector3();
  function w2s(x, y, z) {
    proj.set(x, y, z).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * window.innerWidth, y: (-proj.y * 0.5 + 0.5) * window.innerHeight };
  }
  function ellip(t, maxW) {
    let s = String(t);
    while (oc.measureText(s).width > maxW && s.length > 1) s = s.slice(0, -1);
    return s + (s.length < String(t).length ? '…' : '');
  }
  function bubble(x, y, text) {
    oc.font = '12px sans-serif';
    const w = Math.min(170, oc.measureText(text).width + 14), h = 20;
    oc.fillStyle = 'rgba(255,252,240,.95)';
    oc.strokeStyle = '#B8A98C'; oc.lineWidth = 1;
    oc.beginPath(); oc.roundRect(x - w / 2, y - h, w, h, 6); oc.fill(); oc.stroke();
    oc.fillStyle = '#4A3B28'; oc.textAlign = 'center';
    oc.fillText(ellip(text, w - 10), x, y - 6);
  }
  const t0 = performance.now();
  function drawOverlay() {
    const dpr = renderer.getPixelRatio();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (overlay.width !== Math.round(vw * dpr)) { overlay.width = Math.round(vw * dpr); overlay.height = Math.round(vh * dpr); }
    oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    oc.clearRect(0, 0, vw, vh);
    for (const n of g2.npcs) {
      const s = w2s(n.fx + 0.5, 2.0, n.fy + 0.5);
      if (s.x < -60 || s.x > vw + 60 || s.y < -40 || s.y > vh + 40) continue;
      oc.font = '11px sans-serif'; oc.textAlign = 'center';
      const nw = oc.measureText(n.name).width;
      oc.fillStyle = 'rgba(0,0,0,.45)';
      oc.fillRect(s.x - nw / 2 - 4, s.y - 14, nw + 8, 14);
      oc.fillStyle = '#FFFFFF';
      oc.fillText(n.name, s.x, s.y - 3);
      const d = Math.hypot(n.fx - g2.player.fx, n.fy - g2.player.fy);
      if (d < 1.8 && !opts.dialogOpen()) {
        oc.fillStyle = '#FFF6DE'; oc.font = 'bold 12px sans-serif';
        oc.fillText('E', s.x, s.y - 19);
      }
      if (n.bubble) bubble(s.x, s.y - 24, n.bubble.text);
    }
    const ps = w2s(g2.player.fx + 0.5, 2.0, g2.player.fy + 0.5);
    oc.font = '11px sans-serif'; oc.textAlign = 'center';
    const pw = oc.measureText(g2.player.name).width;
    oc.fillStyle = 'rgba(0,0,0,.45)';
    oc.fillRect(ps.x - pw / 2 - 4, ps.y - 14, pw + 8, 14);
    oc.fillStyle = '#FFE27A';
    oc.fillText(g2.player.name, ps.x, ps.y - 3);
    if (performance.now() - t0 < 12000) {
      oc.fillStyle = 'rgba(0,0,0,.5)';
      oc.fillRect(vw / 2 - 190, vh - 46, 380, 26);
      oc.fillStyle = '#E8E2D0'; oc.font = '12px sans-serif';
      oc.fillText('右键拖动 转视角 · 滚轮 缩放 · WASD 八方向移动 · E 交谈', vw / 2, vh - 29);
    }
  }

  // ============ 主循环 ============
  let last = performance.now();
  let disposed = false;
  let animClock = 0;
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    const phase = opts.phase();
    const p = g2.player;
    animClock += dt;

    // —— 玩家移动：键盘八方向（优先）或点击寻路 ——
    const mv = moveVec();
    if (mv && !opts.dialogOpen()) {
      p.path = []; p.moving = null;
      const dist = (dt / 1000) * 4.4; // 4.4 tile/s ≈ 原 WALK_MS 手感
      if (trySlide(p, mv.x, mv.z, dist)) {
        p._freeMoving = true;
        p.freeDir = { x: mv.x, z: mv.z };
        p.animT = (p.animT || 0) + dt;
        p.frame = Math.floor(p.animT / 130) % 4;
      } else p._freeMoving = false;
    } else {
      p._freeMoving = false;
      stepMove(p, dt);
      if (!p.moving && !opts.dialogOpen()) {
        walkPath(p);
      }
    }
    npcAI(dt, phase);
    scheduleCheck(phase);
    fragPick();

    // 相机
    const hd = Math.cos(cam.pitch) * cam.dist;
    camera.position.set(
      p.fx + 0.5 + Math.sin(cam.yaw) * hd,
      Math.sin(cam.pitch) * cam.dist,
      p.fy + 0.5 + Math.cos(cam.yaw) * hd
    );
    camera.lookAt(p.fx + 0.5, 0.9, p.fy + 0.5);

    applyPhase(phase, dt);

    // billboards 面向相机 + 波光流动
    const fy = Math.atan2(-Math.sin(cam.yaw), -Math.cos(cam.yaw));
    for (const m of billboards) m.rotation.y = fy;
    if (waterMesh) {
      waterTex.offset.x = (now / 9000) % 1;
      waterTex.offset.y = (now / 13000) % 1;
    }

    bindPlayerMesh();
    for (const n of g2.npcs) syncChar(npcMesh.get(n), n);
    syncChar(playerMesh, p);

    const tw = now / 500;
    for (const { m, f } of fragMeshes) {
      m.visible = !f.taken;
      m.rotation.y = tw;
      m.position.y = 0.55 + Math.sin(tw * 2 + f.i) * 0.08;
    }

    // 雨
    rain.update(dt / 1000, { x: p.fx + 0.5, z: p.fy + 0.5 }, camera, nightMix);

    composer.render();
    drawOverlay();
    syncHud();
  }
  let raf = requestAnimationFrame(function loop(now) { if (disposed) return; tick(now); raf = requestAnimationFrame(loop); });

  // ============ 对外接口 ============
  return {
    player: g2.player,
    npcs: g2.npcs,
    frags: g2.frags,
    is3D: true,
    setPlayer(pp) { g2.setPlayer(pp); bindPlayerMesh(); },
    addNpc(r) {
      const n = g2.addNpc(r);
      npcMesh.set(n, makeCharMesh(n.sheet));
      return n;
    },
    setAudioHooks(h) { g2.setAudioHooks(h); },
    showResidentChat(a, b, lines) { g2.showResidentChat(a, b, lines); },
    forceWeather(rainFlag) { rain.force(rainFlag); },
    get weatherState() { return { raining: rain.raining, intensity: rain.intensity }; },
    nearNpc() { return g2.nearNpc(); },
    clickMove,
    stop() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('wheel', wh);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('resize', onResize);
      overlay.remove();
      renderer.dispose();
    },
    walkable
  };
}
