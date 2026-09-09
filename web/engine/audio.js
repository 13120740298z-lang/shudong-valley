// 音频系统：BGM 循环 + 雨声环境 + 交互音效；浏览器自动播放策略下首次交互解锁
// 文件来自 Meowa 生成（见 docs/dev-log.md）

export function createAudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const master = ac.createGain();
  master.gain.value = 0.55;
  master.connect(ac.destination);

  function loopSound(src) {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(master);
    const s = ac.createMediaElementSource(src);
    src.loop = true;
    s.connect(g);
    return { el: src, gain: g };
  }
  function oneShot(src, vol = 0.8, rate = 1) {
    return () => {
      if (muted) return;
      const a = new Audio(src);
      a.volume = vol * master.gain.value / 0.55;
      a.playbackRate = rate;
      a.play().catch(() => {});
    };
  }

  let muted = localStorage.getItem('sv_mute') === '1';
  let bgm = null, rain = null;

  function ensureLoops() {
    if (!bgm) {
      const el = new Audio('audio/bgm-village.mp3');
      el.volume = 0.5;
      bgm = loopSound(el);
      el.play().catch(() => {});
    }
    if (!rain) {
      const el = new Audio('audio/rain-loop.mp3');
      rain = loopSound(el);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function setRain(on) {
    if (!rain) return;
    const target = on ? 0.5 : 0;
    // 平滑过渡
    const step = () => {
      const cur = rain.gain.gain.value;
      const d = target - cur;
      if (Math.abs(d) < 0.02) { rain.gain.gain.value = target; return; }
      rain.gain.gain.value = cur + d * 0.1;
      requestAnimationFrame(step);
    };
    step();
  }

  const sfx = {
    step: oneShot('audio/step.mp3', 0.35, 0.9 + Math.random() * 0.2),
    pickup: oneShot('audio/pickup.mp3', 0.9),
    dialog: oneShot('audio/dialog.mp3', 0.5),
    shimmer: oneShot('audio/shimmer.mp3', 0.6)
  };

  // 脚步：移动中节流播放
  let lastStep = 0;
  function stepWhileMoving(moving) {
    if (!moving) return;
    const now = performance.now();
    if (now - lastStep > 260) { lastStep = now; sfx.step(); }
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('sv_mute', muted ? '1' : '0');
    master.gain.value = muted ? 0 : 0.55;
    if (bgm) bgm.el.muted = muted;
    if (rain) rain.el.muted = muted;
    return muted;
  }
  const isMuted = () => muted;

  return { ensureLoops, setRain, sfx, stepWhileMoving, toggleMute, isMuted, onFirstInteract: ensureLoops };
}
