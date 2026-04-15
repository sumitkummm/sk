import axios from 'axios';

export interface Batch {
  _id: string;
  id?: string;
  name: string;
  previewImage?: string;
  imageId?: string;
  bannerImage?: string;
  thumbnail?: string;
  description: string;
}

export interface Subject {
  _id: string;
  subjectName: string;
  imageId?: string;
  thumbnail?: string;
  bannerImage?: string;
}

export interface Content {
  _id: string;
  topic: string;
  url: string; // Primary URL (usually video)
  contentType: string;
  thumbnail?: string;
  image?: string;
  parentId?: string;
  childId?: string;
  noteUrl?: string; // Optional paired note URL
  exerciseUrl?: string; // Optional paired exercise URL
}

// Local API Base for proxying
const API_BASE = '/api';

/**
 * PW Identity Headers (Handled by server, but kept for reference)
 */
const COMMON_HEADERS = {
  'client-id': '5eb3cfee95f3240011b3e5c1',
  'client-type': 'web'
};

export const penpencilService = {
  /**
   * Sends OTP to the mobile number.
   */
  getOtp: async (mobile: string) => {
    const response = await axios.post(`${API_BASE}/get-otp`, {
      mobile
    });
    return response.data;
  },

  /**
   * Verifies OTP and returns access token.
   */
  verifyOtp: async (mobile: string, otp: string) => {
    const response = await axios.post(`${API_BASE}/verify-otp`, {
      mobile,
      otp
    });
    return response.data;
  },

  /**
   * Fetches purchased batches.
   */
  getBatches: async (token: string, organisationId?: string) => {
    const response = await axios.get(`${API_BASE}/batches`, {
      params: { token, organisationId }
    });
    return response.data.data || response.data;
  },

  /**
   * Fetches subjects for a specific batch.
   */
  getBatchDetails: async (token: string, batchId: string, organisationId?: string) => {
    const response = await axios.get(`${API_BASE}/batch-details/${batchId}`, {
      params: { token, organisationId }
    });
    const data = response.data.data;
    return data?.subjects || data;
  },

  /**
   * Fetches contents (lectures/notes/exercises).
   */
  getContents: async (token: string, batchId: string, subjectId: string, contentType = "videos", organisationId?: string) => {
    const response = await axios.get(`${API_BASE}/lectures/${batchId}`, {
      params: { 
        token,
        subjectId,
        contentType,
        organisationId
      }
    });
    
    const data = response.data.data;
    if (Array.isArray(data)) return data;
    if (data && (data.videos || data.notes || data.exercises)) return data;
    return [];
  }
};
