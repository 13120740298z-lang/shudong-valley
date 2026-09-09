// 经典 Perlin 柏林噪声（2D）+ 分形布朗运动（多倍频叠加）
// 纯确定性实现：同 seed 同输出，服务端/前端可用

export class Perlin {
  constructor(seed = 1337) {
    // 置换表：用 seed 的 xorshift 打乱 0..255
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }

  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static lerp(a, b, t) { return a + (b - a) * t; }

  static grad(hash, x, y) {
    // 8 方向梯度
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  // 单倍频 Perlin，返回约 [-1, 1]
  noise(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = Perlin.fade(xf), v = Perlin.fade(yf);
    const p = this.p;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = Perlin.lerp(Perlin.grad(aa, xf, yf), Perlin.grad(ba, xf - 1, yf), u);
    const x2 = Perlin.lerp(Perlin.grad(ab, xf, yf - 1), Perlin.grad(bb, xf - 1, yf - 1), u);
    return Perlin.lerp(x1, x2, v); // 约 [-1,1]
  }

  // 分形布朗运动：octaves 层叠加，返回约 [-1,1]
  fbm(x, y, { octaves = 4, lacunarity = 2, gain = 0.5 } = {}) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
