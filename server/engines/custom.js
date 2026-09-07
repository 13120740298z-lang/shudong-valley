// 自定义居民：一句话设定 → 人设卡（GLM 生成 / 模板合成降级）
// 边界：设定 ≤40 字；镇上居民总数上限 12；玩家上限 3 位（在 index.js 校验）

import { chatJSON, hash01 } from '../services/llm.js';

const BAD_WORDS = /(政治|色情|暴力|赌博|毒品|自杀|枪|脏话)/;

const NAME_A = ['小火', '半糖', '阿星', '咕咕', '栗子', '柚子', '默默', '布丁', '团子', '小满'];
const NAME_B = ['阿姨', '大叔', '同学', '老师', '店长', ''];
const TITLES = ['夜市摊主', '旧书摊老板', '修表匠', '屋顶天文学家', '流浪歌手', '盆景匠', '天气预报员', '拾光者'];
const QUIRKS = ['说话前会先整理袖口', '随身带一个小本子', '笑起来会先自嘲', '给每朵云起名字', '收集别人的口头禅', '坚持用手写账本'];
const CLOTH = ['#D96C4F', '#5FA777', '#7A6CFF', '#DFA33C', '#C25B8E', '#4AA3DF'];
const HAIR = ['#2B2B3A', '#5A3A22', '#6B4226', '#1F1F2E', '#7A4A2B'];

function mockPersona(desc, idx) {
  const seed = desc + idx;
  const name = (NAME_A[hash01(seed) % NAME_A.length]) + (NAME_B[hash01(seed + 'b') % NAME_B.length]);
  const title = TITLES[hash01(seed + 't') % TITLES.length];
  const quirk = QUIRKS[hash01(seed + 'q') % QUIRKS.length];
  return {
    name,
    title,
    persona: `${name}，${title}。因为「${desc.slice(0, 20)}」搬来树洞谷。性格温和但有主见，${quirk}。愿意听人说话，也爱分享自己的行当里的小智慧。`,
    greeting: `你好呀，我是${name}，刚把家安在这条街——你是？`,
    samples: ['每个行当里都藏着半个哲学家。', '小镇的好处是：烦恼会被风分掉一半。'],
    cloth: CLOTH[hash01(seed + 'c') % CLOTH.length],
    hair: HAIR[hash01(seed + 'h') % HAIR.length],
    schedule: {
      morning: { x: 20, y: 17, label: '广场' },
      noon: { x: 10, y: 19, label: '面包房' },
      evening: { x: 30, y: 11, label: '老盐酒馆' },
      night: { x: 20, y: 17, label: '广场' }
    },
    memorySeed: `${name}刚搬来，正四处认识邻居。`
  };
}

export async function designResident(desc, idx) {
  const { data, source } = await chatJSON({
    system: [
      '你在为像素疗愈小镇「树洞谷」设计新居民。根据用户的一句话设定，输出 JSON（不要多余文字），字段：',
      '{"name":"2-4字中文名","title":"6-10字身份","persona":"第三人称人设，80-120字，包含年龄、身份、性格、说话风格、和谁关系好","greeting":"初次见面的第一句话，不超过30字","samples":["口头禅或代表性台词","两句"],"cloth":"#十六进制衣服颜色","hair":"#十六进制发色"}',
      '要求：温和治愈、接地气、有记忆点；不要名人真名；不要敏感内容；中文。'
    ].join('\n'),
    user: `居民设定：${desc}`,
    temperature: 0.9,
    maxTokens: 500,
    fallback: () => mockPersona(desc, idx)
  });
  // 兜底校验：字段缺失时回退 mock
  const fb = mockPersona(desc, idx);
  const out = {
    name: (data?.name || fb.name).slice(0, 6),
    title: (data?.title || fb.title).slice(0, 12),
    persona: (data?.persona || fb.persona).slice(0, 260),
    greeting: (data?.greeting || fb.greeting).slice(0, 60),
    samples: Array.isArray(data?.samples) && data.samples.length ? data.samples.slice(0, 2).map((s) => String(s).slice(0, 40)) : fb.samples,
    cloth: /^#[0-9a-fA-F]{6}$/.test(data?.cloth || '') ? data.cloth : fb.cloth,
    hair: /^#[0-9a-fA-F]{6}$/.test(data?.hair || '') ? data.hair : fb.hair,
    schedule: fb.schedule,
    memorySeed: fb.memorySeed,
    custom: true,
    desc: String(desc).slice(0, 40)
  };
  return { resident: out, source };
}

export function validateDesc(desc) {
  const d = String(desc || '').trim();
  if (d.length < 2) return { ok: false, msg: '设定太短了，多给几个字。' };
  if (d.length > 40) return { ok: false, msg: '设定最多 40 字，留点想象空间。' };
  if (BAD_WORDS.test(d)) return { ok: false, msg: '这个设定不适合树洞谷，换一个温和点的吧。' };
  return { ok: true, desc: d };
}
