import React, { useState } from 'react';
import { ViewState } from '../types';
import { dummyData } from '../data';
import { Search, Hash, ArrowRight, AudioLines } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SearchViewProps {
  onNavigate: (view: ViewState, context?: any) => void;
}

export function SearchView({ onNavigate }: SearchViewProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = (q: string) => {
    setQuery(q);
    if (!q) {
      setShowResults(false);
      return;
    }
    
    setIsSearching(true);
    // Simulate AI processing time
    setTimeout(() => {
      setIsSearching(false);
      setShowResults(true);
    }, 800);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-32">
      <h1 className="text-3xl font-bold tracking-tight mb-8 text-slate-900">무엇을 찾으시나요?</h1>
      
      {/* Search Input */}
      <div className="relative mb-8 group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="w-6 h-6 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
        </div>
        <input 
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="예) 교수님이 9블록 강조한 부분"
          className="w-full bg-white border border-slate-200 pl-14 pr-4 py-5 rounded-2xl text-lg text-slate-800 font-medium focus:outline-none focus:border-blue-400 focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all shadow-sm"
        />
        
        <AnimatePresence>
          {isSearching && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none"
            >
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {!showResults && !isSearching ? (
          <motion.div 
            key="suggestions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h3 className="text-sm font-bold text-slate-400 mb-4">추천 검색어</h3>
            <div className="flex flex-wrap gap-2">
              {dummyData.searchSuggestions.map(s => (
                <button 
                  key={s}
                  onClick={() => handleSearch(s)}
                  className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 text-slate-700 shadow-sm"
                >
                  <Search className="w-4 h-4 text-slate-400" /> {s}
                </button>
              ))}
            </div>
            
            <h3 className="text-sm font-bold text-slate-400 mb-4 mt-8 flex items-center gap-2">
              <Hash className="w-4 h-4" /> 많이 찾는 태그
            </h3>
            <div className="flex flex-wrap gap-2">
              {dummyData.aiInsights.tags.map(tag => (
                <button 
                  key={tag}
                  onClick={() => handleSearch(tag)}
                  className="bg-violet-50 text-violet-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-100 hover:bg-violet-100 transition-all shadow-sm"
                >
                  {tag}
                </button>
              ))}
            </div>
          </motion.div>
        ) : showResults ? (
          <motion.div 
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-400 mb-4">시맨틱 매칭 결과</h3>
            
            {/* Mock Result Card */}
            <div 
              onClick={() => onNavigate('replay', { inkGroup: 'ink-1' })}
              className="bg-white border border-slate-200 p-5 rounded-2xl cursor-pointer hover:bg-slate-50 hover:border-blue-300 transition-all group relative overflow-hidden shadow-sm hover:shadow-md"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:bg-blue-100 transition-colors" />
              
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center p-2 relative overflow-hidden shrink-0">
                  {/* Mock thumbnail of ink */}
                  <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
                  <svg viewBox="0 0 100 100" className="w-full h-full opacity-60">
                    <path d="M 10 30 Q 50 20, 90 30" stroke="#F59E0B" strokeWidth="4" fill="none" />
                    <rect x="20" y="40" width="60" height="40" stroke="#94a3b8" strokeWidth="2" fill="none" opacity="0.8"/>
                    <circle cx="50" cy="60" r="10" fill="#94a3b8" opacity="0.4"/>
                  </svg>
                </div>
                
                <div className="flex-1 flex flex-col justify-center text-slate-800">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-500 mb-1">
                    <AudioLines className="w-3 h-3" /> 00:30 구간
                  </div>
                  <h4 className="text-lg font-bold mb-2 text-slate-900">BMC 9블록의 전체 구조 개요</h4>
                  
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-xs font-medium text-amber-600 w-fit">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> 
                    강조 어조 ↑ · 필기 밀도 ↑ 교집합
                  </div>
                </div>
                
                <div className="absolute top-1/2 right-6 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
            
             <div 
              onClick={() => onNavigate('replay', { inkGroup: 'ink-3' })}
              className="bg-white border border-slate-200 p-5 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all group opacity-75 hover:opacity-100 shadow-sm"
            >
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col justify-center">
                  <div className="text-xs font-mono font-bold text-slate-400 mb-1">
                    12:30 구간
                  </div>
                  <h4 className="font-bold mb-1 text-slate-900">수익원: 무료 → 프로 구독 전환 트리거</h4>
                  <p className="text-xs text-slate-500">관련 키워드 매칭</p>
                </div>
              </div>
            </div>

          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
