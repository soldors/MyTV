'use client';

// ArtPlayer + hls.js 播放器封装（M2）：
// - m3u8 经 /api/proxy 同源代理（规避上游 CORS/防盗链，分片自动带会话 cookie）
// - 进度回调节流 10s（云端续看），暂停/销毁时兜底上报
// - 控制条无操作自动隐藏、移动端锁屏键、全屏（ArtPlayer 内建）

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { useEffect, useRef } from 'react';
import { proxied } from '@/lib/client-api';

interface ArtPlayerProps {
  /** m3u8 原始地址（组件内部走代理） */
  url: string;
  title?: string;
  poster?: string;
  /** 续看起点（秒）；切集后由父组件以 key 重挂载 */
  initialTime?: number;
  onProgress?: (time: number, duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

/** Artplayer 实例上挂载 hls 的扩展形态（customType 内使用） */
interface ArtplayerWithHls extends Artplayer {
  hls?: Hls | null;
}

export default function ArtPlayer({
  url,
  title,
  poster,
  initialTime,
  onProgress,
  onEnded,
  className,
}: ArtPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 回调存 ref：Artplayer 实例生命周期与渲染周期解耦，避免重建播放器
  const progressRef = useRef(onProgress);
  const endedRef = useRef(onEnded);
  progressRef.current = onProgress;
  endedRef.current = onEnded;

  useEffect(() => {
    if (!containerRef.current) return;
    const playUrl = proxied(url);

    const art = new Artplayer({
      container: containerRef.current,
      url: playUrl,
      type: 'm3u8',
      poster,
      volume: 0.7,
      autoplay: false,
      setting: true,
      playbackRate: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: true,
      playsInline: true,
      lock: true,
      theme: '#E8112D',
      lang: 'zh-cn',
      customType: {
        m3u8(video: HTMLVideoElement, src: string, player: Artplayer) {
          const withHls = player as ArtplayerWithHls;
          if (Hls.isSupported()) {
            if (withHls.hls) withHls.hls.destroy();
            const hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(video);
            withHls.hls = hls;
            player.on('destroy', () => {
              hls.destroy();
              withHls.hls = null;
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
          } else {
            player.notice.show = '当前浏览器不支持 m3u8 播放';
          }
        },
      },
    });

    if (initialTime && initialTime > 5) {
      art.on('ready', () => {
        art.currentTime = initialTime;
      });
    }

    let lastSave = 0;
    // ArtPlayer 的媒体元素事件带 video: 前缀（art.on('timeupdate') 不存在）
    art.on('video:timeupdate', () => {
      const now = Date.now();
      if (now - lastSave >= 10_000) {
        lastSave = now;
        progressRef.current?.(art.currentTime, art.duration || 0);
      }
    });
    // 注意：不在 destroy 时保存进度——切集重挂载会触发旧实例 destroy，
    // 其闭包持有旧集号且 currentTime 已被重置，会覆盖新集的记录；
    // 切集由播放页显式保存，页面离开最多丢失最后一个 10s 窗口的进度。
    art.on('pause', () => progressRef.current?.(art.currentTime, art.duration || 0));
    art.on('ended', () => endedRef.current?.());

    return () => {
      art.destroy(false);
    };
    // initialTime 变化不应重建播放器（切集由父组件 key 控制）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, poster, title]);

  return <div ref={containerRef} className={className} />;
}
