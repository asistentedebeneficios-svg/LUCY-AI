import React, { useState, useEffect, useRef, useMemo } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, CheckSquare, Square, Share, Link as LinkIcon, Power, Briefcase, Plus, Mail, UserMinus, BarChart3, TrendingUp, Filter, ArrowLeft, Printer } from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch, query, deleteField } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut, signInWithCustomToken } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// ==========================================
// 1. TUS CREDENCIALES REALES
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCh_eweHfWdALF3VtFHh1UM0AkiH-8I9Uo",
  authDomain: "lucy-ai-11572.firebaseapp.com",
  projectId: "lucy-ai-11572",
  storageBucket: "lucy-ai-11572.firebasestorage.app",
  messagingSenderId: "979126041068",
  appId: "1:979126041068:web:e605f2bf9528424e26e8c9",
  measurementId: "G-4L08BMRY61"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ID fijo para que siempre encuentres tus datos en producción
const appId = 'lucy-production-v1'; 

// CLAVE DE IA (Dividida por seguridad básica)
const partA = "AIzaSyCMPSIf7ocyb8DzoRt5izDH3";
const partB = "-5zcLu5ojM";
const GOOGLE_API_KEY = partA + partB;

// --- UTILIDADES ---
const IMAGES = { lucy: "https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" };

const LucyAvatar = ({ className = "w-10 h-10" }) => (
  <img src={IMAGES.lucy} alt="Lucy" className={`${className} rounded-full object-cover shadow-sm border border-slate-100 bg-slate-200`} onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"; }} />
);

const ProtectionLogo = ({ size = 24, className = "" }) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9.5L12 3l9 6.5v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M12 18.5c2.5-1.5 5.5-4 5.5-6.5 0-1.7-1.3-3-3-3-1 0-1.9.5-2.5 1.5-.6-1-1.5-1.5-2.5-1.5-1.7 0-3 1.3-3 3 0 2.5 3 5 5.5 6.5z" /></svg>);
const BrainAvatar = ({ className = "w-10 h-10" }) => (<div className={`${className} rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-sm`}><Sparkles size={20} strokeWidth={2} /></div>);

function cleanAiMessage(text) { 
    if (!text) return ''; 
    let cleaned = text.replace(new RegExp('\\[Botón:.*?\\]', 'gi'), '').replace(new RegExp('\\[Button:.*?\\]', 'gi'), '');
    return cleaned.split('***').join('').split('---').join('').trim();
}

function to12h(t) { if (!t) return ''; const [h, m] = t.split(':'); return `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`; }
function formatScheduledDate(d) { if (!d || d.length < 10) return d; const date = new Date(d); return isNaN(date) ? d : date.toLocaleDateString('en-US', {month:'2-digit', day:'2-digit', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}); }
function formatFirestoreDate(ts) { if (!ts) return 'Reciente'; return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); }
function getJsDate(ts) { if (!ts) return new Date(); return ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000); }

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GOOGLE_API_KEY}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Error API: ${res.status}`);
    return await res.json();
  } catch (e) { console.error("Connection failed:", e); throw new Error("Error conexión"); }
}

function useInactivityTimer(action, timeout = 600000) {
    useEffect(() => {
        let timer;
        const resetTimer = () => { clearTimeout(timer); timer = setTimeout(action, timeout); };
        window.addEventListener('mousemove', resetTimer); window.addEventListener('click', resetTimer); window.addEventListener('keypress', resetTimer); window.addEventListener('touchstart', resetTimer);
        resetTimer();
        return () => { clearTimeout(timer); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('click', resetTimer); window.removeEventListener('keypress', resetTimer); window.removeEventListener('touchstart', resetTimer); };
    }, [action, timeout]);
}

// --- COMPONENTES HIJOS ---

function LandingView({ onStartChat, onOpenLogin, isAdmin, onGoToAdmin }) {
  const testimonials = [ { text: "Gracias a Lucy encontré un plan perfecto.", author: "María G." }, { text: "Excelente atención, muy paciente.", author: "Carmen R." }, { text: "Rápido y sencillo.", author: "José L." } ];
  const [idx, setIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setIdx((p) => (p + 1) % testimonials.length), 5000); return () => clearInterval(t); }, []);
  const cur = testimonials[idx];
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-2xl mx-auto space-y-8 animate-in slide-up">
        <div className="relative mb-4"><div className="absolute inset-0 bg-rose-200 rounded-full blur-2xl opacity-30 animate-pulse"></div><LucyAvatar className="w-28 h-28 md:w-32 md:h-32 border-4 border-white shadow-xl relative z-10" /><div className="absolute bottom-0 right-0 bg-white p-1.5 rounded-full shadow-md z-20"><Heart size={20} className="text-rose-500 fill-current animate-bounce" /></div></div>
        <div className="space-y-3"><h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">Hola, soy Lucy 👋</h1><p className="text-slate-500 text-lg md:text-xl font-medium max-w-md mx-auto leading-relaxed">Su asistente <span className="text-rose-500 font-bold">AI</span> experta en <span className="text-rose-500 font-semibold">Protección Familiar</span>.</p><p className="text-slate-400 text-sm md:text-base max-w-lg mx-auto">Estoy aquí para escucharle y explicarle los beneficios de protección disponibles para usted.</p></div>
        <button onClick={onStartChat} className="group relative inline-flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-2xl font-semibold text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95 w-full md:w-auto justify-center"><span>Hablar con Lucy</span><MessageSquare size={20} /></button>
        <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-600 italic border border-slate-100 max-w-sm mx-auto mt-4 relative min-h-[100px] flex flex-col justify-center transition-all duration-500"><p key={idx} className="animate-in fade-in">{cur.text}</p><div className="mt-2 font-bold text-xs text-slate-800">- {cur.author}</div></div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full max-w-md pt-4 border-t border-slate-100">
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><UserCheck size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Licenciados</span></div>
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-red-50 text-red-600 rounded-xl"><PhoneOff size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Seguro</span></div>
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-green-50 text-green-600 rounded-xl"><ShieldCheck size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Privado</span></div>
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-yellow-50 text-yellow-600 rounded-xl"><Zap size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Rápido</span></div>
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Activity size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Sin Examen</span></div>
            <div className="flex flex-col items-center gap-1"><div className="p-2 bg-pink-50 text-pink-600 rounded-xl"><Heart size={18} /></div><span className="text-[9px] font-bold text-slate-400 uppercase">Soporte</span></div>
        </div>
      </div>
      <div className="p-4 text-center">
          {isAdmin ? (
              <button onClick={onGoToAdmin} className="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center justify-center gap-1 mx-auto"><LayoutDashboard size={14}/> Ir al Panel de Admin</button>
          ) : (
              <button onClick={onOpenLogin} className="text-[9px] text-slate-300 hover:text-slate-400 transition-colors">Acceso Corporativo</button>
          )}
      </div>
    </div>
  );
}

function LeadModal({ lead, onClose }) {
    const [copyFeedback, setCopyFeedback] = useState(false);
    const copyLeadToClipboard = () => {
      if (!lead) return;
      const text = [`📋 FICHA`, `Nombre: ${lead.nombre}`, `Email: ${lead.email}`, `Tel: ${lead.telefono}`, `Resumen: ${lead.resumen_ai}`].join('\n');
      const textArea = document.createElement("textarea"); textArea.value = text; document.body.appendChild(textArea); textArea.select();
      try { document.execCommand('copy'); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); } catch (err) {}
      document.body.removeChild(textArea);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
                <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3"><div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center"><User size={20}/></div><div><h3 className="font-bold text-lg">{lead.nombre}</h3><p className="text-xs text-slate-500">{formatFirestoreDate(lead.createdAt)}</p></div></div>
                    <button onClick={onClose}><X size={20}/></button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-50 rounded-xl"><span className="text-[10px] font-bold text-slate-400 uppercase">Email</span><p className="text-sm font-medium">{lead.email || 'No registrado'}</p></div>
                        <div className="p-4 bg-slate-50 rounded-xl"><span className="text-[10px] font-bold text-slate-400 uppercase">Teléfono</span><p className="text-sm font-medium">{lead.telefono || 'No registrado'}</p></div>
                        <div className="p-4 bg-slate-50 rounded-xl col-span-2 relative"><div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-xl"></div><span className="text-[10px] font-bold text-slate-400 uppercase flex gap-1 items-center"><Sparkles size={10}/> Resumen AI</span><p className="text-sm text-slate-700 mt-1 leading-relaxed">{lead.resumen_ai}</p></div>
                    </div>
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase border-b pb-2">Historial de Chat</h4>
                        {lead.fullChat?.map((m,i) => (
                            <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}><div className={`px-4 py-2 rounded-xl text-xs max-w-[85%] ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>{m.content}</div></div>
                        ))}
                    </div>
                </div>
                <div className="p-4 border-t flex gap-2">
                    <button onClick={copyLeadToClipboard} className={`flex-1 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${copyFeedback ? 'bg-green-500 text-white' : 'bg-black text-white'}`}>{copyFeedback ? <CheckCircle size={16}/> : <Copy size={16}/>} {copyFeedback ? "¡Copiado!" : "Copiar Ficha"}</button>
                </div>
            </div>
        </div>
    );
}

function ReportsView({ leads, agents, initialAgent }) {
    const [dateRange, setDateRange] = useState('month'); 
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedAgentStats, setSelectedAgentStats] = useState(null); 
    const [viewLead, setViewLead] = useState(null);

    useEffect(() => {
        if (initialAgent && agents.length > 0) setSelectedAgentStats({ name: initialAgent.name, count: 0 });
    }, [initialAgent]);

    const filteredLeads = useMemo(() => {
        const now = new Date();
        let start = new Date(0); 
        let end = new Date(); 
        if (dateRange === 'week') { start = new Date(); start.setDate(now.getDate() - 7); } 
        else if (dateRange === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); } 
        else if (dateRange === 'custom' && customStart) { start = new Date(customStart); if (customEnd) end = new Date(customEnd); end.setHours(23, 59, 59); }
        return leads.filter(l => { const d = getJsDate(l.createdAt); return d >= start && d <= end; });
    }, [leads, dateRange, customStart, customEnd]);

    const stats = useMemo(() => {
        const total = filteredLeads.length;
        const assigned = filteredLeads.filter(l => l.status === 'assigned').length;
        const archived = filteredLeads.filter(l => l.status === 'archived').length;
        const active = filteredLeads.filter(l => (!l.status || l.status === 'active')).length;
        const conversionRate = total > 0 ? Math.round((assigned / total) * 100) : 0;
        const agentStats = {};
        filteredLeads.filter(l => l.status === 'assigned' && l.assignedAgentName).forEach(l => { agentStats[l.assignedAgentName] = (agentStats[l.assignedAgentName] || 0) + 1; });
        const sortedAgents = Object.entries(agentStats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
        return { total, assigned, archived, active, conversionRate, sortedAgents };
    }, [filteredLeads]);

    const agentLeads = useMemo(() => {
        if (!selectedAgentStats) return [];
        return filteredLeads.filter(l => l.assignedAgentName === selectedAgentStats.name);
    }, [filteredLeads, selectedAgentStats]);

    const copyAgentReport = () => {
        if (!selectedAgentStats) return;
        let report = `REPORTE DE ASIGNACIÓN\nAGENTE: ${selectedAgentStats.name}\nTOTAL: ${agentLeads.length}\n\nDETALLE:\n`;
        agentLeads.forEach((l, i) => { const date = l.assignedAt ? new Date(l.assignedAt.seconds * 1000).toLocaleDateString() : 'N/A'; report += `${i+1}. ${l.nombre || 'Anónimo'} | Asignado: ${date} | Tel: ${l.telefono || 'N/A'}\n`; });
        const textArea = document.createElement("textarea"); textArea.value = report; document.body.appendChild(textArea); textArea.select();
        try { document.execCommand('copy'); alert("¡Reporte copiado!"); } catch (e) {}
        document.body.removeChild(textArea);
    };

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in space-y-6">
            {viewLead && <LeadModal lead={viewLead} onClose={() => setViewLead(null)} />}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-2"><div className="bg-blue-100 text-blue-600 p-2 rounded-xl"><BarChart3 size={20}/></div><h2 className="text-lg font-bold text-slate-800">Reportes de Rendimiento</h2></div>
                <div className="flex flex-wrap gap-2 items-center">
                     <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg p-2 outline-none"><option value="week">Últimos 7 días</option><option value="month">Este Mes</option><option value="all">Todo el Historial</option><option value="custom">Rango Personalizado</option></select>
                     {dateRange === 'custom' && (<div className="flex gap-2 items-center animate-in fade-in"><input type="date" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} className="bg-white border rounded px-2 py-1 text-xs"/><span className="text-slate-400">-</span><input type="date" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} className="bg-white border rounded px-2 py-1 text-xs"/></div>)}
                </div>
            </div>
            {selectedAgentStats ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in slide-up">
                    <div className="flex justify-between items-start mb-6"><div><button onClick={() => setSelectedAgentStats(null)} className="text-xs text-slate-500 hover:text-black mb-2 flex items-center gap-1 transition-colors"><ArrowLeft size={14}/> Volver al ranking</button><h2 className="text-2xl font-bold text-slate-800">{selectedAgentStats.name}</h2><p className="text-sm text-slate-500 mt-1">Total Asignados: <strong className="text-black text-lg">{agentLeads.length}</strong> <span className="text-xs opacity-70">(En el periodo seleccionado)</span></p></div><button onClick={copyAgentReport} className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 shadow-md transition-all active:scale-95"><Copy size={14}/> Copiar Reporte</button></div>
                    <div className="overflow-hidden border border-gray-100 rounded-xl"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-bold border-b border-gray-100"><tr><th className="px-6 py-3">Fecha Asignación</th><th className="px-6 py-3">Nombre Lead</th><th className="px-6 py-3">Contacto</th><th className="px-6 py-3 text-center">Detalles</th></tr></thead><tbody className="divide-y divide-gray-50 bg-white">{agentLeads.map((l, idx) => (<tr key={l.id} onClick={() => setViewLead(l)} className="hover:bg-blue-50/50 transition-colors cursor-pointer group"><td className="px-6 py-4 text-slate-500 font-mono text-xs">{l.assignedAt ? new Date(l.assignedAt.seconds * 1000).toLocaleDateString() : '-'}</td><td className="px-6 py-4 font-bold text-slate-800">{l.nombre || 'Anónimo'}</td><td className="px-6 py-4 text-slate-500">{l.telefono || '-'}</td><td className="px-6 py-4 text-center"><span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">Ver Ficha</span></td></tr>))}</tbody></table>{agentLeads.length === 0 && <div className="p-10 text-center text-slate-400 text-sm italic">No hay leads asignados a este agente en las fechas seleccionadas.</div>}</div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold text-slate-400 uppercase mb-1">Total Leads</div><div className="text-3xl font-bold text-slate-800">{stats.total}</div><div className="text-[10px] text-slate-400 mt-1">En el periodo</div></div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold text-slate-400 uppercase mb-1">Asignados</div><div className="text-3xl font-bold text-blue-600">{stats.assigned}</div><div className="text-[10px] text-green-600 mt-1 font-bold flex items-center gap-1"><TrendingUp size={10}/> {stats.conversionRate}% Conv.</div></div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold text-slate-400 uppercase mb-1">Activos</div><div className="text-3xl font-bold text-orange-500">{stats.active}</div><div className="text-[10px] text-slate-400 mt-1">En bandeja</div></div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100"><div className="text-xs font-bold text-slate-400 uppercase mb-1">Archivados</div><div className="text-3xl font-bold text-slate-400">{stats.archived}</div><div className="text-[10px] text-slate-400 mt-1">Cerrados</div></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100"><h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Award size={18} className="text-yellow-500"/> Ranking de Asignación</h3><p className="text-xs text-slate-400 mb-4">Haz clic en un agente para ver el detalle de sus leads.</p><div className="space-y-3">{stats.sortedAgents.length === 0 ? <p className="text-slate-400 text-sm text-center py-4">No hay datos suficientes.</p> : stats.sortedAgents.map((agent, i) => (<div key={i} onClick={() => setSelectedAgentStats(agent)} className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-xl transition-all"><div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-slate-100 text-slate-600':i===2?'bg-orange-100 text-orange-700':'bg-slate-50 text-slate-400'}`}>#{i+1}</div><div className="flex-1"><div className="flex justify-between mb-1.5"><span className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">{agent.name}</span><span className="text-xs font-bold text-slate-500">{agent.count} leads</span></div><div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${(agent.count / stats.assigned) * 100}%` }}></div></div></div><div className="text-slate-300 group-hover:text-blue-500"><ExternalLink size={14}/></div></div>))}</div></div>
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center"><h3 className="font-bold text-slate-800 mb-6 text-sm text-center">Estado de la Cartera</h3><div className="space-y-6"><div className="relative pt-2"><div className="flex h-4 mb-2 overflow-hidden text-xs bg-slate-100 rounded-full"><div style={{ width: `${stats.total > 0 ? (stats.assigned/stats.total)*100 : 0}%` }} className="flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 shadow-none"></div><div style={{ width: `${stats.total > 0 ? (stats.active/stats.total)*100 : 0}%` }} className="flex flex-col text-center whitespace-nowrap text-white justify-center bg-orange-500 shadow-none"></div><div style={{ width: `${stats.total > 0 ? (stats.archived/stats.total)*100 : 0}%` }} className="flex flex-col text-center whitespace-nowrap text-white justify-center bg-slate-300 shadow-none"></div></div></div><div className="space-y-2"><div className="flex items-center justify-between text-xs text-slate-600"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Asignados</div><span className="font-bold">{stats.assigned}</span></div><div className="flex items-center justify-between text-xs text-slate-600"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-orange-500"></span> Activos</div><span className="font-bold">{stats.active}</span></div><div className="flex items-center justify-between text-xs text-slate-600"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-300"></span> Archivados</div><span className="font-bold">{stats.archived}</span></div></div></div></div>
                    </div>
                </>
            )}
        </div>
    );
}

function LeadsList({ leads, agents, onDeleteLead, onUpdateStatus, onAssignAgent, onUnassign, isArchive, searchTerm }) {
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadToDelete, setLeadToDelete] = useState(null); 
  const [selectedIds, setSelectedIds] = useState([]); 
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAgentForAssign, setSelectedAgentForAssign] = useState(null);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [agentSearch, setAgentSearch] = useState('');

  const filteredLeads = leads.filter(l => String(l.nombre||'').toLowerCase().includes(searchTerm.toLowerCase()));

  const handleSelectAll = (e) => { if (e.target.checked) setSelectedIds(filteredLeads.map(l => l.id)); else setSelectedIds([]); };
  const handleSelectOne = (id) => { setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); };
  const handleBulkDelete = () => { if (selectedIds.length > 0) setLeadToDelete(selectedIds); };
  const handleBulkArchive = () => { if (selectedIds.length > 0) { onUpdateStatus(selectedIds, isArchive ? 'active' : 'archived'); setSelectedIds([]); } };
  const handleOpenAssignModal = () => { if (selectedIds.length > 0) { setShowAssignModal(true); setAssignSuccess(false); setAgentSearch(''); } };
  const handleBulkUnassign = () => { if (selectedIds.length > 0) { onUnassign(selectedIds); setSelectedIds([]); } };

  const confirmAssign = async () => {
      if (selectedAgentForAssign && selectedIds.length > 0) {
          await onAssignAgent(selectedIds, selectedAgentForAssign);
          setAssignSuccess(true);
          setTimeout(() => { setShowAssignModal(false); setSelectedIds([]); setAssignSuccess(false); setSelectedAgentForAssign(null); }, 2000);
      }
  };

  const confirmDelete = async () => { if (leadToDelete) { await onDeleteLead(leadToDelete); setLeadToDelete(null); setSelectedIds([]); } };

  const copyLeadToClipboard = (lead) => {
      if (!lead) return;
      const text = [`📋 FICHA`, `Nombre: ${lead.nombre}`, `Email: ${lead.email}`, `Tel: ${lead.telefono}`, `Resumen: ${lead.resumen_ai}`].join('\n');
      const textArea = document.createElement("textarea"); textArea.value = text; document.body.appendChild(textArea); textArea.select();
      try { document.execCommand('copy'); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); } catch (err) {}
      document.body.removeChild(textArea);
  };
  
  return (
    <div className="animate-in fade-in duration-500">
        {leadToDelete && (
            <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm border border-gray-100 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><Trash2 size={24} /></div>
                    <h3 className="font-bold text-lg text-slate-800 mb-2">¿Eliminar?</h3>
                    <div className="flex gap-3 mt-4"><button onClick={() => setLeadToDelete(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-sm">Cancelar</button><button onClick={confirmDelete} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm">Eliminar</button></div>
                </div>
            </div>
        )}

        {showAssignModal && (
            <div className="fixed inset-0 z-[130] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md border border-gray-100 relative overflow-hidden flex flex-col max-h-[80vh]">
                    {assignSuccess ? (
                        <div className="text-center py-8 animate-in zoom-in"><CheckCircle size={32} className="mx-auto text-green-500 mb-2"/><h3 className="font-bold text-xl text-slate-800">¡Asignación Exitosa!</h3><p className="text-sm text-slate-500">Email enviado al cliente.</p></div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center mb-2 shrink-0"><h3 className="font-bold text-lg text-slate-800">Asignar Agente</h3><button onClick={() => setShowAssignModal(false)}><X size={20}/></button></div>
                            <div className="relative mb-3 shrink-0"><Search className="absolute left-3 top-2.5 text-gray-400" size={14} /><input autoFocus type="text" placeholder="Buscar agente por nombre..." value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"/></div>
                            <div className="space-y-2 overflow-y-auto no-scrollbar mb-4 flex-1">
                                {agents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase())).map(agent => (
                                    <div key={agent.id} onClick={() => setSelectedAgentForAssign(agent)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border ${selectedAgentForAssign?.id === agent.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}>
                                        <img src={agent.photoUrl || "https://ui-avatars.com/api/?name="+agent.name} className="w-8 h-8 rounded-full bg-gray-200 object-cover" />
                                        <div className="flex-1"><h4 className="font-bold text-sm">{agent.name}</h4><p className="text-[10px] text-slate-500">{agent.licenses}</p></div>
                                    </div>
                                ))}
                                {agents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && <p className="text-center text-xs text-gray-400 py-4">No se encontraron agentes</p>}
                            </div>
                            <div className="shrink-0 pt-2 border-t border-gray-100"><button onClick={confirmAssign} disabled={!selectedAgentForAssign} className="w-full py-3 bg-black text-white rounded-xl font-medium text-sm disabled:opacity-50">Confirmar</button></div>
                        </>
                    )}
                </div>
            </div>
        )}

        {selectedLead && <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
        
        <div className="bg-white rounded-[24px] shadow-sm overflow-hidden border border-gray-100">
          {selectedIds.length > 0 && (
              <div className="bg-blue-50 border-b border-blue-100 px-6 py-2 flex justify-between items-center animate-in fade-in">
                  <span className="text-xs font-bold text-blue-700">{selectedIds.length} seleccionados</span>
                  <div className="flex gap-2">
                      {leads.some(l => l.status !== 'assigned') && <button onClick={handleOpenAssignModal} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium">Asignar</button>}
                      {leads.some(l => l.status === 'assigned') && <button onClick={handleBulkUnassign} className="flex items-center gap-1 px-3 py-1.5 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-medium"><UserMinus size={14}/> Desasignar</button>}
                      <button onClick={handleBulkArchive} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 rounded-lg text-xs font-medium">{isArchive ? 'Restaurar' : 'Archivar'}</button>
                      <button onClick={handleBulkDelete} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium">Eliminar</button>
                  </div>
              </div>
          )}
          <table className="w-full text-left">
            <thead className="bg-[#FBFBFD] border-b border-gray-100 text-[10px] uppercase text-slate-400 font-bold">
                <tr>
                    <th className="px-4 py-4 text-center w-12"><input type="checkbox" className="custom-checkbox" checked={filteredLeads.length > 0 && selectedIds.length === filteredLeads.length} onChange={handleSelectAll} /></th>
                    <th className="px-4 py-4 w-1/4">Nombre</th>
                    <th className="px-4 py-4 w-1/4">Preferencia</th>
                    <th className="px-4 py-4 w-1/3">Resumen</th>
                    <th className="px-4 py-4 text-center">Acción</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {filteredLeads.map(l => (
                <tr key={l.id} onClick={() => setSelectedLead(l)} className={`hover:bg-[#F5F5F7] cursor-pointer group ${selectedIds.includes(l.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="custom-checkbox" checked={selectedIds.includes(l.id)} onChange={() => handleSelectOne(l.id)} /></td>
                  <td className="px-4 py-4"><div className="font-semibold text-slate-900">{l.nombre || 'Anónimo'}</div><div className="text-xs text-slate-500">{l.email || 'Sin email'}</div></td>
                  <td className="px-4 py-4">
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${l.metodo_contacto === 'ahora' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{l.metodo_contacto === 'ahora' ? <Zap size={10}/> : <CalendarClock size={10}/>} {l.metodo_contacto === 'ahora' ? 'Ahora' : 'Prog'}</div>
                      {l.assignedAgentName && <div className="mt-1 text-[10px] text-green-600 font-bold flex gap-1 items-center"><Briefcase size={10}/> {l.assignedAgentName}</div>}
                  </td>
                  <td className="px-4 py-4 text-slate-500 truncate max-w-[200px] text-xs">{l.resumen_ai}</td>
                  <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {l.status === 'assigned' && <button onClick={() => onUnassign(l.id)} className="p-2 text-slate-400 hover:text-orange-500 bg-white shadow-sm border border-gray-100 rounded-lg" title="Desasignar"><UserMinus size={14}/></button>}
                          <button onClick={() => setLeadToDelete(l.id)} className="p-2 text-slate-400 hover:text-red-500 bg-white shadow-sm border border-gray-100 rounded-lg"><Trash2 size={14}/></button>
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
    </div>
  );
}

function AgentsManager({ agents, onViewReport }) {
    const [isEditing, setIsEditing] = useState(false);
    const [currentAgent, setCurrentAgent] = useState({ name: '', phone: '', email: '', licenses: '', photoUrl: '', bio: '' });
    const [saving, setSaving] = useState(false);
    const [agentToDelete, setAgentToDelete] = useState(null);
    const [userId, setUserId] = useState(null);

    // Obtener el ID del usuario actual de la app principal si es necesario, 
    // pero como usamos `auth.currentUser` en las funciones, no es estrictamente necesario pasarlo como prop 
    // si las funciones lo obtienen directamente, PERO para seguridad lo obtenemos.
    useEffect(() => {
        const u = getAuth().currentUser;
        if(u) setUserId(u.uid);
    }, []);

    const handleSaveAgent = async (e) => {
        e.preventDefault(); 
        if(!userId) return;
        setSaving(true);
        try {
            const agentData = { ...currentAgent };
            if (currentAgent.id) await updateDoc(doc(db, 'artifacts', appId, 'users', userId, 'agents', currentAgent.id), agentData);
            else await addDoc(collection(db, 'artifacts', appId, 'users', userId, 'agents'), { ...agentData, createdAt: serverTimestamp() });
            setIsEditing(false); setCurrentAgent({ name: '', phone: '', email: '', licenses: '', photoUrl: '', bio: '' });
        } catch (error) { console.error(error); }
        setSaving(false);
    };

    const confirmDeleteAgent = async () => {
        if (!agentToDelete || !userId) return;
        try { await deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'agents', agentToDelete.id)); setAgentToDelete(null); } catch (error) {}
    };

    return (
        <div className="max-w-5xl mx-auto animate-in fade-in">
            {agentToDelete && (
                <div className="fixed inset-0 z-[150] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><Trash2 size={24} /></div>
                        <h3 className="font-bold text-lg mb-2">¿Eliminar Agente?</h3>
                        <p className="text-sm text-slate-500 mb-6">Esta acción es irreversible.</p>
                        <div className="flex gap-3"><button onClick={() => setAgentToDelete(null)} className="flex-1 py-2 bg-slate-100 rounded-lg text-sm">Cancelar</button><button onClick={confirmDeleteAgent} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm">Eliminar</button></div>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-center mb-6"><h3 className="font-semibold text-lg text-[#1d1d1f]">Equipo de Agentes</h3><button onClick={() => { setCurrentAgent({ name: '', phone: '', email: '', licenses: '', photoUrl: '', bio: '' }); setIsEditing(true); }} className="bg-black text-white px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 hover:bg-gray-800"><Plus size={16} /> Nuevo Agente</button></div>
            {isEditing ? (
                <div className="bg-white p-6 rounded-[24px] border border-gray-100 shadow-sm max-w-2xl mx-auto animate-in zoom-in-95">
                    <h4 className="font-bold mb-4 text-slate-800">{currentAgent.id ? 'Editar Perfil' : 'Nuevo Perfil'}</h4>
                    <form onSubmit={handleSaveAgent} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label><input required value={currentAgent.name} onChange={e => setCurrentAgent({...currentAgent, name: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" /></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Teléfono</label><input required value={currentAgent.phone} onChange={e => setCurrentAgent({...currentAgent, phone: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" /></div>
                        </div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Correo Electrónico (para notificaciones)</label><input type="email" required value={currentAgent.email} onChange={e => setCurrentAgent({...currentAgent, email: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" placeholder="agente@empresa.com" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Foto URL</label><input value={currentAgent.photoUrl} onChange={e => setCurrentAgent({...currentAgent, photoUrl: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Licencias</label><input value={currentAgent.licenses} onChange={e => setCurrentAgent({...currentAgent, licenses: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" /></div>
                        <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bio</label><textarea rows="3" value={currentAgent.bio} onChange={e => setCurrentAgent({...currentAgent, bio: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100" /></div>
                        <div className="flex gap-3 pt-2"><button type="button" onClick={() => setIsEditing(false)} className="flex-1 py-2.5 text-slate-500 bg-slate-50 rounded-lg text-sm font-medium">Cancelar</button><button type="submit" disabled={saving} className="flex-1 py-2.5 bg-black text-white rounded-lg text-sm font-medium">Guardar</button></div>
                    </form>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map(agent => (
                        <div key={agent.id} className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm relative group hover:shadow-md transition-all">
                            <button onClick={() => setAgentToDelete(agent)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                            <div className="flex items-center gap-4 mb-4"><img src={agent.photoUrl || "https://ui-avatars.com/api/?name="+agent.name} className="w-14 h-14 rounded-full object-cover bg-slate-100" /><div><h4 className="font-bold text-[#1d1d1f] text-sm">{agent.name}</h4><p className="text-xs text-slate-500">{agent.phone}</p></div></div>
                            <div className="text-xs text-slate-600 mb-2 flex gap-2 items-center"><Mail size={12} className="text-blue-500"/> {agent.email || 'Sin email'}</div>
                            <div className="text-xs text-slate-600 mb-4 flex gap-2 items-center"><ShieldCheck size={14} className="text-green-500"/> Licencias: {agent.licenses}</div>
                            <p className="text-[11px] text-slate-400 line-clamp-2 italic mb-4">"{agent.bio}"</p>
                            <div className="flex gap-2 mt-auto">
                                <button onClick={() => { setCurrentAgent(agent); setIsEditing(true); }} className="flex-1 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-100">Editar</button>
                                <button onClick={() => onViewReport(agent)} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center justify-center gap-1"><BarChart3 size={12}/> Auditoría</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function AdminBrain({ aiConfig, onSaveConfig }) {
  const [c, setC] = useState(aiConfig);
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState({ url: '', type: '', msg: '' }); 
  
  // CRITICAL FIX: Sync local state with props when data loads from DB
  useEffect(() => { setC(aiConfig); }, [aiConfig]);
  
  const handleDayToggle = (day) => setC(prev => ({...prev, schedule: {...prev.schedule, [day]: {...prev.schedule[day], enabled: !prev.schedule[day].enabled}}}));
  const handleTimeChange = (day, type, value) => setC(prev => ({...prev, schedule: {...prev.schedule, [day]: {...prev.schedule[day], [type]: value}}}));
  const save = async () => { setSaving(true); await onSaveConfig(c); setSaving(false); };
  
  const testWebhook = async (url) => {
      if(!url) return;
      setTestStatus({ url, type: 'loading', msg: 'Enviando...' });
      try {
          await fetch(url, {
              method: 'POST',
              mode: 'no-cors',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ event: 'TEST', date: new Date().toISOString(), message: 'Prueba de conexión exitosa desde Lucy' })
          });
          setTestStatus({ url, type: 'success', msg: '¡Enviado! Revisa Zapier.' });
          setTimeout(() => setTestStatus({ url: '', type: '', msg: '' }), 4000);
      } catch(e) {
          setTestStatus({ url, type: 'error', msg: 'Error: ' + e.message });
      }
  }

  const daysList = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
      <div className="bg-white p-8 rounded-[24px] shadow-[0_2px_20px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col gap-8">
        
        <div className="space-y-8">
           
           {/* 1. PROMPT (Instrucciones Base) */}
           <div>
               <h3 className="font-semibold text-[#1d1d1f] mb-4 text-lg flex items-center gap-2">Cerebro de Lucy</h3>
               <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wide block mb-2">Instrucciones Base (Prompt)</label>
               <textarea value={c.systemPrompt} onChange={(e)=>setC({...c, systemPrompt:e.target.value})} className="w-full h-48 p-4 bg-[#F5F5F7] border border-gray-200 rounded-2xl text-sm font-mono text-[#1d1d1f] focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-inner leading-relaxed resize-none" placeholder="Escribe aquí cómo debe comportarse Lucy..." />
           </div>

           {/* 2. SCHEDULE (Horario) */}
           <div>
               <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wide block mb-3">Horario de Atención</label>
               <div className="bg-[#F5F5F7] p-5 rounded-2xl border border-gray-100">
                   <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
                       <span className="text-xs font-bold uppercase text-slate-500 flex items-center gap-2"><Clock size={14}/> Configuración Semanal</span>
                       <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-slate-500 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 hover:border-orange-300 transition-colors">
                           <input type="checkbox" checked={c.vacationMode} onChange={(e)=>setC({...c, vacationMode: e.target.checked})} className="accent-orange-500"/> Modo Vacaciones
                       </label>
                   </div>
                   
                   {c.vacationMode && (
                       <div className="flex gap-4 items-center bg-orange-50 p-4 rounded-xl border border-orange-100 mb-4 animate-in fade-in">
                           <div className="flex-1">
                               <label className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Desde</label>
                               <input type="date" value={c.vacationStart} onChange={(e)=>setC({...c, vacationStart:e.target.value})} className="w-full bg-white border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-orange-800 outline-none focus:ring-2 focus:ring-orange-200"/>
                           </div>
                           <span className="text-orange-400 font-bold mt-3">→</span>
                           <div className="flex-1">
                               <label className="text-[9px] font-bold text-orange-600 uppercase block mb-1">Hasta</label>
                               <input type="date" value={c.vacationEnd} onChange={(e)=>setC({...c, vacationEnd:e.target.value})} className="w-full bg-white border border-orange-200 rounded-lg px-2 py-1.5 text-xs text-orange-800 outline-none focus:ring-2 focus:ring-orange-200"/>
                           </div>
                       </div>
                   )}

                   <div className="space-y-3">
                       {daysList.map(day => (
                           <div key={day} className="flex items-center justify-between group">
                               <div className="flex items-center gap-3 w-32">
                                   <input type="checkbox" checked={c.schedule?.[day]?.enabled} onChange={() => handleDayToggle(day)} className="accent-black w-4 h-4 rounded cursor-pointer"/>
                                   <span className={`text-xs font-bold uppercase tracking-wide ${c.schedule?.[day]?.enabled ? 'text-slate-700' : 'text-slate-400'}`}>{day}</span>
                               </div>
                               {c.schedule?.[day]?.enabled ? (
                                   <div className="flex gap-2 items-center flex-1 justify-end">
                                       <input type="time" value={c.schedule[day].start} onChange={(e)=>handleTimeChange(day, 'start', e.target.value)} className="bg-white border border-gray-200 p-1.5 rounded-lg text-xs w-24 text-center font-medium outline-none focus:border-blue-500"/>
                                       <span className="text-slate-300 text-[10px] font-bold">A</span>
                                       <input type="time" value={c.schedule[day].end} onChange={(e)=>handleTimeChange(day, 'end', e.target.value)} className="bg-white border border-gray-200 p-1.5 rounded-lg text-xs w-24 text-center font-medium outline-none focus:border-blue-500"/>
                                   </div>
                               ) : (
                                   <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest px-4 py-1.5 border border-transparent">Cerrado</span>
                               )}
                           </div>
                       ))}
                   </div>
               </div>
           </div>

           {/* 3. WEBHOOKS (Integraciones) */}
           <div className="pt-4 border-t border-gray-100">
               <div className="flex justify-between items-center mb-4">
                   <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wide flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div> Integraciones (Webhooks)</label>
               </div>
               <div className="grid md:grid-cols-2 gap-6">
                   <div>
                       <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1.5">Nuevo Lead (Notificación)</label>
                       <div className="flex gap-2 relative">
                           <input placeholder="https://hooks.zapier.com/..." value={c.webhookUrl || ''} onChange={e=>setC({...c, webhookUrl:e.target.value})} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-xs font-medium text-[#1d1d1f] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
                           <button onClick={() => testWebhook(c.webhookUrl)} disabled={!c.webhookUrl} className="px-4 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 transition-all">Probar</button>
                       </div>
                       {testStatus.url === c.webhookUrl && testStatus.msg && (
                           <div className={`text-[10px] mt-1.5 font-medium flex items-center gap-1 ${testStatus.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                               {testStatus.type === 'success' ? <CheckCircle size={10}/> : null} {testStatus.msg}
                           </div>
                       )}
                   </div>
                   <div>
                       <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1.5">Asignación Agente (Email)</label>
                       <div className="flex gap-2 relative">
                           <input placeholder="https://hooks.zapier.com/..." value={c.assignmentWebhookUrl || ''} onChange={e=>setC({...c, assignmentWebhookUrl:e.target.value})} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-xs font-medium text-[#1d1d1f] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-sm" />
                           <button onClick={() => testWebhook(c.assignmentWebhookUrl)} disabled={!c.assignmentWebhookUrl} className="px-4 py-2 bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 transition-all">Probar</button>
                       </div>
                       {testStatus.url === c.assignmentWebhookUrl && testStatus.msg && (
                           <div className={`text-[10px] mt-1.5 font-medium flex items-center gap-1 ${testStatus.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                               {testStatus.type === 'success' ? <CheckCircle size={10}/> : null} {testStatus.msg}
                           </div>
                       )}
                   </div>
               </div>
           </div>

           <div className="pt-4">
               <button onClick={save} disabled={saving} className="w-full bg-[#1d1d1f] text-white font-medium py-4 rounded-xl hover:bg-black transition-all text-sm shadow-xl hover:shadow-2xl active:scale-[0.99] flex justify-center items-center gap-2">
                   {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Guardando...</> : "Guardar Configuración"}
               </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function ClientChat({ aiConfig, onSaveLead, onOpenLogin }) {
  const [activeUsers, setActiveUsers] = useState(Math.floor(Math.random() * (28 - 18 + 1)) + 18);
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hola, soy Lucy, su asistente personal experta en **Gastos Finales**. Mi misión es brindarle la información que necesita para su tranquilidad y la de su familia.\n\nTenga la plena seguridad de que **todo lo que hablemos es confidencial**; nada será divulgado sin su expresa autorización. Mi único objetivo es ayudarle, y si al final de nuestra charla usted lo desea, podré conectarle directamente con un **agente acreditado por su estado**.\n\n¿Cómo le podemos servir el día de hoy?' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [ended, setEnded] = useState(false);
  const scrollRef = useRef(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const { isAgentAvailable, message: statusMessage, isVacation, resumeDate } = getAgentStatus(aiConfig);

  useEffect(()=>{ 
      const i = setInterval(() => setActiveUsers(p => p + (Math.random() > 0.5 ? 1 : -1)), 5000);
      return () => clearInterval(i);
  },[]);

  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },[msgs, loading, showOptions]);

  const handleOptionClick = (type) => {
      setShowOptions(false); 
      const userChoiceText = type === 'ahora' ? "Prefiero hablar con un agente ahora." : "Prefiero programar una llamada.";
      const systemContext = `[SISTEMA: El usuario ha presionado el botón "${type === 'ahora' ? 'Hablar Ahora' : 'Programar Llamada'}". POR FAVOR, PIDE EL NÚMERO DE TELÉFONO ${type === 'programada' ? 'Y EL HORARIO PREFERIDO' : ''} AHORA.]`;
      const newMsgs = [...msgs, { role: 'user', content: userChoiceText }];
      setMsgs(newMsgs);
      setLoading(true);
      callGemini(newMsgs, systemContext);
  };

  const handleCopyFromModal = () => {
             const url = window.location.href;
             const textArea = document.createElement("textarea"); textArea.value = url; document.body.appendChild(textArea); textArea.select();
             try { document.execCommand('copy'); setCopySuccess(true); setTimeout(() => setCopySuccess(false), 3000); } catch (err) {}
             document.body.removeChild(textArea);
  };

  const send = async (e) => {
            e.preventDefault(); if(!input.trim() || loading || ended) return;
            const newM = [...msgs, {role:'user', content:input}]; setMsgs(newM); setInput(''); setLoading(true);
            callGemini(newM);
          };

  const callGemini = async (history, extra = "") => {
    try {
        let availabilityInstruction = "";
        if (isVacation && resumeDate) availabilityInstruction = `NOTA CRÍTICA: Estamos en vacaciones hasta el ${resumeDate.toLocaleDateString()}. SI PIDEN LLAMADA, di que podemos agendar a partir de esa fecha.`;

        const prompt = `
          FECHA: ${new Date().toLocaleString()}. ${aiConfig.systemPrompt} ${availabilityInstruction}
          HISTORIAL: ${history.map(m=>m.role+': '+m.content).join('\n')} ${extra}
          
          OBJETIVO: Recolectar 7 datos: Nombre, Edad, Salud, Estado, Tabaco, Presupuesto, EMAIL.
          * IMPORTANTE: Pide el EMAIL explicando que es para enviarle la FOTO y LICENCIA del agente por seguridad.
          * SI TIENES LOS 7 DATOS: Responde SOLO JSON: { "action": "show_options", "text": "Excelente, tengo su perfil completo. ¿Cómo prefiere continuar?" }
          * SI ELIGEN OPCION: Si "Hablar" pide Telefono. Si "Programar" pide Telefono y Horario.
          * FINAL: Si confirman todo, responde SOLO JSON: { "action": "save_lead", "nombre": "...", "email": "...", "telefono": "...", "resumen": "...", "text": "¡Perfecto! Un agente le contactará pronto." }
        `;
        
        const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }] }] });
        const text = res.candidates[0].content.parts[0].text;
        let json, reply = text;
        
        try { const match = text.match(/```json([\s\S]*?)```/) || [null, text.substring(text.indexOf('{'), text.lastIndexOf('}')+1)]; if (match[1]) json = JSON.parse(match[1]); } catch (e) {}

        if (json) {
            if (json.action === 'show_options') { setShowOptions(true); reply = json.text; }
            if (json.action === 'save_lead') { onSaveLead({ ...json, metodo_contacto: 'finalizado', fullChat: history }); setEnded(true); reply = json.text; }
        }
        setMsgs([...history, { role: 'assistant', content: cleanAiMessage(reply) }]);
    } catch (e) { console.error(e); }
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
                      <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full bg-green-500 animate-pulse ${ended ? 'bg-gray-400' : ''}`}></span><p className="text-xs text-[#86868b] font-medium">{ended ? 'Desconectado' : 'En Línea'}</p></div>
                      {!ended && <><span className="text-[#86868b] text-[10px]">•</span><p className="text-xs text-blue-600 font-medium">{activeUsers} personas consultando</p></>}
                  </div>
                </div>
            </div>
            <button onClick={() => setShowShareModal(true)} className="flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-600 transition-colors p-2"><Share size={20} /><span className="text-[9px] font-medium uppercase tracking-wide">Guardar</span></button>
        </div>

        {showShareModal && (
            <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-100 relative">
                    <button onClick={() => setShowShareModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    <div className="text-center space-y-4">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto"><Share size={24} /></div>
                        <h3 className="font-bold text-lg text-slate-800">Guardar para después</h3>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2"><LinkIcon size={14} className="text-slate-400 shrink-0" /><span className="text-xs text-slate-500 truncate flex-1 font-mono">{window.location.href}</span></div>
                        <button onClick={handleCopyFromModal} className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${copySuccess ? 'bg-green-500 text-white shadow-green-200' : 'bg-black text-white hover:bg-gray-800 shadow-xl'}`}>{copySuccess ? <><CheckCircle size={18} /> ¡Enlace Copiado!</> : <><Copy size={18} /> Copiar Enlace</>}</button>
                    </div>
                </div>
            </div>
        )}
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 bg-white no-scrollbar">
            {msgs.map((m,i)=>(<div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>{m.role === 'assistant' && <LucyAvatar className="w-8 h-8 mr-2 mt-auto shrink-0" />}<div className={`w-fit max-w-[75%] px-5 py-3 rounded-2xl text-[16px] leading-relaxed shadow-sm text-left ${m.role==='user'?'bg-[#007AFF] text-white rounded-br-none':'bg-[#F2F2F7] text-[#1d1d1f] rounded-bl-none'}`}><RichText content={m.content}/></div></div>))}
            {loading && <div className="flex justify-start pl-10"><div className="bg-[#F2F2F7] px-4 py-3 rounded-2xl rounded-bl-none flex gap-1.5 items-center w-fit"><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span><span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span></div></div>}
            {showOptions && (
                <div className="flex flex-col gap-2 pt-2 animate-in zoom-in px-8">
                    <button onClick={() => handleOptionClick('ahora')} disabled={!isAgentAvailable} className={`w-full font-medium py-3.5 rounded-xl transition-all text-sm shadow-sm flex items-center justify-center gap-2 active:scale-95 ${isAgentAvailable ? 'bg-[#007AFF] text-white hover:bg-[#0062cc]' : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}>{isAgentAvailable ? <Zap size={16} fill="currentColor"/> : <Moon size={16}/>} {isAgentAvailable ? 'Hablar con un Agente Ahora' : 'Agentes no disponibles'}</button>
                    <button onClick={() => handleOptionClick('programada')} className="w-full bg-[#F2F2F7] text-[#007AFF] font-medium py-3.5 rounded-xl hover:bg-[#E5E5EA] transition-all text-sm flex items-center justify-center gap-2 active:scale-95"><Calendar size={16}/> Programar Llamada</button>
                </div>
            )}
        </div>
        
        <form onSubmit={send} className="p-4 bg-white/90 backdrop-blur-xl border-t border-gray-100 flex gap-3">
            <input value={input} onChange={e=>setInput(e.target.value)} disabled={ended} placeholder={ended ? "Chat finalizado" : "Escribe un mensaje..."} className="flex-1 bg-[#F2F2F7] border-0 rounded-full px-5 py-3 text-[16px] focus:ring-2 focus:ring-[#007AFF]/20 text-[#1d1d1f] placeholder:text-[#86868b] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"/>
            <button disabled={loading || ended} className="w-12 h-12 bg-[#007AFF] text-white rounded-full hover:bg-[#0062cc] transition-all active:scale-90 disabled:opacity-50 disabled:scale-100 flex items-center justify-center shrink-0 shadow-md"><Send size={20} fill="currentColor" className="ml-0.5" /></button>
        </form>
        <div className="text-center py-2 bg-white border-t border-gray-50"><button onClick={onOpenLogin} className="text-[9px] text-slate-300 hover:text-slate-400 transition-colors">Acceso Corporativo</button></div>
    </div>
  );
}

// --- COMPONENTE PRINCIPAL (DEFINIDO AL FINAL) ---

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('landing'); 
  const [isAdmin, setIsAdmin] = useState(false); 
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [adminTab, setAdminTab] = useState('active'); 
  const [leads, setLeads] = useState([]);
  const [agents, setAgents] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  
  const [aiConfig, setAiConfig] = useState({ systemPrompt: `Eres Lucy...`, webhookUrl: "", assignmentWebhookUrl: "", schedule: DEFAULT_SCHEDULE, vacationMode: false });
  const [agentToAudit, setAgentToAudit] = useState(null); // ESTADO PARA NAVEGACIÓN EQUIPO -> REPORTE

  useEffect(() => {
    const init = async () => { if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token); else await signInAnonymously(auth); };
    init();
    return onAuthStateChanged(auth, (u) => { 
        if (u) { 
            setUser(u); 
            if (u.isAnonymous === false) { 
                setIsAdmin(true); 
                // CRITICAL FIX: No auto-redirect. Admin stays on Landing but has access.
            } else { 
                setIsAdmin(false); 
            } 
        } 
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    // CRITICAL: Strict PRIVATE path to allow persistence between Client/Admin views without Auth change
    const leadsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'leads');
    const agentsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'agents');
    
    const u1 = onSnapshot(query(leadsRef), (s) => setLeads(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));
    const u2 = onSnapshot(query(agentsRef), (s) => setAgents(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    getDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config')).then(s => s.exists() && setAiConfig(prev => ({...prev, ...s.data()})));
    return () => { u1(); u2(); };
  }, [user]);

  // MODIFIED: Simulated Login for persistence
  const handleLogin = (e) => { 
      e.preventDefault(); 
      if (email === 'admin@demo.com' && password === '123456') { // Accepts specific email, strict password for demo feel
          setIsAdmin(true); 
          setShowLogin(false); 
          setView('admin'); 
      } else { 
          setLoginError("Credenciales inválidas (Prueba: admin@demo.com / 123456)"); 
      } 
  };
  
  const handleLogout = async () => { setIsAdmin(false); setView('landing'); };
  
  const saveLeadToDb = async (d) => { if(!user) return; await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'leads'), { ...d, createdAt: serverTimestamp(), status: 'active' }); };
  const saveConfig = async (c) => { if(!user) return; await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config'), c); setAiConfig(c); };
  
  const deleteLead = async (ids) => { if(!user) return; const batch = writeBatch(db); (Array.isArray(ids)?ids:[ids]).forEach(id => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'leads', id))); await batch.commit(); };
  const updateStatus = async (ids, st) => { if(!user) return; const batch = writeBatch(db); (Array.isArray(ids)?ids:[ids]).forEach(id => batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'leads', id), { status: st })); await batch.commit(); };
  
  const assignAgent = async (ids, agent) => {
      if(!user) return;
      const batch = writeBatch(db);
      (Array.isArray(ids)?ids:[ids]).forEach(id => {
          batch.update(doc(db, 'artifacts', appId, 'users', user.uid, 'leads', id), { assignedAgentId: agent.id, assignedAgentName: agent.name, assignedAt: serverTimestamp(), status: 'assigned' });
          const l = leads.find(x => x.id === id);
          if (l) {
              const url = aiConfig.assignmentWebhookUrl || aiConfig.webhookUrl;
              if (url) fetch(url, { method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ type: "AGENT_ASSIGNMENT", lead: l, agent }) }).catch(console.error);
          }
      });
      await batch.commit();
  };

  const unassignAgent = async (ids) => {
      if(!user) return;
      const batch = writeBatch(db);
      (Array.isArray(ids)?ids:[ids]).forEach(id => {
          const ref = doc(db, 'artifacts', appId, 'users', user.uid, 'leads', id);
          batch.update(ref, { 
              assignedAgentId: deleteField(), 
              assignedAgentName: deleteField(),
              assignedAt: deleteField(),
              status: 'active' 
          });
      });
      await batch.commit();
  };

  const handleViewAgentReport = (agent) => {
      setAgentToAudit(agent);
      setAdminTab('reports');
  };

  if (!user) return <div className="h-screen flex items-center justify-center bg-[#F5F5F7]"><div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin"></div></div>;

  return (
    <div className="h-[100dvh] bg-[#F5F5F7] text-[#1d1d1f] font-sans antialiased flex flex-col overflow-hidden">
      <nav className="bg-white/80 backdrop-blur-xl border-b border-white/20 shrink-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}><div className="bg-rose-500 text-white p-1.5 rounded-lg shadow-sm"><ProtectionLogo size={20}/></div><span className="font-semibold text-base sm:text-lg tracking-tight text-black">Asistente de Beneficios</span></div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <div className="flex bg-[#E8E8ED]/50 p-1 rounded-full animate-in fade-in">
                <button onClick={() => setView('chat')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'chat' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Asistente</button>
                <button onClick={() => setView('admin')} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${view === 'admin' ? 'bg-white text-black shadow-sm' : 'text-slate-500'}`}>Admin</button>
                <button onClick={handleLogout} className="ml-2 px-2 text-xs text-red-400 hover:text-red-600 font-medium">Salir</button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 relative overflow-hidden flex flex-col w-full max-w-7xl mx-auto">
        {view === 'landing' ? (
            <LandingView 
                onStartChat={() => setView('chat')} 
                onOpenLogin={() => isAdmin ? setView('admin') : setShowLogin(true)} 
                isAdmin={isAdmin}
                onGoToAdmin={() => setView('admin')}
            />
        ) : view === 'chat' ? (
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                <ClientChat aiConfig={aiConfig} onSaveLead={saveLeadToDb} onOpenLogin={() => setShowLogin(true)} />
            </div>
        ) : isAdmin ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex gap-1 bg-[#E8E8ED]/50 p-1 rounded-xl w-fit self-start overflow-x-auto no-scrollbar">
                      {[{id:'active',icon:<Inbox size={14}/>,l:'Activos'},{id:'assigned',icon:<Briefcase size={14}/>,l:'Asignados'},{id:'archived',icon:<Archive size={14}/>,l:'Archivo'},{id:'reports',icon:<BarChart3 size={14}/>,l:'Reportes'},{id:'team',icon:<Users size={14}/>,l:'Equipo'},{id:'brain',icon:<BrainAvatar className="w-4 h-4 rounded-md" />,l:'Inteligencia'}].map(t => (
                        <button key={t.id} onClick={()=>setAdminTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${adminTab===t.id?'bg-white text-black shadow-sm':'text-[#86868b] hover:text-black'}`}>{t.icon} {t.l}</button>
                      ))}
                    </div>
                    {adminTab!=='brain' && adminTab!=='team' && adminTab!=='reports' && <div className="relative group w-full md:w-auto"><Search className="absolute left-3 top-2.5 text-gray-400" size={14} /><input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 bg-white border-0 rounded-xl text-sm w-full md:w-64 outline-none shadow-sm" /></div>}
                </div>
                
                {adminTab === 'active' ? <LeadsList leads={leads.filter(l => (!l.status || l.status === 'active'))} agents={agents} onDeleteLead={deleteLead} onUpdateStatus={updateStatus} onAssignAgent={assignAgent} onUnassign={unassignAgent} isArchive={false} searchTerm={searchTerm} /> : 
                 adminTab === 'assigned' ? <LeadsList leads={leads.filter(l => l.status === 'assigned')} agents={agents} onDeleteLead={deleteLead} onUpdateStatus={updateStatus} onAssignAgent={assignAgent} onUnassign={unassignAgent} isArchive={false} searchTerm={searchTerm} /> :
                 adminTab === 'archived' ? <LeadsList leads={leads.filter(l => l.status === 'archived')} agents={agents} onDeleteLead={deleteLead} onUpdateStatus={updateStatus} onAssignAgent={assignAgent} onUnassign={unassignAgent} isArchive={true} searchTerm={searchTerm} /> : 
                 adminTab === 'reports' ? <ReportsView leads={leads} agents={agents} initialAgent={agentToAudit} /> :
                 adminTab === 'team' ? <AgentsManager agents={agents} onViewReport={handleViewAgentReport} /> :
                 <AdminBrain aiConfig={aiConfig} onSaveConfig={saveConfig} />}
            </div>
        ) : (
            // Fallback para no-admins intentando acceder a rutas protegidas
            <LandingView onStartChat={() => setView('chat')} onOpenLogin={() => setShowLogin(true)} isAdmin={false} />
        )}
      </main>

      {showLogin && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6"><div className="flex items-center gap-2 text-red-600"><ShieldAlert size={20} /><h3 className="font-bold text-lg text-slate-800">Acceso Restringido</h3></div><button onClick={() => setShowLogin(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button></div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Correo Corporativo</label><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black/10 outline-none text-sm" placeholder="usuario@empresa.com" /></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Credencial</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black/10 outline-none text-sm" placeholder="••••••••" /></div>
              {loginError && <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg font-medium">{loginError}</div>}
              <button type="submit" className="w-full bg-black text-white font-medium py-3 rounded-xl hover:bg-gray-800 transition-all text-sm shadow-lg disabled:opacity-50">Iniciar Sesión</button>
            </form>
            <div className="mt-4 text-center">
                <p className="text-[10px] text-slate-400">Este sistema monitorea todos los accesos.</p>
                <p className="text-[9px] text-slate-300 mt-1">Demo Login: admin@demo.com / 123456</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
