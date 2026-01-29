import React, { useState, useEffect, useRef, useMemo } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
// Importamos Link como LinkIcon para evitar conflictos
import { MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, CheckSquare, Square, Share2, Briefcase, UserCog, Filter, ChevronDown, MapPin, Mail, UserMinus, UserPlus, Link as LinkIcon } from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// --- MODO OFFLINE / PRODUCCIÓN ---
const OFFLINE_MODE = false; 

// --- SEGURIDAD Y CONFIGURACIÓN ---
const AI_KEY_PART_A = "AIzaSyB9qP1gjlqrrdAN";
const AI_KEY_PART_B = "qvhI2hY5KAirqByeI9Q";
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

// --- UTILIDADES ---
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

function cleanAiMessage(text) { if (!text) return ''; let cleaned = text.replace(new RegExp('\\[Botón:.*?\\]', 'gi'), '').replace(new RegExp('\\[Button:.*?\\]', 'gi'), ''); return cleaned.split('***').join('').split('---').join('').trim(); }
function formatScheduledDate(d) { if (!d || d.length < 10) return d; const date = new Date(d); return isNaN(date) ? d : date.toLocaleDateString('en-US', {month:'2-digit', day:'2-digit', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}); }
function formatFirestoreDate(ts) { if (!ts) return 'Reciente'; if (OFFLINE_MODE && typeof ts === 'string') return new Date(ts).toLocaleDateString('en-US'); return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); }
const RichText = ({ content }) => { if (!content || typeof content !== 'string') return null; return <span className="text-sm leading-relaxed">{content.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i} className="text-slate-900 font-bold">{part.slice(2, -2)}</strong> : part)}</span>; };
const rateLimit = { lastCall: 0, count: 0, check: function() { const now = Date.now(); if (now - this.lastCall < 2000) return false; this.lastCall = now; this.count++; if (this.count > 50) return false; return true; } };
const DEFAULT_SCHEDULE = { lunes: { start: '09:00', end: '18:00', enabled: true }, martes: { start: '09:00', end: '18:00', enabled: true }, miercoles: { start: '09:00', end: '18:00', enabled: true }, jueves: { start: '09:00', end: '18:00', enabled: true }, viernes: { start: '09:00', end: '18:00', enabled: true }, sabado: { start: '10:00', end: '14:00', enabled: false }, domingo: { start: '10:00', end: '14:00', enabled: false } };

const getAgentStatus = (config) => { 
    const now = new Date(); 
    if (config?.vacationMode && config?.vacationStart && config?.vacationEnd) { 
        const vStart = new Date(config.vacationStart + 'T00:00:00'); 
        const vEnd = new Date(config.vacationEnd + 'T23:59:59'); 
        if (now >= vStart && now <= vEnd) return { isAgentAvailable: false, isVacation: true, resumeDate: new Date(vEnd.setDate(vEnd.getDate() + 1)) }; 
    } 
    const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][now.getDay()]; 
    const sch = config?.schedule?.[day]; 
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
    
    // Usamos el modelo estable 1.5 flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`; 
    try { 
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); 
        if (res.ok) return await res.json(); 
        console.error("Gemini Error:", await res.text());
    } catch (e) { throw e; } 
    throw new Error("Error conexión AI"); 
}

function useInactivityTimer(action, timeout = 600000) { useEffect(() => { let timer; const resetTimer = () => { clearTimeout(timer); timer = setTimeout(action, timeout); }; window.addEventListener('mousemove', resetTimer); window.addEventListener('keypress', resetTimer); window.addEventListener('click', resetTimer); window.addEventListener('touchstart', resetTimer); resetTimer(); return () => { clearTimeout(timer); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keypress', resetTimer); window.removeEventListener('click', resetTimer); window.removeEventListener('touchstart', resetTimer); }; }, [action, timeout]); }

// --- ESTÉTICA ---
const IMAGES = { lucy: "https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" };
const LucyAvatar = ({ className = "w-10 h-10" }) => (<img src={IMAGES.lucy} alt="Lucy" className={`${className} rounded-full object-cover shadow-sm border border-slate-100 bg-slate-200`} onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"; }} />);
const BrainAvatar = ({ className = "w-10 h-10" }) => (<div className={`${className} rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-sm`}><Sparkles size={20} strokeWidth={2} /></div>);
const ProtectionLogo = ({ size = 24, className = "" }) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9.5L12 3l9 6.5v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M12 18.5c2.5-1.5 5.5-4 5.5-6.5 0-1.7-1.3-3-3-3-1 0-1.9.5-2.5 1.5-.6-1-1.5-1.5-2.5-1.5-1.7 0-3 1.3-3 3 0 2.5 3 5 5.5 6.5z" /></svg>);

// --- MODALES ---

const LeadDetailModal = ({ lead, agents, onClose, onUpdateStatus, isArchive }) => {
    if (!lead) return null;
    const assignedAgent = agents.find(a => a.id === lead.assignedAgentId);

    return (
        <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95 duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#F5F5F7] rounded-full flex items-center justify-center text-gray-400"><User size={24} strokeWidth={1.5} /></div>
                        <div><h3 className="font-semibold text-[#1d1d1f] text-xl tracking-tight">{String(lead.nombre || 'Anónimo')}</h3><p className="text-xs text-[#86868b] mt-0.5 font-medium">{formatFirestoreDate(lead.createdAt)}</p></div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-[#F5F5F7] hover:bg-[#E8E8ED] rounded-full transition-colors text-[#86868b]"><X size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar bg-white">
                    {assignedAgent && (
                        <div className="bg-blue-50 p-4 rounded-xl flex items-center gap-3 border border-blue-100">
                            <img src={assignedAgent.foto || "https://ui-avatars.com/api/?name=" + assignedAgent.nombre} className="w-10 h-10 rounded-full object-cover border-2 border-white"/>
                            <div><p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Agente Responsable</p><p className="font-bold text-blue-900 text-sm">{assignedAgent.nombre}</p></div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Contacto</span><a href={`https://wa.me/${String(lead.telefono || '').replace(/\D/g, '')}`} target="_blank" className="font-semibold text-blue-600 text-lg flex items-center gap-2 hover:underline">{String(lead.telefono || 'No disponible')} <ExternalLink size={14} className="opacity-50" /></a></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Programado</span><p className="font-medium text-[#1d1d1f]">{formatScheduledDate(String(lead.horario_preferido || 'Inmediata'))}</p></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Perfil</span><p className="font-medium text-[#1d1d1f] text-sm">{String(lead.edad || '?')} años • {String(lead.estado || '?')} • {String(lead.fuma || '?')}</p></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2">Salud</span><p className="font-medium text-[#1d1d1f] text-sm truncate">{String(lead.salud || '-')}</p></div>
                    </div>
                    <div className="relative"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div><div className="pl-5 py-1"><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-2 flex items-center gap-1"><Sparkles size={12} className="text-blue-500"/> Análisis Lucy</span><p className="text-sm text-[#1d1d1f] leading-relaxed">"{String(lead.resumen_ai || '')}"</p></div></div>
                    <div><span className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wide block mb-4">Historial</span><div className="space-y-3">{lead.fullChat?.map((m, i) => (<div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`px-4 py-2.5 rounded-2xl text-xs max-w-[90%] leading-relaxed ${m.role === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#F5F5F7] text-[#1d1d1f]'}`}><RichText content={String(m.content || '')} /></div></div>))}</div></div>
                </div>
                <div className="p-6 border-t border-gray-100 flex gap-3 bg-white">
                    <button onClick={() => { const text = `Lead: ${lead.nombre}\nTel: ${lead.telefono}`; navigator.clipboard.writeText(text); }} className="flex-1 py-3 bg-black text-white rounded-xl font-medium text-xs hover:bg-gray-800 transition-all">Copiar Ficha</button>
                    <button onClick={() => { onUpdateStatus(lead.id, isArchive ? 'active' : 'archived'); onClose(); }} className="flex-1 py-3 bg-[#F5F5F7] text-[#1d1d1f] rounded-xl font-medium text-xs hover:bg-[#E8E8ED] transition-all">{isArchive ? 'Restaurar' : 'Archivar'}</button>
                </div>
            </div>
        </div>
    );
};

const AgentAssignmentModal = ({ isOpen, onClose, onAssign, agents }) => {
    const [search, setSearch] = useState('');
    if (!isOpen) return null;
    const filtered = agents.filter(a => a.nombre.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white"><h3 className="font-bold text-gray-800">Seleccionar Agente</h3><button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={18}/></button></div>
                <div className="p-4 bg-gray-50 border-b border-gray-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input autoFocus type="text" placeholder="Buscar agente..." className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" value={search} onChange={(e) => setSearch(e.target.value)} />
                        {search && (<button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>)}
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    <button onClick={() => onAssign('unassign')} className="w-full flex items-center gap-3 p-3 hover:bg-red-50 rounded-xl transition-colors text-left group"><div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-500 group-hover:bg-red-200"><UserMinus size={18}/></div><div><p className="font-bold text-red-600 text-sm">Desasignar / Liberar</p><p className="text-[10px] text-red-400">Dejar sin agente</p></div></button>
                    <div className="h-px bg-gray-100 my-1 mx-4"></div>
                    {filtered.length > 0 ? filtered.map(agent => (
                        <button key={agent.id} onClick={() => onAssign(agent.id)} className="w-full flex items-center gap-3 p-3 hover:bg-blue-50 rounded-xl transition-colors text-left"><img src={agent.foto || "https://ui-avatars.com/api/?name=" + agent.nombre} className="w-10 h-10 rounded-full object-cover border border-gray-200" /><div className="flex-1 min-w-0"><p className="font-bold text-gray-800 text-sm truncate">{agent.nombre}</p><div className="flex items-center gap-2 text-[10px] text-gray-500"><span className="flex items-center gap-1"><MapPin size={10}/> {agent.estados || 'N/A'}</span></div></div><div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">Asignar</div></button>
                    )) : (<p className="text-center text-gray-400 text-sm py-4">No se encontraron agentes.</p>)}
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL APP ---
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

  // Estados Globales
  const [selectedLead, setSelectedLead] = useState(null); 
  const [assignModalData, setAssignModalData] = useState({ isOpen: false, targetIds: [] }); 

  const [aiConfig, setAiConfig] = useState({
    systemPrompt: `Eres Lucy...`, webhookUrl: "", assignmentWebhookUrl: "", schedule: DEFAULT_SCHEDULE, 
    vacationMode: false, vacationStart: "", vacationEnd: "", personality: "Empático"
  });

  useEffect(() => { const handlePopState = (event) => { if (event.state && event.state.view) setView(event.state.view); else setView('landing'); }; window.addEventListener('popstate', handlePopState); return () => window.removeEventListener('popstate', handlePopState); }, []);
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

  useEffect(() => {
      if (OFFLINE_MODE || !user || !isAdmin) return;
      const agentsDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list');
      const unsub = onSnapshot(agentsDocRef, (docSnap) => { if (docSnap.exists()) { setAgents(docSnap.data().list || []); } else { setAgents([]); } });
      return () => unsub();
  }, [user, isAdmin]);

  const handleLogin = async (e) => { e.preventDefault(); setIsLoggingIn(true); setLoginError(null); if (OFFLINE_MODE) { setTimeout(()=>{ setIsAdmin(true); navigateTo('admin'); setShowLogin(false); setIsLoggingIn(false); }, 1000); return; } try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); setEmail(''); setPassword(''); } catch (error) { setLoginError("Credenciales no válidas."); } setIsLoggingIn(false); };
  const handleLogout = async () => { if (!OFFLINE_MODE) await signOut(auth); setIsAdmin(false); navigateTo('landing'); };
  const notifyNewLead = (lead) => { if (Notification.permission === "granted") new Notification("¡Nuevo Lead!", { body: lead.nombre, icon: IMAGES.lucy }); if (aiConfig.webhookUrl && lead.status === 'active') fetch(aiConfig.webhookUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(e=>console.error(e)); };
  const saveLeadToDb = async (leadData) => { if (OFFLINE_MODE) { alert("Modo Offline"); return; } await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), { ...leadData, createdAt: serverTimestamp(), status: 'active' }); };
  const saveAiConfig = async (newConfig) => { if (OFFLINE_MODE) { setAiConfig(newConfig); return; } if (!user || !isAdmin) return; await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config'), newConfig); setAiConfig(newConfig); };
  
  const deleteLead = async (ids) => { const idArray = Array.isArray(ids) ? ids : [ids]; if(!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id); batch.delete(ref); }); await batch.commit(); }
  const updateLeadStatus = async (ids, status) => { const idArray = Array.isArray(ids) ? ids : [ids]; if(!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id); batch.update(ref, { status: status }); }); await batch.commit(); }
  
  const handleAssignAgent = async (agentId) => {
      if(!isAdmin) return;
      const targetIds = assignModalData.targetIds;
      if (targetIds.length === 0) return;

      const assignedAgent = agentId !== 'unassign' ? agents.find(a => a.id === agentId) : null;
      const batch = writeBatch(db);
      targetIds.forEach(id => {
          const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id);
          batch.update(ref, { 
              assignedAgentId: agentId === 'unassign' ? null : agentId, 
              assignedAt: agentId === 'unassign' ? null : serverTimestamp() 
          });
      });
      await batch.commit();

      if (assignedAgent && aiConfig.assignmentWebhookUrl) {
          const targetLeads = leads.filter(l => targetIds.includes(l.id));
          targetLeads.forEach(lead => {
              if (lead.email) { 
                  const payload = { leadName: lead.nombre, leadEmail: lead.email, leadPhone: lead.telefono, agentName: assignedAgent.nombre, agentEmail: assignedAgent.email, agentPhone: assignedAgent.telefono, agentPhoto: assignedAgent.foto, assignedAt: new Date().toISOString() };
                  fetch(aiConfig.assignmentWebhookUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(err => console.error("Error webhook asignación:", err));
              }
          });
      }
      setAssignModalData({ isOpen: false, targetIds: [] });
  };

  const openAssignModal = (ids) => { setAssignModalData({ isOpen: true, targetIds: ids }); };

  const saveAgent = async (agentData) => { 
      if(!isAdmin) return; const agentsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'); const docSnap = await getDoc(agentsRef); let currentList = docSnap.exists() ? (docSnap.data().list || []) : [];
      if (agentData.id) { currentList = currentList.map(a => a.id === agentData.id ? { ...agentData, updatedAt: Date.now() } : a); } 
      else { const newAgent = { ...agentData, id: generateId(), createdAt: Date.now() }; currentList.push(newAgent); }
      await setDoc(agentsRef, { list: currentList });
  };
  const deleteAgent = async (ids) => { 
      const idArray = Array.isArray(ids) ? ids : [ids]; if(!isAdmin) return; const agentsRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'); const docSnap = await getDoc(agentsRef); if (!docSnap.exists()) return;
      let currentList = docSnap.data().list || []; currentList = currentList.filter(a => !idArray.includes(a.id)); await setDoc(agentsRef, { list: currentList });
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
                  <button onClick={() => setAdminTab('active')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'active' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Inbox size={14}/> Activos</button>
                  <button onClick={() => setAdminTab('assigned')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'assigned' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><UserCheck size={14}/> Asignados</button>
                  <button onClick={() => setAdminTab('archived')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'archived' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Archive size={14}/> Archivo</button>
                  <button onClick={() => setAdminTab('agents')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'agents' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Briefcase size={14}/> Agentes</button>
                  <button onClick={() => setAdminTab('brain')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'brain' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Sparkles size={14}/> Inteligencia</button>
               </div>
               {adminTab !== 'brain' && <div className="relative group w-full md:w-auto"><Search className="absolute left-3 top-2.5 text-gray-400" size={14} /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-8 py-2 bg-white border-0 rounded-xl text-sm w-full md:w-64 outline-none shadow-sm" />{searchTerm && (<button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>)}</div>}
            </div>
            
            {adminTab === 'active' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active') && !l.assignedAgentId)} agents={agents} onOpenLead={(l) => setSelectedLead(l)} onOpenAssign={openAssignModal} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={false} searchTerm={searchTerm} /> : 
             adminTab === 'assigned' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active') && l.assignedAgentId)} agents={agents} onOpenLead={(l) => setSelectedLead(l)} onOpenAssign={openAssignModal} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={false} searchTerm={searchTerm} /> :
             adminTab === 'archived' ? <LeadsList leads={leads.filter(l => l.status === 'archived')} agents={agents} onOpenLead={(l) => setSelectedLead(l)} onOpenAssign={openAssignModal} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={true} searchTerm={searchTerm} /> : 
             adminTab === 'agents' ? <AgentsManager agents={agents} leads={leads} onOpenLead={(l) => setSelectedLead(l)} onSaveAgent={saveAgent} onDeleteAgent={deleteAgent} searchTerm={searchTerm} /> :
             <AdminBrain aiConfig={aiConfig} onSaveConfig={saveAiConfig} />}
          </div>
        )}
      </main>

      <LeadDetailModal lead={selectedLead} agents={agents} onClose={() => setSelectedLead(null)} onUpdateStatus={updateLeadStatus} isArchive={adminTab === 'archived'} />
      <AgentAssignmentModal isOpen={assignModalData.isOpen} agents={agents} onClose={() => setAssignModalData({ ...assignModalData, isOpen: false })} onAssign={handleAssignAgent} />

      {showLogin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6"><div className="flex items-center gap-2 text-red-600"><ShieldAlert size={20} /><h3 className="font-bold text-lg text-slate-800">Acceso Restringido</h3></div><button onClick={() => setShowLogin(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button></div>
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
