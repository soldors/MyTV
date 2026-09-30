// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { checkUpstreamAllowed, isBlockedByDNS, isValidProxyUrl } from '@/lib/ssrf';
import { fetchWithSafeRedirects } from '@/lib/fetch-utils';
import { rewriteM3u8 } from '@/lib/m3u8';

export const runtime = 'nodejs';

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT || '8000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '1', 10);
const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * 精确域名匹配：仅 `douban.com` 本身及其子域放行。
 * 不能用 endsWith('douban.com')——那样 `evil-douban.com` 也会命中，形成鉴权绕过。
 */
function isDoubanHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'douban.com' || h.endsWith('.douban.com') ||
    h === 'doubanio.com' || h.endsWith('.doubanio.com')
  );
}

/**
 * 未登录即可代理的图片域白名单（精确后缀匹配，防 `evil-bgm.tv` 类绕过）：
 * 豆瓣封面需要 Referer 伪装；Bangumi 封面为公开图片 CDN，无 Referer 校验，
 * 仅需防开放代理滥用。
 */
function isAnonymousImageHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    isDoubanHost(h) ||
    h === 'doubanio.viki.moe' || h.endsWith('.doubanio.viki.moe') ||
    h === 'bgm.tv' || h.endsWith('.bgm.tv')
  );
}

// 未鉴权的图片等资源也允许走代理（豆瓣防盗链需要 Referer 伪装）；
// 但为防止被当作开放代理滥用，仅放行上述公开图片域，其余必须已登录。
function looksLikeImageUrl(target: string): boolean {
  const host = (() => {
    try { return new URL(target).hostname; } catch { return ''; }
  })();
  return isAnonymousImageHost(host);
}

/**
 * 部分采集站的 vod_play_url 给的不是 m3u8 而是 `/share/<id>` 网页播放器，
 * 真实播放列表嵌在页面脚本里（`var main = "/.../index.m3u8?sign=..."`）。
 * 代理遇到 text/html 且页面中可提取出 m3u8 地址时，转取该地址（过 SSRF 校验），
 * 对播放器完全透明（懒解析，仅在真正点开某集时发生一次页面拉取）。
 */
function extractPlaylistFromHtml(html: string, baseUrl: string): string | null {
  const patterns = [
    /var\s+main\s*=\s*["']([^"']+\.m3u8[^"']*)["']/i,
    /["']([^"']+\.m3u8[^"']*)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m) {
      try {
        return new URL(m[1], baseUrl).href;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * 通用流式代理：
 * - 已登录会话（httpOnly cookie）→ m3u8 重写后的分片同源请求自动携带；
 * - 未登录仅放行图片目标（豆瓣封面等），且同样受 SSRF 防护约束；
 * - m3u8 文本重写为代理路径，分片/key/map 全部经本站转发，规避上游 CORS；
 * - share 播放器页自动解析出真实 m3u8 后代取（见 extractPlaylistFromHtml）。
 */
export async function GET(req: Request, ctx: { params: Promise<{ url: string }> }) {
  const { url: encodedUrl } = await ctx.params;
  const targetUrl = (() => {
    try { return decodeURIComponent(encodedUrl); } catch { return encodedUrl; }
  })();

  const guarded = await guardRequest(req);
  if (guarded && !looksLikeImageUrl(targetUrl)) return guarded;

  if (!isValidProxyUrl(targetUrl)) {
    return new NextResponse('无效的 URL', { status: 400 });
  }
  if (await isBlockedByDNS(targetUrl)) {
    return new NextResponse('不允许访问私有/保留网络地址', { status: 403 });
  }

  const headers: Record<string, string> = { 'User-Agent': UA, Accept: '*/*' };
  try {
    if (isDoubanHost(new URL(targetUrl).hostname)) {
      headers.Referer = 'https://movie.douban.com/';
    }
  } catch { /* 忽略非法 URL */ }

  const range = req.headers.get('range');
  if (range) headers.Range = range;

  // 边缘缓存策略：视频分片/图片是静态内容，落 Cloudflare 边缘缓存后
  // 同片二刷、多人观看直接命中就近节点（源站只被打一次）；
  // m3u8 索引短缓存保新鲜；share 播放器页（HTML）与未知类型不缓存。
  const lowerUrl = targetUrl.toLowerCase();
  const cacheCf: Record<string, unknown> | undefined = (() => {
    if (/\.(ts|m4s|mp4|jpg|jpeg|png|webp|gif|key)([?#]|$)/.test(lowerUrl)) {
      return { cacheEverything: true, cacheTtl: 6 * 3600, cacheTtlByStatus: { '404-410': 0, '500-599': 0 } };
    }
    if (lowerUrl.includes('.m3u8')) {
      return { cacheEverything: true, cacheTtl: 60, cacheTtlByStatus: { '404-410': 0, '500-599': 0 } };
    }
    return undefined;
  })();

  let response: Response | undefined;
  let finalUrl = targetUrl;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fetchWithSafeRedirects(targetUrl, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }, { cf: cacheCf });
      response = result.res;
      finalUrl = result.finalUrl;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!response) {
    return new NextResponse(
      `代理请求失败: ${lastError instanceof Error ? lastError.message : '未知错误'}`,
      { status: 502 }
    );
  }

  let contentType = response.headers.get('content-type') || '';
  let isM3u8 =
    contentType.includes('mpegurl') || contentType.includes('x-mpegurl') ||
    targetUrl.toLowerCase().endsWith('.m3u8');

  // share 播放器页：HTML 中提取真实 m3u8 并代取（图片等其他 HTML 目标不受影响）
  let wasHtml = false;
  if (!isM3u8 && contentType.includes('text/html')) {
    wasHtml = true;
    const html = await response.text();
    const playlist = extractPlaylistFromHtml(html, finalUrl);
    if (playlist) {
      const verdict = await checkUpstreamAllowed(playlist);
      if (verdict.ok) {
        const resolved = await fetchWithSafeRedirects(playlist, {
          headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        response = resolved.res;
        finalUrl = resolved.finalUrl;
        contentType = response.headers.get('content-type') || '';
        isM3u8 =
          contentType.includes('mpegurl') || contentType.includes('x-mpegurl') ||
          playlist.toLowerCase().includes('.m3u8');
      }
    }
    // 播放器页 body 已读入内存，此分支不能再走下方流式透传（重复消费 body，
    // workerd 直接抛异常变 500）。源站对代理出口返回风控页等提不出 m3u8 的
    // 情形，明确报错让用户换源，而不是压成 500 白屏。
    if (!isM3u8) {
      return new NextResponse('无法从播放器页解析出视频地址，该源可能限制访问，请换源试试', {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // m3u8 文本：重写为代理路径（以重定向后的最终 URL 为 base 解析相对地址）
  if (isM3u8) {
    const text = await response.text();
    // 内容嗅探：源站播放 CDN 对代理出口存在间歇性风控，会把 403 页面
    // 以 m3u8 路径返回（URL 判定通过但内容是 HTML）。喂给 hls.js 只会
    // 得到莫名的分片加载失败，明确报错引导换源。
    if (!text.replace(/^\uFEFF/, '').trimStart().startsWith('#EXTM3U')) {
      return new NextResponse('播放列表不可用（源站拒绝访问），请换源试试', {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new NextResponse(rewriteM3u8(text, finalUrl), {
      status: response.status,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 其余（图片 / JSON / 分片 / key）流式透传
  const outHeaders = new Headers();
  for (const name of ['content-type', 'accept-ranges', 'content-range', 'etag', 'last-modified']) {
    const v = response.headers.get(name);
    if (v) outHeaders.set(name, v);
  }
  // fetch 会自动解压，转发时必须去掉长度相关头避免浏览器二次解压。
  // 封面/分片按 URL 不可变（豆瓣封面 URL 含内容哈希、m3u8 分片名含序号），
  // 浏览器侧缓存 1 天：跨会话/跨页复用，显著减少打进 Worker 的图片与分片请求
  outHeaders.set('Cache-Control', wasHtml ? 'no-store' : 'public, max-age=86400');
  outHeaders.set('Access-Control-Allow-Origin', '*');

  return new NextResponse(response.body, {
    status: response.status,
    headers: outHeaders,
  });
}
