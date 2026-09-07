// LLM 服务：GLM（智谱）↔ mock 双模
// 官方文档核实（2026-09-07）：端点 https://open.bigmodel.cn/api/paas/v4/chat/completions
// 鉴权 Authorization: Bearer <key>；OpenAI 兼容；免费模型 glm-4.7-flash（200K ctx）
// 环境变量：GLM_API_KEY / GLM_MODEL（默认 glm-4.7-flash）
// 未配置或调用失败自动降级 mock（台词池+规则合成），保证演示永不挂

const ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = process.env.GLM_MODEL || 'glm-4.7-flash';

export function llmReady() {
  return Boolean(process.env.GLM_API_KEY);
}
export const llmMode = () => (llmReady() ? `glm:${MODEL}` : 'mock');

function hash01(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function callGLM(messages, { temperature = 0.85, maxTokens = 300, timeoutMs = 25000 } = {}) {
  if (!llmReady()) throw new Error('GLM_NOT_CONFIGURED');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GLM_API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens }),
      signal: ctrl.signal
    });
    if (!resp.ok) throw new Error(`GLM_HTTP_${resp.status}`);
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('GLM_EMPTY');
    return String(text).trim();
  } finally {
    clearTimeout(t);
  }
}

// 提取 JSON（GLM 偶尔包裹 ```json），失败返回 null
export function extractJSON(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function chatJSON({ system, user, temperature = 0.8, maxTokens = 400, fallback = null }) {
  if (llmReady()) {
    try {
      const raw = await callGLM([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ], { temperature, maxTokens });
      const obj = extractJSON(raw);
      if (obj) return { ok: true, data: obj, source: 'glm' };
    } catch { /* fallthrough */ }
  }
  if (fallback !== null) return { ok: true, data: typeof fallback === 'function' ? fallback() : fallback, source: 'mock' };
  return { ok: false, source: 'none' };
}

export async function chatText({ system, user, temperature = 0.85, maxTokens = 220, fallback = '' }) {
  if (llmReady()) {
    try {
      const raw = await callGLM([
        { role: 'system', content: system },
        { role: 'user', content: user }
      ], { temperature, maxTokens });
      if (raw) return { text: raw, source: 'glm' };
    } catch { /* fallthrough */ }
  }
  return { text: typeof fallback === 'function' ? fallback() : fallback, source: 'mock' };
}

export { hash01 };
