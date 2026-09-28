// 普通用户密码哈希：PBKDF2-SHA256（WebCrypto，Workers/Node 双运行时原生可用）。
// 站长登录不走这里（PASSWORD 环境变量恒定时间比较，见 lib/auth.ts）。

const KEY_LEN_BYTES = 32;
const SALT_LEN_BYTES = 16;

/**
 * 迭代次数默认 10000：Workers 免费档单次调用 CPU 限时约 10ms，
 * 10k 次 PBKDF2-SHA256 的原生耗时在个位数毫秒内；注册/登录均为低频操作。
 * 如需提升强度，改此常量并重建 users 行（iterations 随行存储，旧数据按旧参数校验）。
 */
export const DEFAULT_ITERATIONS = 10_000;

const MAX_ITERATIONS = 1_000_000;

export interface PasswordHash {
  hash: string;
  salt: string;
  iterations: number;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return new Uint8Array(0);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2Hex(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_LEN_BYTES * 8
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string, iterations: number = DEFAULT_ITERATIONS): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN_BYTES));
  const hash = await pbkdf2Hex(password, salt, iterations);
  return { hash, salt: toHex(salt), iterations };
}

/** 恒定时间 hex 比较 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number }
): Promise<boolean> {
  const salt = fromHex(stored.salt);
  if (salt.length === 0) return false;
  const iterations = Math.min(Math.max(Math.trunc(stored.iterations) || DEFAULT_ITERATIONS, 1), MAX_ITERATIONS);
  const actual = await pbkdf2Hex(password, salt, iterations);
  return timingSafeEqualHex(actual, stored.hash);
}
