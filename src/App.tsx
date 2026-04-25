/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from "react";
import { 
  Send, BookOpen, MessageCircle, Settings2, Sparkles, User, Bot, Loader2, 
  ChevronRight, BrainCircuit, NotebookTabs, Home, GraduationCap, Languages,
  Trash2, Plus, LayoutDashboard, Cpu, CheckCircle2, Circle, Volume2, VolumeX,
  X, ChevronLeft
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";

// --- Constants ---
const AVAILABLE_SUBJECTS = [
  "Mathematics", "Physics", "Chemistry", "Biology", 
  "Computer Science", "Aviation Technology", "Agriculture"
];

const GREETINGS: Record<string, string> = {
  "Mixed (Sheng/English)": "Sema! I am Mwalimu AI. Ready to dive into some STEM concepts today? Tuchambue pamoja!",
  "Formal Swahili": "Hujambo! Mimi ni Mwalimu AI. Je, uko tayari kusoma leo? Tuchambue dhana hizi pamoja!",
  "Pure English": "Hello! I am Mwalimu AI. Ready to dive into some STEM concepts today? Let's explore together!"
};

// --- Types ---
type Page = "home" | "tutor" | "notes";

interface Profile {
  name: string;
  educationLevel: string;
  specificLevel: string;
  languageMix: string;
  subjects: string[];
  studyHours: number;
  studyMinutes: number;
}

interface Note {
  id: string;
  subject: string;
  topic: string;
  content: string;
  date: string;
}

interface Message {
  role: "user" | "ai";
  text: string;
}

// --- AI Setup removed (now handled on server for security) ---

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("home");
  const [profile, setProfile] = useState<Profile>(() => {
    const saved = localStorage.getItem("mwalimu_profile");
    return saved ? JSON.parse(saved) : {
      name: "name",
      educationLevel: "Secondary",
      specificLevel: "Form 4",
      languageMix: "Mixed (Sheng/English)",
      subjects: ["Physics"],
      studyHours: 1,
      studyMinutes: 30
    };
  });

  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem("mwalimu_notes");
    return saved ? JSON.parse(saved) : [];
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tutorMode, setTutorMode] = useState<"selection" | "lesson" | "question">("selection");
  const [lastNote, setLastNote] = useState<{ topic: string, content: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [questionLog, setQuestionLog] = useState<number[]>([]);

  // Stop current speech
  const stopSpeech = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  // Initialize first message based on language
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ role: "ai", text: GREETINGS[profile.languageMix] || GREETINGS["Mixed (Sheng/English)"] }]);
    }
  }, []);

  // Update greeting when mode or language changes
  useEffect(() => {
    if (tutorMode === "selection") {
      setMessages([{ role: "ai", text: GREETINGS[profile.languageMix] || GREETINGS["Mixed (Sheng/English)"] }]);
    } else if (tutorMode === "lesson") {
      setMessages([{ role: "ai", text: `Ready for your ${profile.subjects[0]} lesson! What topic should we tackle?` }]);
    } else if (tutorMode === "question") {
      setMessages([{ role: "ai", text: `Ask me anything about ${profile.subjects[0]}. I'll give you the facts and the background context.` }]);
    }
    setLastNote(null);
  }, [tutorMode, profile.languageMix, profile.subjects]);

  // TTS Helper
  const speak = (text: string) => {
    if (!audioEnabled || !("speechSynthesis" in window)) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const cleanText = text.replace(/#|🧊|🚌|🌍|🎯|\[NOTE\].*?\[\/NOTE\]/gs, "").trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Normal rate, but we'll try to be clear
    utterance.rate = 0.95;
    utterance.pitch = 1;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem("mwalimu_profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("mwalimu_notes", JSON.stringify(notes));
  }, [notes]);

  // --- Handlers ---
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    // Rate limiting for questions during a lesson
    if (tutorMode === "lesson" && messages.length > 2) {
      const now = Date.now();
      const fiveMinsAgo = now - 5 * 60 * 1000;
      const recentQuestions = questionLog.filter(ts => ts > fiveMinsAgo);
      
      if (recentQuestions.length >= 5) {
        setMessages(prev => [...prev, { 
          role: "ai", 
          text: "Let's pause the questions for a moment, rafiki! You've asked 5 questions in the last 5 minutes. Let's focus on the lesson content first so we stay on track! Sawa?" 
        }]);
        setLoading(false);
        return;
      }
      setQuestionLog(prev => [...prev, now]);
    }

    const currentInput = input;
    const userMsg: Message = { role: "user", text: currentInput };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: currentInput, profile, tutorMode })
      });

      if (!response.ok) {
        const errorData = await response.json();
        const customErr = new Error(errorData.error || "Failed to get AI response") as any;
        customErr.details = errorData.details;
        customErr.suggestion = errorData.suggestion;
        throw customErr;
      }

      const data = await response.json();
      const responseText = data.text || "";
      
      const noteMatch = responseText.match(/\[NOTE\](.*?)\[\/NOTE\]/s);
      if (noteMatch && tutorMode === "lesson") {
        const noteContent = noteMatch[1].trim();
        setLastNote({ topic: currentInput, content: noteContent });
      }

      const cleanText = responseText.replace(/\[NOTE\].*?\[\/NOTE\]/gs, "").trim();
      setMessages((prev) => [...prev, { role: "ai", text: cleanText }]);
      
      // Audio for lesson mode
      if (tutorMode === "lesson") {
        speak(cleanText);
      }
    } catch (err: any) {
      console.error(err);
      let errorMsg = err.message || "Pole sana rafiki, nimepata error kidogo. Let's try again!";
      if (err.details) {
        errorMsg += ` (${err.details}: ${err.suggestion || ""})`;
      }
      setMessages((prev) => [...prev, { role: "ai", text: errorMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const createNoteFromLast = () => {
    if (lastNote) {
      const newNote: Note = {
        id: Math.random().toString(36).substr(2, 9),
        subject: profile.subjects[0] || "General Science",
        topic: lastNote.topic.slice(0, 30) + (lastNote.topic.length > 30 ? "..." : ""),
        content: lastNote.content,
        date: new Date().toLocaleDateString()
      };
      setNotes((prev: Note[]) => [newNote, ...prev]);
      setLastNote(null);
    }
  };

  const toggleSubject = (sub: string) => {
    setProfile(prev => ({ ...prev, subjects: [sub] }));
  };

  // --- UI Components ---
  const Sidebar = () => (
    <aside className="w-64 glass-heavy border-r border-white/40 h-screen sticky top-0 hidden md:flex flex-col p-6 z-50">
      <div className="flex items-center gap-3 mb-12">
        <div className="bg-gradient-to-br from-cyan-400 to-blue-600 p-2 rounded-xl shadow-lg">
          <Cpu className="text-white w-6 h-6" />
        </div>
        <h1 className="text-xl font-display font-bold text-slate-800">Mwalimu AI</h1>
      </div>

      <nav className="flex-1 space-y-2">
        {[
          { icon: LayoutDashboard, label: "Home", id: "home" },
          { icon: BrainCircuit, label: "AI Tutor", id: "tutor" },
          { icon: NotebookTabs, label: "Notes", id: "notes" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id as Page)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-bold text-sm cursor-pointer ${
              currentPage === item.id 
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-200" 
                : "text-slate-500 hover:bg-white/50"
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-white/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full glacier-grad flex items-center justify-center text-white font-bold">
            {profile.name[0]}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold truncate">{profile.name}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{profile.specificLevel}</p>
          </div>
        </div>
      </div>
    </aside>
  );

  const BottomNav = () => (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/40 backdrop-blur-2xl border border-white/40 px-6 py-3 rounded-full shadow-2xl flex items-center gap-10 z-50 md:hidden">
      {[
        { icon: Home, label: "Home", id: "home" },
        { icon: BrainCircuit, label: "Tutor", id: "tutor" },
        { icon: NotebookTabs, label: "Notes", id: "notes" },
      ].map(item => (
        <button 
          key={item.id}
          onClick={() => setCurrentPage(item.id as Page)}
          className={`flex flex-col items-center gap-1 transition-all cursor-pointer ${currentPage === item.id ? "text-cyan-600 scale-110" : "text-slate-500 hover:text-cyan-400"}`}
        >
          <item.icon size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F0F9FF] text-slate-800 font-sans selection:bg-cyan-100 relative overflow-hidden flex">
      {/* Background Glacier Decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-cyan-200/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-200/20 blur-[120px] rounded-full pointer-events-none" />

      {currentPage !== "tutor" && <Sidebar />}
      
      <main className={`flex-1 h-screen flex flex-col relative z-20 overflow-hidden ${currentPage === "tutor" ? "w-full" : ""}`}>
        <AnimatePresence mode="wait">
          {currentPage === "home" && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 overflow-y-auto p-6 md:p-12 pb-32 space-y-12 scrollbar-hide w-full"
            >
              <header>
                <div className="flex items-center gap-6 mb-4">
                  <div className="w-20 h-20 rounded-3xl glacier-grad flex items-center justify-center shadow-2xl shadow-cyan-200">
                    <User className="text-white w-10 h-10" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-display font-bold">Jambo, {profile.name}!</h1>
                    <p className="text-slate-500 font-medium">Welcome back to your glacier learning space.</p>
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-6">
                  <section className="glass p-8 rounded-[2.5rem] shadow-xl">
                    <h3 className="text-xs font-black text-cyan-600 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                       Academic Info
                    </h3>
                    <div className="space-y-8">
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Name</label>
                        <input 
                          className="w-full bg-white/60 border-none rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-cyan-500/10 font-bold text-lg shadow-sm cursor-text"
                          value={profile.name}
                          onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Education Level</label>
                          <select 
                            className="w-full bg-white/60 border-none rounded-2xl px-6 py-4 appearance-none outline-none focus:ring-4 focus:ring-cyan-500/10 font-bold shadow-sm cursor-pointer"
                            value={profile.educationLevel}
                            onChange={(e) => setProfile(prev => ({ ...prev, educationLevel: e.target.value }))}
                          >
                            <option>Primary</option>
                            <option>Secondary</option>
                            <option>University</option>
                          </select>
                        </div>
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Class / Year</label>
                          <input 
                            className="w-full bg-white/60 border-none rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-cyan-500/10 font-bold shadow-sm cursor-text"
                            value={profile.specificLevel}
                            placeholder="e.g. Form 4"
                            onChange={(e) => setProfile(prev => ({ ...prev, specificLevel: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Lesson Duration</label>
                         <div className="flex items-center gap-4 bg-white/60 p-4 rounded-2xl shadow-sm">
                           <div className="flex flex-1 items-center gap-2">
                             <div className="flex flex-col gap-1">
                               <input 
                                 type="number" min="0" max="23"
                                 className="w-16 bg-white border-2 border-cyan-100 rounded-xl px-2 py-3 font-black text-center outline-none focus:border-cyan-500 text-cyan-700 shadow-inner appearance-none cursor-text"
                                 value={profile.studyHours}
                                 onChange={(e) => setProfile(prev => ({ ...prev, studyHours: Math.max(0, parseInt(e.target.value) || 0) }))}
                               />
                               <span className="text-[9px] font-black text-slate-400 text-center uppercase">Hours</span>
                             </div>
                             <span className="text-xl font-bold text-cyan-200 mb-4">:</span>
                             <div className="flex flex-col gap-1">
                               <input 
                                 type="number" min="0" max="59"
                                 className="w-16 bg-white border-2 border-cyan-100 rounded-xl px-2 py-3 font-black text-center outline-none focus:border-cyan-500 text-cyan-700 shadow-inner appearance-none cursor-text"
                                 value={profile.studyMinutes}
                                 onChange={(e) => setProfile(prev => ({ ...prev, studyMinutes: Math.max(0, Math.min(59, parseInt(e.target.value) || 0)) }))}
                               />
                               <span className="text-[9px] font-black text-slate-400 text-center uppercase">Mins</span>
                             </div>
                           </div>
                           <div className="h-10 w-[1px] bg-cyan-100 mx-2" />
                           <div className="text-right">
                             <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Total</p>
                             <p className="text-lg font-black text-cyan-600 leading-none">{profile.studyHours}h {profile.studyMinutes}m</p>
                           </div>
                         </div>
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter ml-1">Language Mix</label>
                        <select 
                          className="w-full bg-white/60 border-none rounded-2xl px-6 py-4 appearance-none outline-none focus:ring-4 focus:ring-cyan-500/10 font-bold shadow-sm cursor-pointer"
                          value={profile.languageMix}
                          onChange={(e) => setProfile(prev => ({ ...prev, languageMix: e.target.value }))}
                        >
                          <option>Mixed (Sheng/English)</option>
                          <option>Formal Swahili</option>
                          <option>Pure English</option>
                        </select>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="space-y-6">
                  <section className="glass p-8 rounded-[2.5rem] shadow-xl">
                    <h3 className="text-xs font-black text-cyan-600 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                       Which subject do you want to read today?
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                      {AVAILABLE_SUBJECTS.map((sub) => {
                        const isSelected = profile.subjects.includes(sub);
                        return (
                          <button
                            key={sub}
                            onClick={() => toggleSubject(sub)}
                            className={`flex items-center justify-between p-5 rounded-2xl transition-all border-2 group cursor-pointer ${
                              isSelected 
                                ? "bg-cyan-50 border-cyan-500 text-cyan-700 shadow-lg shadow-cyan-100" 
                                : "bg-white/40 border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/60"
                            }`}
                          >
                            <span className={`text-sm font-bold ${isSelected ? "scale-105" : ""} transition-transform`}>{sub}</span>
                            {isSelected ? <CheckCircle2 size={20} className="text-cyan-600" /> : <Circle size={20} opacity={0.1} className="group-hover:opacity-30 transition-opacity" />}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>

              <div className="pt-6 pb-12">
                <button 
                  onClick={() => {
                    setTutorMode("selection"); 
                    setCurrentPage("tutor");
                  }}
                  className="w-full max-w-sm bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold py-5 rounded-[2rem] shadow-2xl shadow-cyan-200 flex items-center justify-center gap-3 group transition-transform active:scale-95 cursor-pointer hover:shadow-cyan-300 transform hover:-translate-y-1"
                >
                  <BrainCircuit size={22} className="text-cyan-200" />
                  Jump into Tutoring
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {currentPage === "tutor" && (
            <TutorView 
              messages={messages} 
              input={input} 
              setInput={setInput} 
              handleSend={handleSend} 
              loading={loading}
              profile={profile}
              tutorMode={tutorMode}
              setTutorMode={setTutorMode}
              lastNote={lastNote}
              createNoteFromLast={createNoteFromLast}
              setLastNote={setLastNote}
              setCurrentPage={setCurrentPage}
              speak={speak}
              isSpeaking={isSpeaking}
              audioEnabled={audioEnabled}
              setAudioEnabled={setAudioEnabled}
              stopSpeech={stopSpeech}
            />
          )}

          {currentPage === "notes" && (
            <NotesView notes={notes} setNotes={setNotes} />
          )}
        </AnimatePresence>

        <BottomNav />
      </main>
    </div>
  );
}

// --- Sub-Views ---

function TeacherAnimation({ isSpeaking, profile }: { isSpeaking: boolean, profile: Profile }) {
  const getStatusText = () => {
    if (isSpeaking) {
      if (profile.languageMix === "Formal Swahili") return "Mwalimu Mwalimu yuko tayari kuongea...";
      if (profile.languageMix === "Mixed (Sheng/English)") return "Mode Mwalimu yuko speaking...";
      return "Teacher Mwalimu Speaking...";
    }
    
    if (profile.languageMix === "Formal Swahili") return "Mwalimu Mwalimu yuko tayari";
    if (profile.languageMix === "Mixed (Sheng/English)") return "Mode Mwalimu yuko ready";
    return "Teacher Mwalimu Ready";
  };

  return (
    <div className="flex flex-col items-center justify-center py-8">
      <motion.div 
        animate={{ 
          scale: isSpeaking ? [1, 1.05, 1] : 1,
          rotate: isSpeaking ? [0, 2, -2, 0] : 0
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity,
          ease: "easeInOut" 
        }}
        className="w-32 h-32 relative"
      >
        <div className="absolute inset-0 bg-cyan-100 rounded-full animate-float blur-xl opacity-50" />
        <div className="relative w-full h-full bg-white rounded-3xl shadow-xl flex items-center justify-center border-2 border-cyan-200">
           <Bot size={64} className="text-cyan-600" />
           {isSpeaking && (
             <motion.div 
               animate={{ height: [2, 12, 2] }}
               transition={{ duration: 0.15, repeat: Infinity }}
               className="absolute bottom-10 w-8 bg-cyan-800 rounded-full"
             />
           )}
        </div>
      </motion.div>
      <p className="text-cyan-600 font-black italic mt-4 text-xs tracking-widest uppercase">
        {getStatusText()}
      </p>
    </div>
  );
}

function TutorView({ 
  messages, input, setInput, handleSend, loading, 
  profile, tutorMode, setTutorMode, lastNote, 
  createNoteFromLast, setLastNote, setCurrentPage, speak, isSpeaking,
  audioEnabled, setAudioEnabled, stopSpeech
}: any) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (tutorMode === "selection") {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        className="flex-1 flex flex-col items-center justify-start sm:justify-center p-6 md:p-12 bg-white/30 backdrop-blur-3xl overflow-y-auto"
      >
        <div className="text-center mb-8 md:mb-12">
           <div className="w-16 h-16 md:w-24 md:h-24 bg-cyan-600 rounded-3xl flex items-center justify-center text-white mx-auto shadow-2xl mb-4 md:mb-6">
             <BrainCircuit className="w-8 h-8 md:w-12 md:h-12" />
           </div>
           <h2 className="text-3xl md:text-4xl font-display font-black text-cyan-950 mb-2 md:mb-4">Choose Your Session Type</h2>
           <p className="text-cyan-700/60 font-bold text-sm md:text-base">How would you like to learn {profile.subjects[0]} today?</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full max-w-4xl px-4">
          <button 
            onClick={() => setTutorMode("lesson")}
            className="group glass p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] text-left hover:bg-cyan-600 hover:text-white transition-all duration-500 shadow-xl border-white/80 cursor-pointer"
          >
             <div className="w-10 h-10 md:w-14 md:h-14 bg-cyan-100 group-hover:bg-cyan-500 rounded-2xl flex items-center justify-center text-cyan-600 group-hover:text-white mb-4 md:mb-6 transition-colors">
               <GraduationCap size={28} />
             </div>
             <h3 className="text-xl md:text-2xl font-black mb-2 md:mb-3">Complete Lesson</h3>
             <p className="text-xs md:text-sm font-bold opacity-70 group-hover:opacity-90 leading-relaxed">
               Dive deep into a structured topic with examples, analogies, and a summary.
             </p>
          </button>

          <button 
            onClick={() => setTutorMode("question")}
            className="group glass p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] text-left hover:bg-slate-800 hover:text-white transition-all duration-500 shadow-xl border-white/80 cursor-pointer"
          >
             <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-100 group-hover:bg-slate-600 rounded-2xl flex items-center justify-center text-slate-600 group-hover:text-white mb-4 md:mb-6 transition-colors">
               <MessageCircle size={28} />
             </div>
             <h3 className="text-xl md:text-2xl font-black mb-2 md:mb-3">Pose a Question</h3>
             <p className="text-xs md:text-sm font-bold opacity-70 group-hover:opacity-90 leading-relaxed">
               Got a quick concern? Get a precise, bolded answer with background context instantly.
             </p>
          </button>
        </div>
        
        <button 
          onClick={() => setCurrentPage("home")}
          className="mt-8 md:mt-12 mb-8 text-cyan-600 font-black uppercase text-xs tracking-widest hover:underline flex items-center gap-2"
        >
           <X size={14} /> Cancel & Go Home
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div 
      key="tutor"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col h-full overflow-hidden"
    >
      <header className="px-4 md:px-8 py-4 md:py-6 glass-heavy border-none flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-3 md:gap-6">
          <button 
            onClick={() => setTutorMode("selection")}
            className="p-2 hover:bg-white/60 rounded-xl transition-colors cursor-pointer text-slate-400 hover:text-cyan-600"
            title="Choose another mode"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="hidden sm:block">
            <h2 className="text-xl md:text-2xl font-display font-bold text-cyan-950 flex items-center gap-2 md:gap-3">
               {tutorMode === "lesson" ? <GraduationCap className="text-cyan-600" /> : <MessageCircle className="text-slate-600" />}
               <span className="truncate">{tutorMode === "lesson" ? "Mwalimu Lesson" : "Quick Q&A"}</span>
            </h2>
            <div className="flex items-center gap-3 mt-1">
               <p className="text-[9px] md:text-[10px] text-cyan-700 font-black uppercase tracking-[0.2em] truncate">
                  {profile.subjects[0]} • {profile.specificLevel}
               </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
           <button 
             onClick={() => setAudioEnabled(!audioEnabled)}
             className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
               audioEnabled ? "bg-cyan-600 text-white shadow-lg shadow-cyan-200" : "bg-slate-200 text-slate-500"
             }`}
             title={audioEnabled ? "Mute Bot" : "Unmute Bot"}
           >
             {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
           </button>
           
           {isSpeaking && (
             <button 
               onClick={stopSpeech}
               className="h-9 md:h-10 px-3 md:px-4 rounded-full bg-red-100 text-red-600 font-black text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-red-200 transition-colors cursor-pointer"
             >
               <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-red-600 rounded-full animate-pulse" />
               <span className="hidden xs:inline">Stop</span>
             </button>
           )}

           <button 
             onClick={() => setCurrentPage("home")}
             className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/60 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors cursor-pointer sm:hidden"
           >
             <X size={20} />
           </button>

           <div className="bg-white/40 backdrop-blur-md px-3 md:px-4 py-1.5 md:py-2 rounded-2xl border border-white/60 hidden lg:block">
              <p className="text-[10px] md:text-xs font-bold text-cyan-600">{profile.languageMix}</p>
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-8 space-y-8 scrollbar-hide py-4 w-full max-w-4xl mx-auto">
        {messages.map((m: Message, i: number) => (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            key={i} 
            className={`flex items-start gap-4 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div className={`w-10 h-10 rounded-2xl shadow-lg flex items-center justify-center flex-shrink-0 ${
              m.role === "user" 
                ? "glacier-grad text-white" 
                : "bg-white text-cyan-600 border border-white/60"
            }`}>
              {m.role === "user" ? <User size={20} /> : <Bot size={20} />}
            </div>
            
            <div className={`max-w-[85%] p-6 rounded-3xl text-sm md:text-base leading-relaxed shadow-xl border overflow-hidden ${
              m.role === "user" 
                ? "bg-cyan-600 text-white border-cyan-500 rounded-tr-none" 
                : "bg-white/90 backdrop-blur-md text-slate-800 border-white/80 rounded-tl-none"
            }`}>
              {m.role === "ai" ? (
                <div className="prose prose-slate prose-sm max-w-none prose-headings:text-cyan-950 prose-headings:font-display prose-headings:mb-2 prose-p:mb-4">
                  <ReactMarkdown>{m.text}</ReactMarkdown>
                </div>
              ) : (
                m.text
              )}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div className="flex flex-col gap-4">
            {tutorMode === "lesson" && <TeacherAnimation isSpeaking={false} profile={profile} />}
            <div className="flex items-center gap-3 text-xs text-cyan-700 font-black uppercase italic px-4 animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              Preparing your session...
            </div>
          </div>
        )}

        {tutorMode === "lesson" && !loading && messages.length > 1 && (
          <TeacherAnimation isSpeaking={isSpeaking} profile={profile} />
        )}

        {lastNote && !loading && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 glass-heavy rounded-[3rem] border-2 border-cyan-500 shadow-2xl mt-8 text-center"
          >
            <NotebookTabs className="text-cyan-600 mx-auto mb-4" size={32} />
            <h4 className="text-xl font-black text-cyan-950 mb-2">Lesson Completed!</h4>
            <p className="text-sm font-bold text-cyan-700/60 mb-6">Would you like to save a brief note from this lesson to your library?</p>
            <div className="flex gap-4 justify-center">
               <button 
                 onClick={createNoteFromLast}
                 className="bg-cyan-600 text-white px-8 py-3 rounded-2xl font-black text-sm shadow-xl hover:bg-cyan-500 active:scale-95 transition-all cursor-pointer"
               >
                 Yes, Save Note
               </button>
               <button 
                 onClick={() => setLastNote(null)}
                 className="bg-white text-slate-400 border border-slate-100 px-8 py-3 rounded-2xl font-black text-sm hover:text-slate-600 active:scale-95 transition-all cursor-pointer"
               >
                 No, Thanks
               </button>
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-8 pb-32 md:pb-12 w-full max-w-4xl mx-auto">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-300 to-blue-400 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000 group-focus-within:opacity-50"></div>
          <input 
            className="relative w-full bg-white/95 backdrop-blur-2xl border-none p-6 pr-20 rounded-[2rem] shadow-2xl outline-none focus:ring-4 focus:ring-cyan-500/10 transition-all font-bold text-lg placeholder:text-slate-300"
            placeholder={tutorMode === "lesson" ? "What topic are we studying?" : "Ask your question..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="absolute right-3 top-3 bottom-3 aspect-square bg-cyan-600 text-white rounded-[1.5rem] flex items-center justify-center hover:bg-cyan-500 transition-all shadow-lg active:scale-90 disabled:opacity-50 disabled:active:scale-100 cursor-pointer disabled:cursor-not-allowed"
          >
            <Send size={24} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function NotesView({ notes, setNotes }: { notes: Note[], setNotes: any }) {
  return (
    <motion.div 
      key="notes"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex-1 flex flex-col h-full overflow-hidden p-6 md:p-12 pb-32 max-w-6xl mx-auto w-full"
    >
      <header className="mb-12">
        <h2 className="text-5xl font-display font-bold text-cyan-950 tracking-tighter">Glacier Notes</h2>
        <p className="text-slate-500 font-medium mt-2">Personal knowledge archive generated by Mwalimu AI.</p>
      </header>

      {notes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
          <div className="w-32 h-32 rounded-[3rem] border-4 border-dashed border-cyan-200 flex items-center justify-center mb-6">
            <NotebookTabs size={48} className="text-cyan-200" />
          </div>
          <p className="text-lg font-bold text-cyan-900/50">Your archive is empty.</p>
          <p className="text-sm mt-1">Start a conversation in the Tutor tab to capture notes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto scrollbar-hide pr-2">
          {notes.map((n) => (
            <motion.div 
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              key={n.id} 
              className="glass p-6 rounded-[2.5rem] relative group border-white/80 flex flex-col h-fit hover:shadow-2xl hover:shadow-cyan-100 transition-all duration-500"
            >
               <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setNotes((prev: Note[]) => prev.filter(x => x.id !== n.id))}
                  className="p-2 bg-red-50 text-red-400 hover:text-red-600 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-600 bg-cyan-100/50 px-3 py-1 rounded-full">
                   {n.subject}
                </span>
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">{n.date}</span>
              </div>
              <h4 className="text-xl font-bold text-slate-800 mb-4 leading-tight">{n.topic}</h4>
              <div className="text-sm text-slate-600 leading-relaxed font-medium italic border-l-4 border-cyan-200 pl-4 py-1 prose prose-slate prose-sm prose-p:my-0 prose-headings:my-0 prose-strong:text-cyan-700">
                <ReactMarkdown>{n.content}</ReactMarkdown>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
