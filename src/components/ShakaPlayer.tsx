import React, { useEffect, useRef, useState } from 'react';
import shaka from 'shaka-player';
import { Play, AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import { getLocalVideoProxyUrl } from '../lib/pwUtils';

interface ShakaPlayerProps {
  mpdUrl: string;
  licenseUrl: string;
  token: string;
  title?: string;
}

export const ShakaPlayer: React.FC<ShakaPlayerProps> = ({
  mpdUrl,
  licenseUrl,
  token,
  title
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<shaka.Player | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Install polyfills to support various browsers
    shaka.polyfill.installAll();

    if (!shaka.Player.isBrowserSupported()) {
      setError('Browser not supported for DRM playback');
      return;
    }

    const initPlayer = async () => {
      if (!videoRef.current) return;

      const shakaPlayer = new shaka.Player(videoRef.current);
      setPlayer(shakaPlayer);

      // Configure DRM
      shakaPlayer.configure({
        drm: {
          servers: {
            'com.widevine.alpha': licenseUrl,
            'com.microsoft.playready': licenseUrl,
          },
          advanced: {
            'com.widevine.alpha': {
              'videoRobustness': 'SW_SECURE_CRYPTO',
              'audioRobustness': 'SW_SECURE_CRYPTO'
            }
          }
        }
      });

      // Add Token to Request Headers
      shakaPlayer.getNetworkingEngine()?.registerRequestFilter((type, request) => {
        // Add Authorization token to all requests (Manifest, Segments, License)
        request.headers['Authorization'] = `Bearer ${token}`;
        request.headers['client-id'] = '5eb3cfee95f3240011b3e5c1';
        request.headers['client-type'] = 'web';
        
        // Use proxy for manifest and segments, but NOT for the license server directly 
        // (unless the license server is also proxied, but PW's usually needs direct headers)
        if (type !== shaka.net.NetworkingEngine.RequestType.LICENSE) {
          if (!request.uris[0].includes('/api/video-proxy')) {
            request.uris[0] = getLocalVideoProxyUrl(request.uris[0], token);
          }
        }
      });

      try {
        await shakaPlayer.load(getLocalVideoProxyUrl(mpdUrl, token));
        console.log('ShakaPlayer: MPD loaded successfully');
        setIsLoading(false);
      } catch (e: any) {
        console.error('ShakaPlayer: Error loading MPD', e);
        setError(`Playback Error: ${e.message || 'Failed to load stream'}`);
        setIsLoading(false);
      }
    };

    initPlayer();

    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [mpdUrl, licenseUrl, token]);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => console.error('ShakaPlayer: Play failed', err));
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black group">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster="https://picsum.photos/seed/lecture/1920/1080?blur=10"
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Loading Overlay */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
          <Loader2 className="w-12 h-12 text-[#5A4BDA] animate-spin mb-4" />
          <p className="text-white/60 text-[10px] font-black uppercase tracking-widest">
            Initializing Secure Player...
          </p>
        </div>
      )}

      {/* Play Button Overlay */}
      {!isPlaying && !isLoading && !error && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] cursor-pointer z-10 transition-all duration-500 hover:bg-black/20"
          onClick={handlePlay}
        >
          <div className="w-20 h-20 bg-[#5A4BDA] rounded-full flex items-center justify-center shadow-2xl transform transition-transform duration-300 hover:scale-110">
            <Play className="w-8 h-8 text-white fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30 p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">Playback Error</h3>
          <p className="text-white/40 text-xs max-w-xs mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-[#5A4BDA] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#4A3BCA] transition-all"
          >
            <RotateCcw className="w-3 h-3" />
            Reload App
          </button>
        </div>
      )}

      {/* Title Overlay */}
      {title && isPlaying && (
        <div className="absolute top-6 left-6 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <h4 className="text-white/90 font-black text-sm uppercase tracking-widest drop-shadow-lg">{title}</h4>
        </div>
      )}
    </div>
  );
};
