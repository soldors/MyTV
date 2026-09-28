// 用户侧数据（播放记录/收藏/搜索历史）的入参校验。
// 采集站字段宽松（标题含任意字符、图片地址超长），这里只做长度与形态约束，
// 真正的出网请求另有 SSRF 层把关（lib/ssrf.ts）。

export interface VodItemInput {
  source: string;
  vodId: string;
  title: string;
  pic?: string;
}

export type VodItemCheck = { ok: true; value: VodItemInput } | { ok: false; error: string };

const VOD_ID_RE = /^[\w-]{1,64}$/;

export function checkVodItem(raw: {
  source?: unknown;
  vodId?: unknown;
  title?: unknown;
  pic?: unknown;
}): VodItemCheck {
  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  const vodId = typeof raw.vodId === 'string' ? raw.vodId.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const pic = typeof raw.pic === 'string' ? raw.pic.trim() : '';

  if (!source || source.length > 256) return { ok: false, error: '无效的源标识' };
  if (!VOD_ID_RE.test(vodId)) return { ok: false, error: '无效的影片ID' };
  if (!title || title.length > 256) return { ok: false, error: '无效的标题' };
  if (pic && (!/^https?:\/\//i.test(pic) || pic.length > 2048)) return { ok: false, error: '无效的图片地址' };

  return { ok: true, value: { source, vodId, title, pic: pic || undefined } };
}

export function checkNonNegativeNumber(raw: unknown, fallback = 0): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
