'use client';

// 站点公告条（L15）：内容来自后台「站点设置」→ admin_configs；可关闭，
// 以内容哈希记忆关闭状态——公告更新后会重新出现。

import { useEffect, useState } from 'react';
import { useSession } from '@/hooks/use-session';

function hashOf(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export default function AnnouncementBar() {
  const { site } = useSession();
  const text = site.announcement?.trim() ?? '';
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!text) return;
    try {
      setDismissed(localStorage.getItem('mytv_announcement_seen') === hashOf(text));
    } catch {
      setDismissed(false);
    }
  }, [text]);

  if (!text || dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-card border border-accent/30 bg-accent/10 px-4 py-2.5 text-xs leading-relaxed text-t1">
      <span className="mt-px shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
        公告
      </span>
      <p className="min-w-0 flex-1">{text}</p>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem('mytv_announcement_seen', hashOf(text));
          } catch {
            /* 忽略 */
          }
        }}
        aria-label="关闭公告"
        className="shrink-0 rounded px-1 text-t2 transition hover:text-t1"
      >
        ✕
      </button>
    </div>
  );
}
