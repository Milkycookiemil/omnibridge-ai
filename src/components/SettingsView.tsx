import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Cloud, Sparkles, PenTool, LayoutTemplate,
  BatteryWarning, Bell, ChevronRight,
  Plus, ArrowRight, Zap, Check, X, Shield, Lock, TriangleAlert, Info, Mic, LogOut
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';

import { googleSignIn, getAccessToken, logout, getCurrentUser } from '../lib/auth';
import { exportAllNotesToFile } from '../lib/exporter';
import {
  getAnthropicKey, setAnthropicKey, getSummaryModel, setSummaryModel,
  summarizeTranscript, SUMMARY_MODELS,
} from '../lib/aiSummary';
import { usePreferences } from '../lib/preferences';

const DUMMY_DATA = {
  account: {
    name: "최동민", email: "gmail 연결됨",
    plan: "free",
    devices: [
      { name: "Galaxy Tab S9+", type: "tablet" },
      { name: "LG Gram 16", type: "laptop" }
    ],
    deviceLimit: 2,
    studyReport: { enabled: true, savedTime: "12:37" }
  },
  sync: {
    driveStatus: "connected", lastSync: "0.1초 전",
    storageUsed: 4.2, storageTotal: 15,
    deltaInterval: "실시간", backgroundSave: true
  },
  ai: {
    mode: "auto",
    summaryInterval: 30,
    semanticIndexing: true,
    mappingPrecision: "정밀"
  },
  note: {
    defaultWidth: 4,
    defaultColor: "#334155",
    infiniteZoom: true,
    pressure: true,
    recordQuality: "고음질",
    autoOcr: true
  },
  smart: { autoDetect: true, calendar: "Google Calendar 연결됨", barDuration: 5, taskPrecision: "정밀" },
  energy: { lowPower: false, warnHighPower: true, refreshRate: "가변 1~120Hz", bgSyncLimit: false },
  permissions: ["마이크", "저장소", "미디어", "알림", "전화", "Drive"]
};

type SettingGroup = 
  | 'account' 
  | 'sync' 
  | 'ai' 
  | 'note' 
  | 'smart' 
  | 'energy' 
  | 'notification' 
  | 'permission';

interface SettingsViewProps {
  onLogout: () => void;
  onShowLegal?: (doc: 'terms' | 'privacy') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onLogout, onShowLegal }) => {
  const [activeGroup, setActiveGroup] = useState<SettingGroup>('account');
  const currentEmail = getCurrentUser()?.email ?? null;
  const { notificationsEnabled, setNotificationsEnabled } = usePreferences();
  const [data, setData] = useState(DUMMY_DATA);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showEnergyToast, setShowEnergyToast] = useState(false);
  
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [showPermissionScreen, setShowPermissionScreen] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // AI 요약 BYOK 설정 상태
  const [apiKeyInput, setApiKeyInput] = useState(getAnthropicKey());
  const [summaryModel, setSummaryModelState] = useState(getSummaryModel());
  const [keySaved, setKeySaved] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const handleSaveKey = () => {
    setAnthropicKey(apiKeyInput);
    setKeySaved(true);
    window.setTimeout(() => setKeySaved(false), 2000);
  };

  const handleModelChange = (m: string) => {
    setSummaryModelState(m);
    setSummaryModel(m);
  };

  const handleTestKey = async () => {
    setAnthropicKey(apiKeyInput); // 테스트 전 현재 입력값 저장
    setTesting(true);
    setTestMsg(null);
    try {
      const pts = await summarizeTranscript('오늘 강의에서는 손익분기점과 고정비, 변동비의 개념을 다뤘다.');
      setTestMsg(pts.length ? '연결 성공 — 요약이 정상 생성됩니다.' : '응답은 왔지만 요약이 비어 있어요.');
    } catch (e) {
      setTestMsg((e as Error).message || '테스트에 실패했어요.');
    } finally {
      setTesting(false);
    }
  };

  const handleExportAll = async () => {
    try {
      const count = await exportAllNotesToFile();
      setExportMsg(count === 0 ? '내보낼 노트가 없어요.' : `노트 ${count}개를 .ob로 내보냈어요.`);
    } catch (e) {
      console.error(e);
      setExportMsg('내보내기에 실패했어요.');
    }
    window.setTimeout(() => setExportMsg(null), 2600);
  };
  
  useEffect(() => {
    getAccessToken().then(token => setIsSignedIn(!!token));
  }, []);
  
  const handleDriveConnect = async () => {
    try {
      if (isSignedIn) {
        await logout();
        setIsSignedIn(false);
      } else {
        const result = await googleSignIn();
        if (result?.accessToken) {
           setShowPermissionScreen(true);
        }
      }
    } catch (e) {
      console.error(e);
      alert("로그인에 실패했습니다.");
    }
  };
  
  const requestOSPermissions = async () => {
    setShowPermissionScreen(false);
    try {
       await navigator.mediaDevices.getUserMedia({ audio: true });
       setIsSignedIn(true);
    } catch (e) {
       console.error(e);
       setIsSignedIn(true);
    }
  };
  
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showList, setShowList] = useState(true);

  // Handle mobile drilldown
  const handleSelectGroup = (group: SettingGroup) => {
    setActiveGroup(group);
    if (isMobile) setShowList(false);
  };

  const handleAIModeChange = (mode: string) => {
    setData(prev => ({ ...prev, ai: { ...prev.ai, mode } }));
    if (mode === 'cloud' && data.energy.warnHighPower) {
      setShowEnergyToast(true);
      setTimeout(() => setShowEnergyToast(false), 5000); // 5 sec toast
    }
  };

  const SETTINGS_GROUPS: { id: SettingGroup; label: string; icon: React.FC<any>; dotColor: string }[] = [
    { id: 'account', label: '계정 & 구독', icon: User, dotColor: 'bg-blue-500' },
    { id: 'sync', label: '동기화 & 저장소', icon: Cloud, dotColor: 'bg-teal-500' },
    { id: 'ai', label: 'AI 엔진', icon: Sparkles, dotColor: 'bg-violet-500' },
    { id: 'note', label: '필기 & 녹음', icon: PenTool, dotColor: 'bg-slate-400' },
    { id: 'smart', label: '스마트 기능', icon: LayoutTemplate, dotColor: 'bg-rose-500' }, // coral
    { id: 'energy', label: '성능 & 배터리', icon: BatteryWarning, dotColor: 'bg-amber-500' },
    { id: 'notification', label: '알림', icon: Bell, dotColor: 'bg-slate-400' },
    { id: 'permission', label: '권한 & 정보', icon: Shield, dotColor: 'bg-slate-400' },
  ];

  return (
    <div className="w-full h-full flex bg-slate-50 relative overflow-hidden">
      
      {/* Left: Navigation List */}
      <AnimatePresence>
        {(!isMobile || showList) && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className={cn(
              "w-full md:w-[320px] lg:w-[380px] h-full border-r border-slate-200 bg-white flex flex-col pt-20 flex-shrink-0 z-10",
              isMobile && !showList ? "hidden" : "flex" 
            )}
          >
            <div className="px-6 py-4 mb-2">
              <h2 className="text-2xl font-bold text-slate-800">설정</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-1">
              {SETTINGS_GROUPS.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleSelectGroup(group.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left",
                    activeGroup === group.id 
                      ? "bg-slate-100/80 shadow-sm"
                      : "hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", group.dotColor)} />
                    <group.icon className={cn(
                      "w-5 h-5",
                      activeGroup === group.id ? "text-slate-800" : "text-slate-500"
                    )} />
                    <span className={cn(
                      "font-medium tracking-tight",
                      activeGroup === group.id ? "text-slate-900 font-bold" : "text-slate-600"
                    )}>
                      {group.label}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Right: Detailed Panels */}
      <AnimatePresence mode="wait">
        {(!isMobile || !showList) && (
          <motion.div 
            key={activeGroup}
            initial={{ opacity: 0, scale: 0.98, x: 10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.98, x: 10 }}
            transition={{ duration: 0.2 }}
            className="flex-1 h-full pt-16 md:pt-20 overflow-y-auto bg-slate-50 flex flex-col z-0 pb-32 relative"
          >
            <div className="max-w-2xl px-6 md:px-12 w-full py-8">
              
              {isMobile && (
                <button 
                  onClick={() => setShowList(true)}
                  className="mb-6 flex items-center gap-2 text-slate-500 font-medium"
                >
                  <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                     <ChevronRight className="w-4 h-4 rotate-180" />
                  </div>
                  목록으로 돌아가기
                </button>
              )}
              
              <div className="flex items-center gap-3 mb-8 pb-4 border-b border-slate-200">
                <div className={cn("w-3 h-3 rounded-full", SETTINGS_GROUPS.find(g => g.id === activeGroup)?.dotColor)} />
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  {SETTINGS_GROUPS.find(g => g.id === activeGroup)?.label}
                </h3>
              </div>
              
              {/* === 1. ACCOUNT === */}
              {activeGroup === 'account' && (
                <div className="space-y-8">
                  {/* Profile Section */}
                  <div className="bg-white p-6 justify-between flex items-center gap-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl shrink-0">
                        {(currentEmail ?? data.account.name).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-lg text-slate-800 truncate">{currentEmail ?? '게스트'}</h4>
                        <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5">
                           <span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block"/> {currentEmail ? 'Supabase 계정으로 로그인됨' : '게스트 모드'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={onLogout}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-rose-600 hover:bg-rose-50 hover:border-rose-200 transition-colors"
                    >
                      <LogOut className="w-4 h-4" /> 로그아웃
                    </button>
                  </div>
                  
                  {/* Subscription Plan — Free에 거의 모든 기능, Pro는 전문가/팀 전용 부가기능만 */}
                  <div>
                    <h5 className="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4 pl-2">현재 플랜</h5>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 rounded-2xl border-2 border-blue-500 bg-blue-50/30 p-5 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-bl-lg">현재 적용 중</div>
                        <div className="font-bold text-lg text-slate-900 mb-1">Free</div>
                        <p className="text-xs text-slate-500 mb-3 font-medium">거의 모든 기능을 무료로</p>
                        <div className="text-2xl font-bold text-blue-600 mb-4">$0 <span className="text-sm text-slate-400 font-medium">/월</span></div>
                        <ul className="text-xs font-medium text-slate-600 space-y-1.5">
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0"/> 필기 · 펜 5종 · 레이어</li>
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0"/> 멀티기기 실시간 미러링</li>
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0"/> 온디바이스 AI 전사 · 요약</li>
                          <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500 shrink-0"/> PDF · 슬라이드 필기</li>
                        </ul>
                      </div>
                      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 cursor-pointer hover:border-violet-300 hover:shadow-md transition-all">
                        <div className="font-bold text-lg text-slate-900 mb-1 flex items-center gap-2">Pro <Sparkles className="w-4 h-4 text-violet-500"/></div>
                        <p className="text-xs text-slate-500 mb-3 font-medium">전문가 · 팀을 위한 부가기능</p>
                        <div className="text-2xl font-bold text-slate-800 mb-4">$9.99 <span className="text-sm text-slate-400 font-medium">/월</span></div>
                        <ul className="text-xs font-medium text-slate-600 space-y-1.5">
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-violet-500 shrink-0"/> 연결 기기 무제한</li>
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-violet-500 shrink-0"/> Cloud 부스트 (고정밀 클라우드 요약)</li>
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-violet-500 shrink-0"/> 시맨틱 인덱싱 풀 액세스</li>
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-violet-500 shrink-0"/> 우선 지원</li>
                        </ul>
                      </div>
                      <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all opacity-70">
                        <div className="font-bold text-lg text-slate-900 mb-1">B2B</div>
                        <p className="text-xs text-slate-500 mb-3 font-medium">기업 및 학교 단체 플랜</p>
                        <div className="text-2xl font-bold text-slate-800 mb-4">문의</div>
                        <ul className="text-xs font-medium text-slate-600 space-y-1.5">
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-slate-400 shrink-0"/> 조직 관리 · SSO</li>
                          <li className="flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-slate-400 shrink-0"/> 단체 라이선스</li>
                        </ul>
                      </div>
                    </div>
                    {data.account.plan !== 'free' && (
                      <button
                        onClick={() => setData((prev) => ({ ...prev, account: { ...prev.account, plan: 'free' } }))}
                        className="mt-4 text-sm font-bold text-rose-500 hover:text-rose-600 hover:underline"
                      >
                        구독 해지
                      </button>
                    )}
                  </div>

                  {/* Devices */}
                  <div>
                    <div className="flex items-center justify-between pl-2 mb-4">
                       <h5 className="font-bold text-sm text-slate-400 uppercase tracking-wider">연결 기기 ({data.account.devices.length}/{data.account.deviceLimit})</h5>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      {data.account.devices.map((device, i) => (
                        <div key={i} className="px-5 py-4 flex items-center justify-between border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                {device.type === 'tablet' ? <LayoutTemplate className="w-5 h-5"/> : <Cloud className="w-5 h-5" />}
                             </div>
                             <div>
                               <p className="font-bold text-slate-800">{device.name}</p>
                               <p className="text-xs text-slate-400 mt-0.5 capitalize">{device.type}</p>
                             </div>
                          </div>
                        </div>
                      ))}
                      <button 
                        onClick={() => setShowUpgradeModal(true)}
                        className="p-4 flex items-center justify-center gap-2 text-sm font-bold text-blue-600 bg-slate-50/50 hover:bg-blue-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> 기기 추가
                      </button>
                    </div>
                  </div>
                  
                  {/* Study Report */}
                  <div className="bg-white p-6 justify-between flex items-center rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                      <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-1">AI 학습 분석 리포트</h4>
                      <p className="text-sm text-slate-500 font-medium">이번 달 절약한 복습 시간: <strong className="text-violet-600 ml-1">{data.account.studyReport.savedTime}</strong></p>
                    </div>
                    <Toggle isOn={data.account.studyReport.enabled} onToggle={() => setData(p => ({ ...p, account: { ...p.account, studyReport: { ...p.account.studyReport, enabled: !p.account.studyReport.enabled } } }))}/>
                  </div>
                </div>
              )}
              
              {/* === 2. SYNC & STORAGE === */}
              {activeGroup === 'sync' && (
                <div className="space-y-8">
                  <div className="bg-white p-6 justify-between flex items-center rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600">
                        <Cloud className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">Google Drive</h4>
                        <div className="flex items-center gap-1.5 text-sm font-medium transition-colors">
                           <span className={cn("w-2 h-2 rounded-full", isSignedIn ? "bg-teal-500" : "bg-slate-300")} /> 
                           <span className={isSignedIn ? "text-teal-600" : "text-slate-500"}>
                              {isSignedIn ? `연결됨 · ${data.sync.lastSync} 동기화` : '연결되지 않음'}
                           </span>
                        </div>
                      </div>
                    </div>
                    <button onClick={handleDriveConnect} className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors">
                       {isSignedIn ? '연결 해제' : '연결하기'}
                    </button>
                  </div>
                  
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h5 className="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4">저장소</h5>
                    <div className="flex justify-between text-sm font-bold mb-2">
                       <span className="text-slate-800">{data.sync.storageUsed}GB 사용</span>
                       <span className="text-slate-400">{data.sync.storageTotal}GB</span>
                    </div>
                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                       <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(data.sync.storageUsed / data.sync.storageTotal) * 100}%` }} />
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                     <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                       <div>
                         <h4 className="font-bold text-slate-800 mb-1">델타 동기화 주기</h4>
                         <p className="text-sm text-slate-500 font-medium">변경된 부분만 압축하여 동기화합니다</p>
                       </div>
                       <select className="bg-slate-100 border-none font-bold text-sm text-slate-800 rounded-lg py-2 px-3 focus:ring-2 focus:ring-teal-500 outline-none">
                         <option>실시간</option>
                         <option>1분</option>
                         <option>5분</option>
                       </select>
                     </div>
                     <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                         <h4 className="font-bold text-slate-800 mb-1">백그라운드 저장 (Zero-Loss)</h4>
                         <p className="text-sm text-slate-500 font-medium">비정상 종료 시에도 데이터를 보존합니다</p>
                       </div>
                       <Toggle isOn={data.sync.backgroundSave} onToggle={() => setData(p => ({ ...p, sync: { ...p.sync, backgroundSave: !p.sync.backgroundSave } }))} />
                     </div>
                     <div className="p-6 flex items-center justify-between bg-slate-50/50">
                        <div>
                         <h4 className="font-bold text-slate-800 mb-1">데이터 내보내기</h4>
                         <p className="text-sm text-slate-500 font-medium">
                           {exportMsg ?? '모든 노트를 .ob 파일로 저장 — 기기 간 완벽한 데이터 이동성'}
                         </p>
                       </div>
                       <button
                         onClick={handleExportAll}
                         className="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50 transition-colors shadow-sm"
                       >
                         전체 내보내기 (.ob)
                       </button>
                     </div>
                  </div>
                 </div>
              )}
              
              {/* === 3. AI ENGINE === */}
              {activeGroup === 'ai' && (
                <div className="space-y-8">
                  {/* AI 요약 (BYOK) — 사용자 본인 Claude API 키 */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                     <div className="flex items-center gap-2 mb-1">
                       <Sparkles className="w-4 h-4 text-violet-600" />
                       <h5 className="font-bold text-sm text-slate-800">AI 요약 (Claude · 내 키 사용)</h5>
                     </div>
                     <p className="text-sm text-slate-500 font-medium mb-4 leading-relaxed">
                       녹음 중 실시간 전사 내용을 Claude가 요약합니다. 본인 Anthropic API 키를 입력하면
                       브라우저에만 저장되며 요약 비용은 본인 키로 청구됩니다.{' '}
                       <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-violet-600 underline">키 발급받기</a>
                     </p>

                     <label className="block text-xs font-bold text-slate-500 mb-1.5">API 키</label>
                     <div className="flex gap-2 mb-4">
                       <input
                         type="password"
                         value={apiKeyInput}
                         onChange={(e) => setApiKeyInput(e.target.value)}
                         placeholder="sk-ant-..."
                         className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-violet-500/30"
                       />
                       <button
                         onClick={handleSaveKey}
                         className="whitespace-nowrap px-4 py-2 bg-violet-600 text-white font-bold rounded-lg text-sm hover:bg-violet-700 transition-colors"
                       >
                         {keySaved ? '저장됨 ✓' : '저장'}
                       </button>
                       <button
                         onClick={handleTestKey}
                         disabled={testing || !apiKeyInput.trim()}
                         className="whitespace-nowrap px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                       >
                         {testing ? '테스트 중…' : '테스트'}
                       </button>
                     </div>

                     <label className="block text-xs font-bold text-slate-500 mb-1.5">요약 모델</label>
                     <select
                       value={summaryModel}
                       onChange={(e) => handleModelChange(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 font-medium text-sm text-slate-800 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-violet-500/30"
                     >
                       {SUMMARY_MODELS.map((m) => (
                         <option key={m.id} value={m.id}>{m.label}</option>
                       ))}
                     </select>

                     {testMsg && (
                       <p className="text-sm mt-3 font-medium text-slate-600">{testMsg}</p>
                     )}
                  </div>

                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                     <h5 className="font-bold text-sm text-slate-400 uppercase tracking-wider mb-4">하이브리드 AI 모드</h5>
                     <div className="flex bg-slate-100 p-1.5 rounded-xl">
                       <button 
                         onClick={() => handleAIModeChange('npu')}
                         className={cn("flex-1 flex justify-center py-2.5 rounded-lg text-sm font-bold transition-all items-center gap-2", data.ai.mode === 'npu' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                       >
                         <Lock className="w-4 h-4"/> 프라이버시 (온디바이스)
                       </button>
                       <button 
                         onClick={() => handleAIModeChange('cloud')}
                         className={cn("flex-1 flex justify-center py-2.5 rounded-lg text-sm font-bold transition-all items-center gap-2", data.ai.mode === 'cloud' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                       >
                         <Zap className="w-4 h-4"/> 부스트 (Cloud)
                       </button>
                       <button 
                         onClick={() => handleAIModeChange('auto')}
                         className={cn("flex-1 flex justify-center py-2.5 rounded-lg text-sm font-bold transition-all items-center gap-2", data.ai.mode === 'auto' ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                       >
                         <Sparkles className="w-4 h-4"/> 자동 전환
                       </button>
                     </div>
                     <p className="text-sm text-slate-500 mt-4 leading-relaxed font-medium">
                        <strong>자동 모드</strong>는 인터넷 연결 상태와 배터리 잔량에 따라 온디바이스와 클라우드 AI를 유연하게 전환합니다.
                     </p>
                  </div>
                  
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                     <div className="p-6 border-b border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                           <div>
                             <h4 className="font-bold text-slate-800 mb-1">실시간 요약 생성 간격</h4>
                           </div>
                           <div className="font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-lg text-sm">{data.ai.summaryInterval} 초</div>
                        </div>
                        <input type="range" min="15" max="60" step="15" value={data.ai.summaryInterval} 
                          onChange={(e) => setData(p => ({ ...p, ai: { ...p.ai, summaryInterval: parseInt(e.target.value) } }))}
                          className="w-full accent-violet-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none" 
                        />
                        <div className="flex justify-between text-xs font-bold text-slate-400 mt-2">
                           <span>15초 (빠르게)</span>
                           <span>60초 (정확하게)</span>
                        </div>
                     </div>
                     <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <div>
                         <h4 className="font-bold text-slate-800 mb-1">시맨틱 인덱싱 활성화</h4>
                         <p className="text-sm text-slate-500 font-medium">필기와 음성 간 맥락적 검색을 지원</p>
                       </div>
                       <Toggle isOn={data.ai.semanticIndexing} onToggle={() => setData(p => ({ ...p, ai: { ...p.ai, semanticIndexing: !p.ai.semanticIndexing } }))} />
                     </div>
                     <div className="p-6 flex items-center justify-between bg-slate-50/50">
                        <div>
                         <h4 className="font-bold text-slate-800 mb-1">잉크-오디오 매핑 정밀도</h4>
                       </div>
                       <select 
                         value={data.ai.mappingPrecision} onChange={(e) => setData(p => ({ ...p, ai: { ...p.ai, mappingPrecision: e.target.value } }))}
                         className="bg-white border border-slate-200 font-bold text-sm text-slate-800 rounded-lg py-2 px-3 outline-none"
                       >
                         <option>표준</option>
                         <option>정밀</option>
                       </select>
                     </div>
                  </div>
                </div>
              )}
              
              {/* STATIC GROUPS */}
              {activeGroup === 'note' && (
                <div className="space-y-8">
                  {/* 펜 기본값 */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <h4 className="font-bold text-slate-800 mb-4">기본 펜 굵기</h4>
                      <div className="flex gap-3">
                        {[2, 4, 8].map(w => (
                          <button
                            key={w}
                            onClick={() => setData(p => ({ ...p, note: { ...p.note, defaultWidth: w } }))}
                            className={cn("flex-1 h-14 rounded-xl border flex items-center justify-center transition-all",
                              data.note.defaultWidth === w ? "border-slate-800 bg-slate-50 shadow-sm" : "border-slate-200 hover:border-slate-300")}
                          >
                            <div className="bg-slate-700 rounded-full" style={{ width: w + 4, height: w + 4 }} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-6">
                      <h4 className="font-bold text-slate-800 mb-4">기본 잉크 색상</h4>
                      <div className="flex gap-3">
                        {['#334155', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b'].map(c => (
                          <button
                            key={c}
                            onClick={() => setData(p => ({ ...p, note: { ...p.note, defaultColor: c } }))}
                            className={cn("w-9 h-9 rounded-full border-2 transition-all shadow-sm",
                              data.note.defaultColor === c ? "border-slate-400 scale-110" : "border-transparent hover:scale-105")}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 캔버스 & 녹음 옵션 */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">무한 줌 캔버스 엔진</h4>
                        <p className="text-sm text-slate-500 font-medium">화질 저하 없이 무한 확대/축소를 지원합니다.</p>
                      </div>
                      <Toggle isOn={data.note.infiniteZoom} onToggle={() => setData(p => ({ ...p, note: { ...p.note, infiniteZoom: !p.note.infiniteZoom } }))} />
                    </div>
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">필압 감지 (S펜 / Apple Pencil)</h4>
                        <p className="text-sm text-slate-500 font-medium">누르는 세기에 따라 획 굵기를 자연스럽게 표현합니다.</p>
                      </div>
                      <Toggle isOn={data.note.pressure} onToggle={() => setData(p => ({ ...p, note: { ...p.note, pressure: !p.note.pressure } }))} />
                    </div>
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">기본 녹음 품질</h4>
                        <p className="text-sm text-slate-500 font-medium">고음질일수록 용량이 커집니다.</p>
                      </div>
                      <select
                        value={data.note.recordQuality}
                        onChange={(e) => setData(p => ({ ...p, note: { ...p.note, recordQuality: e.target.value } }))}
                        className="bg-white border border-slate-200 font-bold text-sm text-slate-800 rounded-lg py-2 px-3 outline-none"
                      >
                        <option>표준 (64kbps)</option>
                        <option>고음질</option>
                      </select>
                    </div>
                    <div className="p-6 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">손글씨 자동 OCR 변환</h4>
                        <p className="text-sm text-slate-500 font-medium">필기를 검색 가능한 텍스트로 색인합니다.</p>
                      </div>
                      <Toggle isOn={data.note.autoOcr} onToggle={() => setData(p => ({ ...p, note: { ...p.note, autoOcr: !p.note.autoOcr } }))} />
                    </div>
                  </div>
                </div>
              )}
              {activeGroup === 'smart' && (
                <div className="space-y-8">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">AI 자동 일정 인식 (NER)</h4>
                        <p className="text-sm text-slate-500 font-medium max-w-xs">필기 중 한국어 개체명 인식으로 날짜·시험·과제를 감지합니다.</p>
                      </div>
                      <Toggle isOn={data.smart.autoDetect} onToggle={() => setData(p => ({ ...p, smart: { ...p.smart, autoDetect: !p.smart.autoDetect } }))} />
                    </div>
                    <div className="p-6 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">캘린더 연동</h4>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-teal-600">
                          <span className="w-2 h-2 rounded-full bg-teal-500" /> {data.smart.calendar}
                        </div>
                      </div>
                      <button className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-200 transition-colors">연결 관리</button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="font-bold text-slate-800 mb-1">알림 스낵바 표시 시간</h4>
                          <p className="text-sm text-slate-500 font-medium">감지 알림이 화면에 머무는 시간입니다.</p>
                        </div>
                        <div className="font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-lg text-sm">{data.smart.barDuration}초</div>
                      </div>
                      <input
                        type="range" min="3" max="10" step="1" value={data.smart.barDuration}
                        onChange={(e) => setData(p => ({ ...p, smart: { ...p.smart, barDuration: parseInt(e.target.value) } }))}
                        className="w-full accent-rose-500 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
                      />
                      <div className="flex justify-between text-xs font-bold text-slate-400 mt-2">
                        <span>3초 (짧게)</span><span>10초 (길게)</span>
                      </div>
                    </div>
                    <div className="p-6 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">태스크 바인딩 정밀도</h4>
                        <p className="text-sm text-slate-500 font-medium">필기 맥락과 일정 연결의 민감도입니다.</p>
                      </div>
                      <select
                        value={data.smart.taskPrecision}
                        onChange={(e) => setData(p => ({ ...p, smart: { ...p.smart, taskPrecision: e.target.value } }))}
                        className="bg-white border border-slate-200 font-bold text-sm text-slate-800 rounded-lg py-2 px-3 outline-none"
                      >
                        <option>표준</option>
                        <option>정밀</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
              {activeGroup === 'energy' && (
                <div className="space-y-8">
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3 items-start">
                    <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-800 mb-1">Energy Echo</h4>
                      <p className="text-sm text-amber-700/80 font-medium leading-relaxed">전력 소모를 실시간 추적해 온디바이스와 클라우드 AI 사용을 지능적으로 조절합니다.</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">저전력 모드</h4>
                        <p className="text-sm text-slate-500 font-medium">백그라운드 동기화 빈도를 낮춰 배터리를 아낍니다.</p>
                      </div>
                      <Toggle isOn={data.energy.lowPower} onToggle={() => setData(p => ({ ...p, energy: { ...p.energy, lowPower: !p.energy.lowPower } }))} />
                    </div>
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">부스트 모드 전환 경고</h4>
                        <p className="text-sm text-slate-500 font-medium max-w-xs">Cloud 부스트로 전환 시 전력 소모 경고를 표시합니다.</p>
                      </div>
                      <Toggle isOn={data.energy.warnHighPower} onToggle={() => setData(p => ({ ...p, energy: { ...p.energy, warnHighPower: !p.energy.warnHighPower } }))} />
                    </div>
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">화면 주사율</h4>
                        <p className="text-sm text-slate-500 font-medium">가변 주사율은 필기 지연과 전력의 균형을 맞춥니다.</p>
                      </div>
                      <select
                        value={data.energy.refreshRate}
                        onChange={(e) => setData(p => ({ ...p, energy: { ...p.energy, refreshRate: e.target.value } }))}
                        className="bg-white border border-slate-200 font-bold text-sm text-slate-800 rounded-lg py-2 px-3 outline-none"
                      >
                        <option>가변 1~120Hz</option>
                        <option>고정 60Hz</option>
                        <option>고정 120Hz</option>
                      </select>
                    </div>
                    <div className="p-6 flex items-center justify-between bg-slate-50/50">
                      <div>
                        <h4 className="font-bold text-slate-800 mb-1">충전 중에만 클라우드 백업</h4>
                        <p className="text-sm text-slate-500 font-medium">배터리 사용 중에는 드라이브 업로드를 미룹니다.</p>
                      </div>
                      <Toggle isOn={data.energy.bgSyncLimit} onToggle={() => setData(p => ({ ...p, energy: { ...p.energy, bgSyncLimit: !p.energy.bgSyncLimit } }))} />
                    </div>
                  </div>
                </div>
              )}
               {activeGroup === 'notification' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                     <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
                           <Bell className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 mb-1">일정 감지 알림</h4>
                          <p className="text-sm text-slate-500 font-medium leading-snug max-w-xs">필기 중 AI가 날짜·일정을 감지하면 비침습적 스낵바로 안내합니다.</p>
                        </div>
                     </div>
                     <Toggle isOn={notificationsEnabled} onToggle={() => setNotificationsEnabled(!notificationsEnabled)} />
                  </div>
                  <div className="p-6 flex items-center justify-between bg-slate-50/50">
                     <div>
                       <h4 className="font-bold text-slate-800 mb-1">AI 요약 완료 푸시</h4>
                       <p className="text-sm text-slate-500 font-medium">실시간 요약 카드가 생성되면 알려줍니다.</p>
                     </div>
                     <Toggle isOn={notificationsEnabled} onToggle={() => setNotificationsEnabled(!notificationsEnabled)} />
                  </div>
                </div>
              )}
               {activeGroup === 'permission' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4 mx-auto">
                     <Shield className="w-8 h-8" />
                  </div>
                  <h4 className="text-lg font-bold text-slate-800 mb-2">권한 및 앱 정보</h4>
                  <p className="text-slate-500 mb-6 max-w-sm text-sm mx-auto">허용된 기기 권한을 확인하고 다크/라이트 테마를 변경합니다.</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto">
                     {data.permissions.map(p => (
                       <span key={p} className="px-2.5 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded">
                         {p}
                       </span>
                     ))}
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-4 text-sm font-medium">
                     <button onClick={() => onShowLegal?.('terms')} className="text-slate-500 hover:text-slate-800 underline">
                       이용약관
                     </button>
                     <span className="text-slate-300">·</span>
                     <button onClick={() => onShowLegal?.('privacy')} className="text-slate-500 hover:text-slate-800 underline">
                       개인정보처리방침
                     </button>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* --- Overlay Modals & Toasts --- */}
      
      {/* 1. Energy Echo Toast */}
      <AnimatePresence>
        {showEnergyToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 shadow-xl rounded-2xl p-4 w-[90%] max-w-md z-50 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <TriangleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-amber-900 leading-snug">부스트 모드는 전력 소모가 큽니다.</h4>
                <p className="text-sm font-medium text-amber-700/80 mt-1">백그라운드에서 지속적인 Cloud AI 통신이 발생합니다.</p>
              </div>
              <button onClick={() => setShowEnergyToast(false)} className="p-1 rounded-full text-amber-500 hover:bg-amber-100">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="flex justify-end pt-2 border-t border-amber-200/50">
               <label className="flex items-center gap-2 text-sm font-bold text-amber-800 cursor-pointer">
                 <input type="checkbox" className="accent-amber-500 rounded" 
                   onChange={(e) => setData(p => ({ ...p, energy: { ...p.energy, warnHighPower: !e.target.checked } }))}
                 />
                 다시 표시 안 함
               </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* 2. Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
               {/* Modal Header */}
               <div className="bg-slate-50 p-6 flex items-start justify-between border-b border-slate-200">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                       <Info className="w-5 h-5"/>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">기기 추가 안내</h3>
                      <p className="text-slate-500 font-medium text-sm">지금 무료로 2대를 사용 중이에요.</p>
                    </div>
                 </div>
                 <button onClick={() => setShowUpgradeModal(false)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors">
                   <X className="w-5 h-5" />
                 </button>
               </div>
               
               {/* Modal Body */}
               <div className="p-6">
                 <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 text-center space-y-2">
                    <p className="text-slate-700 font-medium leading-relaxed">
                      지금 <strong>무료로 2대</strong>를 쓰고 있어요. 3대 이상 연결은 <strong className="text-blue-600">Pro</strong>에서 가능합니다.
                    </p>
                 </div>
                 
                 <div className="rounded-2xl border-2 border-blue-500 p-5 bg-blue-50/20 relative overflow-hidden group cursor-pointer hover:bg-blue-50/50 transition-colors">
                    <div className="absolute top-0 right-0 px-4 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-bl-lg">추천</div>
                    <div className="flex items-center gap-2 mb-2">
                       <h4 className="font-bold text-xl text-slate-900">Pro 업그레이드</h4>
                       <Sparkles className="w-4 h-4 text-violet-500" />
                    </div>
                    <ul className="text-sm font-medium text-slate-600 space-y-2 mb-4">
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500"/> 연결 기기 개수 <strong>무제한</strong></li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500"/> 무제한 Cloud 부스트 AI 모드</li>
                      <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500"/> 시맨틱 인덱싱 풀 접근권</li>
                    </ul>
                    <button className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-colors">
                      지금 업그레이드하기
                    </button>
                 </div>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Permission Explanatory Modal */}
      <AnimatePresence>
        {showPermissionScreen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.95, y: -20 }} 
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative border border-slate-200"
            >
               <div className="bg-slate-50 border-b border-slate-100 p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                     <Shield className="w-8 h-8 text-blue-600" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 tracking-tight">서비스 이용을 위한 권한 안내</h2>
                  <p className="text-sm font-medium text-slate-500 mt-2">안전하고 원활한 사용을 위해 꼭 필요한 권한만 요청합니다.</p>
               </div>
               <div className="p-6 space-y-6">
                  <div className="flex gap-4 items-start">
                     <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center shrink-0">
                        <Mic className="w-5 h-5 text-rose-500" />
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 mb-1">마이크 (오디오 녹음)</h4>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">강의 음성 녹음용. 로컬 환경에서만 처리되며 절대로 외부 서버에 임의 전송되지 않습니다.</p>
                     </div>
                  </div>
                  <div className="flex gap-4 items-start">
                     <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Cloud className="w-5 h-5 text-emerald-500" />
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 mb-1">Google Drive 연동</h4>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed">노트를 내 Google Drive로 내보내 백업하는 선택 기능입니다. 기본 저장은 계정 클라우드에 자동으로 됩니다.</p>
                     </div>
                  </div>
               </div>
               
               <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                  <button onClick={() => setShowPermissionScreen(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 bg-slate-200/50 transition-colors rounded-xl text-sm">
                     취소
                  </button>
                  <button onClick={requestOSPermissions} className="flex-[2] py-3 text-white font-bold bg-blue-600 hover:bg-blue-700 transition-colors rounded-xl shadow-sm text-sm">
                     확인 및 권한 허용하러 가기
                  </button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

// Reusable Toggle Component
function Toggle({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <div 
      onClick={onToggle}
      className={cn(
        "w-12 h-6 rounded-full cursor-pointer transition-colors relative flex items-center shrink-0 border",
        isOn ? "bg-teal-500 border-teal-600" : "bg-slate-200 border-slate-300"
      )}
    >
      <motion.div 
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={cn(
          "w-3 h-3 rounded-full bg-white shadow-sm mx-1",
          isOn ? "translate-x-6" : "translate-x-0"
        )}
      />
    </div>
  );
}
