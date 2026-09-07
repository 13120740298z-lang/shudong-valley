// 知乎内容层：公告栏热榜（缓存 1h）+ 图书馆知识书架（免鉴权赛事接口）+ 镇长热线（直答）
// 热榜/直答需 ZHIHU_ACCESS_SECRET（env 门控）；知识接口免鉴权
// 所有来源失败时回退内置离线缓存，保证页面永远有内容

const DEV_BASE = 'https://developer.zhihu.com';
const HACK_BASE = 'https://api.zhihu.com/km-indep-home/hackathon/v2';

const OFFLINE_HOT = [
  { title: '为什么越来越多人开始过「低配生活」？', url: 'https://www.zhihu.com/search?type=content&q=低配生活' },
  { title: '第一次意识到自己不再年轻，是什么瞬间？', url: 'https://www.zhihu.com/search?type=content&q=不再年轻的瞬间' },
  { title: '裸辞去旅行三个月的人，后来都怎么样了？', url: 'https://www.zhihu.com/search?type=content&q=裸辞去旅行' },
  { title: '哪句话在你最难的时候拉过你一把？', url: 'https://www.zhihu.com/search?type=content&q=拉我一把的话' },
  { title: '如何看待「数字游民」生活方式流行？', url: 'https://www.zhihu.com/search?type=content&q=数字游民' }
];

const OFFLINE_KNOWLEDGE = [
  { work_id: 'offline1', title: '不想学习的时候如何逼迫自己学习？', description: '启动成本越低，行动越容易发生：把"学习"缩小成"翻开书' },
  { work_id: 'offline2', title: '如何走出职业倦怠？', description: '倦怠不是懒，是意义感暂时离线。先休整，再重新定义任' },
  { work_id: 'offline3', title: '如何从心理被动的人慢慢变为主动？', description: '绝大部分退缩行为和自我概念有关：你不是不能，是觉得' },
  { work_id: 'offline4', title: '年轻人在职场：我们是如何陷入穷人思维的？', description: '越努力越贫穷的怪圈，往往从"用时间换安全感"开始。' },
  { work_id: 'offline5', title: '打造职业发展的金字塔', description: '把职业能力分成三层：可迁移的底座、行业的中层、个人' }
];

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.ZHIHU_ACCESS_SECRET || ''}`,
    'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    'Content-Type': 'application/json'
  };
}

async function getJSON(url, { timeoutMs = 12000, headers = {}, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { method, headers, body, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP_${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(t);
  }
}

let hotCache = { t: 0, items: OFFLINE_HOT, live: false };

export async function getHotList() {
  if (Date.now() - hotCache.t < 3600_000) return hotCache;
  if (!process.env.ZHIHU_ACCESS_SECRET) return hotCache; // 未配置：离线内容
  try {
    const u = new URL(`${DEV_BASE}/api/v1/content/hot_list`);
    u.searchParams.set('Limit', '10');
    const d = await getJSON(u.toString(), { headers: authHeaders() });
    const items = (d?.Data?.Items || []).map((i) => ({ title: i.Title, url: i.Url }));
    if (items.length) hotCache = { t: Date.now(), items, live: true };
  } catch { /* 保留旧缓存 */ }
  return hotCache;
}

let knowledgeCache = { t: 0, items: OFFLINE_KNOWLEDGE, live: false };

export async function getKnowledge() {
  if (Date.now() - knowledgeCache.t < 3600_000) return knowledgeCache;
  try {
    const d = await getJSON(`${HACK_BASE}/knowledge/list`, { headers: { Accept: 'application/json' } });
    const items = (Array.isArray(d) ? d : []).slice(0, 8).map((k) => ({
      work_id: k.work_id, title: k.title, description: (k.description || '').slice(0, 60)
    }));
    if (items.length) knowledgeCache = { t: Date.now(), items, live: true };
  } catch { /* 保留旧缓存 */ }
  return knowledgeCache;
}

export async function getKnowledgeDetail(workId) {
  if (!/^[\w-]+$/.test(workId)) return null;
  try {
    const d = await getJSON(`${HACK_BASE}/knowledge/${workId}`, { headers: { Accept: 'application/json' } });
    if (d && d.content) return { title: d.chapter_name || '一篇知识', content: String(d.content).slice(0, 600) };
  } catch { /* fallthrough */ }
  const off = OFFLINE_KNOWLEDGE.find((k) => k.work_id === workId);
  return off ? { title: off.title, content: off.description + '……（离线摘要，接入官方接口后可读全文）' } : null;
}

export async function mayorHotline(question) {
  if (!process.env.ZHIHU_ACCESS_SECRET) return null;
  try {
    const resp = await fetch(`${DEV_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model: 'zhida-fast-1p5', messages: [{ role: 'user', content: `用60字以内、温柔不说教的口吻回答：${question}` }], stream: false })
    });
    const data = await resp.json().catch(() => ({}));
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}
