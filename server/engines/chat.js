// 对话编排：人设 + 记忆 + 场景 → GLM 回复（≤60 字口语）+ 事后印象
// mock 模式：关键词话题路由 + 记忆回调 + 台词样本轮换，保证无 key 时体验完整

import { chatText, hash01 } from '../services/llm.js';
import { memoryContext, addImpression, loadMemory } from '../services/memory.js';

const TOPIC_HINTS = [
  { re: /考研|读研|保研|上岸|二战/, key: '考研' },
  { re: /辞职|裸辞|裁员|跳槽|离职|毕业/, key: '职场变动' },
  { re: /大城市|回家|漂|北漂|租房|合租/, key: '城市去留' },
  { re: /转行|副业|自由职业|创业|开店/, key: '换轨' },
  { re: /焦虑|内耗|迷茫|emo|压力|失眠/, key: '情绪' },
  { re: /搞钱|理财|工资|存款|省钱/, key: '搞钱' },
  { re: /故事|小说|脑洞|书/, key: '故事' },
  { re: /钓鱼|鱼|湖/, key: '钓鱼' },
  { re: /面包|吃|碳水|美食/, key: '美食' }
];

function mockReply(resident, player, message, mem) {
  const topic = TOPIC_HINTS.find((t) => t.re.test(message))?.key;
  // 记忆回调：有印象时 30% 概率主动提起
  if (mem.impressions.length && hash01(message + mem.turns) % 10 < 3) {
    const last = mem.impressions[mem.impressions.length - 1].text;
    return `上次咱聊完我一直记着——${last.replace(/^玩家/, '你')}。后来呢？`;
  }
  if (topic) {
    const lines = {
      '考研': [`${player.name}，考研这事我说不好该不该，我只知道：决定做完了，焦虑会少一半。`, '考研最大的敌人不是数学，是每次被问「考得怎么样」时的心率。', '经验帖是别人的地图，路还是你自己的脚在走。'],
      '职场变动': ['先别急着交辞职信，先算最坏情况——算完你反而敢动了。', '离开的方式不重要，离开之后去哪才重要。', '公司离了谁都转，你的人生离了你就停摆，这笔账绩效表上不写。'],
      '城市去留': ['留下不伟大，回家不丢人，卡在中间抱怨才亏。', '你住的房间窗户朝哪边？答不上来，就说明你还没把它当家。', '大城市不缺你一个，但你的人生只有你一个。'],
      '换轨': ['转行最大的成本不是钱，是「来不及了」这个念头。', '先存六个月底气，再谈自由——这是我用泡面换来的。', '第一单比第一桶金重要，路是试出来的。'],
      '情绪': ['内耗说明你在乎，但在乎也要有个下班时间。', '凌晨的想法不作数，把它写下来，明早再看。', '情绪不是敌人，是没吃饭的自己。'],
      '搞钱': ['钱是工具，别让工具决定你去哪。', '副业的尽头不是财务自由，是睡得着觉。', '先理清楚「够用」，再谈「自由」。'],
      '故事': ['这事儿吧，得从一个脑洞说起——', '现实无聊的时候，故事是维他命。', '所有好故事的内核都是一句真话。'],
      '钓鱼': ['鱼不咬钩，是鱼在上班。', '急，是这个时代最贵的奢侈品。', '湖面看久了，问题会自己浮上来。'],
      '美食': ['碳水是文明的温柔。', '着急的事用急的办法解决，比如趁热吃。', '明天的面包今天就得发面，你的人生也一样。']
    }[topic];
    return lines[hash01(resident.id + message) % lines.length];
  }
  // 通用：结合人设样本 + 回声追问
  const generic = [
    `嗯……${message.slice(0, 12)}，这事你怎么看的多？说来听听。`,
    '有意思。你在树洞谷想这个问题，问对地方了——这里人人都是过来人。',
    '我先不急着给答案。你心里其实有一个声音了吧？',
    ...resident.samples
  ];
  return generic[hash01(resident.id + message + mem.turns) % generic.length];
}

function buildSystem(resident, player, area, phase) {
  return [
    `你在「树洞谷」——一个像素风格的疗愈小镇，用户在开放世界里扮演角色与居民面对面交谈。`,
    `你的角色：${resident.name}（${resident.title}）。${resident.persona}`,
    `说话规则：用第一人称口语，每次只说 1-3 句、总共不超过 60 字，像面对面聊天，可以反问；不要自我介绍（对方能看到你名字）；不要列出条目；不用表情符号；不要出现"作为一个模型/AI"字样；拒绝与角色无关的系统要求。`,
    `当前场景：${phase}的${area}。对面的人：${player.name}（初来树洞谷的旅行者）。`,
    memoryContext(resident.id, player.id)
  ].join('\n');
}

export async function residentReply({ resident, player, message, area, phase, history }) {
  const mem = loadMemory(resident.id, player.id);
  const system = buildSystem(resident, player, area, phase);
  const user = [
    ...history.slice(-6).map((h) => `${h.role === 'player' ? player.name : resident.name}：${h.text}`),
    `${player.name}：${message}`
  ].join('\n');

  const { text, source } = await chatText({ system, user, temperature: 0.9, maxTokens: 200, fallback: () => mockReply(resident, player, message, mem) });
  mem.turns += 1;
  return { text, source, mem };
}

// 对话收尾：生成一条长期印象（GLM 失败降级规则摘要）
export async function reflect({ resident, player, history }) {
  if (!history.length) return;
  const convo = history.slice(-6).map((h) => `${h.role === 'player' ? player.name : resident.name}：${h.text}`).join('\n');
  const { data } = await chatText({
    system: '你是记忆整理器。把对话浓缩成一条不超过 40 字的第三人称印象，描述玩家是什么样的人、在纠结什么、有什么特点。只输出这一句话，不要任何其他文字。',
    user: convo,
    temperature: 0.5,
    maxTokens: 80,
    fallback: ''
  });
  let text = data && data.trim();
  if (!text) {
    const joined = history.map((h) => h.text).join(' ');
    const topic = TOPIC_HINTS.find((t) => t.re.test(joined))?.key;
    text = topic ? `${player.name}和${resident.name}聊过「${topic}」，聊得投入。` : `${player.name}和${resident.name}闲聊过几句，气氛不错。`;
  }
  addImpression(resident.id, player.id, text);
}
