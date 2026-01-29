import React, { useState, useEffect, useRef, useMemo } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, CheckSquare, Square, Share2, Briefcase, UserCog, Filter, ChevronDown, MapPin, Mail, UserMinus } from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// --- MODO OFFLINE / PRODUCCIÓN ---
const OFFLINE_MODE = false; 

// --- SEGURIDAD Y CONFIGURACIÓN ---
const AI_KEY_PART_A = "AIzaSyCMPSIf7ocyb8DzoRt";
const AI_KEY_PART_B = "5izDH3-5zcLu5ojM";
const GEMINI_API_KEY = `${AI_KEY_PART_A}${AI_KEY_PART_B}`;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCh_eweHfWdALF3VtFHh1UM0AkiH-8I9Uo",
  authDomain: "lucy-ai-11572.firebaseapp.com",
  projectId: "lucy-ai-11572",
  storageBucket: "lucy-ai-11572.firebasestorage.app",
  messagingSenderId: "979126041068",
  appId: "1:979126041068:web:e605f2bf9528424e26e8c9",
  measurementId: "G-4L08BMRY61"
};

const APP_ID = 'gastos-finales-v1';

// Inicialización Segura
let app, auth, db;
if (!OFFLINE_MODE) {
    try {
        app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) { console.error("Firebase init error", e); }
}

// --- ESTÉTICA ---
const IMAGES = { lucy: "https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" };

const LucyAvatar = ({ className = "w-10 h-10" }) => (
  <img 
    src={IMAGES.lucy} 
    alt="Lucy Asistente" 
    className={`${className} rounded-full object-cover shadow-sm border border-slate-100 bg-slate-200`} 
    onError={(e) => {
      e.target.onerror = null; 
      e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400";
    }}
  />
);

const BrainAvatar = ({ className = "w-10 h-10" }) => (<div className={`${className} rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-sm`}><Sparkles size={20} strokeWidth={2} /></div>);
const ProtectionLogo = ({ size = 24, className = "" }) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9.5L12 3l9 6.5v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M12 18.5c2.5-1.5 5.5-4 5.5-6.5 0-1.7-1.3-3-3-3-1 0-1.9.5-2.5 1.5-.6-1-1.5-1.5-2.5-1.5-1.7 0-3 1.3-3 3 0 2.5 3 5 5.5 6.5z" /></svg>);

// --- UTILIDADES ---
function cleanAiMessage(text) { 
    if (!text) return ''; 
    let cleaned = text.replace(new RegExp('\\[Botón:.*?\\]', 'gi'), '').replace(new RegExp('\\[Button:.*?\\]', 'gi'), '');
    return cleaned.split('***').join('').split('---').join('').trim();
}

function to12h(t) { if (!t) return ''; const [h, m] = t.split(':'); return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function formatScheduledDate(d) { if (!d || d.length < 10) return d; const date = new Date(d); return isNaN(date) ? d : date.toLocaleDateString('en-US', {month:'2-digit', day:'2-digit', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}); }
function formatFirestoreDate(ts) { 
    if (!ts) return 'Reciente'; 
    if (OFFLINE_MODE && typeof ts === 'string') return new Date(ts).toLocaleDateString('en-US'); 
    return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); 
}

const RichText = ({ content }) => {
  if (!content || typeof content !== 'string') return null;
  return <span className="text-sm leading-relaxed">{content.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i} className="text-slate-900 font-bold">{part.slice(2, -2)}</strong> : part)}</span>;
};

const rateLimit = { lastCall: 0, count: 0, check: function() { const now = Date.now(); if (now - this.lastCall < 2000) return false; this.lastCall = now; this.count++; if (this.count > 50) return false; return true; } };

const DEFAULT_SCHEDULE = { lunes: { start: '09:00', end: '18:00', enabled: true }, martes: { start: '09:00', end: '18:00', enabled: true }, miercoles: { start: '09:00', end: '18:00', enabled: true }, jueves: { start: '09:00', end: '18:00', enabled: true }, viernes: { start: '09:00', end: '18:00', enabled: true }, sabado: { start: '10:00', end: '14:00', enabled: false }, domingo: { start: '10:00', end: '14:00', enabled: false } };

const getAgentStatus = (config) => {
  const now = new Date();
  if (config.vacationMode && config.vacationStart && config.vacationEnd) {
     const vStart = new Date(config.vacationStart + 'T00:00:00'); 
     const vEnd = new Date(config.vacationEnd + 'T23:59:59'); 
     if (now >= vStart && now <= vEnd) return { isAgentAvailable: false, isVacation: true, resumeDate: new Date(vEnd.setDate(vEnd.getDate() + 1)) };
  }
  const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][now.getDay()];
  const sch = config.schedule?.[day];
  if (!sch || !sch.enabled) return { isAgentAvailable: false, message: "Cerrado hoy" };
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sH, sM] = sch.start.split(':').map(Number);
  const [eH, eM] = sch.end.split(':').map(Number);
  if (mins < sH * 60 + sM || mins >= eH * 60 + eM) return { isAgentAvailable: false, message: "Cerrado ahora" };
  return { isAgentAvailable: true, message: "Agentes Disponibles" };
};

async function fetchGeminiWithRetry(payload) {
  if (!rateLimit.check()) throw new Error("Espera unos segundos.");
  if (OFFLINE_MODE) { await new Promise(r => setTimeout(r, 1000)); return { candidates: [{ content: { parts: [{ text: "Modo offline simulado." }] } }] }; }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
  try { const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (res.ok) return await res.json(); } catch (e) { throw e; }
  throw new Error("Error conexión");
}

function useInactivityTimer(action, timeout = 600000) {
    useEffect(() => {
        let timer;
        const resetTimer = () => { clearTimeout(timer); timer = setTimeout(action, timeout); };
        window.addEventListener('mousemove', resetTimer); window.addEventListener('keypress', resetTimer);
        window.addEventListener('click', resetTimer); window.addEventListener('touchstart', resetTimer);
        resetTimer();
        return () => { clearTimeout(timer); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keypress', resetTimer); window.removeEventListener('click', resetTimer); window.removeEventListener('touchstart', resetTimer); };
    }, [action, timeout]);
}

// --- COMPONENTE PRINCIPAL ---
function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [isAdmin, setIsAdmin] = useState(false); 
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [adminTab, setAdminTab] = useState('active'); 
  const [leads, setLeads] = useState([]);
  const [agents, setAgents] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionError, setPermissionError] = useState(false);

  const [aiConfig, setAiConfig] = useState({
    systemPrompt: `Eres Lucy...`, webhookUrl: "", schedule: DEFAULT_SCHEDULE, 
    vacationMode: false, vacationStart: "", vacationEnd: "", personality: "Empático"
  });

  useEffect(() => {
      const handlePopState = (event) => { if (event.state && event.state.view) setView(event.state.view); else setView('landing'); };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (newView) => { setView(newView); window.history.pushState({ view: newView }, '', `#${newView}`); };
  useInactivityTimer(() => { if (view !== 'landing') { if (isAdmin) handleLogout(); else navigateTo('landing'); } }, 600000);

  useEffect(() => {
    if (OFFLINE_MODE) { setUser({ uid: 'offline', isAnonymous: true }); return; }
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) { setUser(u); if (!u.isAnonymous) { setIsAdmin(true); navigateTo('admin'); } else { setIsAdmin(false); } } 
        else { signInAnonymously(auth).catch(e => console.error(e)); }
    });
    return () => unsubscribe();
  }, []);

  // Fetch Leads y Config
  useEffect(() => {
    if (OFFLINE_MODE) { setLeads([]); return; }
    if (!user) return;
    const leadsRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads');
    const unsub = onSnapshot(leadsRef, (snapshot) => {
        setPermissionError(false);
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setLeads(data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (error) => { if (error.code === 'permission-denied' && isAdmin) setPermissionError(true); });
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config')).then(s => s.exists() && setAiConfig(prev => ({...prev, ...s.data()}))).catch(e => console.log("Default Config"));
    return () => unsub();
  }, [user, isAdmin]);

  // Fetch Agentes
  useEffect(() => {
      if (OFFLINE_MODE || !user || !isAdmin) return;
      const agentsDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list');
      const unsub = onSnapshot(agentsDocRef, (docSnap) => {
          if (docSnap.exists()) {
              setAgents(docSnap.data().list || []);
          } else {
              setAgents([]);
          }
      });
      return () => unsub();
  }, [user, isAdmin]);

  const handleLogin = async (e) => {
    e.preventDefault(); setIsLoggingIn(true); setLoginError(null);
    if (OFFLINE_MODE) { setTimeout(()=>{ setIsAdmin(true); navigateTo('admin'); setShowLogin(false); setIsLoggingIn(false); }, 1000); return; }
    try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); setEmail(''); setPassword(''); } 
    catch (error) { setLoginError("Credenciales no válidas."); }
    setIsLoggingIn(false);
  };
  const handleLogout = async () => { if (!OFFLINE_MODE) await signOut(auth); setIsAdmin(false); navigateTo('landing'); };
  const notifyNewLead = (lead) => { if (Notification.permission === "granted") new Notification("¡Nuevo Lead!", { body: lead.nombre, icon: IMAGES.lucy }); if (aiConfig.webhookUrl && lead.status === 'active') fetch(aiConfig.webhookUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(e=>console.error(e)); };
  const saveLeadToDb = async (leadData) => { if (OFFLINE_MODE) { alert("Modo Offline"); return; } await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), { ...leadData, createdAt: serverTimestamp(), status: 'active' }); };
  const saveAiConfig = async (newConfig) => { if (OFFLINE_MODE) { setAiConfig(newConfig); return; } if (!user || !isAdmin) return; await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config'), newConfig); setAiConfig(newConfig); };
  
  // Acciones Leads
  const deleteLead = async (ids) => { const idArray = Array.isArray(ids) ? ids : [ids]; if(!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id); batch.delete(ref); }); await batch.commit(); }
  const updateLeadStatus = async (ids, status) => { const idArray = Array.isArray(ids) ? ids : [ids]; if(!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id); batch.update(ref, { status: status }); }); await batch.commit(); }
  
  // Asignar Agente (Individual)
  const assignAgentToLead = async (leadId, agentId) => { if(!isAdmin) return; await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', leadId), { assignedAgentId: agentId || null, assignedAt: agentId ? serverTimestamp() : null }); };

  // NUEVO: Asignación Masiva
  const bulkAssignAgent = async (leadIds, agentId) => {
      if(!isAdmin) return;
      const batch = writeBatch(db);
      leadIds.forEach(id => {
          const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id);
          batch.update(ref, { 
              assignedAgentId: agentId === 'unassign' ? null : agentId, 
              assignedAt: agentId === 'unassign' ? null : serverTimestamp() 
          });
      });
      await batch.commit();
  };

  // Acciones Agentes
  const saveAgent = async (agentData) => { 
      if(!isAdmin) return; 
      const agentsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list');
      const docSnap = await getDoc(agentsRef);
      let currentList = docSnap.exists() ? (docSnap.data().list || []) : [];

      if (agentData.id) {
          currentList = currentList.map(a => a.id === agentData.id ? { ...agentData, updatedAt: Date.now() } : a);
      } else {
          const newAgent = { ...agentData, id: crypto.randomUUID(), createdAt: Date.now() };
          currentList.push(newAgent);
      }
      await setDoc(agentsRef, { list: currentList });
  };

  const deleteAgent = async (ids) => { 
      const idArray = Array.isArray(ids) ? ids : [ids];
      if(!isAdmin) return; 
      const agentsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list');
      const docSnap = await getDoc(agentsRef);
      if (!docSnap.exists()) return;
      let currentList = docSnap.data().list || [];
      currentList = currentList.filter(a => !idArray.includes(a.id));
      await setDoc(agentsRef, { list: currentList });
  };

  if (!user) return <div className="h-screen flex items-center justify-center bg-[#F5F5F7] text-slate-400">Cargando...</div>;

  return (
    <div className="h-[100dvh] bg-[#F5F5F7] text-[#1d1d1f] font-sans antialiased flex flex-col overflow-hidden">
      {OFFLINE_MODE && <div className="absolute top-0 w-full z-[100] bg-yellow-500 text-white p-1 text-center text-[10px] font-bold flex justify-center items-center gap-2"><WifiOff size={12}/> MODO DISEÑO (OFFLINE)</div>}
      {permissionError && <div className="absolute top-0 w-full z-[100] bg-red-600 text-white p-2 text-center text-xs font-bold">Error de Permisos</div>}
      <nav className="bg-white/80 backdrop-blur-xl border-b border-white/20 shrink-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-rose-500 text-white p-1.5 rounded-lg shadow-sm"><ProtectionLogo size={20}/></div>
            <span className="font-semibold text-base sm:text-lg tracking-tight text-black">Asistente de Beneficios</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin ? (
              <div className="flex bg-[#E8E8ED]/50 p-1 rounded-full animate-in fade-in">
                <button onClick={() => navigateTo('chat')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'chat' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Asistente</button>
                <button onClick={() => navigateTo('admin')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'admin' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Admin</button>
                <button onClick={handleLogout} className="ml-2 px-2 text-xs text-red-400 hover:text-red-600 font-medium">Salir</button>
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden flex flex-col w-full max-w-7xl mx-auto">
        {!isAdmin ? (
          view === 'landing' ? <LandingView onStartChat={() => navigateTo('chat')} onOpenLogin={() => setShowLogin(true)} /> : 
          <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden"><ClientChat aiConfig={aiConfig} onSaveLead={saveLeadToDb} onOpenLogin={() => setShowLogin(true)} /></div>
        ) : (
          view === 'chat' ? <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden"><ClientChat aiConfig={aiConfig} onSaveLead={saveLeadToDb} /></div> : 
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
               <div className="flex gap-1 bg-[#E8E8ED]/50 p-1 rounded-xl w-fit self-start">
                  {[{ id: 'active', icon: <Inbox size={14} />, label: 'Activos' }, { id: 'archived', icon: <Archive size={14} />, label: 'Archivo' }, { id: 'agents', icon: <Briefcase size={14} />, label: 'Agentes' }, { id: 'brain', icon: <BrainAvatar className="w-4 h-4 rounded-md" />, label: 'Inteligencia' }].map(tab => (
                    <button key={tab.id} onClick={() => setAdminTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === tab.id ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}>
                      {tab.id !== 'brain' && tab.icon}{tab.id === 'brain' && <Sparkles size={14}/>}{tab.label}
                    </button>
                  ))}
               </div>
               {adminTab !== 'brain' && <div className="relative group w-full md:w-auto"><Search className="absolute left-3 top-2.5 text-gray-400" size={14} /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-white border-0 rounded-xl text-sm w-full md:w-64 outline-none shadow-sm" /></div>}
            </div>
            {adminTab === 'active' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active'))} agents={agents} onAssignAgent={assignAgentToLead} onBulkAssign={bulkAssignAgent} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={false} searchTerm={searchTerm} /> : 
             adminTab === 'archived' ? <LeadsList leads={leads.filter(l => l.status === 'archived')} agents={agents} onAssignAgent={assignAgentToLead} onBulkAssign={bulkAssignAgent} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={true} searchTerm={searchTerm} /> : 
             adminTab === 'agents' ? <AgentsManager agents={agents} leads={leads} onSaveAgent={saveAgent} onDeleteAgent={deleteAgent} searchTerm={searchTerm} /> :
             <AdminBrain aiConfig={aiConfig} onSaveConfig={saveAiConfig} />}
          </div>
        )}
      </main>

      {showLogin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 text-red-600"><ShieldAlert size={20} /><h3 className="font-bold text-lg text-slate-800">Acceso Restringido</h3></div>
              <button onClick={() => setShowLogin(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Correo Corporativo</label><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black/10 outline-none text-sm" placeholder="usuario@empresa.com" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Credencial</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black/10 outline-none text-sm" placeholder="••••••••" /></div>
              {loginError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg font-medium">{loginError}</div>}
              <button type="submit" disabled={isLoggingIn} className="w-full bg-black text-white font-medium py-3 rounded-xl hover:bg-gray-800 transition-all text-sm shadow-lg disabled:opacity-50">{isLoggingIn ? 'Verificando...' : 'Iniciar Sesión'}</button>
            </form>
            <p className="mt-4 text-center text-[10px] text-slate-400">Este sistema monitorea todos los accesos.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- LANDING VIEW ---
function LandingView({ onStartChat, onOpenLogin }) {
  const testimonials = [ { text: "Gracias a Lucy encontré un plan perfecto para mi mamá sin gastar de más. Fue muy fácil.", author: "María G. - Florida" }, { text: "Excelente atención, muy paciente y clara. Me sentí muy segura con la información.", author: "Carmen R. - Texas" }, { text: "Rápido y sencillo. Encontré justo lo que necesitaba para mi tranquilidad.", author: "José L. - California" } ];
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx((p) => (p + 1) % testimonials.length), 5000); return () => clearInterval(t); }, []);
  const cur = testimonials[idx];

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto space-y-8 animate-in slide-up">
        <div className="relative mb-4"><div className="absolute inset-0 bg-rose-200 rounded-full blur-2xl opacity-30 animate-pulse"></div><LucyAvatar className="w-28 h-28 md:w-32 md:h-32 border-4 border-white shadow-xl relative z-10" /><div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md z-20"><Heart size={20} className="text-rose-500 fill-current animate-bounce" /></div></div>
        <div className="space-y-3"><h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Hola, soy Lucy 👋</h1><p className="text-slate-500 text-lg md:text-xl font-medium max-w-md mx-auto leading-relaxed">Su asistente <span className="text-rose-500 font-bold">AI</span> experta en <span className="text-rose-500 font-semibold">Protección Familiar</span>.</p><p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto">Estoy aquí para escucharle y explicarle los beneficios de protección disponibles para usted. Hablemos con confianza, a su ritmo y sin complicaciones.</p></div>
        <button onClick={onStartChat} className="group relative inline-flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 w-full md:w-auto justify-center"><span>Hablar con Lucy</span><MessageSquare size={20} className="group-hover:translate-x-1 transition-transform" /></button>
        <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 italic border border-slate-100 max-w-sm mx-auto mt-2 relative min-h-[100px] flex flex-col justify-center transition-all duration-500 shadow-sm"><span className="absolute -top-3 left-4 text-3xl text-slate-200">"</span><p className="animate-in fade-in duration-500" key={idx}>{cur.text}</p><div className="mt-2 flex items-center justify-center gap-2 not-italic font-semibold text-slate-800 text-xs animate-in fade-in duration-500" key={`author-${idx}`}><div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">{cur.author.charAt(0)}</div>{cur.author}</div></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 w-full max-w-md pt-4 border-t border-slate-100">
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><UserCheck size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">Solo agentes licenciados</span></div>
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-red-50 text-red-600 rounded-xl"><PhoneOff size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">No más llamadas inesperadas</span></div>
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-green-50 text-green-600 rounded-xl"><ShieldCheck size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">100% seguro</span></div>
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-yellow-50 text-yellow-600 rounded-xl"><Zap size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">Cobertura inmediata</span></div>
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Activity size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">Sin examén médico</span></div>
           <div className="flex flex-col items-center gap-1.5"><div className="p-2 bg-pink-50 text-pink-600 rounded-xl"><Heart size={20} /></div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide text-center">Soporte Familiar</span></div>
        </div>
      </div>
      <div className="p-4 text-center"><p className="text-[10px] text-slate-300">&copy; 2024 Asistente de Beneficios. Privacidad Garantizada.</p><button onClick={onOpenLogin} className="mt-2 text-[9px] text-slate-200 hover:text-slate-400 transition-colors">Acceso Corporativo</button></div>
    </div>
  );
}

// --- AGENTS MANAGER (CORREGIDO) ---
function AgentsManager({ agents, leads, onSaveAgent, onDeleteAgent, searchTerm }) {
    const [selectedAgent, setSelectedAgent] = useState(null); 
    const [isEditing, setIsEditing] = useState(false); 
    const [editingAgent, setEditingAgent] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '', foto: '', estados: '', mensaje: '' });
    const [dateFilter, setDateFilter] = useState('all');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const openForm = (agent = null) => {
        setEditingAgent(agent);
        setFormData(agent || { nombre: '', telefono: '', email: '', foto: '', estados: '', mensaje: '' });
        setIsEditing(true);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            await onSaveAgent(formData);
            setIsEditing(false);
            setEditingAgent(null);
        } catch (error) {
            console.error(error);
            alert("Error al guardar");
        }
    };

    const filteredAgents = agents.filter(a => 
        (a.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
        (a.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelectAll = (e) => e.target.checked ? setSelectedIds(filteredAgents.map(a => a.id)) : setSelectedIds([]);
    const handleSelectOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    
    const handleDeleteSelected = async () => {
        if(confirm(`¿Eliminar ${selectedIds.length} agentes?`)) {
            await onDeleteAgent(selectedIds);
            setSelectedIds([]);
        }
    };

    const getAgentLeads = (agentId) => {
        let agentLeads = leads.filter(l => l.assignedAgentId === agentId);
        const now = new Date();
        
        if (dateFilter === 'thisMonth') {
            agentLeads = agentLeads.filter(l => {
                const d = l.assignedAt?.toDate ? l.assignedAt.toDate() : new Date(l.assignedAt?.seconds * 1000);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });
        } else if (dateFilter === 'lastMonth') {
             const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
             const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
             agentLeads = agentLeads.filter(l => {
                const d = l.assignedAt?.toDate ? l.assignedAt.toDate() : new Date(l.assignedAt?.seconds * 1000);
                return d >= lastMonth && d <= endLastMonth;
            });
        } else if (dateFilter === 'custom' && customStart && customEnd) {
             const start = new Date(customStart);
             const end = new Date(customEnd);
             end.setHours(23,59,59);
             agentLeads = agentLeads.filter(l => {
                const d = l.assignedAt?.toDate ? l.assignedAt.toDate() : new Date(l.assignedAt?.seconds * 1000);
                return d >= start && d <= end;
            });
        }
        return agentLeads;
    };

    if (selectedAgent) {
        const agentLeads = getAgentLeads(selectedAgent.id);
        return (
            <div className="animate-in fade-in space-y-6">
                <button onClick={()=>setSelectedAgent(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-black transition-colors mb-4"><RotateCcw size={14}/> Volver a la lista</button>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 items-center md:items-start">
                    <img src={selectedAgent.foto || "https://ui-avatars.com/api/?name=" + selectedAgent.nombre} className="w-24 h-24 rounded-full object-cover border-4 border-gray-50 shadow-md" />
                    <div className="flex-1 text-center md:text-left space-y-2">
                        <h2 className="text-2xl font-bold text-gray-900">{selectedAgent.nombre}</h2>
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                             <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium flex items-center gap-1"><MapPin size={12}/> {selectedAgent.estados || 'Sin estados'}</span>
                             <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium flex items-center gap-1"><Phone size={12}/> {selectedAgent.telefono || 'Sin tel'}</span>
                             <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-xs font-medium flex items-center gap-1"><Mail size={12}/> {selectedAgent.email || 'Sin mail'}</span>
                        </div>
                        <p className="text-sm text-gray-500 italic max-w-xl">"{selectedAgent.mensaje || 'Sin mensaje'}"</p>
                    </div>
                    <div className="text-center bg-gray-50 p-4 rounded-xl">
                        <span className="block text-3xl font-bold text-black">{agentLeads.length}</span>
                        <span className="text-xs text-gray-500 uppercase font-bold">Leads Asignados</span>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2"><Filter size={16} className="text-gray-400"/><span className="text-sm font-bold text-gray-700">Filtrar Asignaciones:</span></div>
                    <div className="flex gap-2 flex-wrap">
                        {['all', 'thisMonth', 'lastMonth', 'custom'].map(f => (
                            <button key={f} onClick={()=>setDateFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${dateFilter===f ? 'bg-black text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                {f==='all'?'Todo':f==='thisMonth'?'Este Mes':f==='lastMonth'?'Mes Pasado':'Personalizado'}
                            </button>
                        ))}
                    </div>
                    {dateFilter === 'custom' && (<div className="flex gap-2 items-center animate-in fade-in"><input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} className="bg-gray-50 border rounded p-1 text-xs" /><span className="text-gray-400">-</span><input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} className="bg-gray-50 border rounded p-1 text-xs" /></div>)}
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase">Fecha Asignación</th><th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase">Nombre Lead</th><th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase">Estado</th><th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase">Resumen</th></tr></thead>
                        <tbody className="divide-y divide-gray-50">
                            {agentLeads.length > 0 ? agentLeads.map(lead => (
                                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 text-xs text-gray-600 font-medium">{formatFirestoreDate(lead.assignedAt || lead.createdAt)}</td>
                                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">{lead.nombre}</td>
                                    <td className="px-6 py-4"><span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full uppercase">{lead.status}</span></td>
                                    <td className="px-6 py-4 text-xs text-gray-500 truncate max-w-xs">{lead.resumen_ai}</td>
                                </tr>
                            )) : (<tr><td colSpan="4" className="text-center py-8 text-gray-400 text-sm">No hay leads asignados en este periodo.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Gestión de Agentes</h2>
                <div className="flex gap-2">
                    {selectedIds.length > 0 && (<button onClick={handleDeleteSelected} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"><Trash2 size={16}/> Eliminar ({selectedIds.length})</button>)}
                    <button onClick={()=>openForm(null)} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-lg shadow-gray-200"><UserCog size={16}/> Nuevo Agente</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAgents.map(agent => (
                    <div key={agent.id} className={`bg-white rounded-2xl p-5 border transition-all hover:shadow-md cursor-pointer relative group ${selectedIds.includes(agent.id) ? 'border-blue-500 bg-blue-50/10' : 'border-gray-100'}`} onClick={()=>setSelectedAgent(agent)}>
                        <div className="absolute top-4 right-4 z-10" onClick={e=>e.stopPropagation()}><input type="checkbox" className="custom-checkbox" checked={selectedIds.includes(agent.id)} onChange={()=>handleSelectOne(agent.id)} /></div>
                        <div className="flex items-center gap-4 mb-4">
                            <img src={agent.foto || "https://ui-avatars.com/api/?name=" + agent.nombre} className="w-14 h-14 rounded-full object-cover bg-gray-200" />
                            <div><h3 className="font-bold text-gray-900">{agent.nombre}</h3><p className="text-xs text-gray-500 font-medium">{agent.email}</p></div>
                        </div>
                        <div className="space-y-2 text-xs text-gray-600">
                             <div className="flex items-center gap-2"><Phone size={12}/> {agent.telefono || 'N/A'}</div>
                             <div className="flex items-center gap-2"><MapPin size={12}/> <span className="truncate max-w-[150px]">{agent.estados || 'Sin licencias'}</span></div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ver Bitácora</span>
                            <button onClick={(e)=>{e.stopPropagation(); openForm(agent);}} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil size={14}/></button>
                        </div>
                    </div>
                ))}
            </div>

            {isEditing && (
                <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
                        <h3 className="text-lg font-bold mb-4">{editingAgent ? 'Editar Agente' : 'Nuevo Agente'}</h3>
                        <form onSubmit={handleFormSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                 <div><label className="text-[10px] font-bold text-gray-500 uppercase">Nombre Completo</label><input required className="w-full p-2 border rounded-lg text-sm" value={formData.nombre} onChange={e=>setFormData({...formData, nombre:e.target.value})} /></div>
                                 <div><label className="text-[10px] font-bold text-gray-500 uppercase">Teléfono</label><input className="w-full p-2 border rounded-lg text-sm" value={formData.telefono} onChange={e=>setFormData({...formData, telefono:e.target.value})} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                 <div><label className="text-[10px] font-bold text-gray-500 uppercase">Email</label><input type="email" className="w-full p-2 border rounded-lg text-sm" value={formData.email} onChange={e=>setFormData({...formData, email:e.target.value})} /></div>
                                 <div><label className="text-[10px] font-bold text-gray-500 uppercase">Foto (URL)</label><input className="w-full p-2 border rounded-lg text-sm" placeholder="https://..." value={formData.foto} onChange={e=>setFormData({...formData, foto:e.target.value})} /></div>
                            </div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Estados (Licencias)</label><input placeholder="Ej: FL, TX, CA" className="w-full p-2 border rounded-lg text-sm" value={formData.estados} onChange={e=>setFormData({...formData, estados:e.target.value})} /></div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Mensaje Especial</label><textarea className="w-full p-2 border rounded-lg text-sm h-20" value={formData.mensaje} onChange={e=>setFormData({...formData, mensaje:e.target.value})} /></div>
                            
                            <div className="flex gap-2 justify-end mt-4">
                                <button type="button" onClick={()=>{setIsEditing(false); setEditingAgent(null)}} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button>
                                <button type="submit" className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- LEADS LIST (MODIFICADO: Con Asignación Masiva) ---
function LeadsList({ leads, agents, onAssignAgent, onBulkAssign, onDeleteLead, onUpdateStatus, isArchive, searchTerm }) {
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadToDelete, setLeadToDelete] = useState(null); 
  const [selectedIds, setSelectedIds] = useState([]); 
  const filteredLeads = leads.filter(l => String(l.nombre||'').toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelectAll = (e) => e.target.checked ? setSelectedIds(filteredLeads.map(l => l.id)) : setSelectedIds([]);
  const handleSelectOne = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const handleBulkArchive = () => { if (selectedIds.length > 0) { onUpdateStatus(selectedIds, isArchive ? 'active' : 'archived'); setSelectedIds([]); } };
  const confirmDelete = async () => { if (leadToDelete) { await onDeleteLead(leadToDelete); setLeadToDelete(null); setSelectedIds([]); } };

  const handleBulkAssignChange = (e) => {
      const val = e.target.value;
      if (!val) return;
      if (confirm(val === 'unassign' ? `¿Desasignar ${selectedIds.length} leads?` : `¿Asignar ${selectedIds.length} leads al agente?`)) {
          onBulkAssign(selectedIds, val);
          setSelectedIds([]);
          e.target.value = ""; // Reset
      } else {
          e.target.value = "";
      }
  };

  return (
    <div className="animate-in fade-in duration-500">
        {leadToDelete && (
            <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><Trash2 size={24} /></div>
                    <h3 className="font-bold text-lg text-slate-800 mb-2">{Array.isArray(leadToDelete) && leadToDelete.length > 1 ? `¿Eliminar ${leadToDelete.length} Leads?` : "¿Eliminar este Lead?"}</h3>
                    <p className="text-sm text-slate-500 mb-6">Esta acción es irreversible.</p>
                    <div className="flex gap-3"><button onClick={() => setLeadToDelete(null)} className="flex-1 py-2.5 bg-white border border-gray-200 text-slate-600 rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors">Cancelar</button><button onClick={confirmDelete} className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium text-sm hover:bg-red-600 transition-colors shadow-lg shadow-red-200">Eliminar</button></div>
                </div>
            </div>
        )}

        {selectedLead && (
            <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white w-full max-w-2xl rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
                    <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
                        <div className="flex items-center gap-4"><div className="w-12 h-12 bg-[#F5F5F7] rounded-full flex items-center justify-center text-gray-400"><User size={24} strokeWidth={1.5} /></div><div><h3 className="font-semibold text-[#1d1d1f] text-xl tracking-tight">{String(selectedLead.nombre || 'Anónimo')}</h3><p className="text-xs text-[#86868b] mt-0.5 font-medium">{formatFirestoreDate(selectedLead.createdAt)}</p></div></div>
                        <button onClick={() => setSelectedLead(null)} className="p-2 bg-[#F5F5F7] hover:bg-[#E8E8ED] rounded-full transition-colors text-[#86868b]"><X size={18}/></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-white">
                        <div className="bg-blue-50 p-4 rounded-xl flex items-center justify-between border border-blue-100">
                             <div className="flex items-center gap-2 text-blue-800 font-medium text-sm"><Briefcase size={16}/><span>Asignar a Agente:</span></div>
                             <div className="relative">
                                 <select className="bg-white border border-blue-200 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 pr-8 appearance-none outline-none cursor-pointer" value={selectedLead.assignedAgentId || ""} onChange={(e) => { onAssignAgent(selectedLead.id, e.target.value); setSelectedLead(prev => ({...prev, assignedAgentId: e.target.value})); }}>
                                     <option value="">-- Sin Asignar --</option>
                                     {agents && agents.map(agent => (<option key={agent.id} value={agent.id}>{agent.nombre}</option>))}
                                 </select>
                                 <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none"/>
                             </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Contacto</span><a href={`https://wa.me/${String(selectedLead.telefono || '').replace(/\D/g, '')}`} target="_blank" className="font-semibold text-blue-600 text-lg flex items-center gap-2 hover:underline">{String(selectedLead.telefono || 'No disponible')} <ExternalLink size={14} className="opacity-50" /></a></div>
                            <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Programado</span><p className="font-medium text-[#1d1d1f]">{formatScheduledDate(String(selectedLead.horario_preferido || 'Inmediata'))}</p></div>
                            <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Perfil</span><p className="font-medium text-[#1d1d1f] text-sm">{String(selectedLead.edad || '?')} años • {String(selectedLead.estado || '?')} • {String(selectedLead.fuma || '?')}</p></div>
                            <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Salud</span><p className="font-medium text-[#1d1d1f] text-sm truncate">{String(selectedLead.salud || '-')}</p></div>
                        </div>
                        <div className="relative"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div><div className="pl-5 py-1"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2 flex items-center gap-1"><Sparkles size={12} className="text-blue-500"/> Análisis Lucy</span><p className="text-sm text-[#1d1d1f] leading-relaxed">"{String(selectedLead.resumen_ai || '')}"</p></div></div>
                        <div><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-4">Historial</span><div className="space-y-3">{selectedLead.fullChat?.map((m, i) => (<div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`px-4 py-2.5 rounded-2xl text-xs max-w-[90%] leading-relaxed ${m.role === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#F5F5F7] text-[#1d1d1f]'}`}><RichText content={String(m.content || '')} /></div></div>))}</div></div>
                    </div>
                    <div className="p-6 border-t border-gray-100 flex gap-3 bg-white">
                        <button onClick={() => { const text = `Lead: ${selectedLead.nombre}\nTel: ${selectedLead.telefono}`; navigator.clipboard.writeText(text); }} className="flex-1 py-3 bg-black text-white rounded-xl font-medium text-xs hover:bg-gray-800 transition-all">Copiar Ficha</button>
                        <button onClick={() => { onUpdateStatus(selectedLead.id, isArchive ? 'active' : 'archived'); setSelectedLead(null); }} className="flex-1 py-3 bg-[#F5F5F7] text-[#1d1d1f] rounded-xl font-medium text-xs hover:bg-[#E8E8ED] transition-all">{isArchive ? 'Restaurar' : 'Archivar'}</button>
                    </div>
                </div>
            </div>
        )}
      
        <div className="bg-white rounded-[24px] shadow-sm overflow-hidden border border-gray-100/50">
          {selectedIds.length > 0 && (
              <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex justify-between items-center animate-in fade-in sticky top-0 z-20">
                  <span className="text-xs font-bold text-blue-700">{selectedIds.length} seleccionados</span>
                  <div className="flex gap-2 items-center">
                      
                      {/* NUEVO: Dropdown de Asignación Masiva */}
                      <div className="relative">
                          <select 
                              onChange={handleBulkAssignChange} 
                              className="appearance-none bg-white border border-blue-200 text-blue-700 text-xs font-medium rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
                          >
                              <option value="">Asignar Agente...</option>
                              <option value="unassign">-- Desasignar / Liberar --</option>
                              {agents.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                          </select>
                          <ChevronDown size={14} className="absolute right-2 top-2 text-blue-400 pointer-events-none"/>
                      </div>

                      <button onClick={handleBulkArchive} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors">
                          {isArchive ? <RotateCcw size={14}/> : <Archive size={14}/>}
                          {isArchive ? 'Restaurar' : 'Archivar'}
                      </button>
                      <button onClick={() => setLeadToDelete(selectedIds)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={14}/> Eliminar</button>
                  </div>
              </div>
          )}

          <table className="w-full text-left table-fixed">
            <thead className="bg-[#FBFBFD] border-b border-gray-100">
                <tr>
                    <th className="px-4 py-4 w-12 text-center"><input type="checkbox" className="custom-checkbox" checked={filteredLeads.length > 0 && selectedIds.length === filteredLeads.length} onChange={handleSelectAll} /></th>
                    <th className="px-4 py-4 text-[11px] font-bold text-[#86868b] uppercase w-1/4">Nombre</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-[#86868b] uppercase w-1/4">Agente</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-[#86868b] uppercase w-1/3">Resumen</th>
                    <th className="px-4 py-4 text-[11px] font-bold text-[#86868b] uppercase text-center w-32">Acción</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredLeads.map(l => {
                  const assignedAgent = agents.find(a => a.id === l.assignedAgentId);
                  return (
                    <tr key={l.id} onClick={() => setSelectedLead(l)} className={`hover:bg-[#F5F5F7] transition-colors cursor-pointer group ${selectedIds.includes(l.id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="custom-checkbox" checked={selectedIds.includes(l.id)} onChange={() => handleSelectOne(l.id)} />
                      </td>
                      <td className="px-4 py-5 truncate"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full bg-gradient-to-b from-gray-100 to-gray-200 flex items-center justify-center font-semibold text-xs text-gray-500 shrink-0 border border-white shadow-sm">{l.nombre ? l.nombre.charAt(0).toUpperCase() : '?'}</div><div className="min-w-0"><div className="text-sm font-semibold text-[#1d1d1f] truncate">{String(l.nombre || 'Anónimo')}</div><div className="text-[11px] text-[#86868b] mt-0.5">{String(l.edad || '')} años • {String(l.estado || '')}</div></div></div></td>
                      
                      {/* Columna Agente */}
                      <td className="px-4 py-5">
                          {assignedAgent ? (
                              <div className="flex items-center gap-2">
                                  <img src={assignedAgent.foto || "https://ui-avatars.com/api/?name=" + assignedAgent.nombre} className="w-5 h-5 rounded-full object-cover"/>
                                  <span className="text-xs font-medium text-gray-700 truncate">{assignedAgent.nombre}</span>
                              </div>
                          ) : (
                              <span className="text-[10px] text-gray-400 italic">-- Sin Asignar --</span>
                          )}
                      </td>

                      <td className="px-4 py-5"><p className="text-xs text-[#1d1d1f] truncate opacity-80">"{String(l.resumen_ai || '')}"</p></td>
                      <td className="px-4 py-5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                              <button onClick={() => onUpdateStatus(l.id, isArchive ? 'active' : 'archived')} className="p-2 text-[#86868b] hover:text-[#1d1d1f] hover:bg-white rounded-lg transition-all">
                                {isArchive ? <RotateCcw size={16} strokeWidth={1.5}/> : <Archive size={16} strokeWidth={1.5}/>}
                              </button>
                              <button onClick={() => setLeadToDelete(l.id)} className="p-2 text-[#86868b] hover:text-red-500 hover:bg-white rounded-lg transition-all"><Trash2 size={16} strokeWidth={1.5}/></button>
                          </div>
                      </td>
                    </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
    </div>
  );
}

// --- ADMIN BRAIN (RESTORED) ---
function AdminBrain({ aiConfig, onSaveConfig }) {
  const [c, setC] = useState(aiConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); 
  const [isEditingWebhook, setIsEditingWebhook] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);

  const handleDayToggle = (day) => setC(prev => ({...prev, schedule: {...prev.schedule, [day]: {...prev.schedule[day], enabled: !prev.schedule[day].enabled}}}));
  const handleTimeChange = (day, type, value) => setC(prev => ({...prev, schedule: {...prev.schedule, [day]: {...prev.schedule[day], [type]: value}}}));

  const handleSave = async () => { 
      setIsSaving(true); 
      await onSaveConfig(c); 
      setIsSaving(false); 
      setIsEditingWebhook(false); 
      setShowSuccess(true); 
      setTimeout(() => setShowSuccess(false), 3000); 
  }; 

  const daysList = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

  const handleEditWebhookClick = () => { setShowAuthModal(true); setAuthPassword(''); setAuthError(null); };

  const handleAuthSubmit = async (e) => {
     e.preventDefault();
     setAuthError(null);
     try {
         const user = auth.currentUser;
         if (user && user.email) {
             await signInWithEmailAndPassword(auth, user.email, authPassword);
             setShowAuthModal(false);
             setIsEditingWebhook(true);
         } else {
             setAuthError("No se pudo verificar la sesión.");
         }
     } catch (error) {
         console.error("Auth check failed", error);
         setAuthError("Contraseña incorrecta.");
     }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col md:flex-row gap-10">
        <div className="flex-1 space-y-6">
          <div>
            <h3 className="font-semibold text-[#1d1d1f] mb-4 text-sm flex items-center gap-2">Configuración del Cerebro</h3>
            <div className="space-y-3 mb-6 bg-[#F5F5F7] p-5 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2"><Clock size={14}/> Horario Semanal</span><label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded-md shadow-sm border border-slate-200"><input type="checkbox" checked={c.vacationMode} onChange={(e)=>setC({...c, vacationMode: e.target.checked})} className="accent-orange-500"/> Modo Vacaciones (No Disponible)</label></div>
              {c.vacationMode && (
                  <div className="flex gap-4 items-center bg-orange-50 p-3 rounded-xl border border-orange-100 mb-3 animate-in fade-in">
                      <div><label className="text-[10px] font-bold text-orange-600 uppercase block mb-1">Fecha Inicio</label><input type="date" value={c.vacationStart} onChange={(e) => setC({...c, vacationStart: e.target.value})} className="bg-white border border-orange-200 rounded-lg px-2 py-1 text-xs text-orange-800 outline-none focus:ring-2 focus:ring-orange-200" /></div>
                      <span className="text-orange-400 font-bold">→</span>
                      <div><label className="text-[10px] font-bold text-orange-600 uppercase block mb-1">Fecha Fin</label><input type="date" value={c.vacationEnd} onChange={(e) => setC({...c, vacationEnd: e.target.value})} className="bg-white border border-orange-200 rounded-lg px-2 py-1 text-xs text-orange-800 outline-none focus:ring-2 focus:ring-orange-200" /></div>
                  </div>
              )}
              {daysList.map(day => (
                <div key={day} className="flex items-center justify-between group">
                   <div className="flex items-center gap-3"><input type="checkbox" checked={c.schedule?.[day]?.enabled} onChange={() => handleDayToggle(day)} className="accent-black w-4 h-4 rounded cursor-pointer"/><span className={`text-xs font-bold uppercase tracking-wide w-20 ${c.schedule?.[day]?.enabled ? 'text-slate-700' : 'text-slate-400'}`}>{day}</span></div>
                   {c.schedule?.[day]?.enabled ? (<div className="flex gap-2 items-center animate-in fade-in"><input type="time" value={c.schedule[day].start} onChange={(e)=>handleTimeChange(day, 'start', e.target.value)} className="bg-white border p-1 rounded text-xs w-20 text-center font-medium"/><span className="text-slate-400 text-[10px]">a</span><input type="time" value={c.schedule[day].end} onChange={(e)=>handleTimeChange(day, 'end', e.target.value)} className="bg-white border p-1 rounded text-xs w-20 text-center font-medium"/></div>) : (<span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-8">No disponible</span>)}
                </div>
              ))}
            </div>
            <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Instrucciones Base</label>
            <textarea value={c.systemPrompt} onChange={(e)=>setC({...c, systemPrompt:e.target.value})} className="w-full h-32 p-4 bg-white border border-gray-200 rounded-xl text-xs font-mono text-[#1d1d1f] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm leading-relaxed resize-none" />
          </div>
        </div>
        <div className="md:w-72 space-y-6">
          <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide">Webhook URL (Zapier/Make)</label>
                {!isEditingWebhook && (<button onClick={handleEditWebhookClick} className="text-blue-500 hover:text-blue-700 transition-colors" title="Editar Webhook"><Pencil size={12} /></button>)}
              </div>
              <input type={isEditingWebhook ? "text" : "password"} placeholder="https://hooks.zapier.com/..." value={c.webhookUrl || ""} onChange={(e)=>setC({...c, webhookUrl:e.target.value})} disabled={!isEditingWebhook} className={`w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-medium text-[#1d1d1f] focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all shadow-sm ${!isEditingWebhook ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`} />
              <p className="text-[9px] text-gray-400 mt-1">{isEditingWebhook ? "Edición habilitada. Guarde para bloquear." : "Conectado con Zapier (Oculto)"}</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="w-full bg-black text-white font-medium py-3 rounded-xl hover:bg-gray-800 transition-all text-xs shadow-lg relative overflow-hidden">{isSaving ? "Guardando..." : "Guardar Cambios"}</button>
          {showSuccess && (<div className="animate-in fade-in bg-green-50 text-green-700 border border-green-100 rounded-xl p-3 flex items-center justify-center gap-2 text-xs font-medium shadow-sm mt-2"><CheckCircle size={14} /> Cambios guardados correctamente</div>)}
        </div>
      </div>
      {showAuthModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs border border-gray-100">
                  <div className="flex justify-between items-center mb-4"><h4 className="font-bold text-sm text-slate-800">Confirmar Identidad</h4><button onClick={() => setShowAuthModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button></div>
                  <form onSubmit={handleAuthSubmit} className="space-y-3">
                      <p className="text-xs text-slate-500">Ingrese su contraseña de administrador para editar el Webhook.</p>
                      <input type="password" autoFocus value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-100 outline-none" placeholder="Contraseña"/>
                      {authError && <p className="text-xs text-red-500 font-medium">{authError}</p>}
                      <div className="flex justify-end gap-2 mt-2"><button type="button" onClick={() => setShowAuthModal(false)} className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800">Cancelar</button><button type="submit" className="px-4 py-2 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800">Verificar</button></div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}

// --- CLIENT CHAT (MODIFICADO: Botón compartir URL) ---
function ClientChat({ aiConfig, onSaveLead, onOpenLogin }) {
  const [activeUsers, setActiveUsers] = useState(Math.floor(Math.random() * (28 - 18 + 1)) + 18);
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: 'Hola, soy Lucy, su asistente personal experta en **Gastos Finales**. Mi misión es brindarle la información que necesita para su tranquilidad y la de su familia.\n\nTenga la plena seguridad de que **todo lo que hablemos es confidencial**; nada será divulgado sin su expresa autorización. Mi único objetivo es ayudarle, y si al final de nuestra charla usted lo desea, podré conectarle directamente con un **agente acreditado por su estado**.\n\n¿Cómo le podemos servir el día de hoy?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [pendingLeadData, setPendingLeadData] = useState(null);
  
  const [showShareModal, setShowShareModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  
  const scrollRef = useRef(null);
  const { isAgentAvailable, message: statusMessage, isVacation, resumeDate } = getAgentStatus(aiConfig);

  useEffect(()=>{ 
      const i = setInterval(() => setActiveUsers(p => p + (Math.random() > 0.5 ? 1 : -1)), 5000);
      return () => clearInterval(i);
  },[]);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },[msgs, loading, showOptions]);

  const handleCopyLink = () => {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
          setUrlCopied(true);
          setTimeout(() => setUrlCopied(false), 2500);
      });
  };

  const handleOptionClick = (type) => {
      if (pendingLeadData) {
          const finalLead = {
              ...pendingLeadData,
              metodo_contacto: type,
              horario_preferido: type === 'ahora' ? 'Inmediata' : 'Pendiente'
          };
          onSaveLead(finalLead);
          setPendingLeadData(null); 
          setShowOptions(false); 
          const responseMsg = type === 'ahora' ? "¡Perfecto! Un agente se comunicará con usted en breve al número proporcionado." : "Excelente. Un agente le llamará para programar la cita en el horario que mejor le convenga.";
          setMsgs(prev => [...prev, {role: 'assistant', content: responseMsg}]);
      }
  };

  const send = async (e) => {
    e.preventDefault(); if(!input.trim() || loading) return;
    const newM = [...msgs, {role:'user', content:input}]; setMsgs(newM); setInput(''); setLoading(true);
    try {
        let availabilityInstruction = "";
        if (isVacation && resumeDate) availabilityInstruction = `NOTA CRÍTICA DEL SISTEMA: Estamos en un periodo especial de no disponibilidad hasta el ${resumeDate.toLocaleDateString()}. SI EL USUARIO PIDE LLAMADA INMEDIATA O "AHORA", responde que en este momento no es posible conectar en vivo, pero que podemos agendar una llamada prioritaria a partir del ${resumeDate.toLocaleDateString()}. Sé muy amable y profesional, NO digas "vacaciones".`;

        const prompt = `
          ${aiConfig.systemPrompt}
          ${availabilityInstruction}
          HISTORIAL:
          ${newM.map(m=>`${m.role}: ${m.content}`).join('\n')}
          INSTRUCCIÓN TÉCNICA CRÍTICA:
          Si el usuario YA ha proporcionado Nombre, Edad, y algún dato de contacto, y consideras que la etapa de recolección de datos ha terminado, TU RESPUESTA DEBE INCLUIR UN BLOQUE JSON AL FINAL con este formato:
          \`\`\`json
          { "action": "data_ready", "nombre": "...", "edad": "...", "telefono": "...", "resumen_ai": "..." }
          \`\`\`
          IMPORTANTE: NO te despidas definitivamente todavía. Solo di que tienes opciones disponibles.
          Si no, responde normalmente como Lucy.
        `;

        const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }] }] });
        const rawText = res.candidates[0].content.parts[0].text;
        let reply = rawText;
        const jsonMatch = rawText.match(/```json([\s\S]*?)```/);
        if (jsonMatch) {
            try {
               const jsonStr = jsonMatch[1];
               const data = JSON.parse(jsonStr);
               if (data.action === 'data_ready') {
                   setPendingLeadData({ nombre: data.nombre || 'Anonimo', edad: data.edad || '', telefono: data.telefono || '', resumen_ai: data.resumen_ai || 'Lead capturado por Lucy', fullChat: newM });
                   setShowOptions(true);
                   reply = rawText.replace(jsonMatch[0], '').trim();
               }
            } catch(jsonErr) { console.error("Error parsing JSON", jsonErr); }
        }
        reply = cleanAiMessage(reply);
        setMsgs([...newM, {role:'assistant', content:reply}]);
    } catch(e){ console.error(e); }
    setLoading(false);
  };

  return (
    <div className="max-w-[480px] mx-auto flex flex-col h-full bg-white rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden relative font-sans">
        <div className="bg-white/90 backdrop-blur-xl p-5 border-b border-gray-100 flex items-center justify-between z-10 sticky top-0">
            <div className="flex items-center gap-4">
                <div className="relative"><LucyAvatar className="w-12 h-12" /></div>
                <div>
                  <h2 className="font-bold text-[#1d1d1f] text-lg tracking-tight">Lucy</h2>
                  <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full bg-green-500 animate-pulse`}></span><p className="text-xs text-[#86868b] font-medium">En Línea</p></div>
                      <span className="text-[#86868b] text-[10px]">•</span>
                      <p className="text-xs text-blue-600 font-medium">{activeUsers} personas</p>
                  </div>
                </div>
            </div>
            <button onClick={() => setShowShareModal(true)} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Guardar enlace"><Share2 size={20} /></button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 bg-white no-scrollbar">
            {msgs.map((m,i)=>(
                <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                    {m.role === 'assistant' && <LucyAvatar className="w-8 h-8 mr-2 mt-auto shrink-0" />}
                    <div className={`w-fit max-w-[75%] px-5 py-3 rounded-2xl text-[16px] leading-relaxed shadow-sm text-left ${m.role==='user'?'bg-[#007AFF] text-white rounded-br-none':'bg-[#F2F2F7] text-[#1d1d1f] rounded-bl-none'}`}><RichText content={m.content}/></div>
                </div>
            ))}
            {loading && <div className="flex justify-start pl-10"><div className="bg-[#F2F2F7] px-4 py-3 rounded-2xl rounded-bl-none flex gap-1.5 items-center w-fit"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span></div></div>}
            {showOptions && (
                <div className="flex flex-col gap-2 pt-2 animate-in zoom-in px-8">
                    <button onClick={() => handleOptionClick('ahora')} disabled={!isAgentAvailable} className={`w-full font-medium py-3.5 rounded-xl transition-all text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 ${isAgentAvailable ? 'bg-[#007AFF] text-white hover:bg-[#0062cc]' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}>{isAgentAvailable ? <Zap size={16} fill="currentColor"/> : <Moon size={16}/>} {isAgentAvailable ? 'Hablar con un Agente Ahora' : 'Agentes no disponibles'}</button>
                    <button onClick={() => handleOptionClick('programada')} className="w-full bg-[#F2F2F7] text-[#007AFF] font-medium py-3.5 rounded-xl hover:bg-[#E5E5EA] transition-all text-sm flex items-center justify-center gap-2 active:scale-95"><Calendar size={16}/> Programar Llamada</button>
                </div>
            )}
        </div>
        <form onSubmit={send} className="p-4 bg-white/90 backdrop-blur-xl border-t border-gray-100 flex gap-3">
            <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 bg-[#F2F2F7] border-0 rounded-full px-5 py-3 text-[16px] focus:ring-2 focus:ring-[#007AFF]/20 text-[#1d1d1f] placeholder:text-[#86868b] outline-none transition-all"/>
            <button disabled={loading} className="w-12 h-12 bg-[#007AFF] text-white rounded-full hover:bg-[#0062cc] transition-all active:scale-90 disabled:opacity-50 disabled:scale-100 flex items-center justify-center shrink-0 shadow-md"><Send size={20} fill="currentColor" className="ml-0.5" /></button>
        </form>
        <div className="text-center py-2 bg-white border-t border-gray-50"><button onClick={onOpenLogin} className="text-[9px] text-slate-300 hover:text-slate-400 transition-colors">Acceso Corporativo</button></div>
        {showShareModal && (
            <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                <div className="bg-white rounded-[24px] shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95">
                    <div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-bold text-slate-800">Guardar conversación</h3><p className="text-xs text-slate-500 mt-1">Copie este enlace para volver a hablar con Lucy más tarde sin perder el contacto.</p></div><button onClick={() => setShowShareModal(false)} className="p-1 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full"><X size={16}/></button></div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2 mb-4"><input type="text" readOnly value={window.location.href} className="bg-transparent border-0 text-xs text-slate-600 w-full outline-none font-mono truncate" /></div>
                    <button onClick={handleCopyLink} className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${urlCopied ? 'bg-green-500 text-white' : 'bg-black text-white hover:bg-slate-800'}`}>{urlCopied ? <CheckCircle size={16}/> : <Copy size={16}/>}{urlCopied ? '¡Enlace Copiado!' : 'Copiar Enlace'}</button>
                </div>
            </div>
        )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
