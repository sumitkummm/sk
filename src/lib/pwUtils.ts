
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

export const isPdf = (url: string) => {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.pdf') || 
         lowerUrl.includes('.pdf?') ||
         lowerUrl.includes('drive.google.com') || 
         lowerUrl.includes('docs.google.com') ||
         lowerUrl.includes('attachment');
};

export const getPlayerUrl = (videoUrl: string, token: string, parentId?: string, childId?: string) => {
  const resolvedUrl = resolveFileUrl(videoUrl);
  if (!resolvedUrl) return "";

  // Updated to new API: https://anonymouspwplayerr-3cfbfedeb317.herokuapp.com/pw?url={url}&token={pw_token}
  // This API strictly requires parentId and childId parameters.
  const playerUrl = `https://anonymouspwplayerr-3cfbfedeb317.herokuapp.com/pw?url=${encodeURIComponent(resolvedUrl)}&token=${token}&parentId=${encodeURIComponent(parentId || "")}&childId=${encodeURIComponent(childId || "")}`;
  
  return playerUrl;
};
