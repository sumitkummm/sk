import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import cors from "cors";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Database
const db = new Database("database.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    mobile TEXT PRIMARY KEY,
    token TEXT,
    batches_json TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  const CLIENT_ID = "5eb3cfee95f3240011b3e5c1";

  // Helper to extract orgId from JWT token
  const getOrgIdFromToken = (token: string): string | null => {
    try {
      if (!token || !token.includes('.')) return null;
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      // Check all possible keys for organization ID in PW tokens
      return payload.organisationId || 
             payload.orgId || 
             payload.organisationID ||
             payload.oid || 
             payload.cid || 
             payload.organisation_id || 
             payload.org_id || 
             null;
    } catch (e) {
      return null;
    }
  };

  const getHeaders = (token: string, incomingHeaders: any = {}) => {
    const tokenOrgId = getOrgIdFromToken(token);
    const orgId = incomingHeaders["organisationid"] || incomingHeaders["organisationId"] || tokenOrgId || CLIENT_ID;
    
    // Some versions need client-id to match orgId, others need it fixed to the main PW ID
    const clientId = incomingHeaders["client-id"] || CLIENT_ID;
    const clientType = incomingHeaders["client-type"] || "web";
    
    // Generate a semi-random ID for randomId header
    const randomId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const headers: any = {
      "Authorization": token ? `Bearer ${token}` : (incomingHeaders.authorization || ""),
      "client-id": clientId,
      "organisationId": orgId,
      "organisationid": orgId,
      "organisation-id": orgId,
      "organisation_id": orgId,
      "org-id": orgId,
      "x-organisation-id": orgId,
      "client-type": clientType,
      "client-version": "12.84",
      "device-meta": "{APP_VERSION:12.84,DEVICE_MAKE:Asus,DEVICE_MODEL:ASUS_X00TD,OS_VERSION:6,PACKAGE_NAME:xyz.penpencil.physicswalb}",
      "version": "1.0.0",
      "User-Agent": clientType === "MOBILE" ? "Android" : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Origin": "https://study.physicswallah.live",
      "Referer": "https://study.physicswallah.live/",
      "Accept": "application/json, text/plain, */*",
      "randomId": randomId,
      "randomid": randomId
    };
    
    if (!headers.Authorization) delete headers.Authorization;
    
    return headers;
  };

  // Reusable fetch with fallbacks
  const fetchWithFallbacks = async (urlBase: string, token: string, defaultOrgId: string, extraHeaders: any = {}) => {
    const tryFetch = async (url: string, currentOrgId: string, clientType = "web", useOrgAsClientId = false) => {
      console.log(`Trying: ${url} (Org: ${currentOrgId}, Type: ${clientType}, OrgAsClientId: ${useOrgAsClientId})`);
      const headers = getHeaders(token, { ...extraHeaders, organisationId: currentOrgId, "client-type": clientType });
      if (useOrgAsClientId) {
        headers["client-id"] = currentOrgId;
      }
      return await axios.get(url, { headers });
    };

    const tokenOrg = getOrgIdFromToken(token);
    const primaryOrgId = tokenOrg || defaultOrgId;

    // 1. Try primary org (from token or default)
    try {
      const url = urlBase.includes('?') ? `${urlBase}&organisationId=${primaryOrgId}` : `${urlBase}?organisationId=${primaryOrgId}`;
      return await tryFetch(url, primaryOrgId, "web");
    } catch (err: any) {
      if (err.response?.status !== 401) throw err;
      
      console.log(`Primary org ${primaryOrgId} failed, trying alternative orgs...`);
      // 2. Try alternative orgs
      const altOrgs = [
        "5eb393ee95fab7468a79d189", // New Mobile Org
        "5f33vet7zhzic6v2liac7y", // App ID (Priority)
        "6001290352516400119f1828", // Khazana
        "5e5369687483660011116174", // Common PW
        "5f29226e6f6636001140082f", // Common PW 2
        "5f60799426986a001144003a", // Common PW 3
        "5f60799426986a001144003b", // Common PW 4
        "5f60799426986a001144003c", // Common PW 5
        "5f60799426986a001144003d", // Common PW 6
        "5f60799426986a001144003e", // Common PW 7
        "5eb3cfee95f3240011b3e5c1"  // Default
      ];
      
      // Remove the primary org from altOrgs to avoid double-trying
      const filteredAltOrgs = altOrgs.filter(id => id !== primaryOrgId);
      if (tokenOrg && tokenOrg !== primaryOrgId && !filteredAltOrgs.includes(tokenOrg)) {
        filteredAltOrgs.unshift(tokenOrg);
      }

      for (const altOrgId of filteredAltOrgs) {
        try {
          const url = urlBase.includes('?') ? `${urlBase}&organisationId=${altOrgId}` : `${urlBase}?organisationId=${altOrgId}`;
          
          // Try with multiple client-id variations
          const clientIds = [CLIENT_ID, altOrgId, "5f33vet7zhzic6v2liac7y"];
          for (const cid of clientIds) {
            try {
              console.log(`Trying Alt Org: ${altOrgId} with Client-ID: ${cid}`);
              const headers = getHeaders(token, { ...extraHeaders, organisationId: altOrgId, "client-id": cid });
              return await axios.get(url, { headers });
            } catch (e: any) {
              if (e.response?.status !== 401) throw e;
            }
          }
        } catch (err2: any) {
          if (err2.response?.status !== 401) throw err2;
          console.log(`Alt org ${altOrgId} failed...`);
        }
      }
      
      console.log("All alternative orgs failed, trying MOBILE client-type...");
      // 3. Try default org + MOBILE
      try {
        const url = urlBase.includes('?') ? `${urlBase}&organisationId=${defaultOrgId}` : `${urlBase}?organisationId=${defaultOrgId}`;
        return await tryFetch(url, defaultOrgId, "MOBILE");
      } catch (errMobile: any) {
        console.log("MOBILE failed, trying android client-type...");
        // 4. Try default org + android
        try {
          const url = urlBase.includes('?') ? `${urlBase}&organisationId=${defaultOrgId}` : `${urlBase}?organisationId=${defaultOrgId}`;
          return await tryFetch(url, defaultOrgId, "android");
        } catch (err3: any) {
          // 5. Try without orgId in query
          console.log("Android failed, trying without orgId in query...");
          try {
            return await tryFetch(urlBase, defaultOrgId, "web");
          } catch (err4: any) {
            // 6. Final attempt: No organization headers at all
            console.log("No-query failed, trying without any organization headers...");
            return await axios.get(urlBase, {
              headers: {
                "Authorization": token ? `Bearer ${token}` : "",
                "client-type": "web",
                "version": "1.0.0",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
              }
            });
          }
        }
      }
    }
  };

  // Helper to save user data
  const saveUserToken = (mobile: string, token: string) => {
    const stmt = db.prepare("INSERT INTO users (mobile, token) VALUES (?, ?) ON CONFLICT(mobile) DO UPDATE SET token = ?, updated_at = CURRENT_TIMESTAMP");
    stmt.run(mobile, token, token);
  };

  const saveUserBatches = (token: string, batchesJson: string) => {
    const stmt = db.prepare("UPDATE users SET batches_json = ?, updated_at = CURRENT_TIMESTAMP WHERE token = ?");
    stmt.run(batchesJson, token);
  };

  const removeToken = (token: string) => {
    const stmt = db.prepare("UPDATE users SET token = NULL WHERE token = ?");
    stmt.run(token);
  };

  const getCachedBatchesByToken = (token: string) => {
    const stmt = db.prepare("SELECT batches_json FROM users WHERE token = ?");
    const row = stmt.get(token) as any;
    return row?.batches_json ? JSON.parse(row.batches_json) : null;
  };

  // OTP Endpoints
  app.post("/api/get-otp", async (req, res) => {
    const { mobile } = req.body;
    try {
      const response = await axios.post("https://api.penpencil.co/v3/users/get-otp?smsType=1", {
        username: mobile,
        countryCode: "+91",
        organisationId: CLIENT_ID
      }, {
        headers: getHeaders("")
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/verify-otp", async (req, res) => {
    const { mobile, otp } = req.body;
    const tryVerify = async (orgId: string) => {
      return await axios.post("https://api.penpencil.co/v3/oauth/token", {
        username: mobile,
        password: otp,
        grant_type: "password",
        scope: "read",
        client_id: orgId,
        organisationId: orgId
      }, {
        headers: getHeaders("", { organisationId: orgId })
      });
    };

    try {
      try {
        const response = await tryVerify(CLIENT_ID);
        return res.json(response.data.data);
      } catch (err: any) {
        if (err.response?.status !== 401) throw err;
        
        console.log("OTP verify failed with default org, trying alternatives...");
        const altOrgs = ["6001290352516400119f1828", "5f33vet7zhzic6v2liac7y"];
        for (const altOrgId of altOrgs) {
          try {
            const response = await tryVerify(altOrgId);
            return res.json(response.data.data);
          } catch (err2: any) {
            console.log(`OTP verify failed with alt org ${altOrgId}...`);
          }
        }
        throw err;
      }
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // Login Endpoint
  app.post("/api/login", async (req, res) => {
    const { mobile, password, token: incomingToken } = req.body;
    
    if (!mobile) return res.status(400).json({ error: "Mobile number required" });

    try {
      const tokenToSave = incomingToken || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNzkxOTMzNDE5NSIsInRnX3VzZXJuYW1lIjoi4p61IFtvZmZsaW5lXSIsImlhdCI6MTczODY5MjA3N30.SXzZ1MZcvMp5sGESj0hBKSghhxJ3k1GTWoBUbivUe1I"; 
      saveUserToken(mobile, tokenToSave);
      res.json({ token: tokenToSave, mobile });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Public Batches Endpoint
  app.get("/api/batches", async (req, res) => {
    const { token, organisationId } = req.query;
    const orgId = (organisationId as string) || CLIENT_ID;
    
    try {
      // Primary attempt: v3
      const params = "mode=1&filter=false&exam=&amount=&classes=&limit=20&page=1&programId=&ut=1652675230446";
      const v3Base = token 
        ? `https://api.penpencil.co/v3/batches/my-batches?${params}` 
        : `https://api.penpencil.co/v3/batches/all?${params}`;
        
      try {
        const response = await fetchWithFallbacks(v3Base, token as string, orgId, req.headers);
        return res.json(response.data);
      } catch (v3Error: any) {
        console.log("v3 batches failed, trying v2...");
        // Fallback attempt: v2
        const v2Base = token
          ? `https://api.penpencil.co/v2/batches/my-batches?${params}`
          : `https://api.penpencil.co/v2/batches/all?${params}`;
          
        const response = await fetchWithFallbacks(v2Base, token as string, orgId, req.headers);
        return res.json(response.data);
      }
    } catch (error: any) {
      console.error("Fetch Batches Error:", error.response?.data || error.message);
      
      // If public fetch fails, return empty data instead of 500
      if (!token) {
        return res.json({ data: [] });
      }
      
      res.status(error.response?.status || 500).json({ 
        error: error.message,
        details: error.response?.data 
      });
    }
  });

  // Protected Lectures Endpoint
  app.get("/api/lectures/:batchId", async (req, res) => {
    const { batchId } = req.params;
    const { token, subjectId, contentType, organisationId, page = "1" } = req.query;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const orgId = (organisationId as string) || CLIENT_ID;

    try {
      // Try v2 first
      let v2Base = `https://api.penpencil.co/v2/batches/${batchId}/subject/${subjectId}/contents?contentType=${contentType}&page=${page}`;
      if (!subjectId) {
        v2Base = `https://api.penpencil.co/v2/batches/${batchId}/lectures?page=${page}`;
      }
      
      let responseData: any;
      try {
        const response = await fetchWithFallbacks(v2Base, token as string, orgId, req.headers);
        responseData = response.data;
      } catch (v2Error: any) {
        console.log("v2 failed, trying v3...");
        const v3Base = `https://api.penpencil.co/v3/batches/contents?batchId=${batchId}&subjectId=${subjectId}&contentType=${contentType}&page=${page}`;
        
        try {
          const v3Response = await fetchWithFallbacks(v3Base, token as string, orgId, req.headers);
          responseData = v3Response.data;
        } catch (v3Error: any) {
          console.log("v3 failed, trying v3 alt...");
          const v3AltBase = `https://api.penpencil.co/v3/batches/${batchId}/subjects/${subjectId}/contents?contentType=${contentType}&page=${page}`;
          
          const v3AltResponse = await fetchWithFallbacks(v3AltBase, token as string, orgId, req.headers);
          responseData = v3AltResponse.data;
        }
      }

      // Apply URL transformations as requested by user
      if (responseData && responseData.data) {
        responseData.data = responseData.data.map((item: any) => {
          if (item.url && (contentType === 'exercises-notes-videos' || contentType === 'DppVideos')) {
            item.originalUrl = item.url;
            item.url = item.url
              .replace("d1d34p8vz63oiq", "d26g5bnklkwsh4")
              .replace("mpd", "m3u8")
              .trim();
          }
          return item;
        });
      }

      return res.json(responseData);
    } catch (error: any) {
      console.error("Subject Contents Error Details:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.message,
        details: error.response?.data 
      });
    }
  });

  // Tests Endpoint (TestQuiz)
  app.get("/api/tests", async (req, res) => {
    const { token, batchId, subjectId, organisationId, page = "1" } = req.query;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const orgId = (organisationId as string) || CLIENT_ID;

    try {
      const url = `https://api.penpencil.co/v3/test-service/tests/dpp?page=${page}&limit=50&batchId=${batchId}&batchSubjectId=${subjectId}&isSubjective=false`;
      const response = await fetchWithFallbacks(url, token as string, orgId, req.headers);
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // Batch Details Endpoint
  app.get("/api/batch-details/:batchId", async (req, res) => {
    const { batchId } = req.params;
    const { token, organisationId } = req.query;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    const orgId = (organisationId as string) || CLIENT_ID;

    try {
      const v3Base = `https://api.penpencil.co/v3/batches/${batchId}/details`;
      const response = await fetchWithFallbacks(v3Base, token as string, orgId, req.headers);
      return res.json(response.data);
    } catch (error: any) {
      console.error("Batch Details Error Details:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.message,
        details: error.response?.data 
      });
    }
  });

  // User Profile Info
  app.get("/api/profile", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: "Token required" });

    try {
      const response = await fetchWithFallbacks(`https://api.penpencil.co/v3/oauth/exchange-token`, token as string, CLIENT_ID, req.headers);
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // User Self Info Proxy
  app.get("/api/self", async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: "Token required" });

    try {
      const response = await fetchWithFallbacks(`https://api.penpencil.co/v3/users/self`, token as string, CLIENT_ID, req.headers);
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // Register Session Proxy
  app.post("/api/register-session", async (req, res) => {
    const { token, lectureId, batchId, subjectId } = req.body;
    if (!token || !lectureId) return res.status(400).json({ error: "Token and lectureId required" });

    try {
      const response = await axios.post("https://api.penpencil.co/uxncc-be-go/video-stats/v1/register-session", {
        video_id: lectureId,
        batch_id: batchId,
        subject_id: subjectId,
        entry_point: "BATCH_LECTURE_VIDEOS_" + lectureId
      }, {
        headers: getHeaders(token, req.headers)
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // Batch Details Proxy
  app.get("/api/batch-details/:batchId", async (req, res) => {
    const { batchId } = req.params;
    const token = req.query.token as string;

    try {
      const response = await axios.get(`https://api.penpencil.co/v3/batches/${batchId}/details`, {
        headers: getHeaders(token, req.headers)
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
    }
  });

  // DRM Playback Endpoint
  app.get("/api/getPlayback", async (req, res) => {
    const { lectureId, token } = req.query;

    if (!lectureId || !token) {
      return res.status(400).json({ error: "lectureId and token are required" });
    }

    try {
      const headers = getHeaders(token as string, req.headers);
      
      // Call the original video provider API (Simulated PW API)
      const response = await axios.get(`https://api.penpencil.co/v1/videos/get-playback-details?video_id=${lectureId}`, {
        headers: headers
      });

      const data = response.data?.data;
      
      if (!data) {
        throw new Error("Failed to retrieve playback details from provider");
      }

      const mpdUrl = data.videoDetails?.dashUrl || data.dashUrl;
      const licenseUrl = data.videoDetails?.licenseUrl || data.licenseUrl || "https://widevine-dash.ezdrm.com/proxy?pX=YOUR_ID";

      if (!mpdUrl) {
        return res.status(404).json({ error: "MPD URL not found for this lecture" });
      }

      res.json({
        mpdUrl,
        licenseUrl,
        originalData: data
      });

    } catch (error: any) {
      console.error('Playback Fetch Error:', error.response?.data || error.message);
      if (error.response?.status === 401) {
        return res.status(401).json({ error: "Token expired or invalid" });
      }
      res.status(500).json({ error: "Failed to fetch playback details: " + (error.response?.data?.message || error.message) });
    }
  });

  // New Unified Playback Endpoint
  app.get("/api/playback", async (req, res) => {
    const { lectureId, token, parentId, vType } = req.query;

    if (!lectureId || !token) {
      return res.status(400).json({ error: "lectureId and token are required" });
    }

    try {
      const headers = getHeaders(token as string, req.headers);
      
      // Construct the URL with optional parameters
      let apiUrl = `https://api.penpencil.co/v1/videos/get-playback-details?video_id=${lectureId}`;
      if (parentId) apiUrl += `&parentId=${parentId}`;
      if (vType) apiUrl += `&vType=${vType}`;

      const response = await axios.get(apiUrl, {
        headers: headers
      });

      const data = response.data?.data;
      if (!data) throw new Error("No data from provider");

      console.log('Playback Data:', JSON.stringify(data, null, 2));

      let videoUrl = data.videoDetails?.dashUrl || data.dashUrl || data.videoDetails?.hlsUrl || data.hlsUrl;
      const licenseUrl = data.videoDetails?.licenseUrl || data.licenseUrl;

      if (!videoUrl) {
        return res.status(404).json({ error: "Playback URL not found" });
      }

      // Construct the URL in the specific format requested by the user:
      // base.mpd&parentId=...&childId=...&videoId=...&token=...
      const videoId = data.videoId || data.video_id || data.videoDetails?.videoId || lectureId;
      const childId = data.childId || data.child_id || data.videoDetails?.childId || lectureId;

      if (videoUrl.includes(".mpd")) {
        const baseMpd = videoUrl.split('?')[0].split('&')[0];
        videoUrl = `${baseMpd}&parentId=${parentId || ''}&childId=${childId}&videoId=${videoId}&token=${token}`;
      } else if (videoUrl.includes(".m3u8")) {
        const baseHls = videoUrl.split('?')[0].split('&')[0];
        videoUrl = `${baseHls}&parentId=${parentId || ''}&childId=${childId}&videoId=${videoId}&token=${token}`;
      }

      // Determine type
      let type = "mp4";
      if (videoUrl.includes(".mpd")) type = "mpd";
      else if (videoUrl.includes(".m3u8")) type = "m3u8";

      res.json({
        videoUrl,
        licenseUrl,
        type
      });

    } catch (error: any) {
      console.error('Playback Fetch Error:', error.response?.data || error.message);
      const status = error.response?.status || 500;
      const message = error.response?.data?.message || error.response?.data?.error || error.message;
      res.status(status).json({ error: message });
    }
  });

  // Video Proxy Route
  app.get("/api/video-proxy", async (req, res) => {
    const videoUrl = req.query.url as string;
    const token = req.query.token as string;

    if (!videoUrl) {
      return res.status(400).send("URL is required");
    }

    try {
      const headers = getHeaders(token, req.headers);
      
      // Forward Range header from client to target
      if (req.headers.range) {
        headers.range = req.headers.range;
      }

      // Remove host header to avoid conflicts
      delete headers.host;

      console.log(`Proxying request: ${videoUrl}`);
      if (headers.range) console.log(`Range: ${headers.range}`);

      const response = await axios({
        method: 'get',
        url: videoUrl,
        headers: headers,
        responseType: 'stream',
        timeout: 60000, // Increased timeout for video
        validateStatus: () => true
      });

      // Forward status and headers
      res.status(response.status);
      
      // Forward relevant headers
      const headersToForward = [
        'content-type', 
        'content-length', 
        'accept-ranges', 
        'content-range', 
        'cache-control',
        'access-control-allow-origin',
        'access-control-allow-methods',
        'access-control-allow-headers'
      ];

      headersToForward.forEach(h => {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      });

      // Ensure CORS for the proxy itself
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      response.data.pipe(res);

      response.data.on('error', (err: any) => {
        console.error('Proxy Stream Error:', err.message);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });

      req.on('close', () => {
        // Abort axios request if client closes connection
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
      });

    } catch (error: any) {
      console.error('Video Proxy Error:', error.message);
      if (!res.headersSent) {
        res.status(500).send("Proxy error: " + error.message);
      }
    }
  });

  // Admin endpoint to see all stored users
  app.get("/api/admin/users", (req, res) => {
    const users = db.prepare("SELECT mobile, updated_at, (token IS NOT NULL) as is_active, (batches_json IS NOT NULL) as has_cache FROM users").all();
    res.json(users);
  });

  app.get("/api/admin/resume/:mobile", (req, res) => {
    const { mobile } = req.params;
    const row = db.prepare("SELECT token FROM users WHERE mobile = ?").get(mobile) as any;
    if (row?.token) {
      res.json({ token: row.token });
    } else {
      res.status(404).json({ error: "No active token found for this mobile" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
