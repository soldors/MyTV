// 移植自 LibreSpark/LibreTV v2.15.0（AGPL-3.0），见 README 开源义务说明
// 改动（M1）：会话签名/校验移至 lib/session.ts（WebCrypto 单实现，与 middleware 互通）；
//             本文件保留站长密码校验、登录速率限制与 cookie 下发策略。

import crypto from 'node:crypto';
import type { NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  type SessionUser,
  type VerifiedSession,
  sessionFromCookieHeader as verifySessionCookie,
  signSessionToken,
} from './session';

export { SESSION_COOKIE };
export type { SessionUser, VerifiedSession };

/**
 * 会话鉴权：httpOnly cookie + HMAC 签名（见 lib/session.ts）。
 *
 * - 页面源码不下发任何可重放的凭证；
 * - 登录接口只接受 POST body，明文密码不进 query。
 */

/** 站长（环境变量 PASSWORD 派生）在会话中的固定身份 */
export const ADMIN_SESSION_USER: SessionUser = { name: 'admin', role: 'admin' };

function sessionEnv(): { PASSWORD?: string; PROXY_SECRET?: string } {
  return { PASSWORD: process.env.PASSWORD, PROXY_SECRET: process.env.PROXY_SECRET };
}

export function getPassword(): string {
  return process.env.PASSWORD || '';
}

export function isPasswordConfigured(): boolean {
  return getPassword().length > 0;
}

export async function signSession(
  user: SessionUser = ADMIN_SESSION_USER
): Promise<{ token: string; expiresAt: number }> {
  return signSessionToken(user, sessionEnv());
}

export async function sessionFromCookieHeader(
  cookieHeader: string | null
): Promise<VerifiedSession | null> {
  return verifySessionCookie(cookieHeader, sessionEnv());
}

/** 恒定时间比较密码（比较 sha256 摘要避免长度泄漏） */
export function checkPassword(input: string): boolean {
  const password = getPassword();
  if (!password) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * 统一的会话 cookie 下发（/api/auth 与 /api/user/login 共用）。
 * Secure 策略：COOKIE_SECURE 环境变量显式覆盖；否则按 x-forwarded-proto 推导。
 * 不能依赖 req.url——Next.js Route Handler 中它是内部转发地址，并非用户侧的原始协议。
 */
export function applySessionCookie(
  res: NextResponse,
  req: Request,
  token: string,
  expiresAt: number
): void {
  const secure =
    process.env.COOKIE_SECURE === 'true'
      ? true
      : process.env.COOKIE_SECURE === 'false'
        ? false
        : (req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http') === 'https';
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
    path: '/',
  });
}

// —— 登录速率限制（isolate 内存实现；惰性清理，无 setInterval） ——

const attemptMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;

function sweep(now: number): void {
  if (attemptMap.size < MAX_ENTRIES) return;
  for (const [ip, entry] of attemptMap) {
    if (now > entry.resetAt) attemptMap.delete(ip);
  }
  if (attemptMap.size >= MAX_ENTRIES) attemptMap.clear();
}

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  sweep(now);
  const entry = attemptMap.get(ip);
  if (!entry || now > entry.resetAt) {
    attemptMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}

export function clearRateLimit(ip: string): void {
  attemptMap.delete(ip);
}

/** 从请求头取客户端 IP（Workers/代理链路下的尽力而为值） */
export function clientIpOf(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
