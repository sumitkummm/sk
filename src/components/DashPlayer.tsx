import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as dashjs from 'dashjs';
import { Play, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { getLocalVideoProxyUrl, constructPwUrl } from '../lib/pwUtils';

interface DashPlayerProps {
  mpdBaseUrl: string;
  token?: string;
  parentId?: string;
  childId?: string;
}

export const DashPlayer: React.FC<DashPlayerProps> = ({ 
  mpdBaseUrl, 
  token, 
  parentId, 
  childId 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  const TIMEOUT_MS = 15000;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Construct the final MPD URL with query parameters
  const getFinalUrl = useCallback((baseUrl: string) => {
    return constructPwUrl(baseUrl, token || "", parentId, childId);
  }, [token, parentId, childId]);

  const handleFallback = useCallback(() => {
    if (isRedirecting) return;
    
    setIsRedirecting(true);
    setError('Playback failed. Redirecting to external player...');
    
    const finalUrl = getFinalUrl(mpdBaseUrl);
    
    setTimeout(() => {
      window.open(finalUrl, '_blank');
      setIsRedirecting(false);
    }, 2000);
  }, [getFinalUrl, mpdBaseUrl, isRedirecting]);

  const initPlayer = useCallback(() => {
    if (!videoRef.current || !mpdBaseUrl) return;

    const finalUrl = getFinalUrl(mpdBaseUrl);
    // Use the local backend proxy for the initial manifest
    const proxiedUrl = getLocalVideoProxyUrl(finalUrl, token || "");
    
    console.log('DashPlayer: Initializing with Local Proxy');
    console.log('DashPlayer: Final MPD URL:', finalUrl);

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
        console.warn('DashPlayer: Initialization timed out');
        setError('Initialization timed out. The proxy might be slow or the token expired.');
        handleFallback();
      }
    }, TIMEOUT_MS);

    try {
      const player = dashjs.MediaPlayer().create();
      
      // Add headers and proxy filter for ALL requests (manifest + segments)
      (player as any).addXhrFilter((request: any) => {
        const originalUrl = request.url;
        
        // If the URL is not already proxied, route it through our backend
        if (!originalUrl.includes('/api/video-proxy')) {
          const signedUrl = getFinalUrl(originalUrl);
          request.url = getLocalVideoProxyUrl(signedUrl, token || "");
        }

        // Add standard headers
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
        console.error(`DashPlayer: Error:`, e);
        // Only trigger fallback for fatal errors
        if (e.error === 'capability' || e.error === 'mediasource') {
          setError('DASH playback error. Trying fallback...');
          handleFallback();
        }
      });

      playerRef.current = player;
    } catch (err) {
      console.error('DashPlayer: Initialization failed:', err);
      handleFallback();
    }
  }, [mpdBaseUrl, getFinalUrl, isReady, error, handleFallback, token]);

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
  }, [initPlayer]);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('DashPlayer: Play failed', err));
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
            Initializing DASH Stream...
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
