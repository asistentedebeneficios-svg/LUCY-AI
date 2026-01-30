import React, { useState, useEffect, useRef, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { 
  MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, 
  Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, 
  FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, 
  Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, 
  Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, 
  CheckSquare, Square, Share2, Briefcase, UserCog, Filter, ChevronDown, MapPin, 
  Mail, UserMinus, UserPlus, Link as LinkIcon, Plus, MinusCircle, AlertTriangle 
} from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// --- CONFIGURACIÓN ---
const OFFLINE_MODE = false;
const AI_KEY_PART_A = "AIzaSyAIOAO4-h7lRRK8";
const AI_KEY_PART_B = "SKAC2hgomoE-MaCZ58M";
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

let app, auth, db;
if (!OFFLINE_MODE) {
    try {
        app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) { console.error("Firebase Error:", e); }
}

// --- UTILIDADES ---
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

function cleanAiMessage(text) {
    if (!text) return '';
    return text.replace(/\[Botón:.*?\]/gi, '').replace(/\[Button:.*?\]/gi, '').split('***').join('').split('---').join('').trim();
}

function formatScheduledDate(d) {
    if (!d || d.length < 10) return d;
    const date = new Date(d);
    return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFirestoreDate(ts) {
    if (!ts) return 'Reciente';
    if (OFFLINE_MODE && typeof ts === 'string') return new Date(ts).toLocaleDateString('en-US');
    try { return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); } catch (e) { return ''; }
}

const RichText = ({ content }) => {
    if (!content || typeof content !== 'string') return null;
    return <span className="text-sm leading-relaxed">{content.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i} className="text-slate-900 font-bold">{part.slice(2, -2)}</strong> : part)}</span>;
};

// --- LÓGICA DE HORARIOS ROBUSTA ---
const DEFAULT_SCHEDULE = { 
    lunes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    martes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    miercoles: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    jueves: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    viernes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    sabado: { enabled: false, slots: [{start: '10:00', end: '14:00'}] },
    domingo: { enabled: false, slots: [{start: '10:00', end: '14:00'}] }
};

const getAgentStatus = (config) => {
    try {
        // Fallback si config es null/undefined
        if (!config) return { isAgentAvailable: true, message: "Disponible" };

        const now = new Date();
        
        // 1. Vacaciones
        if (config.vacationMode && config.vacationStart && config.vacationEnd) {
            const vStart = new Date(config.vacationStart + 'T00:00:00');
            const vEnd = new Date(config.vacationEnd + 'T23:59:59');
            if (now >= vStart && now <= vEnd) return { isAgentAvailable: false, isVacation: true, resumeDate: new Date(vEnd.setDate(vEnd.getDate() + 1)) };
        }
        
        // 2. Horario Diario (Multi-Slot)
        const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const dayName = days[now.getDay()];
        const dayConfig = config.schedule?.[dayName];
        
        if (!dayConfig || !dayConfig.enabled) return { isAgentAvailable: false, message: "Cerrado hoy" };

        // Normalizar slots (para soportar config antigua que solo tenía start/end simple)
        let slots = dayConfig.slots || [];
        if (slots.length === 0 && dayConfig.start && dayConfig.end) {
            slots = [{ start: dayConfig.start, end: dayConfig.end }];
        }

        if (slots.length === 0) return { isAgentAvailable: false, message: "Sin turnos" };

        const currentMins = now.getHours() * 60 + now.getMinutes();
        
        // Verificar si estamos dentro de ALGÚN slot
        const isOpen = slots.some(slot => {
            if (!slot.start || !slot.end) return false;
            const [sH, sM] = slot.start.split(':').map(Number);
            const [eH, eM] = slot.end.split(':').map(Number);
            const start = sH * 60 + (sM || 0);
            const end = eH * 60 + (eM || 0);
            return currentMins >= start && currentMins < end;
        });

        return isOpen 
            ? { isAgentAvailable: true, message: "Agentes Disponibles" }
            : { isAgentAvailable: false, message: "Cerrado ahora" };

    } catch (e) {
        console.error("Error horario:", e);
        return { isAgentAvailable: true, message: "Disponible (Error)" };
    }
};

const getScheduleText = (schedule) => {
    if (!schedule) return "No especificado";
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    return days.map(d => {
        const c = schedule[d];
        if (!c?.enabled) return `${d}: Cerrado`;
        const slots = c.slots || (c.start ? [{start: c.start, end: c.end}] : []);
        const times = slots.map(s => `${s.start}-${s.end}`).join(', ');
        return `${d}: ${times || 'Sin horario'}`;
    }).join('\n');
};

// --- API FETCH (Auto-Retry Models) ---
async function fetchGeminiWithRetry(payload) {
    if (OFFLINE_MODE) { await new Promise(r => setTimeout(r, 1000)); return { candidates: [{ content: { parts: [{ text: "Modo offline." }] } }] }; }
    
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let lastError = null;

    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (res.ok) return await res.json();
            lastError = `Modelo ${model}: ${res.status} ${res.statusText}`;
        } catch (e) { lastError = e.message; }
    }
    throw new Error(lastError || "Error de conexión AI");
}

function useInactivityTimer(action, timeout = 600000) { 
    const savedAction = useRef(action);
    useEffect(() => { savedAction.current = action; }, [action]);
    useEffect(() => { 
        let timer; const resetTimer = () => { clearTimeout(timer); timer = setTimeout(() => savedAction.current(), timeout); }; 
        window.addEventListener('mousemove', resetTimer); window.addEventListener('click', resetTimer); window.addEventListener('keypress', resetTimer); window.addEventListener('touchstart', resetTimer); resetTimer(); 
        return () => { clearTimeout(timer); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('click', resetTimer); window.removeEventListener('keypress', resetTimer); window.removeEventListener('touchstart', resetTimer); }; 
    }, [timeout]); 
}

// --- COMPONENTES UI ---
const LucyAvatar = ({ className = "w-10 h-10" }) => (<img src="https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" alt="Lucy" className={`${className} rounded-full object-cover shadow-sm border border-slate-100 bg-slate-200`} onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"; }} />);
const ProtectionLogo = ({ size = 24, className = "" }) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9.5L12 3l9 6.5v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M12 18.5c2.5-1.5 5.5-4 5.5-6.5 0-1.7-1.3-3-3-3-1 0-1.9.5-2.5 1.5-.6-1-1.5-1.5-2.5-1.5-1.7 0-3 1.3-3 3 0 2.5 3 5 5.5 6.5z" /></svg>);

// --- MODALES ---
const LeadDetailModal = ({ lead, agents, onClose, onAssignClick, onUpdateStatus, isArchive }) => {
    if (!lead) return null;
    const assignedAgent = agents.find(a => a.id === lead.assignedAgentId);
    return (
        <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4"><div className="w-12 h-12 bg-[#F5F5F7] rounded-full flex items-center justify-center text-gray-400"><User size={24} /></div><div><h3 className="font-semibold text-[#1d1d1f] text-xl">{lead.nombre || 'Anónimo'}</h3><p className="text-xs text-[#86868b]">{formatFirestoreDate(lead.createdAt)}</p></div></div>
                    <button onClick={onClose} className="p-2 bg-[#F5F5F7] hover:bg-[#E8E8ED] rounded-full text-[#86868b]"><X size={18}/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
                    {assignedAgent && (
                        <div className="bg-blue-50 p-4 rounded-xl flex items-center justify-between border border-blue-100">
                            <div className="flex items-center gap-3"><img src={assignedAgent.foto || "https://ui-avatars.com/api/?name=" + assignedAgent.nombre} className="w-10 h-10 rounded-full object-cover border-2 border-white"/><div><p className="text-[10px] font-bold text-blue-600 uppercase">Agente Responsable</p><p className="font-bold text-blue-900 text-sm">{assignedAgent.nombre}</p></div></div>
                            {onAssignClick && (<button onClick={() => onAssignClick([lead.id], 'unassign')} className="p-2 bg-white text-red-500 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100" title="Desvincular"><LinkIcon size={16} className="rotate-45"/></button>)}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-2">Contacto</span><a href={`https://wa.me/${String(lead.telefono || '').replace(/\D/g, '')}`} target="_blank" className="font-semibold text-blue-600 text-lg flex items-center gap-2 hover:underline">{lead.telefono || 'No disponible'} <ExternalLink size={14}/></a></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-2">Programado</span><p className="font-medium text-[#1d1d1f]">{formatScheduledDate(String(lead.horario_preferido || 'Inmediata'))}</p></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-2">Perfil</span><p className="font-medium text-[#1d1d1f] text-sm">{lead.edad || '?'} años • {lead.estado || '?'} • {lead.fuma || '?'}</p></div>
                        <div className="bg-[#F5F5F7] p-5 rounded-2xl"><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-2">Salud</span><p className="font-medium text-[#1d1d1f] text-sm truncate">{lead.salud || '-'}</p></div>
                    </div>
                    <div className="relative"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-full"></div><div className="pl-5 py-1"><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-2 flex items-center gap-1"><Sparkles size={12} className="text-blue-500"/> Análisis Lucy</span><p className="text-sm text-[#1d1d1f] leading-relaxed">"{lead.resumen_ai || ''}"</p></div></div>
                    <div><span className="text-[10px] font-semibold text-[#86868b] uppercase block mb-4">Historial</span><div className="space-y-3">{lead.fullChat?.map((m, i) => (<div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`px-4 py-2.5 rounded-2xl text-xs max-w-[90%] leading-relaxed ${m.role === 'user' ? 'bg-[#0071e3] text-white' : 'bg-[#F5F5F7] text-[#1d1d1f]'}`}><RichText content={String(m.content || '')} /></div></div>))}</div></div>
                </div>
                <div className="p-6 border-t border-gray-100 flex gap-3 bg-white">
                    <button onClick={() => { const text = `Lead: ${lead.nombre}\nTel: ${lead.telefono}`; navigator.clipboard.writeText(text); }} className="flex-1 py-3 bg-black text-white rounded-xl font-medium text-xs hover:bg-gray-800">Copiar Ficha</button>
                    <button onClick={() => { onUpdateStatus(lead.id, isArchive ? 'active' : 'archived'); onClose(); }} className="flex-1 py-3 bg-[#F5F5F7] text-[#1d1d1f] rounded-xl font-medium text-xs hover:bg-[#E8E8ED]">{isArchive ? 'Restaurar' : 'Archivar'}</button>
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
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white"><h3 className="font-bold text-gray-800">Seleccionar Agente</h3><button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={18}/></button></div>
                <div className="p-4 bg-gray-50 border-b border-gray-100"><div className="relative"><Search className="absolute left-3 top-2.5 text-gray-400" size={16} /><input autoFocus type="text" placeholder="Buscar agente..." className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-100" value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button onClick={()=>setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"><X size={14}/></button>}</div></div>
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

// --- APP ---
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
    const [selectedLead, setSelectedLead] = useState(null);
    const [assignModalData, setAssignModalData] = useState({ isOpen: false, targetIds: [] });
    const [aiConfig, setAiConfig] = useState({ systemPrompt: `Eres Lucy...`, webhookUrl: "", assignmentWebhookUrl: "", schedule: DEFAULT_SCHEDULE, vacationMode: false, vacationStart: "", vacationEnd: "", personality: "Empático" });

    useEffect(() => { const handlePopState = (event) => { if (event.state && event.state.view) setView(event.state.view); else setView('landing'); }; window.addEventListener('popstate', handlePopState); return () => window.removeEventListener('popstate', handlePopState); }, []);
    const navigateTo = (newView) => { setView(newView); window.history.pushState({ view: newView }, '', `#${newView}`); };
    useInactivityTimer(() => { if (view !== 'landing') { if (isAdmin) handleLogout(); else navigateTo('landing'); } }, 600000);

    useEffect(() => {
        if (OFFLINE_MODE) { setUser({ uid: 'offline', isAnonymous: true }); return; }
        if (!auth) return;
        return onAuthStateChanged(auth, (u) => { if (u) { setUser(u); if (!u.isAnonymous) { setIsAdmin(true); navigateTo('admin'); } else { setIsAdmin(false); } } else { signInAnonymously(auth).catch(e => console.error(e)); } });
    }, []);

    useEffect(() => {
        if (OFFLINE_MODE || !user || !db) return;
        const unsub = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), (snap) => {
            setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
            setPermissionError(false);
        }, (err) => { if (err.code === 'permission-denied' && isAdmin) setPermissionError(true); });
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config')).then(s => s.exists() && setAiConfig(prev => ({...prev, ...s.data()})));
        return () => unsub();
    }, [user, isAdmin]);

    useEffect(() => {
        if (OFFLINE_MODE || !user || !isAdmin || !db) return;
        return onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'), (s) => setAgents(s.exists() ? (s.data().list || []) : []));
    }, [user, isAdmin]);

    const handleLogin = async (e) => { e.preventDefault(); setIsLoggingIn(true); setLoginError(null); try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); setEmail(''); setPassword(''); } catch (error) { setLoginError("Credenciales no válidas."); } setIsLoggingIn(false); };
    const handleLogout = async () => { await signOut(auth); setIsAdmin(false); navigateTo('landing'); };
    const saveLeadToDb = async (leadData) => { if (OFFLINE_MODE) return; await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), { ...leadData, createdAt: serverTimestamp(), status: 'active' }); };
    const saveAiConfig = async (newConfig) => { if (OFFLINE_MODE) { setAiConfig(newConfig); return; } if (!user || !isAdmin) return; await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config'), newConfig); setAiConfig(newConfig); };
    
    const deleteLead = async (ids) => { const idArray = Array.isArray(ids) ? ids : [ids]; if (!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id)); }); await batch.commit(); }
    const updateLeadStatus = async (ids, status) => { const idArray = Array.isArray(ids) ? ids : [ids]; if (!isAdmin) return; const batch = writeBatch(db); idArray.forEach(id => { batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id), { status: status }); }); await batch.commit(); }

    const handleAssignAgent = async (agentId) => {
        if (!isAdmin) return;
        const targetIds = assignModalData.targetIds;
        if (targetIds.length === 0) return;
        const assignedAgent = agentId !== 'unassign' ? agents.find(a => a.id === agentId) : null;
        const batch = writeBatch(db);
        targetIds.forEach(id => { batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id), { assignedAgentId: agentId === 'unassign' ? null : agentId, assignedAt: agentId === 'unassign' ? null : serverTimestamp() }); });
        await batch.commit();
        if (assignedAgent && aiConfig.assignmentWebhookUrl) {
            const targetLeads = leads.filter(l => targetIds.includes(l.id));
            targetLeads.forEach(lead => { if (lead.email) { fetch(aiConfig.assignmentWebhookUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadName: lead.nombre, leadEmail: lead.email, leadPhone: lead.telefono, agentName: assignedAgent.nombre, agentEmail: assignedAgent.email, agentPhone: assignedAgent.telefono, agentPhoto: assignedAgent.foto, assignedAt: new Date().toISOString() }) }).catch(e => console.error(e)); } });
        }
        setAssignModalData({ isOpen: false, targetIds: [] });
    };

    const saveAgent = async (agentData) => { if (!isAdmin) return; const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'); const snap = await getDoc(ref); let list = snap.exists() ? (snap.data().list || []) : []; if (agentData.id) { list = list.map(a => a.id === agentData.id ? { ...agentData, updatedAt: Date.now() } : a); } else { list.push({ ...agentData, id: generateId(), createdAt: Date.now() }); } await setDoc(ref, { list }); };
    const deleteAgent = async (ids) => { const idArray = Array.isArray(ids) ? ids : [ids]; if (!isAdmin) return; const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'); const snap = await getDoc(ref); if (!snap.exists()) return; await setDoc(ref, { list: snap.data().list.filter(a => !idArray.includes(a.id)) }); };

    if (!user) return <div className="h-screen flex items-center justify-center bg-[#F5F5F7] text-slate-400">Cargando...</div>;

    return (
        <div className="h-[100dvh] bg-[#F5F5F7] text-[#1d1d1f] font-sans antialiased flex flex-col overflow-hidden">
            {OFFLINE_MODE && <div className="absolute top-0 w-full z-[100] bg-yellow-500 text-white p-1 text-center text-[10px] font-bold">MODO OFFLINE</div>}
            {permissionError && <div className="absolute top-0 w-full z-[100] bg-red-600 text-white p-2 text-center text-xs font-bold">Error de Permisos</div>}
            <nav className="bg-white/80 backdrop-blur-xl border-b border-white/20 shrink-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
                    <div className="flex items-center gap-3"><div className="bg-rose-500 text-white p-1.5 rounded-lg shadow-sm"><ProtectionLogo size={20} /></div><span className="font-semibold text-lg tracking-tight">Asistente de Beneficios</span></div>
                    {isAdmin && (<div className="flex bg-[#E8E8ED]/50 p-1 rounded-full"><button onClick={() => navigateTo('chat')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'chat' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Asistente</button><button onClick={() => navigateTo('admin')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'admin' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Admin</button><button onClick={handleLogout} className="ml-2 px-2 text-xs text-red-400 hover:text-red-600 font-medium">Salir</button></div>)}
                </div>
            </nav>
            <main className="flex-1 relative overflow-hidden flex flex-col w-full max-w-7xl mx-auto">
                {!isAdmin ? (view === 'landing' ? <LandingView onStartChat={() => navigateTo('chat')} onOpenLogin={() => setShowLogin(true)} /> : <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden"><ClientChat aiConfig={aiConfig} onSaveLead={saveLeadToDb} onOpenLogin={() => setShowLogin(true)} /></div>) : (
                    view === 'chat' ? <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden"><ClientChat aiConfig={aiConfig} onSaveLead={saveLeadToDb} /></div> :
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div className="flex gap-1 bg-[#E8E8ED]/50 p-1 rounded-xl w-fit self-start">
                                    <button onClick={() => setAdminTab('active')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'active' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Inbox size={14} /> Activos</button>
                                    <button onClick={() => setAdminTab('assigned')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'assigned' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><UserCheck size={14} /> Asignados</button>
                                    <button onClick={() => setAdminTab('archived')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'archived' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Archive size={14} /> Archivo</button>
                                    <button onClick={() => setAdminTab('agents')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'agents' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Briefcase size={14} /> Agentes</button>
                                    <button onClick={() => setAdminTab('brain')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${adminTab === 'brain' ? 'bg-white text-black shadow-sm' : 'text-[#86868b] hover:text-black'}`}><Sparkles size={14} /> Inteligencia</button>
                                </div>
                                {adminTab !== 'brain' && <div className="relative group w-full md:w-auto"><Search className="absolute left-3 top-2.5 text-gray-400" size={14} /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-8 py-2 bg-white border-0 rounded-xl text-sm w-full md:w-64 outline-none shadow-sm" />{searchTerm && <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>}</div>}
                            </div>
                            {adminTab === 'active' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active') && !l.assignedAgentId)} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids) => setAssignModalData({isOpen: true, targetIds: ids})} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={false} searchTerm={searchTerm} /> :
                                adminTab === 'assigned' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active') && l.assignedAgentId)} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids) => setAssignModalData({isOpen: true, targetIds: ids})} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={false} searchTerm={searchTerm} /> :
                                    adminTab === 'archived' ? <LeadsList leads={leads.filter(l => l.status === 'archived')} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids) => setAssignModalData({isOpen: true, targetIds: ids})} onDeleteLead={deleteLead} onUpdateStatus={updateLeadStatus} isArchive={true} searchTerm={searchTerm} /> :
                                        adminTab === 'agents' ? <AgentsManager agents={agents} leads={leads} onOpenLead={setSelectedLead} onSaveAgent={saveAgent} onDeleteAgent={deleteAgent} searchTerm={searchTerm} /> :
                                            <AdminBrain aiConfig={aiConfig} onSaveConfig={saveAiConfig} />}
                        </div>
                )}
            </main>
            <LeadDetailModal lead={selectedLead} agents={agents} onClose={() => setSelectedLead(null)} onAssignClick={handleAssignAgent} onUpdateStatus={updateLeadStatus} isArchive={adminTab === 'archived'} />
            <AgentAssignmentModal isOpen={assignModalData.isOpen} agents={agents} onClose={() => setAssignModalData({ ...assignModalData, isOpen: false })} onAssign={handleAssignAgent} />
            {showLogin && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
                        <h3 className="font-bold text-lg text-slate-800 mb-6 flex items-center gap-2"><ShieldAlert size={20} className="text-red-600"/> Acceso Restringido</h3>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Correo Corporativo</label><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" placeholder="usuario@empresa.com" /></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Credencial</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" placeholder="••••••••" /></div>
                            {loginError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg font-medium">{loginError}</div>}
                            <button type="submit" disabled={isLoggingIn} className="w-full bg-black text-white font-medium py-3 rounded-xl hover:bg-gray-800 transition-all text-sm">{isLoggingIn ? 'Verificando...' : 'Iniciar Sesión'}</button>
                        </form>
                        <button onClick={() => setShowLogin(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20}/></button>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- LANDING VIEW ---
function LandingView({ onStartChat, onOpenLogin }) {
    const testimonials = [{ text: "Gracias a Lucy encontré un plan perfecto para mi mamá sin gastar de más.", author: "María G. - Florida" }, { text: "Excelente atención, muy paciente y clara.", author: "Carmen R. - Texas" }, { text: "Rápido y sencillo. Encontré justo lo que necesitaba.", author: "José L. - California" }];
    const [idx, setIdx] = useState(0);
    useEffect(() => { const t = setInterval(() => setIdx((p) => (p + 1) % testimonials.length), 5000); return () => clearInterval(t); }, []);
    return (
        <div className="flex flex-col h-full overflow-y-auto bg-white">
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto space-y-8 animate-in slide-up">
                <div className="relative mb-4"><div className="absolute inset-0 bg-rose-200 rounded-full blur-2xl opacity-30 animate-pulse"></div><LucyAvatar className="w-28 h-28 md:w-32 md:h-32 border-4 border-white shadow-xl relative z-10" /><div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md z-20"><Heart size={20} className="text-rose-500 fill-current animate-bounce" /></div></div>
                <div className="space-y-3"><h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Hola, soy Lucy 👋</h1><p className="text-slate-500 text-lg md:text-xl font-medium max-w-md mx-auto leading-relaxed">Su asistente <span className="text-rose-500 font-bold">AI</span> experta en <span className="text-rose-500 font-semibold">Protección Familiar</span>.</p></div>
                <button onClick={onStartChat} className="group relative inline-flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all w-full md:w-auto justify-center"><span>Hablar con Lucy</span><MessageSquare size={20} /></button>
                <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 italic border border-slate-100 max-w-sm mx-auto mt-2"><span className="absolute -top-3 left-4 text-3xl text-slate-200">"</span><p key={idx} className="animate-in fade-in">{testimonials[idx].text}</p><div className="mt-2 flex items-center justify-center gap-2 font-semibold text-slate-800 text-xs animate-in fade-in"><div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">{testimonials[idx].author.charAt(0)}</div>{testimonials[idx].author}</div></div>
            </div>
            <div className="p-4 text-center"><p className="text-[10px] text-slate-300">&copy; 2024 Asistente de Beneficios.</p><button onClick={onOpenLogin} className="mt-2 text-[9px] text-slate-200 hover:text-slate-400">Acceso Corporativo</button></div>
        </div>
    );
}

// --- AGENTS MANAGER ---
function AgentsManager({ agents, leads, onOpenLead, onSaveAgent, onDeleteAgent, searchTerm }) {
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '', foto: '', estados: '', mensaje: '' });
    const [selectedIds, setSelectedIds] = useState([]);
    const filteredAgents = agents.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const handleSave = async (e) => { e.preventDefault(); await onSaveAgent(formData); setIsEditing(false); };
    const handleSelectOne = (id) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    if (selectedAgent) {
        const agentLeads = leads.filter(l => l.assignedAgentId === selectedAgent.id);
        return (
            <div className="animate-in fade-in space-y-6">
                <button onClick={() => setSelectedAgent(null)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-black mb-4"><RotateCcw size={14}/> Volver</button>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex gap-6 items-center"><img src={selectedAgent.foto || "https://ui-avatars.com/api/?name="+selectedAgent.nombre} className="w-24 h-24 rounded-full object-cover"/><div className="flex-1"><h2 className="text-2xl font-bold">{selectedAgent.nombre}</h2><div className="flex gap-2 mt-2"><span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs flex gap-1"><MapPin size={12}/>{selectedAgent.estados}</span></div></div><div className="text-center bg-gray-50 p-4 rounded-xl"><span className="block text-3xl font-bold">{agentLeads.length}</span><span className="text-xs uppercase font-bold text-gray-500">Leads</span></div></div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-50"><tr><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Fecha</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Lead</th><th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Estado</th></tr></thead><tbody className="divide-y divide-gray-50">{agentLeads.map(l => (<tr key={l.id} onClick={() => onOpenLead(l)} className="hover:bg-blue-50 cursor-pointer"><td className="px-6 py-4 text-xs">{formatFirestoreDate(l.assignedAt)}</td><td className="px-6 py-4 font-bold">{l.nombre}</td><td className="px-6 py-4"><span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full uppercase">{l.status}</span></td></tr>))}</tbody></table></div>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in space-y-6">
            <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-gray-800">Agentes</h2><div className="flex gap-2">{selectedIds.length > 0 && <button onClick={() => { onDeleteAgent(selectedIds); setSelectedIds([]); }} className="bg-red-50 text-red-600 px-4 py-2 rounded-xl text-sm font-bold flex gap-2"><Trash2 size={16}/> Eliminar</button>}<button onClick={() => { setFormData({}); setIsEditing(true); }} className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex gap-2 shadow-lg"><UserCog size={16}/> Nuevo</button></div></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{filteredAgents.map(a => (<div key={a.id} className={`bg-white rounded-2xl p-5 border transition-all hover:shadow-md cursor-pointer relative ${selectedIds.includes(a.id) ? 'border-blue-500 bg-blue-50/10' : 'border-gray-100'}`} onClick={() => setSelectedAgent(a)}><div className="absolute top-4 right-4" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(a.id)} onChange={() => handleSelectOne(a.id)} className="custom-checkbox"/></div><div className="flex items-center gap-4 mb-4"><img src={a.foto || "https://ui-avatars.com/api/?name="+a.nombre} className="w-14 h-14 rounded-full object-cover bg-gray-200"/><div><h3 className="font-bold text-gray-900">{a.nombre}</h3><p className="text-xs text-gray-500">{a.email}</p></div></div><div className="text-xs text-gray-600 space-y-1"><div className="flex gap-2"><Phone size={12}/> {a.telefono}</div><div className="flex gap-2"><MapPin size={12}/> {a.estados}</div></div></div>))}</div>
            {isEditing && (
                <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
                        <h3 className="text-lg font-bold mb-4">Nuevo Agente</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-bold text-gray-500 uppercase">Nombre</label><input required className="w-full p-2 border rounded-lg text-sm" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} /></div><div><label className="text-[10px] font-bold text-gray-500 uppercase">Teléfono</label><input className="w-full p-2 border rounded-lg text-sm" value={formData.telefono || ''} onChange={e => setFormData({...formData, telefono: e.target.value})} /></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-[10px] font-bold text-gray-500 uppercase">Email</label><input className="w-full p-2 border rounded-lg text-sm" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} /></div><div><label className="text-[10px] font-bold text-gray-500 uppercase">Foto URL</label><input className="w-full p-2 border rounded-lg text-sm" placeholder="https://..." value={formData.foto || ''} onChange={e => setFormData({...formData, foto: e.target.value})} /></div></div>
                            <div><label className="text-[10px] font-bold text-gray-500 uppercase">Estados</label><input className="w-full p-2 border rounded-lg text-sm" value={formData.estados || ''} onChange={e => setFormData({...formData, estados: e.target.value})} /></div>
                            <div className="flex gap-2 justify-end mt-4"><button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">Cancelar</button><button type="submit" className="px-4 py-2 text-sm bg-black text-white rounded-lg">Guardar</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- ADMIN BRAIN (NUEVO: HORARIOS FLEXIBLES) ---
function AdminBrain({ aiConfig, onSaveConfig }) {
    const [c, setC] = useState(aiConfig);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    
    // Funciones Horarios
    const handleAddSlot = (day) => { const slots = c.schedule?.[day]?.slots || []; setC(p => ({ ...p, schedule: { ...p.schedule, [day]: { ...(p.schedule[day] || {}), enabled: true, slots: [...slots, {start: "09:00", end: "18:00"}] } } })); };
    const handleRemoveSlot = (day, idx) => { const slots = (c.schedule?.[day]?.slots || []).filter((_, i) => i !== idx); setC(p => ({ ...p, schedule: { ...p.schedule, [day]: { ...(p.schedule[day] || {}), slots, enabled: slots.length > 0 } } })); };
    const handleSlotChange = (day, idx, field, val) => { const slots = [...(c.schedule?.[day]?.slots || [])]; if (slots[idx]) { slots[idx] = { ...slots[idx], [field]: val }; setC(p => ({ ...p, schedule: { ...p.schedule, [day]: { ...(p.schedule[day] || {}), slots } } })); } };
    const handleDayToggle = (day) => { const enabled = !c.schedule?.[day]?.enabled; let slots = c.schedule?.[day]?.slots || []; if (enabled && slots.length === 0) slots = [{start: "09:00", end: "18:00"}]; setC(p => ({ ...p, schedule: { ...p.schedule, [day]: { ...(p.schedule[day] || {}), enabled, slots } } })); };

    const handleSave = async () => { setIsSaving(true); await onSaveConfig(c); setIsSaving(false); setShowSuccess(true); setTimeout(() => setShowSuccess(false), 3000); };
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

    return (
        <div className="max-w-4xl mx-auto animate-in fade-in space-y-6">
            <div className="bg-white p-8 rounded-[24px] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-10">
                <div className="flex-1 space-y-6">
                    <h3 className="font-bold text-gray-800">Configuración del Cerebro</h3>
                    <div className="bg-[#F5F5F7] p-5 rounded-2xl border border-gray-100 space-y-4">
                        <div className="flex justify-between items-center"><span className="text-xs font-bold uppercase text-gray-500">Horarios</span><label className="flex items-center gap-2 text-xs font-bold text-gray-500 cursor-pointer"><input type="checkbox" checked={c.vacationMode} onChange={e => setC({...c, vacationMode: e.target.checked})} /> Modo Vacaciones</label></div>
                        {c.vacationMode && <div className="flex gap-2 items-center bg-orange-50 p-2 rounded-lg border border-orange-100"><span className="text-[10px] font-bold text-orange-600">INICIO</span><input type="date" value={c.vacationStart} onChange={e => setC({...c, vacationStart: e.target.value})} className="bg-white border rounded px-2 py-1 text-xs"/><span className="text-[10px] font-bold text-orange-600">FIN</span><input type="date" value={c.vacationEnd} onChange={e => setC({...c, vacationEnd: e.target.value})} className="bg-white border rounded px-2 py-1 text-xs"/></div>}
                        {days.map(d => (
                            <div key={d} className="border-b border-gray-200 pb-2 last:border-0">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2"><input type="checkbox" checked={c.schedule?.[d]?.enabled} onChange={() => handleDayToggle(d)} /><span className={`text-xs font-bold uppercase w-20 ${c.schedule?.[d]?.enabled ? 'text-black' : 'text-gray-400'}`}>{d}</span></div>
                                    {c.schedule?.[d]?.enabled && <button onClick={() => handleAddSlot(d)} className="text-blue-500 hover:text-blue-700"><Plus size={14}/></button>}
                                </div>
                                {c.schedule?.[d]?.enabled && (c.schedule[d].slots || []).map((s, i) => (
                                    <div key={i} className="flex gap-2 items-center pl-6 mt-1">
                                        <input type="time" value={s.start} onChange={e => handleSlotChange(d, i, 'start', e.target.value)} className="border rounded px-1 text-xs" />
                                        <span className="text-xs text-gray-400">a</span>
                                        <input type="time" value={s.end} onChange={e => handleSlotChange(d, i, 'end', e.target.value)} className="border rounded px-1 text-xs" />
                                        <button onClick={() => handleRemoveSlot(d, i)} className="text-red-400 hover:text-red-600"><MinusCircle size={14}/></button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Instrucciones Base</label><textarea value={c.systemPrompt} onChange={e => setC({...c, systemPrompt: e.target.value})} className="w-full h-32 p-3 border rounded-xl text-xs font-mono resize-none" /></div>
                </div>
                <div className="md:w-72 space-y-4">
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Webhook Nuevo Lead</label><input type="password" value={c.webhookUrl || ''} onChange={e => setC({...c, webhookUrl: e.target.value})} className="w-full p-2 border rounded-lg text-xs" placeholder="https://..." /></div>
                    <div><label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Webhook Asignación</label><input type="password" value={c.assignmentWebhookUrl || ''} onChange={e => setC({...c, assignmentWebhookUrl: e.target.value})} className="w-full p-2 border rounded-lg text-xs" placeholder="https://..." /></div>
                    <button onClick={handleSave} disabled={isSaving} className="w-full bg-black text-white py-3 rounded-xl font-bold text-xs shadow-lg">{isSaving ? 'Guardando...' : 'Guardar Cambios'}</button>
                    {showSuccess && <div className="bg-green-50 text-green-700 p-2 rounded-lg text-xs text-center font-bold flex items-center justify-center gap-2"><CheckCircle size={14}/> Guardado</div>}
                </div>
            </div>
        </div>
    );
}

// --- LEADS LIST ---
function LeadsList({ leads, agents, onOpenLead, onOpenAssign, onDeleteLead, onUpdateStatus, isArchive, searchTerm }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const filtered = leads.filter(l => (l.nombre||'').toLowerCase().includes(searchTerm.toLowerCase()));
    
    const handleSelectAll = (e) => e.target.checked ? setSelectedIds(filtered.map(l => l.id)) : setSelectedIds([]);
    const handleSelectOne = (id) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    return (
        <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in">
            {selectedIds.length > 0 && (
                <div className="bg-blue-50 px-6 py-2 flex justify-between items-center border-b border-blue-100">
                    <span className="text-xs font-bold text-blue-700">{selectedIds.length} seleccionados</span>
                    <div className="flex gap-2">
                        <button onClick={() => { onOpenAssign(selectedIds); setSelectedIds([]); }} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold flex gap-1 items-center"><UserPlus size={14}/> Asignar</button>
                        <button onClick={() => { onUpdateStatus(selectedIds, isArchive ? 'active' : 'archived'); setSelectedIds([]); }} className="px-3 py-1 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-bold flex gap-1 items-center">{isArchive ? <RotateCcw size={14}/> : <Archive size={14}/>} {isArchive ? 'Restaurar' : 'Archivar'}</button>
                        <button onClick={() => { onDeleteLead(selectedIds); setSelectedIds([]); }} className="px-3 py-1 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-bold flex gap-1 items-center"><Trash2 size={14}/> Eliminar</button>
                    </div>
                </div>
            )}
            <table className="w-full text-left">
                <thead className="bg-[#FBFBFD] border-b border-gray-100"><tr><th className="px-4 py-4 w-12 text-center"><input type="checkbox" onChange={handleSelectAll} checked={filtered.length > 0 && selectedIds.length === filtered.length} /></th><th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase">Nombre</th><th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase">Agente</th><th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase">Resumen</th><th className="px-4 py-4 text-[11px] font-bold text-gray-500 uppercase text-center">Acción</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                    {filtered.map(l => {
                        const agent = agents.find(a => a.id === l.assignedAgentId);
                        return (
                            <tr key={l.id} onClick={() => onOpenLead(l)} className={`hover:bg-gray-50 cursor-pointer ${selectedIds.includes(l.id) ? 'bg-blue-50/50' : ''}`}>
                                <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => handleSelectOne(l.id)} /></td>
                                <td className="px-4 py-4"><div className="font-bold text-sm text-gray-900">{l.nombre}</div><div className="text-[10px] text-gray-500">{formatFirestoreDate(l.createdAt)}</div></td>
                                <td className="px-4 py-4">{agent ? <div className="flex items-center gap-2"><img src={agent.foto} className="w-5 h-5 rounded-full object-cover"/><span className="text-xs font-bold text-gray-700">{agent.nombre}</span></div> : <span className="text-[10px] text-gray-400 italic">--</span>}</td>
                                <td className="px-4 py-4 text-xs text-gray-600 truncate max-w-[200px]">{l.resumen_ai}</td>
                                <td className="px-4 py-4 text-center" onClick={e => e.stopPropagation()}><button onClick={() => onUpdateStatus(l.id, isArchive ? 'active' : 'archived')} className="p-2 hover:bg-gray-200 rounded-full text-gray-500">{isArchive ? <RotateCcw size={16}/> : <Archive size={16}/>}</button></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// --- CLIENT CHAT ---
function ClientChat({ aiConfig, onSaveLead, onOpenLogin }) {
    const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hola, soy Lucy, su asistente personal experta en **Gastos Finales**. Mi misión es brindarle la información que necesita para su tranquilidad y la de su familia.\n\n¿Cómo le podemos servir el día de hoy?' }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [pendingLeadData, setPendingLeadData] = useState(null);
    const scrollRef = useRef(null);
    const { isAgentAvailable, message: statusMessage, isVacation, resumeDate } = getAgentStatus(aiConfig);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, loading, showOptions]);

    const handleOptionClick = (type) => {
        if (pendingLeadData) {
            onSaveLead({ ...pendingLeadData, metodo_contacto: type, horario_preferido: type === 'ahora' ? 'Inmediata' : 'Pendiente' });
            setPendingLeadData(null); setShowOptions(false);
            setMsgs(prev => [...prev, { role: 'assistant', content: type === 'ahora' ? "¡Perfecto! Un agente se comunicará con usted en breve." : "Excelente. Un agente le llamará para programar la cita." }]);
        }
    };

    const send = async (e) => {
        e.preventDefault(); if (!input.trim() || loading) return;
        const newM = [...msgs, { role: 'user', content: input }]; setMsgs(newM); setInput(''); setLoading(true);
        try {
            const scheduleText = getScheduleText(aiConfig?.schedule);
            const prompt = `${aiConfig?.systemPrompt || ""}\n\nHORARIOS:\n${scheduleText}\n\nHISTORIAL:\n${newM.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nINSTRUCCIÓN: Si tienes Nombre, Edad, Email y Telefono, devuelve JSON: {"action": "data_ready", "nombre": "...", "edad": "...", "email": "...", "telefono": "...", "resumen_ai": "..."}`;
            const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }] }] });
            let reply = res.candidates[0].content.parts[0].text;
            const jsonMatch = reply.match(/```json([\s\S]*?)```/);
            if (jsonMatch) { 
                try { 
                    const data = JSON.parse(jsonMatch[1]); 
                    if (data.action === 'data_ready') { 
                        setPendingLeadData(data); setShowOptions(true); reply = reply.replace(jsonMatch[0], '').trim(); 
                    } 
                } catch (e) {} 
            }
            setMsgs([...newM, { role: 'assistant', content: cleanAiMessage(reply) }]);
        } catch (e) { console.error(e); setMsgs([...newM, { role: 'assistant', content: "Lo siento, tuve un problema de conexión." }]); }
        setLoading(false);
    };

    return (
        <div className="max-w-[480px] mx-auto flex flex-col h-full bg-white rounded-[32px] shadow-2xl border border-gray-100 overflow-hidden relative font-sans">
            <div className="bg-white/90 backdrop-blur-xl p-5 border-b border-gray-100 flex items-center justify-between z-10 sticky top-0">
                <div className="flex items-center gap-4"><LucyAvatar /><h2 className="font-bold text-gray-900">Lucy</h2></div>
                {onOpenLogin && <button onClick={onOpenLogin} className="text-[10px] text-gray-400 hover:text-gray-600">Admin</button>}
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && <LucyAvatar className="w-8 h-8 mr-2 mt-auto shrink-0" />}
                        <div className={`px-4 py-2 rounded-2xl text-[15px] max-w-[80%] ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}><RichText content={m.content} /></div>
                    </div>
                ))}
                {loading && <div className="text-xs text-gray-400 pl-12 animate-pulse">Escribiendo...</div>}
                {showOptions && (
                    <div className="flex flex-col gap-2 pt-2 px-8">
                        <button onClick={() => handleOptionClick('ahora')} disabled={!isAgentAvailable} className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${isAgentAvailable ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>{isAgentAvailable ? <Zap size={16}/> : <Moon size={16}/>} {isAgentAvailable ? 'Hablar Ahora' : 'Agentes no disponibles'}</button>
                        <button onClick={() => handleOptionClick('programada')} className="w-full py-3 rounded-xl text-sm font-bold bg-gray-100 text-blue-600 flex items-center justify-center gap-2"><Calendar size={16}/> Programar</button>
                    </div>
                )}
            </div>
            <form onSubmit={send} className="p-4 border-t border-gray-100 flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escribe aquí..." className="flex-1 bg-gray-100 rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-blue-100 transition-all"/>
                <button disabled={loading} className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 disabled:opacity-50"><Send size={20}/></button>
            </form>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
