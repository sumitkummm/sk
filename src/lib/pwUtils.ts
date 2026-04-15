
/**
 * Utility functions for Physics Wallah (PW) integration.
 */

export const resolveImageUrl = (path: any) => {
  if (!path || typeof path !== 'string') return "";
  
  let strPath = path.trim();
  
  // If it's already a full URL, just return it
  if (strPath.startsWith('http')) return strPath;
  if (strPath.startsWith('//')) return `https:${strPath}`;
  
  // Clean leading slash
  let cleanPath = strPath.startsWith('/') ? strPath.substring(1) : strPath;
  
  // Handle specific PW domains if they are in the path but missing protocol
  if (cleanPath.includes('cloudfront.net') || cleanPath.includes('penpencil.co') || cleanPath.includes('static.pw.live')) {
    return `https://${cleanPath}`.replace(/([^:])\/\//g, '$1/');
  }
  
  // Handle relative paths that might be missing the domain
  // Use cloudfront for specific hex ID prefixes
  if (cleanPath.startsWith('5eb3cfee95f3240011b3e5c1/') || /^[0-9a-f]{24}\//.test(cleanPath)) {
    return `https://d2bps9p1kiy4ka.cloudfront.net/${cleanPath}`.replace(/([^:])\/\//g, '$1/');
  }
  
  // Default to static.pw.live for relative paths
  // If it's just a filename (no slashes), it might be in a common folder
  if (!cleanPath.includes('/')) {
    // We don't know the org ID here, but we can try a common one or just the root
    // Usually, the API returns the full relative path. 
    // If it's just a filename, it's likely broken without the org ID.
  }
  
  // Ensure we don't have double slashes
  return `https://static.pw.live/${cleanPath}`.replace(/([^:])\/\//g, '$1/');
};

export const resolveVideoUrl = (url: any) => {
  if (!url || typeof url !== 'string') return "";
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  }
  return cleanUrl;
};

export const resolveFileUrl = (url: any) => {
  if (!url || typeof url !== 'string') return "";
  let cleanUrl = url.trim();
  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  }
  
  // Handle relative paths for files
  if (!cleanUrl.startsWith('http')) {
    if (cleanUrl.startsWith('5eb3cfee95f3240011b3e5c1/') || /^[0-9a-f]{24}\//.test(cleanUrl)) {
      return `https://d2bps9p1kiy4ka.cloudfront.net/${cleanUrl}`;
    }
    return `https://static.pw.live/${cleanUrl}`;
  }
  
  return cleanUrl;
};

export const getPdfProxyUrl = (url: string) => {
  if (!url) return "";
  const resolvedUrl = resolveFileUrl(url);
  return `https://dragoapi.vercel.app/pdf/${encodeURIComponent(resolvedUrl)}`;
};

const PROXY_WORKERS = [
  'https://pwapi.sumitkumawat090912.workers.dev/api/proxy',
  'https://shrill-bird-6f22pwapi.sumitkumawat090912.workers.dev/api/proxy'
];

export const getStreamProxyUrl = (url: string, proxyIndex: number = 0) => {
  if (!url) return "";
  const resolvedUrl = resolveFileUrl(url);
  const workerBase = PROXY_WORKERS[proxyIndex % PROXY_WORKERS.length];
  return `${workerBase}?url=${encodeURIComponent(resolvedUrl)}`;
};

export const constructPwUrl = (url: string, token: string, parentId?: string, childId?: string, videoId?: string) => {
  if (!url) return "";
  try {
    // Clean extra slashes using regex
    let cleanUrl = url.replace(/([^:])\/\//g, '$1/');
    
    // The user requested a specific format: base.mpd&parentId=...&childId=...&videoId=...&token=...
    // We strip existing query params and use '&' as requested
    const baseUrl = cleanUrl.split('?')[0].split('&')[0];
    
    let finalUrl = baseUrl;
    finalUrl += `&parentId=${parentId || ''}`;
    finalUrl += `&childId=${childId || ''}`;
    finalUrl += `&videoId=${videoId || childId || ''}`;
    finalUrl += `&token=${token || ''}`;
    
    return finalUrl;
  } catch (err) {
    console.warn('pwUtils: URL Construction failed, returning original:', err);
    return url;
  }
};

export const fetchPlaybackUrl = async (lectureId: string, token: string, parentId?: string, vType?: string) => {
  let url = `/api/playback?lectureId=${lectureId}&token=${token}`;
  if (parentId) url += `&parentId=${parentId}`;
  if (vType) url += `&vType=${vType}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMessage = errorData.error;
    } catch (e) {
      // Body is not JSON, stick with statusText
    }
    throw new Error(`Failed to fetch playback details: ${errorMessage || response.status}`);
  }
  return await response.json();
};

export const getLocalVideoProxyUrl = (url: string, token: string) => {
  if (!url) return "";
  const resolvedUrl = resolveFileUrl(url);
  // Ensure the token is also in the proxied URL for the backend to use if needed
  return `/api/video-proxy?url=${encodeURIComponent(resolvedUrl)}&token=${encodeURIComponent(token)}`;
};

export const isPdf = (url: string) => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.pdf') || 
         lowerUrl.includes('.pdf?') ||
         lowerUrl.includes('drive.google.com') || 
         lowerUrl.includes('docs.google.com') ||
         lowerUrl.includes('attachment');
};
