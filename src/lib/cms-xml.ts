// XML 采集接口响应解析：海洋CMS / 飞飞CMS / 苹果CMS（at=xml）共用 RSS 5.1 结构，
// 与 JSON 接口同构归一（vod_* 字段），使搜索/详情/探活/收录量管线无需区分源类型。
//
//   <rss version="5.1">
//     <list page="1" pagecount="10" pagesize="20" recordcount="200">
//       <video>
//         <id>1</id><name><![CDATA[..]]></name><type>动作片</type><pic>..</pic>
//         <year>2024</year><area>大陆</area><note>..</note>
//         <actor>..</actor><director>..</director><des><![CDATA[..]]></des>
//         <dl><dd flag="m3u8">第1集$u#第2集$u</dd><dd flag="qq">...</dd></dl>
//       </video>
//     </list>
//   </rss>
//
// 解析优先 DOMParser（workerd 提供；本地 next dev 的 Node 环境没有），失败或不可用时
// 退回正则提取——采集 XML 结构固定无同名嵌套，正则路径同样可靠。

/** 与苹果CMS JSON 分页响应同构的载荷：list 元素字段即 vod_* */
export interface CmsPagePayload {
  list?: unknown;
  pagecount?: unknown;
  total?: unknown;
}

/** 响应体是否为 XML（按首个非空白字符嗅探，JSON 以 { 或 [ 开头） */
export function looksLikeCmsXml(text: string): boolean {
  return text.trimStart().startsWith('<');
}

/** 统一入口：按响应体格式分派 XML / JSON 解析，返回归一后的分页载荷 */
export function parseCmsPagePayload(text: string): CmsPagePayload {
  if (looksLikeCmsXml(text)) return parseCmsXml(text);
  // JSON 路径保持与原 res.json() 相同的抛错语义，由调用方按「源响应异常」处理
  return JSON.parse(text) as CmsPagePayload;
}

/** XML → vod_* 同构载荷；DOMParser 与正则两条路径共用归一规则 */
export function parseCmsXml(text: string): CmsPagePayload {
  return parseWithDom(text) ?? parseWithRegex(text);
}

// —— DOMParser 主路 ——

function attrNumber(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name);
  if (raw === null || raw === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function videoElToVod(video: Element): Record<string, unknown> {
  const child = (tag: string): string => video.querySelector(tag)?.textContent ?? '';
  const dds = Array.from(video.querySelectorAll('dl > dd'));
  return {
    vod_id: child('id'),
    vod_name: child('name'),
    vod_pic: textOrUndefined(child('pic')),
    type_name: textOrUndefined(child('type')),
    vod_year: textOrUndefined(child('year')),
    vod_area: textOrUndefined(child('area')),
    vod_actor: textOrUndefined(child('actor')),
    vod_director: textOrUndefined(child('director')),
    vod_remarks: textOrUndefined(child('note')),
    vod_content: child('des'),
    // 多线路：<dd flag="线路名">集$地址#...</dd>，与 JSON 的 vod_play_from/url $$$ 分段对齐
    vod_play_url: dds.map((dd) => (dd.textContent ?? '').trim()).join('$$$'),
    vod_play_from: dds.map((dd) => dd.getAttribute('flag') ?? '').join('$$$'),
  };
}

function parseWithDom(text: string): CmsPagePayload | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    const listEl = doc.querySelector('list');
    if (!listEl) return null;
    return {
      list: Array.from(doc.querySelectorAll('video')).map(videoElToVod),
      pagecount: attrNumber(listEl, 'pagecount'),
      total: attrNumber(listEl, 'recordcount'),
    };
  } catch {
    return null;
  }
}

// —— 正则兜底（DOMParser 不可用 / 病态输入） ——

/** 剥 CDATA 包裹并解码 XML 实体（DOMParser 路径的 textContent 已自动解码） */
function xmlText(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  // 数字字符引用：&#039; / &#x27;（源站 actor 字段常见）
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)));
  s = s.replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)));
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 码点越界（>0x10FFFF 或代理区）时原样保留，避免 String.fromCodePoint 抛错 */
function safeCodePoint(code: number): string {
  return code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '' : String.fromCodePoint(code);
}

function textOrUndefined(s: string): string | undefined {
  return s || undefined;
}

function pickTag(block: string, tag: string): string {
  // 常规 <tag>..</tag>；自闭合 <tag/> 视为空（海洋CMS常见 <pic/>）
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (m) return xmlText(m[1] ?? '');
  if (new RegExp(`<${tag}(?:\\s[^>]*)?/>`, 'i').test(block)) return '';
  return '';
}

function parseWithRegex(text: string): CmsPagePayload {
  const listOpen = /<list\b([^>]*)>/i.exec(text);
  const attrs = listOpen?.[1] ?? '';
  const attrInt = (name: string): number | undefined => {
    const m = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(attrs);
    if (!m) return undefined;
    const n = parseInt(m[1] ?? '', 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const videos = Array.from(text.matchAll(/<video\b[^>]*>([\s\S]*?)<\/video>/gi)).map((m) => {
    const block = m[1] ?? '';
    const dds = Array.from(block.matchAll(/<dd\b([^>]*)>([\s\S]*?)<\/dd>/gi));
    return {
      vod_id: pickTag(block, 'id'),
      vod_name: pickTag(block, 'name'),
      vod_pic: textOrUndefined(pickTag(block, 'pic')),
      type_name: textOrUndefined(pickTag(block, 'type')),
      vod_year: textOrUndefined(pickTag(block, 'year')),
      vod_area: textOrUndefined(pickTag(block, 'area')),
      vod_actor: textOrUndefined(pickTag(block, 'actor')),
      vod_director: textOrUndefined(pickTag(block, 'director')),
      vod_remarks: textOrUndefined(pickTag(block, 'note')),
      vod_content: pickTag(block, 'des'),
      vod_play_url: dds.map((d) => xmlText(d[2] ?? '')).join('$$$'),
      vod_play_from: dds.map((d) => {
        const flag = /flag\s*=\s*["']([^"']*)["']/i.exec(d[1] ?? '');
        return flag?.[1] ?? '';
      }).join('$$$'),
    };
  });

  return {
    list: videos,
    pagecount: attrInt('pagecount'),
    total: attrInt('recordcount'),
  };
}
