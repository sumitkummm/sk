import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, AlertCircle, Loader2, RotateCcw, ExternalLink } from 'lucide-react';
import { getLocalVideoProxyUrl, constructPwUrl, fetchPlaybackUrl } from '../lib/pwUtils';
import { ShakaPlayer } from './ShakaPlayer';

interface PremiumPlayerProps {
  lectureId: string;
  token: string;
  parentId?: string;
  subjectId?: string;
  vType?: string;
  fallbackUrl?: string;
  title?: string;
}

export const PremiumPlayer: React.FC<PremiumPlayerProps> = ({ 
  lectureId, 
  token,
  parentId,
  subjectId,
  vType,
  fallbackUrl,
  title
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [playbackInfo, setPlaybackInfo] = useState<{ videoUrl: string, licenseUrl: string, type: string } | null>(null);
  
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 10000;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
    }
  }, []);

  const handleFallback = useCallback(() => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setError('Playback failed after multiple attempts. Redirecting...');
    
    setTimeout(() => {
      window.open(fallbackUrl || `https://www.pw.live/study/batches/lecture/${lectureId}`, '_blank');
      setIsRedirecting(false);
    }, 2000);
  }, [lectureId, fallbackUrl, isRedirecting]);

  const initPlayer = useCallback(async () => {
    if (!lectureId) return;

    setIsLoading(true);
    setError(null);
    setIsReady(false);
    cleanup();

    try {
      console.log(`PremiumPlayer: Fetching fresh signed URL for ${lectureId} (Attempt ${retryCount + 1})`);
      const playbackData = await fetchPlaybackUrl(lectureId, token, parentId, vType);
      const { videoUrl, licenseUrl, type } = playbackData;

      if (!videoUrl) throw new Error("No playback URL received from server");
      
      setPlaybackInfo({ videoUrl, licenseUrl, type });

      const isDash = type === 'mpd' || videoUrl.toLowerCase().includes('.mpd');
      const isHls = type === 'm3u8' || videoUrl.toLowerCase().includes('.m3u8');
      const isMp4 = type === 'mp4' || videoUrl.toLowerCase().includes('.mp4');

      if (isDash) {
        // ShakaPlayer handles its own initialization
        setIsLoading(false);
        setIsReady(true);
        return;
      }

      // Set timeout watchdog for non-DASH
      timeoutRef.current = setTimeout(() => {
        if (!isReady) {
          console.warn('PremiumPlayer: Playback start timed out');
          if (retryCount < MAX_RETRIES) {
            setRetryCount(prev => prev + 1);
          } else {
            handleFallback();
          }
        }
      }, TIMEOUT_MS);

      if (isHls) {
        if (!videoRef.current) return;
        console.log('PremiumPlayer: Initializing HLS playback');
        if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = getLocalVideoProxyUrl(videoUrl, token);
          videoRef.current.addEventListener('loadedmetadata', () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setIsReady(true);
            setIsLoading(false);
            videoRef.current?.play().catch(e => console.warn('Auto-play blocked:', e));
          });
        } else if (Hls.isSupported()) {
          const hls = new Hls({
            loader: class ProxiedLoader extends (Hls.DefaultConfig.loader as any) {
              load(context: any, config: any, callbacks: any) {
                if (!context.url.includes('/api/video-proxy')) {
                  context.url = getLocalVideoProxyUrl(context.url, token);
                }
                return super.load(context, config, callbacks);
              }
            } as any,
            xhrSetup: (xhr) => {
              xhr.setRequestHeader('X-Telegram-Bot-Api-Secret-Token', "8659330967:AAE_QnPFo_pQDbXZrrE5BaQK8aj6hDTgw-s");
            }
          });

          hls.loadSource(getLocalVideoProxyUrl(videoUrl, token));
          hls.attachMedia(videoRef.current);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setIsReady(true);
            setIsLoading(false);
            videoRef.current?.play().catch(e => console.warn('Auto-play blocked:', e));
          });

          hls.on(Hls.Events.ERROR, (_, data) => {
            if (data.fatal) {
              console.error('PremiumPlayer: HLS Fatal Error', data);
              if (retryCount < MAX_RETRIES) {
                setRetryCount(prev => prev + 1);
              } else {
                handleFallback();
              }
            }
          });

          hlsRef.current = hls;
        }
      } 
      else if (isMp4) {
        if (!videoRef.current) return;
        console.log('PremiumPlayer: Initializing MP4 playback');
        videoRef.current.src = getLocalVideoProxyUrl(videoUrl, token);
        videoRef.current.addEventListener('canplay', () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setIsReady(true);
          setIsLoading(false);
          videoRef.current?.play().catch(e => console.warn('Auto-play blocked:', e));
        });
        videoRef.current.addEventListener('error', (e) => {
          console.error('PremiumPlayer: MP4 Error', e);
          if (retryCount < MAX_RETRIES) {
            setRetryCount(prev => prev + 1);
          } else {
            handleFallback();
          }
        });
      }
      else {
        throw new Error("Unsupported video format");
      }

    } catch (err: any) {
      console.error('PremiumPlayer: Init failed', err);
      if (retryCount < MAX_RETRIES) {
        setRetryCount(prev => prev + 1);
      } else {
        setError(err.message || 'Failed to initialize player');
        handleFallback();
      }
    }
  }, [lectureId, token, retryCount, handleFallback, cleanup]);

  useEffect(() => {
    initPlayer();
    
    // Register session for analytics and session tracking
    if (lectureId && token) {
      fetch('/api/register-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lectureId,
          batchId: parentId,
          subjectId
        })
      }).catch(err => console.warn('PremiumPlayer: Session registration failed', err));
    }

    return cleanup;
  }, [retryCount]); // Re-run on retry

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('PremiumPlayer: Play failed', err));
    }
  };

  const isDash = playbackInfo?.type === 'mpd' || playbackInfo?.videoUrl.toLowerCase().includes('.mpd');

  if (isDash && playbackInfo) {
    return (
      <div className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5">
        <ShakaPlayer 
          mpdUrl={playbackInfo.videoUrl}
          licenseUrl={playbackInfo.licenseUrl || "https://api.penpencil.co/v1/videos/drm-license-manager"}
          token={token}
          title={title}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        referrerPolicy="no-referrer"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Loading State */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0A] z-20">
          <Loader2 className="w-12 h-12 text-[#5A4BDA] animate-spin mb-4" />
          <p className="text-white/40 text-[10px] font-black uppercase tracking-widest animate-pulse">
            {retryCount > 0 ? `Self-Healing Active (Attempt ${retryCount + 1})...` : 'Securing Stream...'}
          </p>
        </div>
      )}

      {/* Play Overlay */}
      {isReady && !isPlaying && !isLoading && !error && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer z-10 transition-all duration-500 hover:bg-black/20"
          onClick={handlePlay}
        >
          <div className="w-24 h-24 bg-[#5A4BDA] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(90,75,218,0.5)] transform transition-transform duration-300 hover:scale-110 group-hover:scale-105">
            <Play className="w-10 h-10 text-white fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Error / Redirect State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0A]/95 z-30 p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">
            {isRedirecting ? 'Switching Player' : 'Playback Error'}
          </h3>
          <p className="text-white/40 text-xs max-w-xs mb-8 leading-relaxed">
            {error}
          </p>
          {isRedirecting && (
            <div className="flex items-center gap-3 text-[#5A4BDA] animate-pulse">
              <ExternalLink className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Opening External Link...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
