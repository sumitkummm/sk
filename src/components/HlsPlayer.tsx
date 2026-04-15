import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls, { ErrorData } from 'hls.js';
import { Play, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { getLocalVideoProxyUrl, constructPwUrl } from '../lib/pwUtils';

interface HlsPlayerProps {
  videoUrl: string;
  token: string;
}

export const HlsPlayer: React.FC<HlsPlayerProps> = ({ videoUrl, token }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const TIMEOUT_MS = 15000; // 15 seconds timeout for full-stack proxy

  const handleFallbackRedirect = useCallback(() => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setError('Redirecting to external player...');
    
    const finalUrl = constructPwUrl(videoUrl, token);
    
    // Open the original URL in a new tab as a last resort
    setTimeout(() => {
      window.open(finalUrl, '_blank');
      setIsRedirecting(false);
    }, 2000);
  }, [videoUrl, token, isRedirecting]);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !videoUrl) return;

    // Use the local backend proxy for the initial manifest
    const initialSignedUrl = constructPwUrl(videoUrl, token);
    const currentStreamUrl = getLocalVideoProxyUrl(initialSignedUrl, token);
    
    console.log(`HlsPlayer: Initializing with Local Proxy -> ${currentStreamUrl}`);

    setIsLoading(true);
    setError(null);

    // Clear any existing timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    // Set a timeout for initialization
    timeoutRef.current = setTimeout(() => {
      if (!isReady) {
        console.warn('HlsPlayer: Initialization timed out');
        setError('Initialization timed out. The proxy might be slow or the token expired.');
        handleFallbackRedirect();
      }
    }, TIMEOUT_MS);

    // Cleanup existing instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Check for native HLS support (Safari)
    if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('HlsPlayer: Using native HLS support');
      videoRef.current.src = currentStreamUrl;
      
      const onLoadedMetadata = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsReady(true);
        setIsLoading(false);
      };

      const onNativeError = () => {
        console.error('HlsPlayer: Native playback error');
        setError('Native playback failed. Trying fallback...');
        handleFallbackRedirect();
      };

      videoRef.current.addEventListener('loadedmetadata', onLoadedMetadata);
      videoRef.current.addEventListener('error', onNativeError);
    } 
    // Use hls.js
    else if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr, url) => {
          // Add standard headers
          xhr.setRequestHeader('client-id', '5eb3cfee95f3240011b3e5c1');
          xhr.setRequestHeader('client-type', 'web');
          xhr.setRequestHeader('X-Telegram-Bot-Api-Secret-Token', '8659330967:AAE_QnPFo_pQDbXZrrE5BaQK8aj6hDTgw-s');
          
          // Note: We can't easily change the URL here in hls.js xhrSetup
          // So we rely on the loader override if we need to proxy segments
        },
        // Custom loader to ensure EVERY request (segments, keys) is proxied
        loader: class ProxiedLoader extends (Hls.DefaultConfig.loader as any) {
          constructor(config: any) {
            super(config);
          }
          load(context: any, config: any, callbacks: any) {
            const originalUrl = context.url;
            if (!originalUrl.includes('/api/video-proxy')) {
              const signedUrl = constructPwUrl(originalUrl, token);
              context.url = getLocalVideoProxyUrl(signedUrl, token);
            }
            return super.load(context, config, callbacks);
          }
        } as any,
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
      });

      hls.loadSource(currentStreamUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsReady(true);
        setIsLoading(false);
      });

      hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
        if (data.fatal) {
          console.error(`HlsPlayer: Fatal error`, data);
          setError(`Stream error: ${data.details}`);
          handleFallbackRedirect();
        }
      });

      hlsRef.current = hls;
    } else {
      setError('HLS is not supported in this browser');
      setIsLoading(false);
      handleFallbackRedirect();
    }
  }, [videoUrl, token, isReady, handleFallbackRedirect]);

  useEffect(() => {
    initPlayer();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [initPlayer]);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('HlsPlayer: Play failed', err));
    }
  };

  return (
    <div className="relative w-full aspect-video bg-[#0A0A0A] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        referrerPolicy="no-referrer"
        playsInline
        controls={isPlaying}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
      />

      {/* Loading State */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0A] z-20">
          <Loader2 className="w-12 h-12 text-[#5A4BDA] animate-spin mb-4" />
          <p className="text-white/40 text-[10px] font-black uppercase tracking-widest animate-pulse">
            Initializing Stream...
          </p>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-black/40 backdrop-blur-md p-4 rounded-full">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
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

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0A]/95 z-30 p-8 text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">Playback Error</h3>
          <p className="text-white/40 text-xs max-w-xs mb-8 leading-relaxed">
            {error}. This might be due to CORS restrictions or an expired session.
          </p>
          <button
            onClick={() => {
              initPlayer();
            }}
            className="flex items-center gap-2 px-6 py-3 bg-[#5A4BDA] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#4A3BCA] transition-all active:scale-95 shadow-lg shadow-[#5A4BDA]/20"
          >
            <RotateCcw className="w-3 h-3" />
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
