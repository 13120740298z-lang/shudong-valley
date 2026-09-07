// 居民记忆：每位居民对每位玩家的长期印象（JSON 落盘，重启保留）
// 结构：data/memory/{residentId}__{playerId}.json => { impressions: [{t, text}], turns: n }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'memory');

function file(residentId, playerId) {
  return path.join(DIR, `${residentId}__${playerId}.json`.replace(/[^\w.-]/g, '_'));
}

export function loadMemory(residentId, playerId) {
  try {
    return JSON.parse(fs.readFileSync(file(residentId, playerId), 'utf8'));
  } catch {
    return { impressions: [], turns: 0 };
  }
}

export function saveMemory(residentId, playerId, mem) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file(residentId, playerId), JSON.stringify(mem, null, 2));
}

export function addImpression(residentId, playerId, text) {
  const mem = loadMemory(residentId, playerId);
  mem.impressions.push({ t: Date.now(), text });
  if (mem.impressions.length > 12) mem.impressions = mem.impressions.slice(-12); // 滚动窗口
  saveMemory(residentId, playerId, mem);
}

export function memoryContext(residentId, playerId) {
  const mem = loadMemory(residentId, playerId);
  if (!mem.impressions.length) return '（你们是初次见面）';
  const lines = mem.impressions.slice(-6).map((i) => `- ${i.text}`);
  return `你们过去交互的印象（旧到新）：\n${lines.join('\n')}`;
}
