// 点播源清单：env 预置（DEFAULT_SOURCES）+ D1 启用源合并，同 URL 时 env 优先。
// 这段口径原本只在 /api/sources 里，M6 起后台仪表盘/健康接口要用同一份「有哪些源」，
// 故提到 lib 单点维护（前台出口与后台统计不会各算一套）。

import { getEnvSources } from './env-sources';
import { getStorage } from './d1-storage';
import type { SourceConfig } from './types';

export async function listVodSources(): Promise<SourceConfig[]> {
  const envSources = getEnvSources();
  let dbSources: SourceConfig[] = [];
  let hiddenUrls = new Set<string>();
  try {
    const storage = await getStorage();
    const records = await storage.listApiSources();
    dbSources = records
      .filter((r) => r.enabled)
      .map((r) => ({
        key: r.key,
        name: r.name,
        url: r.apiUrl,
        detail: r.detailUrl,
        isAdult: r.isAdult,
      }));
    // env 源被站长删除后以覆盖层屏蔽（前台搜索/源列表一并生效）
    hiddenUrls = new Set((await storage.getSiteConfig()).hiddenEnvSources ?? []);
  } catch {
    // DB 不可用时仍返回 env 源，与 /api/sources 的降级行为一致
  }
  const seenUrls = new Set(envSources.map((s) => s.url));
  return [...envSources.filter((s) => !hiddenUrls.has(s.url)), ...dbSources.filter((s) => !seenUrls.has(s.url))];
}
