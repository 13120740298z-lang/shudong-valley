// 树洞谷 3D 雨系统：斜雨线段（LineSegments）+ 地面涟漪环 + 雨雾（雾密度提升）
// 40–90s 晴雨自动轮换；URL ?weather=rain / ?weather=sun 强制。
import * as THREE from './three.module.min.js';

const RAIN_COUNT = 900;
const AREA = 40; // 覆盖以玩家为中心 ±20

export function createRain3d(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // —— 斜雨：每滴两点线段 ——
  const pos = new Float32Array(RAIN_COUNT * 6);
  const vel = new Float32Array(RAIN_COUNT * 2); // vy, vz(水平随风)
  for (let i = 0; i < RAIN_COUNT; i++) {
    resetDrop(i, true);
  }
  function resetDrop(i, randomY = false) {
    const x = (Math.random() - 0.5) * AREA;
    const z = (Math.random() - 0.5) * AREA;
    const y = 8 + Math.random() * 6;
    const o = i * 6;
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    // 斜率：向下+向后（风）
    const len = 0.55 + Math.random() * 0.3;
    pos[o + 3] = x + len * 0.35; pos[o + 4] = y - len; pos[o + 5] = z + len * 0.12;
    vel[i * 2] = 14 + Math.random() * 8; // 下落速度
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xaecdf0, transparent: true, opacity: 0.34, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  group.add(lines);

  // —— 涟漪：贴地扩散环 ——
  const RIPPLES = 46;
  const rippleGeo = new THREE.PlaneGeometry(1, 1);
  const ripples = [];
  for (let i = 0; i < RIPPLES; i++) {
    const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({
      color: 0xdff2ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    group.add(m);
    ripples.push({ m, t: 1e9, life: 0.9 });
  }
  let rippleClock = 0;

  // —— 状态 ——
  let raining = false, target = 0, opacity = 0;
  let autoTimer = 25 + Math.random() * 30;
  let forced = null;

  const urlW = new URLSearchParams(location.search).get('weather');
  if (urlW === 'rain') { forced = true; raining = true; }
  if (urlW === 'sun') { forced = false; raining = false; }

  function update(dt, playerPos, camera, nightMix) {
    // 自动轮换
    if (!forced) {
      autoTimer -= dt;
      if (autoTimer <= 0) {
        raining = !raining;
        autoTimer = raining ? 40 + Math.random() * 50 : 30 + Math.random() * 40;
      }
    } else raining = forced;

    target = raining ? 1 : 0;
    opacity += (target - opacity) * Math.min(1, dt * 0.8);
    group.visible = opacity > 0.02;
    mat.opacity = 0.36 * opacity;
    if (!group.visible) return opacity;

    // 雨随玩家移动（包裹玩家周围）
    group.position.set(playerPos.x, 0, playerPos.z);

    // 线段下落
    const p = geo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const vy = vel[i * 2];
      const o = i * 6;
      p[o + 1] -= vy * dt; p[o + 4] -= vy * dt;
      p[o] += vy * dt * 0.35; p[o + 3] += vy * dt * 0.35; // 风斜
      p[o + 2] += vy * dt * 0.12; p[o + 5] += vy * dt * 0.12;
      if (p[o + 1] < 0.05) {
        // 落地：生成涟漪
        if (rippleClock <= 0) spawnRipple(p[o], p[o + 2]);
        resetDrop(i);
      }
    }
    geo.attributes.position.needsUpdate = true;
    rippleClock -= dt;

    // 涟漪动画
    for (const r of ripples) {
      if (r.t > r.life) { r.m.visible = false; continue; }
      r.t += dt;
      const k = r.t / r.life;
      r.m.visible = true;
      const s = 0.25 + k * 1.1;
      r.m.scale.set(s, s, 1);
      r.m.material.opacity = 0.4 * (1 - k) * opacity;
    }
    return opacity;
  }
  function spawnRipple(x, z) {
    const r = ripples.find((r2) => r2.t > r2.life);
    if (!r) return;
    r.t = 0;
    rippleClock = 0.035;
    r.m.position.set(x + (Math.random() - 0.5) * 0.4, 0.03, z + (Math.random() - 0.5) * 0.4);
  }
  function force(rain) { forced = !!rain; raining = !!rain; }
  return { update, force, get raining() { return raining; }, get intensity() { return opacity; } };
}
