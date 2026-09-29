// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明

import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { buildCmsApi, cmsRequestHeaders, parseDetail, parseDetailPageHtml } from '@/lib/cms-parser';
import { parseCmsPagePayload } from '@/lib/cms-xml';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';
import { checkBreaker } from '@/lib/circuit-breaker';
import { reportSourceOutcome } from '@/lib/source-health';
import { getKvCache } from '@/lib/kv-cache';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import type { SourceConfig, VideoDetail } from '@/lib/types';

export const runtime = 'nodejs';

/** 详情结果短缓存：换源测速/多人观看同一影片时避免重复打上游 */
const DETAIL_CACHE_TTL = 60 * 1000;

/** 详情 L2（KV）TTL：默认 6 小时（docs/01 §6），环境变量可覆盖 */
const DETAIL_KV_TTL_S = (() => {
  const n = parseInt(process.env.DETAIL_CACHE_TTL_SECONDS || '21600', 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 60), 604_800) : 21_600;
})();

function parseSource(raw: string | null): SourceConfig | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as SourceConfig;
    if (!obj || !/^https?:\/\//.test(obj.url || '')) return null;
    return obj;
  } catch {
    return null;
  }
}

/**
 * 视频详情：优先走列表接口 ?ac=videolist&ids=，
 * 拿不到播放地址时（部分源需要爬详情页）降级到 detail 页 HTML 提取。
 */
export async function GET(req: Request) {
  const guarded = await guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const id = (url.searchParams.get('id') || '').trim();
  const source = parseSource(url.searchParams.get('source'));
  const baseUrl = (url.searchParams.get('baseUrl') || '').trim(); // 可选：详情页根地址

  if (!id || !/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID' }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ error: '无效的点播源配置' }, { status: 400 });
  }

  const start = Date.now();
  try {
    // 命中缓存直接返回（仅缓存成功拿到剧集的结果）
    const detailRootForCache = (source.detail || baseUrl || '').replace(/\/+$/, '');
    const cacheKey = `detail:${source.url}|${detailRootForCache}|${id}`;
    const cached = getCache<VideoDetail>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { 'X-Cache': 'memory' } });
    }
    const kv = await getKvCache();
    if (kv) {
      const kvCached = await kv.get<VideoDetail>(cacheKey);
      if (kvCached) {
        setCache(cacheKey, kvCached, DETAIL_CACHE_TTL); // 回填 L1
        return NextResponse.json(kvCached, { headers: { 'X-Cache': 'kv' } });
      }
    }

    // 熔断中的源直接短路，不再等它超时
    const breaker = checkBreaker(source.url);
    if (breaker.open) {
      return NextResponse.json(
        { error: `源近期连续失败已熔断，${Math.ceil(breaker.retryInMs / 1000)}s 后自动重试` },
        { status: 503 }
      );
    }

    // 用户可控地址发起服务端请求，先过 SSRF 校验（协议白名单 + 内网/保留地址）
    const listVerdict = await checkUpstreamAllowed(source.url);
    if (!listVerdict.ok) {
      return NextResponse.json({ error: listVerdict.reason }, { status: 400 });
    }

    let resolved: VideoDetail | null = null;

    // 1) 标准列表接口（源地址自带 query/ac 参数由 buildCmsApi 归一）
    const api = buildCmsApi(source.url, `ac=videolist&ids=${encodeURIComponent(id)}`);
    const res = await fetchUpstream(api, { timeoutMs: 10000, headers: cmsRequestHeaders() });
    if (res.ok) {
      let data: unknown;
      try {
        // 同一 URL 形态下 JSON 站与 XML 站（海洋CMS 等）按响应体分派解析
        data = parseCmsPagePayload(await res.text());
      } catch {
        data = undefined; // 响应体既非 JSON 也非可解析 XML → 继续尝试详情页
      }
      if (data !== undefined) {
        try {
          const detail = parseDetail(data, source);
          if (detail.episodes.length > 0) {
            resolved = detail;
          }
          // 有详情但无播放地址 → 继续尝试详情页
        } catch {
          // 列表接口无内容 → 继续尝试详情页
        }
      }
    }

    // 2) 详情页 HTML 提取（detail 地址优先，否则用 baseUrl 推导）
    const detailRoot = (source.detail || baseUrl || '').replace(/\/+$/, '');
    if (!resolved && detailRoot && /^https?:\/\//.test(detailRoot)) {
      const detailVerdict = await checkUpstreamAllowed(detailRoot);
      if (!detailVerdict.ok) {
        return NextResponse.json({ error: detailVerdict.reason }, { status: 400 });
      }
      const detailUrl = `${detailRoot}/index.php/vod/detail/id/${id}.html`;
      const detailRes = await fetchUpstream(detailUrl, {
        timeoutMs: 10000,
        headers: { 'User-Agent': cmsRequestHeaders()['User-Agent'] },
      });
      if (detailRes.ok) {
        const html = await detailRes.text();
        resolved = parseDetailPageHtml(html, source);
      }
    }

    if (!resolved || resolved.episodes.length === 0) {
      await reportSourceOutcome(source.url, false, Date.now() - start);
      return NextResponse.json({ error: '未找到播放资源' }, { status: 404 });
    }
    await reportSourceOutcome(source.url, true, Date.now() - start);
    setCache(cacheKey, resolved, DETAIL_CACHE_TTL);
    if (kv) await kv.put(cacheKey, resolved, DETAIL_KV_TTL_S);
    return NextResponse.json(resolved);
  } catch (err) {
    await reportSourceOutcome(source.url, false, Date.now() - start);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '获取详情失败' },
      { status: 502 }
    );
  }
}
