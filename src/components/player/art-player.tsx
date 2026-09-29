'use client';

// ArtPlayer + hls.js 播放器封装（M2，M2.x 增强）：
// - m3u8 经 /api/proxy 同源代理（规避上游 CORS/防盗链，分片自动带会话 cookie）
// - 进度回调节流 10s（云端续看），暂停兜底上报
// - 跳过片头片尾（L7）：introEnd 前自动跳一次 + 悬浮按钮；outroStart 后显示跳过片尾
// - onReady 暴露时间句柄（播放页「标记片头/片尾」取当前进度用）

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { proxied } from '@/lib/client-api';

interface ArtPlayerProps {
  /** m3u8 原始地址（组件内部走代理） */
  url: string;
  title?: string;
  poster?: string;
  /** 续看起点（秒）；切集后由父组件以 key 重挂载 */
  initialTime?: number;
  /** 跳过窗口（秒）：introEnd=片头结束点，outroStart=片尾开始点，0 为未设置 */
  skip?: { introEnd: number; outroStart: number };
  /** 就绪后回调时间句柄（标记片头/片尾用） */
  onReady?: (api: PlayerApi) => void;
  onProgress?: (time: number, duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

export interface PlayerApi {
  getTime(): number;
  seek(t: number): void;
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
  skip,
  onReady,
  onProgress,
  onEnded,
  className,
}: ArtPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 回调存 ref：Artplayer 实例生命周期与渲染周期解耦，避免重建播放器
  const progressRef = useRef(onProgress);
  const endedRef = useRef(onEnded);
  const readyRef = useRef(onReady);
  const skipRef = useRef(skip);
  progressRef.current = onProgress;
  endedRef.current = onEnded;
  readyRef.current = onReady;
  skipRef.current = skip;

  const [skipTarget, setSkipTarget] = useState<'intro' | 'outro' | null>(null);
  const apiRef = useRef<PlayerApi | null>(null);

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

    const api: PlayerApi = {
      getTime: () => art.currentTime,
      seek: (t: number) => {
        art.currentTime = t;
      },
    };
    apiRef.current = api;
    readyRef.current?.(api);

    let lastSave = 0;
    let introSkipped = false;
    // ArtPlayer 的媒体元素事件带 video: 前缀（art.on('timeupdate') 不存在）
    art.on('video:timeupdate', () => {
      const now = Date.now();
      if (now - lastSave >= 10_000) {
        lastSave = now;
        progressRef.current?.(art.currentTime, art.duration || 0);
      }

      const s = skipRef.current;
      const t = art.currentTime;
      // 片头：进入片头窗口即自动跳一次（续看落在片头内同样生效）；之后仅显示按钮
      if (s?.introEnd && s.introEnd > 0 && t < s.introEnd) {
        if (!introSkipped && t > 0.2) {
          introSkipped = true;
          art.currentTime = s.introEnd;
        }
        setSkipTarget((prev) => (prev === 'intro' ? prev : 'intro'));
        return;
      }
      // 片尾：从片尾起点到结束显示跳过片尾（点击跳到末尾触发 ended → 自动切下一集）
      const inOutro = s?.outroStart && s.outroStart > 0 && t >= s.outroStart;
      setSkipTarget((prev) => {
        const next = inOutro ? 'outro' : null;
        return prev === next ? prev : next;
      });
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

  function handleSkipClick() {
    const s = skipRef.current;
    if (!apiRef.current || !s) return;
    if (skipTarget === 'intro' && s.introEnd > 0) {
      apiRef.current.seek(s.introEnd);
    } else if (skipTarget === 'outro') {
      // 跳到末尾触发 ended（播放页据此自动切下一集）
      apiRef.current.seek(Math.max(0, apiRef.current.getTime() + 10_000));
    }
  }

  return (
    <div className={className ? `relative ${className}` : 'relative'}>
      <div ref={containerRef} className="h-full w-full" />
      {skipTarget !== null && (
        <button
          onClick={handleSkipClick}
          className="absolute bottom-14 right-3 z-10 rounded bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur transition hover:bg-black/85"
        >
          {skipTarget === 'intro' ? '跳过片头 »' : '跳过片尾 »'}
        </button>
      )}
    </div>
  );
}
