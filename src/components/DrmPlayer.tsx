import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as dashjs from 'dashjs';
import { Play, AlertCircle, Loader2, ExternalLink, RotateCcw } from 'lucide-react';
import { getLocalVideoProxyUrl, constructPwUrl } from '../lib/pwUtils';

interface DrmPlayerProps {
  mpdUrl: string;
  licenseUrl: string;
  token: string;
  fallbackUrl?: string;
}

export const DrmPlayer: React.FC<DrmPlayerProps> = ({ 
  mpdUrl, 
  licenseUrl, 
  token,
  fallbackUrl
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const MAX_RETRIES = 2;
  const TIMEOUT_MS = 15000;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleFallback = useCallback(() => {
    if (isRedirecting) return;
    
    setIsRedirecting(true);
    setError('DRM Playback failed. Redirecting to external player...');
    
    setTimeout(() => {
      window.open(fallbackUrl || mpdUrl, '_blank');
      setIsRedirecting(false);
    }, 2000);
  }, [mpdUrl, fallbackUrl, isRedirecting]);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !mpdUrl) return;

    // Use the local backend proxy for the initial manifest
    // Note: DRM signed URLs must be used exactly, but we proxy them to handle headers/CORS
    const proxiedUrl = getLocalVideoProxyUrl(mpdUrl, token);
    
    console.log('DrmPlayer: Initializing with Widevine DRM');
    console.log('DrmPlayer: MPD URL:', mpdUrl);
    console.log('DrmPlayer: License URL:', licenseUrl);

    setIsLoading(true);
    setError(null);
    setIsReady(false);

    // Cleanup existing player
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // Set timeout watchdog
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (!isReady && !error) {
        console.warn('DrmPlayer: Initialization timed out');
        if (retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
        } else {
          setError('Playback initialization timed out. The stream might be protected or the token expired.');
          handleFallback();
        }
      }
    }, TIMEOUT_MS);

    try {
      const player = dashjs.MediaPlayer().create();
      
      // Configure DRM Protection Data
      const protectionData = {
        "com.widevine.alpha": {
          "serverURL": licenseUrl,
          "httpRequestHeaders": {
            "Authorization": `Bearer ${token}`,
            "client-id": "5eb3cfee95f3240011b3e5c1",
            "X-Telegram-Bot-Api-Secret-Token": "8659330967:AAE_QnPFo_pQDbXZrrE5BaQK8aj6hDTgw-s"
          }
        }
      };

      player.setProtectionData(protectionData);

      // Add headers and proxy filter for ALL requests (manifest + segments)
      (player as any).addXhrFilter((request: any) => {
        const originalUrl = request.url;
        
        // If the URL is not already proxied and it's not the license request
        if (!originalUrl.includes('/api/video-proxy') && !originalUrl.includes(licenseUrl)) {
          request.url = getLocalVideoProxyUrl(originalUrl, token);
        }

        // Add standard headers to all requests
        request.headers['client-id'] = '5eb3cfee95f3240011b3e5c1';
        request.headers['client-type'] = 'web';
        request.headers['X-Telegram-Bot-Api-Secret-Token'] = '8659330967:AAE_QnPFo_pQDbXZrrE5BaQK8aj6hDTgw-s';
      });

      player.initialize(videoRef.current, proxiedUrl, true);

      player.on(dashjs.MediaPlayer.events.CAN_PLAY, () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsReady(true);
        setIsLoading(false);
      });

      player.on(dashjs.MediaPlayer.events.ERROR, (e: any) => {
        console.error(`DrmPlayer: Error:`, e);
        if (retryCount < MAX_RETRIES) {
          setRetryCount(prev => prev + 1);
        } else {
          setError(`DRM Error: ${e.error || 'Playback failed'}`);
          handleFallback();
        }
      });

      playerRef.current = player;
    } catch (err) {
      console.error('DrmPlayer: Initialization failed:', err);
      handleFallback();
    }
  }, [mpdUrl, licenseUrl, token, isReady, error, handleFallback, retryCount]);

  useEffect(() => {
    initPlayer();
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [retryCount]); // Re-init on retry

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('DrmPlayer: Play failed', err));
    }
  };

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
            {retryCount > 0 ? `Retrying Playback (${retryCount}/${MAX_RETRIES})...` : 'Initializing DRM Stream...'}
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
          {isRedirecting ? (
            <div className="flex items-center gap-3 text-[#5A4BDA] animate-pulse">
              <ExternalLink className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Opening External Link...</span>
            </div>
          ) : (
            <button
              onClick={() => {
                setRetryCount(0);
                initPlayer();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-[#5A4BDA] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#4A3BCA] transition-all active:scale-95 shadow-lg shadow-[#5A4BDA]/20"
            >
              <RotateCcw className="w-3 h-3" />
              Try Again
            </button>
          )}
        </div>
      )}
    </div>
  );
};
