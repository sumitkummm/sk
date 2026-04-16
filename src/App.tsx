/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Key, 
  BookOpen, 
  ChevronRight, 
  Play, 
  ArrowLeft, 
  Search, 
  LogOut,
  Video,
  FileText,
  Layers,
  Home,
  Layout,
  Library,
  Trophy,
  User,
  Settings,
  Bell
} from 'lucide-react';
import { penpencilService, Batch, Subject, Content } from './services/penpencilService';
import { QuizPlayer } from './components/QuizPlayer';

type ViewState = 'login' | 'batches' | 'subjects' | 'contents' | 'player' | 'accounts' | 'profile';
type ContentType = 'videos' | 'notes' | 'notices' | 'DppVideos' | 'DppNotes' | 'tests';
type LoginMode = 'token' | 'otp';

import { 
  resolveImageUrl, 
  resolveVideoUrl, 
  resolveFileUrl,
  getPdfProxyUrl,
  getPlayerUrl,
  isPdf 
} from './lib/pwUtils';

const ImageWithFallback = ({ src, alt, className, fallbackText }: { src: string, alt: string, className?: string, fallbackText: string }) => {
  const [error, setError] = React.useState(false);
  
  if (error || !src) {
    const initial = fallbackText && typeof fallbackText === 'string' && fallbackText.length > 0 
      ? fallbackText.charAt(0).toUpperCase() 
      : '?';
      
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-[#5A4BDA] to-[#1A1A1A] text-white font-black text-2xl ${className}`}>
        {initial}
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt} 
      className={className}
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
  );
};

export default function App() {
  const [view, setView] = useState<ViewState>('login');
  const [loginMode, setLoginMode] = useState<LoginMode>('otp');
  const [token, setToken] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [selectedContent, setSelectedContent] = useState<Content | null>(null);
  const [contentType, setContentType] = useState<ContentType>('videos');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('batches');
  const [storedUsers, setStoredUsers] = useState<any[]>([]);

  const filteredBatches = batches.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [userOrgId, setUserOrgId] = useState<string>('');

  const fetchUserInfo = async (authToken: string) => {
    try {
      const response = await fetch(`/api/self?token=${authToken}`);
      const data = await response.json();
      if (data.data?.organisationId) {
        console.log('Detected Organization ID:', data.data.organisationId);
        setUserOrgId(data.data.organisationId);
      }
      
      // Also fetch full profile
      const profileRes = await fetch(`/api/profile?token=${authToken}`);
      const profileData = await profileRes.json();
      if (profileData.data?.user) {
        setProfile(profileData.data.user);
      } else if (data.data) {
        setProfile(data.data);
      }
      
      return data.data?.organisationId;
    } catch (err) {
      console.error('Failed to fetch user info:', err);
    }
    return null;
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('pw_token');
    if (savedToken) {
      setToken(savedToken);
      const init = async () => {
        const orgId = await fetchUserInfo(savedToken);
        fetchBatches(savedToken, orgId || undefined);
      };
      init();
    } else {
      fetchPublicBatches();
    }
  }, []);

  const fetchPublicBatches = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/batches');
      const data = await response.json();
      setBatches(data.data || []);
    } catch (err) {
      console.error('Failed to fetch public batches:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async (authToken: string, orgId?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await penpencilService.getBatches(authToken, orgId);
      if (!data || data.length === 0) {
        setError('No batches found. If this is a new account, please ensure you have enrolled in at least one batch.');
      }
      setBatches(data || []);
      setView('batches');
    } catch (err: any) {
      console.error('Fetch Batches Error:', err);
      const status = err.response?.status;
      const errorMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      
      if (status === 401) {
        setError('Your session has expired or the token is invalid. Please login again.');
        logout();
      } else {
        setError(`Failed to fetch batches (Status: ${status || 'Unknown'}): ${errorMsg}. Please check your connection or try again later.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const cleanToken = token.trim().replace(/^Bearer\s+/i, '');
    
    setLoading(true);
    try {
      // Detect org first
      const orgId = await fetchUserInfo(cleanToken);
      
      // Store token in backend
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: 'Manual Token', token: cleanToken })
      });

      setToken(cleanToken);
      localStorage.setItem('pw_token', cleanToken);
      fetchBatches(cleanToken, orgId || undefined);
    } catch (err) {
      console.error('Token login error:', err);
      setError('Failed to process token.');
    } finally {
      setLoading(false);
    }
  };

  const handleGetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobile || mobile.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await penpencilService.getOtp(mobile);
      setOtpSent(true);
    } catch (err: any) {
      console.error('OTP Send Error:', err);
      const msg = err.response?.data?.message || 'Failed to send OTP. Please check your number and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      const data = await penpencilService.verifyOtp(mobile, otp);
      const newToken = data.access_token;
      
      // Detect org first
      const orgId = await fetchUserInfo(newToken);

      // Store token in backend for session management
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, token: newToken })
      });

      setToken(newToken);
      localStorage.setItem('pw_token', newToken);
      fetchBatches(newToken, orgId || undefined);
    } catch (err: any) {
      console.error('OTP Verify Error:', err);
      const msg = err.response?.data?.message || 'Invalid OTP. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchSelect = async (batch: Batch) => {
    if (!token) {
      setView('login');
      setError('Please login to access batch content.');
      return;
    }
    setLoading(true);
    setError('');
    setSelectedBatch(batch);
    const batchId = batch._id || batch.id;
    if (!batchId) {
      setError('Invalid Batch ID');
      setLoading(false);
      return;
    }
    try {
      const data = await penpencilService.getBatchDetails(token, batchId, userOrgId || undefined);
      setSubjects(data);
      setView('subjects');
    } catch (err: any) {
      console.error('Batch Details Error:', err);
      const status = err.response?.status;
      if (status === 401) {
        setError('Session expired. Please login again.');
        logout();
      } else {
        setError(`Failed to fetch batch subjects. Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectSelect = async (subject: Subject) => {
    if (!selectedBatch || !token) return;
    const batchId = selectedBatch._id || selectedBatch.id;
    if (!batchId) return;
    
    setSelectedSubject(subject);
    setContentType('videos');
    fetchContents(token, batchId, subject._id, 'videos');
  };

  const fetchContents = async (authToken: string, batchId: string, subjectId: string, type: ContentType, page: number = 1) => {
    setLoading(true);
    setError('');
    try {
      let data: any;
      if (type === 'tests') {
        const response = await fetch(`/api/tests?token=${authToken}&batchId=${batchId}&subjectId=${subjectId}&organisationId=${userOrgId}&page=${page}`);
        data = await response.json();
      } else {
        // Map UI types to API types
        let apiType: string = type;
        if (type === 'notices') apiType = 'notes';
        else if (type === 'DppVideos') apiType = 'exercises-notes-videos';
        else if (type === 'DppNotes') apiType = 'exercises-notes-notes';
        
        data = await penpencilService.getContents(authToken, batchId, subjectId, apiType, userOrgId || undefined, page);
      }
      
      const items = Array.isArray(data) ? data : (data.data || data.videos || data.exercises || data.notes || data.lectures || []);
      const processedContents = items.map((item: any) => {
        // Handle TestQuiz format
        if (type === 'tests') {
          const test = item.test || {};
          return {
            _id: test._id,
            topic: test.name || "Untitled Test",
            url: `https://www.pw.live/study/q-bank-exercise/${test._id}?contentSlug=${test._id}&title=${encodeURIComponent(test.name)}&cameFrom=dpp&subjectName=${encodeURIComponent(selectedSubject?.subjectName || '')}&batchId=${batchId}`,
            contentType: 'test',
            thumbnail: '',
            parentId: batchId,
            childId: test._id,
            vType: 'test'
          };
        }

        // Handle Notes/Notices/DPP Notes/DPP Videos (if structured as homeworks)
        if (type === 'notes' || type === 'notices' || type === 'DppNotes' || type === 'DppVideos') {
          const homework = item.homeworkIds?.[0] || {};
          const attachment = homework.attachmentIds?.[0] || {};
          
          // If it's DppVideos, we only use this logic if it actually has homeworkIds
          if (item.homeworkIds && item.homeworkIds.length > 0) {
            return {
              _id: item._id,
              topic: item.topic || item.name || homework.topic || "Untitled Content",
              url: attachment.baseUrl ? `${attachment.baseUrl}${attachment.key}` : (item.url || item.videoUrl),
              contentType: type === 'DppVideos' ? 'video' : 'document',
              thumbnail: item.thumbnail || item.image,
              parentId: batchId,
              childId: item._id,
              vType: type === 'DppVideos' ? 'video' : 'document'
            };
          }
        }

        // Handle Videos (Standard Lectures)
        const videoUrl = item.url || item.videoUrl || item.videoDetails?.videoUrl || item.videoDetails?.url;
        return {
          _id: item._id,
          topic: item.name || item.topic || "Untitled Lecture",
          url: videoUrl,
          contentType: 'video',
          thumbnail: item.thumbnail || item.image || item.videoDetails?.image,
          parentId: batchId,
          childId: item._id,
          vType: item.vType || 'video'
        };
      });
      
      setContents(processedContents);
      setView('contents');
    } catch (err: any) {
      console.error('Fetch Contents Error:', err);
      const status = err.response?.status;
      if (status === 401) {
        setError('Session expired. Please login again.');
        logout();
      } else {
        setError(`Failed to fetch contents. Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContentSelect = async (content: Content) => {
    if (content.contentType === 'document') {
      window.open(content.url, '_blank');
      return;
    }
    
    // Set view first for immediate feedback
    setView('player');
    setSelectedContent(content);
  };

  const goBack = () => {
    if (view === 'player') setView('contents');
    else if (view === 'contents') setView('subjects');
    else if (view === 'subjects') setView('batches');
    else if (view === 'batches') setView('login');
  };

  const logout = () => {
    localStorage.removeItem('pw_token');
    setToken('');
    setOtpSent(false);
    setOtp('');
    setView('login');
  };

  const fetchStoredUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      setStoredUsers(data);
    } catch (err) {
      console.error('Failed to fetch stored users:', err);
    }
  };

  const resumeSession = async (mobile: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/resume/${mobile}`);
      const data = await response.json();
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('pw_token', data.token);
        fetchBatches(data.token);
      } else {
        setError('Could not resume session. Token might be expired.');
      }
    } catch (err) {
      console.error('Resume session error:', err);
      setError('Failed to resume session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#1A1A1A] font-sans selection:bg-[#5A4BDA]/20 selection:text-[#5A4BDA]">
      {view !== 'login' && (
        <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-[#1A1A1A]/5 z-50 hidden lg:flex flex-col">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-[#5A4BDA] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#5A4BDA]/20">
                <Layers size={20} />
              </div>
              <span className="font-bold text-xl tracking-tight">PW Study</span>
            </div>

                <nav className="space-y-1">
                  <button
                    onClick={() => {
                      setActiveTab('profile');
                      setView('profile');
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      activeTab === 'profile' 
                        ? 'bg-[#5A4BDA]/10 text-[#5A4BDA]' 
                        : 'text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 hover:text-[#1A1A1A]'
                    }`}
                  >
                    <User size={18} />
                    My Profile
                  </button>

                  {[
                    { id: 'batches', icon: Layout, label: 'My Batches' },
                    { id: 'accounts', icon: User, label: 'Stored Accounts' },
                    { id: 'study', icon: BookOpen, label: 'Study' },
                    { id: 'library', icon: Library, label: 'Library' },
                    { id: 'tests', icon: Trophy, label: 'Test Series' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        if (item.id === 'batches') setView('batches');
                        if (item.id === 'accounts') {
                          fetchStoredUsers();
                          setView('accounts');
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        activeTab === item.id 
                          ? 'bg-[#5A4BDA]/10 text-[#5A4BDA]' 
                          : 'text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 hover:text-[#1A1A1A]'
                      }`}
                    >
                      <item.icon size={18} />
                      {item.label}
                    </button>
                  ))}
                </nav>
          </div>

          <div className="mt-auto p-6 space-y-4">
            <div className="p-4 bg-[#F8F9FB] rounded-2xl">
              <p className="text-xs font-bold text-[#1A1A1A]/40 uppercase tracking-wider mb-2">Account</p>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center border border-[#1A1A1A]/5">
                  <User size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">User</p>
                  <p className="text-[10px] text-[#1A1A1A]/40 truncate">{mobile || 'Guest'}</p>
                </div>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </aside>
      )}

      <div className={`${view !== 'login' ? 'lg:pl-64' : ''} transition-all duration-300`}>
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[#1A1A1A]/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {view !== 'login' && view !== 'batches' && (
              <button 
                onClick={goBack}
                className="p-2 hover:bg-[#1A1A1A]/5 rounded-xl transition-colors text-[#1A1A1A]/60"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h1 className="text-lg font-bold tracking-tight">
              {view === 'login' ? 'Welcome Back' : 
               view === 'batches' ? 'My Batches' : 
               view === 'subjects' ? selectedBatch?.name : 
               view === 'contents' ? `${selectedSubject?.subjectName} - ${contentType.replace('Dpp', 'DPP ')}` : 
               view === 'accounts' ? 'Stored Accounts' :
               view === 'profile' ? 'My Profile' :
               'Now Playing'}
            </h1>
          </div>
          
          {view !== 'login' && (
            <div className="flex items-center gap-3">
              <button className="p-2 text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 rounded-xl transition-all">
                <Bell size={20} />
              </button>
              <button className="p-2 text-[#1A1A1A]/40 hover:bg-[#1A1A1A]/5 rounded-xl transition-all lg:hidden" onClick={logout}>
                <LogOut size={20} />
              </button>
            </div>
          )}
        </header>

        <main className="p-6 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {view === 'login' && (
              <motion.div 
                key="login"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="max-w-md mx-auto mt-12"
              >
                <div className="bg-white p-10 rounded-[2.5rem] shadow-xl shadow-[#1A1A1A]/5 border border-[#1A1A1A]/5">
                  <div className="w-16 h-16 bg-[#5A4BDA] rounded-3xl flex items-center justify-center mb-8 text-white shadow-lg shadow-[#5A4BDA]/20 rotate-3">
                    <Key size={32} />
                  </div>
                  <h2 className="text-3xl font-black mb-2">PW Study</h2>
                  <p className="text-[#1A1A1A]/50 mb-10 font-medium">Access your Physics Wallah batches and lectures in a modern interface.</p>
                  
                  <div className="flex gap-2 mb-8 p-1.5 bg-[#F8F9FB] rounded-2xl">
                    <button 
                      onClick={() => setLoginMode('otp')}
                      className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${loginMode === 'otp' ? 'bg-white shadow-md text-[#5A4BDA]' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
                    >
                      OTP Login
                    </button>
                    <button 
                      onClick={() => setLoginMode('token')}
                      className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${loginMode === 'token' ? 'bg-white shadow-md text-[#5A4BDA]' : 'text-[#1A1A1A]/40 hover:text-[#1A1A1A]'}`}
                    >
                      Bearer Token
                    </button>
                  </div>

                  {loginMode === 'otp' ? (
                    <form onSubmit={otpSent ? handleVerifyOtp : handleGetOtp} className="space-y-6">
                      {!otpSent ? (
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30 mb-3 ml-1">Mobile Number</label>
                          <div className="flex gap-3">
                            <span className="flex items-center px-5 bg-[#F8F9FB] rounded-2xl font-black text-[#1A1A1A]/30">+91</span>
                            <input 
                              type="tel"
                              value={mobile}
                              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                              placeholder="10-digit mobile"
                              className="flex-1 p-4 bg-[#F8F9FB] border-none rounded-2xl font-bold focus:ring-2 focus:ring-[#5A4BDA] transition-all placeholder:text-[#1A1A1A]/20"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30 mb-3 ml-1">Enter OTP</label>
                          <input 
                            type="text"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="6-digit OTP"
                            className="w-full p-5 bg-[#F8F9FB] border-none rounded-2xl focus:ring-2 focus:ring-[#5A4BDA] transition-all text-center text-3xl tracking-[0.5em] font-black placeholder:text-[#1A1A1A]/10"
                          />
                          <button 
                            type="button" 
                            onClick={() => setOtpSent(false)}
                            className="mt-4 text-xs font-black text-[#5A4BDA] hover:underline block mx-auto"
                          >
                            Change mobile number
                          </button>
                        </div>
                      )}
                      
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 rounded-2xl text-red-500 text-xs font-bold border border-red-100">
                          {error}
                        </motion.div>
                      )}
                      
                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 bg-[#1A1A1A] text-white rounded-2xl font-black hover:bg-[#5A4BDA] transition-all disabled:opacity-50 shadow-lg shadow-[#1A1A1A]/10 active:scale-95"
                      >
                        {loading ? 'Processing...' : (otpSent ? 'Verify OTP' : 'Get OTP')}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleTokenSubmit} className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30 mb-3 ml-1">Bearer Token</label>
                        <textarea 
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="Paste your token here..."
                          className="w-full h-40 p-5 bg-[#F8F9FB] border-none rounded-2xl font-medium focus:ring-2 focus:ring-[#5A4BDA] transition-all resize-none placeholder:text-[#1A1A1A]/20"
                        />
                      </div>
                      
                      {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-50 rounded-2xl text-red-500 text-xs font-bold border border-red-100">
                          {error}
                        </motion.div>
                      )}
                      
                      <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-5 bg-[#1A1A1A] text-white rounded-2xl font-black hover:bg-[#5A4BDA] transition-all disabled:opacity-50 shadow-lg shadow-[#1A1A1A]/10 active:scale-95"
                      >
                        {loading ? 'Verifying...' : 'Enter App'}
                      </button>
                    </form>
                  )}
                  
                  <div className="relative my-10">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#1A1A1A]/5"></div></div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-black text-[#1A1A1A]/20"><span className="bg-white px-4">Or</span></div>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      fetchStoredUsers();
                      setView('accounts');
                    }}
                    className="w-full py-4 text-[#5A4BDA] font-black text-sm hover:underline transition-all"
                  >
                    View Stored Accounts
                  </button>

                  <button 
                    type="button"
                    onClick={() => setView('batches')}
                    className="w-full py-4 text-[#1A1A1A]/40 font-black text-sm hover:text-[#5A4BDA] transition-all"
                  >
                    Continue as Guest
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'accounts' && (
              <motion.div 
                key="accounts"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div>
                  <h2 className="text-4xl font-black tracking-tight mb-2">Stored Accounts</h2>
                  <p className="text-[#1A1A1A]/40 font-medium">All users who have logged into this application.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {storedUsers.map((user) => (
                    <div key={user.mobile} className="bg-white p-6 rounded-[2rem] border border-[#1A1A1A]/5 shadow-sm">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-[#F8F9FB] rounded-full flex items-center justify-center">
                          <User size={24} className="text-[#5A4BDA]" />
                        </div>
                        <div>
                          <p className="font-black text-lg">{user.mobile}</p>
                          <p className="text-[10px] text-[#1A1A1A]/40 uppercase tracking-widest font-bold">
                            Last seen: {new Date(user.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {user.is_active ? 'Active Token' : 'Token Expired'}
                        </span>
                        {user.has_cache && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            Cached Batches
                          </span>
                        )}
                      </div>
                      {user.is_active && (
                        <button 
                          onClick={() => resumeSession(user.mobile)}
                          className="w-full mt-6 py-3 bg-[#5A4BDA] text-white rounded-xl font-black text-xs hover:bg-[#1A1A1A] transition-all shadow-lg shadow-[#5A4BDA]/20"
                        >
                          Login to this Account
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {view === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-2xl mx-auto"
              >
                <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-xl shadow-[#1A1A1A]/5 border border-[#1A1A1A]/5">
                  <div className="bg-gradient-to-br from-[#5A4BDA] to-[#1A1A1A] p-12 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="relative z-10 flex items-center gap-8">
                      <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/30 text-4xl font-black">
                        {profile?.firstName?.charAt(0) || profile?.name?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <h2 className="text-4xl font-black tracking-tight mb-2">{profile?.firstName || profile?.name || 'User'}</h2>
                        <p className="text-white/60 font-bold">{profile?.primaryNumber || mobile || 'No number'}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-12 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30">Email Address</p>
                        <p className="font-bold text-lg">{profile?.email || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30">Class / Grade</p>
                        <p className="font-bold text-lg">{profile?.profileId?.class || 'Not specified'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30">Parent Details</p>
                        <p className="font-bold text-lg">{profile?.profileId?.parentDetails || 'Not provided'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30">Organization ID</p>
                        <p className="font-bold text-lg font-mono text-xs">{profile?.organisationId || userOrgId || 'Default'}</p>
                      </div>
                    </div>
                    
                    {profile?.profileId?.address && (
                      <div className="pt-8 border-t border-[#1A1A1A]/5">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A]/30 mb-4">Address Information</p>
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(profile.profileId.address).map(([key, val]: [string, any]) => (
                            <div key={key} className="p-4 bg-[#F8F9FB] rounded-2xl">
                              <p className="text-[10px] font-black uppercase text-[#1A1A1A]/30 mb-1">{key.toUpperCase()}</p>
                              <p className="font-bold text-sm">{String(val)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'batches' && (
              <motion.div 
                key="batches"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-10"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-4xl font-black tracking-tight mb-2">My Batches</h2>
                    <p className="text-[#1A1A1A]/40 font-medium">You have {batches.length} batches available.</p>
                  </div>
                  <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A1A1A]/20 group-focus-within:text-[#5A4BDA] transition-colors" size={20} />
                    <input 
                      type="text" 
                      placeholder="Search batches..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 pr-6 py-4 bg-white border border-[#1A1A1A]/5 rounded-2xl focus:ring-4 focus:ring-[#5A4BDA]/10 focus:border-[#5A4BDA] transition-all w-full md:w-80 font-bold shadow-sm"
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {[1,2,3,4,5,6].map(i => (
                      <div key={i} className="h-80 bg-white animate-pulse rounded-[2rem] border border-[#1A1A1A]/5" />
                    ))}
                  </div>
                ) : filteredBatches.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {filteredBatches.map((batch) => (
                      <motion.div 
                        key={batch._id}
                        whileHover={{ y: -8, scale: 1.02 }}
                        onClick={() => handleBatchSelect(batch)}
                        className="group cursor-pointer bg-white rounded-[2rem] overflow-hidden border border-[#1A1A1A]/5 shadow-sm hover:shadow-2xl hover:shadow-[#5A4BDA]/10 transition-all duration-500"
                      >
                        <div className="aspect-[16/10] relative overflow-hidden">
                          <ImageWithFallback 
                            src={resolveImageUrl(batch.previewImage || batch.imageId || batch.bannerImage || batch.thumbnail)} 
                            alt={batch.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            fallbackText={batch.name}
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
                            <div className="w-16 h-16 bg-[#5A4BDA] rounded-full flex items-center justify-center text-white shadow-2xl shadow-[#5A4BDA]/40 transform scale-75 group-hover:scale-100 transition-transform duration-500">
                              <Play size={32} fill="currentColor" />
                            </div>
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A] via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity duration-500" />
                          <div className="absolute top-4 right-4">
                            <div className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 text-white text-[10px] font-black uppercase tracking-widest rounded-full">
                              Premium Batch
                            </div>
                          </div>
                        </div>
                        <div className="p-8">
                          <h3 className="font-black text-xl mb-3 line-clamp-1 group-hover:text-[#5A4BDA] transition-colors">{batch.name}</h3>
                          <p className="text-sm text-[#1A1A1A]/40 line-clamp-2 font-medium leading-relaxed">{batch.description}</p>
                          <div className="mt-6 pt-6 border-t border-[#1A1A1A]/5 flex items-center justify-between">
                            <span className="text-xs font-black text-[#1A1A1A]/30 uppercase tracking-widest">View Details</span>
                            <div className="w-10 h-10 bg-[#F8F9FB] rounded-xl flex items-center justify-center text-[#1A1A1A]/20 group-hover:bg-[#5A4BDA] group-hover:text-white transition-all">
                              <ChevronRight size={20} />
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-[#1A1A1A]/10">
                    <div className="w-24 h-24 bg-[#F8F9FB] rounded-full flex items-center justify-center mx-auto mb-6">
                      <Layers size={40} className="text-[#1A1A1A]/20" />
                    </div>
                    <h3 className="text-2xl font-black mb-2">No batches found</h3>
                    <p className="text-[#1A1A1A]/40 font-medium max-w-xs mx-auto">Try a different search term or check your connection.</p>
                  </div>
                )}
              </motion.div>
            )}

          {view === 'subjects' && (
            <motion.div 
              key="subjects"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-4xl font-black tracking-tight mb-2">{selectedBatch?.name}</h2>
                  <p className="text-[#1A1A1A]/40 font-medium">Select a subject to view its lectures.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {subjects.map((subject) => (
                  <motion.div 
                    key={subject._id}
                    whileHover={{ scale: 1.02, x: 4 }}
                    onClick={() => handleSubjectSelect(subject)}
                    className="group flex items-center gap-5 p-6 bg-white rounded-3xl cursor-pointer border border-[#1A1A1A]/5 hover:border-[#5A4BDA]/30 hover:shadow-xl hover:shadow-[#5A4BDA]/5 transition-all duration-300"
                  >
                    <div className="w-20 h-20 bg-[#F8F9FB] rounded-2xl flex items-center justify-center overflow-hidden group-hover:rotate-3 transition-transform">
                      <ImageWithFallback 
                        src={resolveImageUrl(subject.imageId || subject.thumbnail || subject.bannerImage)} 
                        alt={subject.subjectName} 
                        className="w-full h-full object-cover" 
                        fallbackText={subject.subjectName}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-lg group-hover:text-[#5A4BDA] transition-colors truncate">{subject.subjectName}</h3>
                      <p className="text-xs font-bold text-[#1A1A1A]/30 uppercase tracking-widest mt-1">View Lectures</p>
                    </div>
                    <div className="w-10 h-10 bg-[#F8F9FB] rounded-xl flex items-center justify-center text-[#1A1A1A]/20 group-hover:bg-[#5A4BDA] group-hover:text-white transition-all">
                      <ChevronRight size={20} />
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {view === 'contents' && (
            <motion.div 
              key="contents"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-4xl font-black tracking-tight mb-2">{selectedSubject?.subjectName}</h2>
                  <p className="text-[#1A1A1A]/40 font-medium">Lectures and study materials for this subject.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 bg-[#F8F9FB] p-1.5 rounded-2xl border border-[#1A1A1A]/5">
                  {(['videos', 'notes', 'notices', 'DppVideos', 'DppNotes', 'tests'] as ContentType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setContentType(type);
                        if (selectedBatch && selectedSubject) {
                          const batchId = selectedBatch._id || selectedBatch.id;
                          fetchContents(token, batchId!, selectedSubject._id, type);
                        }
                      }}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                        contentType === type 
                          ? 'bg-white text-[#5A4BDA] shadow-sm' 
                          : 'text-[#1A1A1A]/30 hover:text-[#1A1A1A]'
                      }`}
                    >
                      {type.replace('Dpp', 'DPP ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {contents.map((content) => (
                  <motion.div 
                    key={content._id}
                    whileHover={{ y: -4 }}
                    className="group bg-white rounded-[2rem] border border-[#1A1A1A]/5 hover:border-[#5A4BDA]/30 hover:shadow-xl hover:shadow-[#5A4BDA]/5 transition-all duration-300 overflow-hidden"
                  >
                    <div 
                      onClick={() => handleContentSelect(content)}
                      className="aspect-video bg-[#F8F9FB] relative cursor-pointer overflow-hidden"
                    >
                      <ImageWithFallback 
                        src={resolveImageUrl(content.thumbnail || content.image)} 
                        alt={content.topic} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        fallbackText={content.topic}
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-[#5A4BDA] shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                          {content.contentType === 'video' ? <Play size={28} fill="currentColor" /> : <FileText size={28} />}
                        </div>
                      </div>
                      {content.contentType === 'video' && (
                        <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-lg">
                          Video
                        </div>
                      )}
                    </div>
                    
                    <div className="p-6">
                      <h3 className="font-black text-lg group-hover:text-[#5A4BDA] transition-colors line-clamp-2 min-h-[3.5rem] leading-tight">
                        {content.topic}
                      </h3>
                      
                      <div className="mt-6 pt-6 border-t border-[#1A1A1A]/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            content.contentType === 'video' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                          }`}>
                            {content.contentType === 'video' ? <Video size={16} /> : <FileText size={16} />}
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/30">
                            {content.contentType}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const playbackUrl = getPlayerUrl(
                                content.url,
                                token,
                                content.parentId || selectedSubject?._id || '',
                                content.childId || selectedSubject?._id || ''
                              );
                              navigator.clipboard.writeText(playbackUrl);
                              alert('Playback URL copied to clipboard!');
                            }}
                            className="w-10 h-10 bg-[#F8F9FB] rounded-xl flex items-center justify-center text-[#1A1A1A]/20 hover:bg-[#5A4BDA]/10 hover:text-[#5A4BDA] transition-all"
                            title="Copy Playback URL"
                          >
                            <Key size={18} />
                          </button>
                          <button 
                            onClick={() => handleContentSelect(content)}
                            className="w-10 h-10 bg-[#F8F9FB] rounded-xl flex items-center justify-center text-[#1A1A1A]/20 group-hover:bg-[#5A4BDA] group-hover:text-white transition-all"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {contents.length === 0 && !loading && (
                <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-[#1A1A1A]/10">
                  <div className="w-24 h-24 bg-[#F8F9FB] rounded-full flex items-center justify-center mx-auto mb-6">
                    <Layers size={40} className="text-[#1A1A1A]/20" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">No {contentType} found</h3>
                  <p className="text-[#1A1A1A]/40 font-medium max-w-xs mx-auto">Try selecting a different category or check back later.</p>
                </div>
              )}
            </motion.div>
          )}

          {view === 'player' && selectedContent && (
            <motion.div 
              key="player"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              <div className="aspect-video bg-black rounded-[2.5rem] overflow-hidden shadow-2xl shadow-[#1A1A1A]/20 border border-[#1A1A1A]/5">
                {isPdf(selectedContent.url) ? (
                  <div className="w-full h-full flex flex-col">
                    <iframe 
                      src={getPdfProxyUrl(selectedContent.url)}
                      className="w-full h-full border-none bg-white"
                    />
                    <div className="p-4 bg-[#F8F9FB] border-t border-[#1A1A1A]/5 flex justify-between items-center">
                      <p className="text-xs font-bold text-[#1A1A1A]/40">PDF Viewer Proxy Active</p>
                      <button 
                        onClick={() => window.open(selectedContent.url, '_blank')}
                        className="text-[10px] font-black uppercase tracking-widest text-[#5A4BDA] hover:underline"
                      >
                        Direct Link Fallback
                      </button>
                    </div>
                  </div>
                ) : selectedContent.contentType === 'test' ? (
                  <QuizPlayer 
                    testId={selectedContent._id || selectedContent.childId || ""}
                    token={token}
                    title={selectedContent.topic}
                    onClose={() => setView('contents')}
                  />
                ) : (
                  <iframe 
                    src={getPlayerUrl(
                      selectedContent.url,
                      token,
                      selectedContent.parentId || selectedBatch?._id || '',
                      selectedContent.childId || selectedContent._id || ''
                    )}
                    className="w-full h-full border-0 rounded-[2.5rem]"
                    allow="autoplay; encrypted-media; fullscreen"
                    allowFullScreen
                    title={selectedContent.topic}
                  />
                )}
              </div>
              <div className="bg-white p-8 rounded-[2rem] border border-[#1A1A1A]/5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-[#5A4BDA]/10 text-[#5A4BDA] text-[10px] font-black uppercase tracking-widest rounded-lg">Now Playing</span>
                  <span className="text-[10px] font-bold text-[#1A1A1A]/30 uppercase tracking-widest">{selectedBatch?.name}</span>
                </div>
                <h2 className="text-3xl font-black mb-6 tracking-tight">{selectedContent.topic}</h2>
                
                <div className="mt-8 flex flex-wrap items-center gap-6 text-sm font-bold text-[#1A1A1A]/40">
                  <button 
                    onClick={() => {
                      const playbackUrl = getPlayerUrl(
                        selectedContent.url,
                        token,
                        selectedContent.parentId || selectedSubject?._id || '',
                        selectedContent.childId || selectedSubject?._id || ''
                      );
                      navigator.clipboard.writeText(playbackUrl);
                      alert('Full Playback Link copied!');
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#5A4BDA]/5 text-[#5A4BDA] rounded-xl hover:bg-[#5A4BDA]/10 transition-all"
                  >
                    <Key size={16} />
                    <span>Copy Playback Link</span>
                  </button>
                  <div className="flex items-center gap-2">
                    {isPdf(selectedContent.url) ? <FileText size={16} /> : <Video size={16} />}
                    <span>{isPdf(selectedContent.url) ? 'Study Material' : 'Video Lecture'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} />
                    <span>{selectedSubject?.subjectName}</span>
                  </div>
                  {isPdf(selectedContent.url) && (
                    <button 
                      onClick={() => window.open(selectedContent.url, '_blank')}
                      className="flex items-center gap-2 text-[#5A4BDA] hover:underline"
                    >
                      <Layers size={16} />
                      <span>Open in New Tab</span>
                    </button>
                  )}
                  {selectedContent.noteUrl && !isPdf(selectedContent.url) && (
                    <button 
                      onClick={() => window.open(getPdfProxyUrl(selectedContent.noteUrl), '_blank')}
                      className="flex items-center gap-2 text-[#5A4BDA] hover:underline"
                    >
                      <FileText size={16} />
                      <span>View Lecture Notes</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xl font-black tracking-tight">Up Next</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contents.filter(c => c._id !== selectedContent._id).slice(0, 4).map((content) => (
                    <div 
                      key={content._id}
                      onClick={() => handleContentSelect(content)}
                      className="flex items-center gap-4 p-4 bg-white rounded-2xl cursor-pointer border border-[#1A1A1A]/5 hover:border-[#5A4BDA]/30 transition-all"
                    >
                      <div className="w-16 h-10 bg-[#F8F9FB] rounded-lg overflow-hidden flex items-center justify-center text-[#1A1A1A]/20">
                        <ImageWithFallback 
                          src={resolveImageUrl(content.thumbnail || content.image)} 
                          alt={content.topic} 
                          className="w-full h-full object-cover"
                          fallbackText={content.topic}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{content.topic}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold text-[#1A1A1A]/30 uppercase tracking-widest">
                            Lecture
                          </p>
                          {content.noteUrl && (
                            <span className="w-1 h-1 bg-[#1A1A1A]/10 rounded-full" />
                          )}
                          {content.noteUrl && (
                            <p className="text-[10px] font-bold text-[#5A4BDA] uppercase tracking-widest">
                              Notes Available
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-md flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#5A4BDA]/10 rounded-full" />
            <div className="absolute inset-0 w-20 h-20 border-4 border-[#5A4BDA] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.2em] text-[#5A4BDA] animate-pulse">Loading Content</p>
        </div>
      )}
      </div>
    </div>
  );
}
