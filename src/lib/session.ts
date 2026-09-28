// 会话令牌 v2（M1）：M0 的 `<exp>.<hmac>` 升级为 `<exp>.<name>.<role>.<hmac>`，携带用户身份。
// 基于修改自 LibreSpark/LibreTV v2.15.0（AGPL-3.0）的会话机制，见 README 开源义务说明。
//
// 单一实现基于 WebCrypto：Node 路由（nodejs 运行时）与 middleware（Worker 运行时）共用，
// 消除 M0 时代 lib/auth.ts（node:crypto）与 middleware（WebCrypto 复刻）双实现漂移的风险。
// 旧格式（无身份段）令牌一律判定无效——升级部署后既有会话需重新登录。

export const SESSION_COOKIE = 'mytv_session';
const SESSION_SALT = ':mytv::session-salt';
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 天

export type SessionRole = 'admin' | 'user';

export interface SessionUser {
  name: string;
  role: SessionRole;
}

export interface VerifiedSession extends SessionUser {
  expiresAt: number;
}

/** 两种运行环境的密钥来源：Node 路由传 process.env 的字段子集，middleware 传 Worker env */
export type SessionEnv = { PASSWORD?: string; PROXY_SECRET?: string };

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(input)));
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

/** 固定长度 hex 的常量时间比较（WebCrypto 无 timingSafeEqual） */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function getSessionSecret(env: SessionEnv): Promise<string> {
  if (env.PROXY_SECRET) return env.PROXY_SECRET;
  return sha256Hex((env.PASSWORD || '') + SESSION_SALT);
}

/** 生成签名会话 token：`<expiresAtMs>.<name>.<role>.<hmac>` */
export async function signSessionToken(
  user: SessionUser,
  env: SessionEnv,
  ttlMs: number = SESSION_TTL_MS
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${expiresAt}.${user.name}.${user.role}`;
  const sig = await hmacHex(await getSessionSecret(env), payload);
  return { token: `${payload}.${sig}`, expiresAt };
}

/**
 * 校验 token 的签名、有效期与格式，返回会话身份。
 * name 段允许包含 '.'（按首尾段截取，中间全部归用户名），角色段只接受 admin/user。
 */
export async function verifySessionToken(
  token: string | null | undefined,
  env: SessionEnv
): Promise<VerifiedSession | null> {
  if (!token) return null;
  // 未配置任何密钥来源时一律拒绝（与 M0 行为一致，避免空密码派生弱密钥）
  if (!env.PASSWORD && !env.PROXY_SECRET) return null;

  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^[0-9a-f]+$/.test(sig)) return null;

  const expected = await hmacHex(await getSessionSecret(env), payload);
  if (!timingSafeEqualHex(sig, expected)) return null;

  const parts = payload.split('.');
  if (parts.length < 3) return null;
  const expiresAt = parseInt(parts[0], 10);
  const role = parts[parts.length - 1];
  const name = parts.slice(1, -1).join('.');
  if (!Number.isFinite(expiresAt) || !name) return null;
  if (role !== 'admin' && role !== 'user') return null;
  if (Date.now() >= expiresAt) return null;
  return { name, role, expiresAt };
}

export function sessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const c of cookieHeader.split(';')) {
    const eq = c.indexOf('=');
    if (eq === -1) continue;
    if (c.slice(0, eq).trim() === SESSION_COOKIE) {
      try {
        return decodeURIComponent(c.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function sessionFromCookieHeader(
  cookieHeader: string | null,
  env: SessionEnv
): Promise<VerifiedSession | null> {
  return verifySessionToken(sessionTokenFromCookieHeader(cookieHeader), env);
}
