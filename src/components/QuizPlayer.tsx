import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Trophy, 
  RotateCcw,
  Loader2,
  AlertCircle
} from 'lucide-react';

interface Question {
  _id: string;
  question: string;
  options: {
    _id: string;
    text: string;
    isCorrect: boolean;
  }[];
  explanation?: string;
  type: string;
}

interface QuizPlayerProps {
  testId: string;
  token: string;
  title: string;
  onClose: () => void;
}

export const QuizPlayer: React.FC<QuizPlayerProps> = ({ testId, token, title, onClose }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [startTime] = useState(Date.now());
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/tests/${testId}/questions?token=${token}`);
        const data = await response.json();
        
        if (data.data && Array.isArray(data.data)) {
          // Map PW question format to our format
          const mappedQuestions = data.data.map((q: any) => ({
            _id: q._id,
            question: q.question,
            options: q.options.map((opt: any) => ({
              _id: opt._id,
              text: opt.text,
              isCorrect: opt.isCorrect
            })),
            explanation: q.explanation,
            type: q.type
          }));
          setQuestions(mappedQuestions);
          // Set timer if test has duration (mocking 30 mins if not provided)
          setTimeLeft(30 * 60); 
        } else {
          throw new Error('No questions found for this test.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load questions');
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [testId, token]);

  useEffect(() => {
    if (timeLeft > 0 && !showResults) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && !showResults && questions.length > 0) {
      setShowResults(true);
    }
  }, [timeLeft, showResults, questions.length]);

  const handleOptionSelect = (optionIndex: number) => {
    if (showResults) return;
    setSelectedOptions(prev => ({
      ...prev,
      [currentQuestionIndex]: optionIndex
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, index) => {
      const selectedIdx = selectedOptions[index];
      if (selectedIdx !== undefined && q.options[selectedIdx].isCorrect) {
        correct++;
      }
    });
    return correct;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-white rounded-[2.5rem] border border-[#1A1A1A]/5">
        <Loader2 className="w-12 h-12 text-[#5A4BDA] animate-spin mb-4" />
        <p className="text-[#1A1A1A]/40 font-black uppercase tracking-widest text-xs">Preparing Quiz...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-white rounded-[2.5rem] border border-[#1A1A1A]/5 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-black mb-2">Failed to load Quiz</h3>
        <p className="text-[#1A1A1A]/40 font-medium mb-8">{error}</p>
        <button 
          onClick={onClose}
          className="px-8 py-3 bg-[#5A4BDA] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:shadow-xl hover:shadow-[#5A4BDA]/20 transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    const total = questions.length;
    const percentage = Math.round((score / total) * 100);

    return (
      <div className="bg-white rounded-[2.5rem] border border-[#1A1A1A]/5 overflow-hidden shadow-2xl">
        <div className="p-12 text-center">
          <div className="w-24 h-24 bg-[#5A4BDA]/10 rounded-full flex items-center justify-center mx-auto mb-8">
            <Trophy className="w-12 h-12 text-[#5A4BDA]" />
          </div>
          <h2 className="text-4xl font-black mb-2 tracking-tight">Quiz Completed!</h2>
          <p className="text-[#1A1A1A]/40 font-medium mb-12">Here's how you performed in {title}</p>
          
          <div className="grid grid-cols-3 gap-6 mb-12">
            <div className="p-6 bg-[#F8F9FB] rounded-3xl">
              <div className="text-3xl font-black text-[#5A4BDA] mb-1">{score}/{total}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/30">Score</div>
            </div>
            <div className="p-6 bg-[#F8F9FB] rounded-3xl">
              <div className="text-3xl font-black text-[#5A4BDA] mb-1">{percentage}%</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/30">Accuracy</div>
            </div>
            <div className="p-6 bg-[#F8F9FB] rounded-3xl">
              <div className="text-3xl font-black text-[#5A4BDA] mb-1">{formatTime(Math.floor((Date.now() - startTime) / 1000))}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/30">Time Taken</div>
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={() => {
                setShowResults(false);
                setCurrentQuestionIndex(0);
                setSelectedOptions({});
              }}
              className="w-full py-4 bg-[#5A4BDA] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:shadow-xl hover:shadow-[#5A4BDA]/20 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Retake Quiz
            </button>
            <button 
              onClick={onClose}
              className="w-full py-4 bg-[#F8F9FB] text-[#1A1A1A]/60 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-[#F0F2F5] transition-all"
            >
              Back to Lectures
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];

  return (
    <div className="bg-white rounded-[2.5rem] border border-[#1A1A1A]/5 overflow-hidden shadow-2xl flex flex-col h-[700px]">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#1A1A1A]/5 flex items-center justify-between bg-[#F8F9FB]/50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-white border border-[#1A1A1A]/5 flex items-center justify-center text-[#1A1A1A]/40 hover:text-[#5A4BDA] transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <h3 className="font-black text-sm tracking-tight line-clamp-1">{title}</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]/30">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-[#1A1A1A]/5 shadow-sm">
          <Clock size={16} className="text-[#5A4BDA]" />
          <span className="font-black text-xs tabular-nums">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-[#F8F9FB]">
        <motion.div 
          className="h-full bg-[#5A4BDA]"
          initial={{ width: 0 }}
          animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Area */}
      <div className="flex-1 overflow-y-auto p-8 md:p-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-xl md:text-2xl font-bold text-[#1A1A1A] leading-relaxed" dangerouslySetInnerHTML={{ __html: currentQuestion.question }} />
            
            <div className="grid grid-cols-1 gap-4">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedOptions[currentQuestionIndex] === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleOptionSelect(idx)}
                    className={`group p-6 rounded-3xl border-2 text-left transition-all duration-300 flex items-center justify-between ${
                      isSelected 
                        ? 'border-[#5A4BDA] bg-[#5A4BDA]/5 shadow-lg shadow-[#5A4BDA]/5' 
                        : 'border-[#F8F9FB] bg-[#F8F9FB]/50 hover:border-[#5A4BDA]/20 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs transition-colors ${
                        isSelected ? 'bg-[#5A4BDA] text-white' : 'bg-white text-[#1A1A1A]/20 group-hover:text-[#5A4BDA]'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </div>
                      <span className={`font-bold transition-colors ${isSelected ? 'text-[#1A1A1A]' : 'text-[#1A1A1A]/60'}`} dangerouslySetInnerHTML={{ __html: option.text }} />
                    </div>
                    {isSelected && <CheckCircle2 size={20} className="text-[#5A4BDA]" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-8 py-6 border-t border-[#1A1A1A]/5 flex items-center justify-between bg-[#F8F9FB]/50">
        <button
          onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
          disabled={currentQuestionIndex === 0}
          className="px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] text-[#1A1A1A]/40 hover:text-[#1A1A1A] disabled:opacity-30 transition-colors"
        >
          Previous
        </button>
        
        {currentQuestionIndex === questions.length - 1 ? (
          <button
            onClick={() => setShowResults(true)}
            className="px-8 py-3 bg-[#5A4BDA] text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:shadow-xl hover:shadow-[#5A4BDA]/20 transition-all"
          >
            Finish Quiz
          </button>
        ) : (
          <button
            onClick={() => setCurrentQuestionIndex(prev => Math.min(questions.length - 1, prev + 1))}
            className="px-8 py-3 bg-[#1A1A1A] text-white rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-black transition-all flex items-center gap-2"
          >
            Next Question
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
