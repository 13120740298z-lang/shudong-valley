// 天气系统：晴 ↔ 雨 随机轮换（雨天参考通用 2D 雨天做法：斜雨粒子 + 地面涟漪 + 画面冷暗 + 闪电）
// 绘制在屏幕空间（不进世界坐标），由 game.js 主循环调用

export function createWeather(canvas) {
  const state = {
    raining: false,
    intensity: 0,        // 0..1 平滑过渡
    nextFlip: Date.now() + 20000 + Math.random() * 30000,
    drops: [],
    ripples: [],
    lightning: 0,        // 闪白剩余时间
    nextBolt: 0
  };

  function maybeFlip(now) {
    if (now < state.nextFlip) return;
    state.raining = !state.raining;
    state.nextFlip = now + (state.raining
      ? 25000 + Math.random() * 30000
      : 40000 + Math.random() * 50000);
  }

  function ensureDrops() {
    const target = Math.floor(canvas.width / 6);
    while (state.drops.length < target) {
      state.drops.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        v: 5.5 + Math.random() * 3.5,
        len: 7 + Math.random() * 8
      });
    }
  }

  // 返回 {raining, lightning}，并在屏幕上绘制雨层（世界变换之外调用）
  function updateAndDraw(c, now, dt, night) {
    maybeFlip(now);
    state.intensity += ((state.raining ? 1 : 0) - state.intensity) * Math.min(1, dt / 900);
    const I = state.intensity;
    if (I < 0.02) {
      state.lightning = 0;
      return { raining: false, intensity: 0 };
    }
    ensureDrops();

    // 雨滴
    c.save();
    c.strokeStyle = `rgba(180, 205, 255, ${0.34 * I})`;
    c.lineWidth = 1;
    c.beginPath();
    for (const d of state.drops) {
      d.y += d.v * (dt / 16.7);
      d.x += d.v * 0.18 * (dt / 16.7);
      if (d.y > canvas.height) {
        // 落地：在屏幕随机位置生成涟漪概率
        if (Math.random() < 0.28 * I && state.ripples.length < 40) {
          state.ripples.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, t: 0 });
        }
        d.y = -20; d.x = Math.random() * canvas.width;
      }
      c.moveTo(d.x, d.y);
      c.lineTo(d.x + d.len * 0.18, d.y - d.len);
    }
    c.stroke();

    // 涟漪
    for (let i = state.ripples.length - 1; i >= 0; i--) {
      const r = state.ripples[i];
      r.t += dt;
      const life = 620;
      if (r.t > life) { state.ripples.splice(i, 1); continue; }
      const p = r.t / life;
      c.strokeStyle = `rgba(200, 220, 255, ${(1 - p) * 0.4 * I})`;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(r.x, r.y, 2 + p * 7, (2 + p * 7) * 0.45, 0, 0, Math.PI * 2);
      c.stroke();
    }

    // 雨幕冷色调
    c.fillStyle = `rgba(40, 60, 110, ${0.16 * I})`;
    c.fillRect(0, 0, canvas.width, canvas.height);

    // 闪电（夜晚更频繁）
    if (now > state.nextBolt) {
      state.nextBolt = now + (night ? 7000 : 16000) + Math.random() * 12000;
      if (Math.random() < 0.6) state.lightning = 130;
    }
    if (state.lightning > 0) {
      state.lightning -= dt;
      c.fillStyle = `rgba(235, 240, 255, ${Math.min(0.5, state.lightning / 130 * 0.5) * I})`;
      c.fillRect(0, 0, canvas.width, canvas.height);
    }
    c.restore();
    return { raining: state.raining, intensity: I };
  }

  function force(rain) {
    state.raining = rain;
    state.nextFlip = Date.now() + (rain ? 120000 : 120000);
    if (rain) state.intensity = Math.max(state.intensity, 0.1);
  }
  return { updateAndDraw, force, state };
}
