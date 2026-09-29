// 直播源清单：env 预置（DEFAULT_LIVE_SOURCES）+ D1 live_sources 合并（对齐 source-registry 口径）。
// env 源被站长删除后以 SiteConfig.hiddenEnvLiveSources 覆盖层屏蔽，前台直播页同步生效。

import { getEnvLiveSources } from './env-live-sources';
import { getStorage } from './d1-storage';
import type { LiveSourceConfig } from './types';

export async function listLiveSourceConfigs(): Promise<LiveSourceConfig[]> {
  const envSources = getEnvLiveSources();
  let dbSources: LiveSourceConfig[] = [];
  let hiddenUrls = new Set<string>();
  try {
    const storage = await getStorage();
    dbSources = (await storage.listLiveSources())
      .filter((r) => r.enabled)
      .map((r) => ({ key: r.key, name: r.name, url: r.url, epg: r.epg }));
    hiddenUrls = new Set((await storage.getSiteConfig()).hiddenEnvLiveSources ?? []);
  } catch {
    // DB 不可用时仍返回 env 源，与点播侧降级行为一致
  }
  const seenUrls = new Set(envSources.map((s) => s.url));
  return [
    ...envSources.filter((s) => !hiddenUrls.has(s.url)),
    ...dbSources.filter((s) => !seenUrls.has(s.url)),
  ];
}
