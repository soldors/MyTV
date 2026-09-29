// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明

import type { SearchResultItem, VideoDetail } from './types';

/**
 * Apple CMS（苹果CMS）资源站响应解析
 * 与上游 js/api.js 逻辑对齐，纯函数便于单元测试。
 */

const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // JSON 与 XML（海洋CMS 等）采集站都要能协商，不能只声明 JSON
  Accept: 'application/json, text/xml, */*',
};

export function cmsRequestHeaders(): Record<string, string> {
  return { ...UA_HEADERS };
}

/** 搜索响应 → 统一结果列表 */
export function parseSearchList(
  data: unknown,
  source: { key: string; name: string; url: string; isAdult?: boolean }
): SearchResultItem[] {
  if (!data || typeof data !== 'object') throw new Error('API返回的数据格式无效');
  const list = (data as { list?: unknown }).list;
  // 部分源站无结果时返回 list: null（而非 []），视为空结果而非格式错误
  if (list !== null && list !== undefined && !Array.isArray(list)) {
    throw new Error('API返回的数据格式无效');
  }
  return (Array.isArray(list) ? list : []).map((item) => {
    const vod = item as Record<string, unknown>;
    return {
      sourceKey: source.key,
      sourceName: source.name,
      vodId: String(vod.vod_id ?? ''),
      name: String(vod.vod_name ?? ''),
      pic: typeof vod.vod_pic === 'string' ? vod.vod_pic : undefined,
      typeName: typeof vod.type_name === 'string' ? vod.type_name : undefined,
      year: typeof vod.vod_year === 'string' ? vod.vod_year : undefined,
      area: typeof vod.vod_area === 'string' ? vod.vod_area : undefined,
      remarks: typeof vod.vod_remarks === 'string' ? vod.vod_remarks : undefined,
      sourceUrl: source.url,
      isAdult: source.isAdult,
    };
  });
}

/** 取分集条目的地址：标准 `集名$URL` 取 $ 后段；裸 URL 直接用（部分源无集名前缀） */
function episodeUrlOf(entry: string): string {
  const parts = entry.split('$');
  const url = parts.length > 1 ? parts[1] : parts[0];
  return url.startsWith('http://') || url.startsWith('https://') ? url : '';
}

/** 从 vod_play_url 中提取分集地址：格式 源1$$$源2，集1$URL1#集2$URL2 */
export function extractEpisodesFromPlayUrl(playUrl: string): string[] {
  if (!playUrl) return [];
  const firstSource = playUrl.split('$$$')[0] ?? '';
  return firstSource
    .split('#')
    .map(episodeUrlOf)
    .filter((url) => url !== '');
}

/**
 * 解析全部播放线路（L8）：vod_play_url 按 $$$ 分段，vod_play_from 按同序给出线路名
 * （常见为格式名如 qq/m3u8/youku，直接展示采集站原始标记；缺失/数量不齐时兜底「线路N」）。
 * 每段内 # 分集、$ 分「集名$地址」；仅保留 http(s) 地址，空线路丢弃。
 */
export function extractPlayLines(playUrl: string, playFrom: string): { name: string; episodes: string[] }[] {
  if (!playUrl) return [];
  const urlSegments = playUrl.split('$$$');
  const nameSegments = (playFrom || '').split('$$$');
  const lines: { name: string; episodes: string[] }[] = [];
  for (let i = 0; i < urlSegments.length; i++) {
    const episodes = urlSegments[i]
      .split('#')
      .map(episodeUrlOf)
      .filter((url) => url !== '');
    if (episodes.length === 0) continue;
    const rawName = (nameSegments[i] ?? '').trim();
    lines.push({ name: rawName || `线路${i + 1}`, episodes });
  }
  return lines;
}

/** 从简介文本中兜底提取 m3u8 链接 */
export function extractM3u8FromText(text: string): string[] {
  if (!text) return [];
  const matches = text.match(M3U8_PATTERN) || [];
  return matches.map((link) => link.replace(/^\$/, ''));
}

/** 详情 JSON 响应 → 统一详情 */
export function parseDetail(
  data: unknown,
  source: { key: string; name: string; url: string }
): VideoDetail {
  const d = data as { list?: Record<string, unknown>[] };
  if (!d || !Array.isArray(d.list) || d.list.length === 0) {
    throw new Error('获取到的详情内容无效');
  }
  const vod = d.list[0];
  const playUrl = String(vod.vod_play_url ?? '');
  let lines = extractPlayLines(playUrl, String(vod.vod_play_from ?? ''));
  let episodes = lines[0]?.episodes ?? [];
  if (episodes.length === 0) {
    // 列表接口无播放地址 → 简介兜底提取（此时无线路概念）
    episodes = extractM3u8FromText(String(vod.vod_content ?? ''));
    lines = episodes.length > 0 ? [{ name: '线路1', episodes }] : [];
  }
  return {
    episodes: lines[0]?.episodes ?? episodes,
    lines,
    videoInfo: {
      title: str(vod.vod_name),
      cover: str(vod.vod_pic),
      desc: str(vod.vod_content),
      typeName: str(vod.type_name),
      year: str(vod.vod_year),
      area: str(vod.vod_area),
      director: str(vod.vod_director),
      actor: str(vod.vod_actor),
      remarks: str(vod.vod_remarks),
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
    },
  };
}

function str(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

/**
 * 部分源的列表接口不返回播放地址，需要爬详情页 HTML 提取 m3u8。
 * 与上游 handleSpecialSourceDetail 对齐。
 */
export function parseDetailPageHtml(
  html: string,
  source: { key: string; name: string; url: string }
): VideoDetail {
  // 先尝试通用模式，再尝试日期哈希特征路径
  let matches = html.match(/\$(https?:\/\/[^"'\s]+?\.m3u8)/g) || [];
  if (matches.length === 0) {
    matches = html.match(/\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g) || [];
  }
  // 去重并清理尾缀
  const episodes = [...new Set(matches)].map((link) => {
    let u = link.substring(1);
    const parenIndex = u.indexOf('(');
    if (parenIndex > 0) u = u.substring(0, parenIndex);
    return u;
  });

  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);

  return {
    episodes,
    lines: episodes.length > 0 ? [{ name: '线路1', episodes }] : [],
    videoInfo: {
      title: titleMatch ? titleMatch[1].trim() : undefined,
      desc: descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : undefined,
      sourceKey: source.key,
      sourceName: source.name,
      sourceUrl: source.url,
    },
  };
}

/** 敏感分类过滤（成人内容过滤，关键词与上游保持一致） */
const ADULT_KEYWORDS = [
  '伦理片', '福利', '倫理片', '福利片', '日本伦理', '日本福利', '日本福利片', '日本伦理片', '擦边短剧', '擦边', '韩国伦理','里番动漫', '门事件', '萝莉少女', '制服诱惑', '国产传媒',
  'cosplay', '黑丝诱惑', '无码', '日本无码', '有码', '日本有码', 'SWAG',
  '网红主播', '色情片', '同性片', '福利视频', '无码高清', '有码高清', '91视频', '自拍偷拍', 'mini传媒', '福利片',
];

export function isAdultContent(typeName: string | undefined): boolean {
  if (!typeName) return false;
  return ADULT_KEYWORDS.some((k) => typeName.includes(k));
}

/** 自定义过滤词命中（名称或分类；词与目标都做 trim，空词不参与） */
function hitsCustomWord(words: string[] | undefined, name: string | undefined, typeName: string | undefined): boolean {
  if (!words || words.length === 0) return false;
  const haystacks = [name, typeName].filter((s): s is string => Boolean(s));
  return words.some((w) => haystacks.some((h) => h.includes(w)));
}

/**
 * 敏感内容过滤：内置分类关键词（与上游一致）+ 站长自定义词库（内容运营页维护）。
 * enabled=false 时全部放行（#8 后台可关）。
 */
export function filterAdultResults<T extends { name?: string; typeName?: string }>(
  items: T[],
  enabled: boolean,
  customWords?: string[]
): T[] {
  if (!enabled) return items;
  return items.filter((item) => !isAdultContent(item.typeName) && !hitsCustomWord(customWords, item.name, item.typeName));
}

/**
 * 归一化标题/关键词：去空白、标点与符号，转小写。
 * 用于跨标点差异匹配（源站存「摔跤吧!爸爸」而用户搜「摔跤吧！爸爸」）。
 */
export function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * 相关性判断：结果标题是否真的命中了搜索词。
 * 部分采集站会做分词/OR 模糊搜索（搜「摔跤吧！爸爸」返回一堆「爸爸XXX」），
 * 逐条校验后只保留真正相关的结果。
 *
 * 规则：归一化后的标题包含归一化后的完整关键词；
 * 多词查询（空格分隔）时放宽为「每个词都命中」即可（如「钢铁侠 2008」）。
 */
export function isRelevant(name: string, wd: string): boolean {
  const nName = normalizeTitle(name);
  const nWd = normalizeTitle(wd);
  if (!nName || !nWd) return true; // 空关键词不参与过滤
  if (nName.includes(nWd)) return true;
  const tokens = wd.trim().split(/\s+/);
  if (tokens.length > 1) {
    return tokens.every((t) => {
      const n = normalizeTitle(t);
      return n && nName.includes(n);
    });
  }
  return false;
}

/**
 * 结果相关性过滤：丢弃与关键词无关的条目。
 * 过滤后为空时回退到原列表——宁可多展示也不把源站唯一可用的结果清空。
 */
export function filterRelevantResults<T extends { name?: string }>(items: T[], wd: string): T[] {
  const filtered = items.filter((item) => isRelevant(item.name || '', wd));
  return filtered.length > 0 ? filtered : items;
}
