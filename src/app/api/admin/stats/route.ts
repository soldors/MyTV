// 后台仪表盘统计（M6）：设计图上四个统计卡 + 近 N 日趋势 + 最新注册用户的数据出口。
// 口径全部来自 D1 真实行，没有任何估算值；缺数据的项返回 null / 计数，由界面显示「—」或「未采集」。
//
// 播放量口径说明（docs/09 §1.2）：play_records 是 (user, source, vod) 唯一行、
// 播放进度每 10s 覆盖写 save_time，所以「今日播放」= 今日有播放动作的条目数，不是播放人次。

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-guard';
import { getStorage } from '@/lib/d1-storage';
import { listVodSources } from '@/lib/source-registry';

export const runtime = 'nodejs';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 健康采样保留窗口：趋势/可用率最长可选 30 日，超出部分在读取时顺手清理 */
const RETENTION_DAYS = 30;
const LATEST_USERS_LIMIT = 10;

function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Math.trunc(Number(raw));
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** 「日」的边界按站长浏览器时区算（后台是给站长看的，不是 UTC 值班表） */
function dayNumber(tsMs: number, tzOffsetMs: number): number {
  return Math.floor((tsMs + tzOffsetMs) / DAY_MS);
}

function dayLabel(dayNum: number): string {
  // dayNum 已是「本地日」序号，直接按 UTC 展开即得该日本地日期字符串
  return new Date(dayNum * DAY_MS).toISOString().slice(5, 10);
}

export async function GET(req: Request) {
  const guard = await requireAdmin(req);
  if ('error' in guard) return guard.error;

  const params = new URL(req.url).searchParams;
  const days = intParam(params.get('days'), 7, 7, RETENTION_DAYS);
  // tz = 东偏移分钟数（客户端传 -new Date().getTimezoneOffset()；默认 UTC+8）
  const tzOffsetMs = intParam(params.get('tz'), 480, -840, 840) * 60_000;

  const now = Date.now();
  const today = dayNumber(now, tzOffsetMs);
  const storage = await getStorage();

  const sinceDay = today - (days - 1);
  const sinceTs = sinceDay * DAY_MS - tzOffsetMs;
  /** 本日与昨日的半开区间 [fromTs, toTs) */
  const todayRange = [today * DAY_MS - tzOffsetMs, (today + 1) * DAY_MS - tzOffsetMs] as const;
  const yesterdayRange = [(today - 1) * DAY_MS - tzOffsetMs, today * DAY_MS - tzOffsetMs] as const;

  const [userCounts, usersToday, usersYesterday, playsToday, playsYesterday, playTrend, signupTrend, health, catalog, sources, latestUsers] =
    await Promise.all([
      storage.countUsersByStatus(),
      storage.countUsersCreatedBetween(todayRange[0], todayRange[1]),
      storage.countUsersCreatedBetween(yesterdayRange[0], yesterdayRange[1]),
      storage.countPlaysBetween(todayRange[0], todayRange[1]),
      storage.countPlaysBetween(yesterdayRange[0], yesterdayRange[1]),
      storage.getDailyPlayCounts(sinceTs, tzOffsetMs),
      storage.getDailySignupCounts(sinceTs, tzOffsetMs),
      storage.getSourceHealthSince(now - days * DAY_MS),
      storage.listSourceCatalog(),
      listVodSources(),
      storage.listLatestUsers(LATEST_USERS_LIMIT),
    ]);

  // 采样窗口外的行顺手清掉：一次 DELETE 换有界的表大小（源数 × 24 × 30 量级）
  await storage.pruneSourceHealth(now - RETENTION_DAYS * DAY_MS).catch(() => 0);

  const playByDay = new Map(playTrend.map((d) => [d.day, d.count]));
  const signupByDay = new Map(signupTrend.map((d) => [d.day, d.count]));
  const dayNumbers = Array.from({ length: days }, (_, i) => sinceDay + i);

  // 收录合计只累加「已知总量」的源；未探活/不返回 total 的源计入 missingSources 由界面标注
  const knownTotals = new Map(catalog.filter((c) => typeof c.total === 'number').map((c) => [c.url, c.total as number]));
  const catalogTotal = [...knownTotals.values()].reduce((sum, n) => sum + n, 0);
  const activeSourceUrls = new Set(sources.map((s) => s.url));
  const missingSources = [...activeSourceUrls].filter((url) => !knownTotals.has(url)).length;

  const samples = health.reduce((n, h) => n + h.samples, 0);
  const okSamples = health.reduce((n, h) => n + h.okCount, 0);

  return NextResponse.json({
    users: {
      total: userCounts.total,
      pending: userCounts.pending,
      active: userCounts.active,
      disabled: userCounts.disabled,
      todayNew: usersToday,
      yesterdayNew: usersYesterday,
    },
    plays: { today: playsToday, yesterday: playsYesterday },
    catalog: {
      total: catalogTotal,
      probedSources: knownTotals.size,
      sources: activeSourceUrls.size,
      missingSources,
    },
    availability: {
      pct: samples > 0 ? Math.round((okSamples / samples) * 1000) / 10 : null,
      samples,
      sources: health.length,
      windowDays: days,
    },
    trend: {
      days: dayNumbers.map(dayLabel),
      plays: dayNumbers.map((d) => playByDay.get(d) ?? 0),
      signups: dayNumbers.map((d) => signupByDay.get(d) ?? 0),
    },
    latestUsers,
  });
}
