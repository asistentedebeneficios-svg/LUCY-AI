import React, { useState, useEffect, useRef, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';

/**
 * -----------------------------------------------------------------------------
 * 1. IMPORTACIÓN DE ICONOS (LUCIDE REACT)
 * -----------------------------------------------------------------------------
 */
import { 
  MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, 
  Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, 
  FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, 
  Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, 
  Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, 
  CheckSquare, Square, Share2, Briefcase, UserCog, Filter, ChevronDown, MapPin, 
  Mail, UserMinus, UserPlus, Link as LinkIcon, Plus, MinusCircle, 
  BarChart3, TrendingUp, PieChart, Wallet, AlertCircle, Info, RefreshCw,
  ArrowRight, CheckSquare as CheckBox, HelpCircle, HardDrive
} from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/**
 * -----------------------------------------------------------------------------
 * 2. CONFIGURACIÓN GLOBAL Y ESTADOS INICIALES
 * -----------------------------------------------------------------------------
 */
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
try {
    app = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.error("Firebase Init Error");
}

const DEFAULT_SCHEDULE = { 
    lunes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    martes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    miercoles: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    jueves: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    viernes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    sabado: { enabled: false, slots: [] },
    domingo: { enabled: false, slots: [] }
};

const DEFAULT_SYSTEM_PROMPT = `
Eres Lucy, una asistente experta y profundamente empática en "Gastos Finales". 
TU MISIÓN ES EDUCAR ANTES DE PREGUNTAR. No eres un formulario.

REGLAS DE INTERACCIÓN:
1. EDUCA: Antes de pedir Salud, explica que es para calificar al beneficio inmediato. Antes de pedir Presupuesto, di que hay planes desde $1 al día.
2. EMPATÍA: Si el usuario menciona a su familia o miedos, valida sus sentimientos.
3. CALENDARIO: Hoy es ${new Date().toLocaleDateString()}. Si el usuario pide un día CERRADO (como Sábado o Domingo según el horario adjunto), infórmale que los agentes no laboran y ofrece el lunes.

ETIQUETAS: [MODE:HEALTH], [MODE:SMOKER], [MODE:BUDGET], [MODE:CLOSING].
`;

/**
 * -----------------------------------------------------------------------------
 * 3. HELPERS DE LÓGICA
 * -----------------------------------------------------------------------------
 */
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

function cleanAiMessage(text) {
    if (!text) return '';
    return text.replace(/```json[\s\S]*?```/g, '').replace(/\[MODE:[A-Z_]+\]/g, '').trim();
}

function formatFirestoreDate(ts) {
    if (!ts) return 'Reciente';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        return d.toLocaleDateString();
    } catch (e) { return 'Error Fecha'; }
}

const RichText = ({ content }) => {
    if (!content) return null;
    const parts = content.split(/(\*\*.*?\*\*)/g);
    return (
        <span className="text-sm leading-relaxed">
            {parts.map((part, i) => part.startsWith('**') ? <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong> : part)}
        </span>
    );
};

const getAgentStatus = (config) => {
    if (!config || !config.schedule) return { isAgentAvailable: true };
    const now = new Date();
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const day = config.schedule[days[now.getDay()]];
    if (!day || !day.enabled) return { isAgentAvailable: false, message: "Cerrado hoy" };
    const min = now.getHours() * 60 + now.getMinutes();
    const open = (day.slots || []).some(s => {
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        return min >= (sh * 60 + sm) && min < (eh * 60 + em);
    });
    return { isAgentAvailable: open };
};

/**
 * -----------------------------------------------------------------------------
 * 4. COMPONENTES: DASHBOARD Y REPORTES
 * -----------------------------------------------------------------------------
 */
const ReportsDashboard = ({ leads, agents }) => {
    const metrics = useMemo(() => {
        const total = leads.length;
        const sold = leads.filter(l => l.status === 'sold').length;
        return { total, sold, conversion: total > 0 ? ((sold/total)*100).toFixed(1) : 0 };
    }, [leads]);

    const rank = agents.map(a => {
        const al = leads.filter(l => l.assignedAgentId === a.id);
        const as = al.filter(l => l.status === 'sold').length;
        return { ...a, leads: al.length, sales: as, eff: al.length > 0 ? ((as/al.length)*100).toFixed(0) : 0 };
    }).sort((a,b) => b.sales - a.sales);

    return (
        <div className="space-y-8 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="p-3 bg-blue-50 text-blue-600 w-fit rounded-2xl mb-4"><Users size={24}/></div>
                    <h4 className="text-4xl font-black">{metrics.total}</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Leads Generados</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="p-3 bg-green-50 text-green-600 w-fit rounded-2xl mb-4"><DollarSign size={24}/></div>
                    <h4 className="text-4xl font-black">{metrics.sold}</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ventas Cerradas</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="p-3 bg-indigo-50 text-indigo-600 w-fit rounded-2xl mb-4"><TrendingUp size={24}/></div>
                    <h4 className="text-4xl font-black">{metrics.conversion}%</h4>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tasa de Éxito</p>
                </div>
            </div>

            <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden">
                <div className="p-6 border-b bg-slate-50/50 flex justify-between items-center">
                    <h3 className="font-bold">Desempeño de Agentes</h3>
                    <Award className="text-yellow-500" size={20}/>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase">
                        <tr><th className="p-6">Agente</th><th className="p-6">Leads</th><th className="p-6">Cierres</th><th className="p-6">Efectividad</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {rank.map(a => (
                            <tr key={a.id}>
                                <td className="p-6 flex items-center gap-3 font-bold"><img src={a.foto} className="w-8 h-8 rounded-full"/>{a.nombre}</td>
                                <td className="p-6 text-sm">{a.leads}</td>
                                <td className="p-6 text-sm font-bold text-green-600">{a.sales}</td>
                                <td className="p-6"><div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-indigo-500 h-full" style={{width: `${a.eff}%`}}></div></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/**
 * -----------------------------------------------------------------------------
 * 5. COMPONENTES: GESTIÓN DE LEADS
 * -----------------------------------------------------------------------------
 */
function LeadsList({ leads, agents, onOpen, onAssign, onUpdate, searchTerm, isArchive = false }) {
    const filtered = leads.filter(l => l.nombre?.toLowerCase().includes(searchTerm.toLowerCase()));
    const [sel, setSel] = useState([]);

    const toggle = (id) => setSel(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]);

    return (
        <div className="bg-white rounded-[32px] border shadow-sm overflow-hidden animate-in fade-in">
            {sel.length > 0 && (
                <div className="bg-slate-900 p-4 text-white flex justify-between items-center">
                    <span className="text-xs font-bold uppercase">{sel.length} Seleccionados</span>
                    <div className="flex gap-2">
                        <button onClick={() => { onAssign(sel); setSel([]); }} className="bg-white/20 px-4 py-2 rounded-xl text-[10px] font-bold">Asignar</button>
                        <button onClick={() => { onUpdate(sel, isArchive ? 'active' : 'archived'); setSel([]); }} className="bg-white/20 px-4 py-2 rounded-xl text-[10px] font-bold">{isArchive ? 'Activar' : 'Archivar'}</button>
                    </div>
                </div>
            )}
            <table className="w-full text-left">
                <thead className="bg-slate-50/50 border-b text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <tr><th className="p-6 w-12"></th><th className="p-6">Prospecto</th><th className="p-6">Prioridad</th><th className="p-6">Resumen Lucy</th><th className="p-6 text-center">Acción</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {filtered.map(l => (
                        <tr key={l.id} className="hover:bg-slate-50/50 cursor-pointer group" onClick={() => onOpen(l)}>
                            <td className="p-6" onClick={e => { e.stopPropagation(); toggle(l.id); }}><input type="checkbox" checked={sel.includes(l.id)} /></td>
                            <td className="p-6"><div className="font-bold">{l.nombre}</div><div className="text-[10px] text-slate-400">{l.estado} • {l.edad} años</div></td>
                            <td className="p-6"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${l.horario_preferido === 'Programada' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>{l.horario_preferido || 'Inmediata'}</span></td>
                            <td className="p-6 text-xs text-slate-500 italic max-w-xs truncate">"{l.resumen_ai}"</td>
                            <td className="p-6 text-center" onClick={e => e.stopPropagation()}><button onClick={() => onAssign([l.id])} className="p-2 text-indigo-500 hover:bg-white rounded-xl shadow-sm opacity-0 group-hover:opacity-100 transition-all"><UserPlus size={16}/></button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// CONTINÚA EN EL SIGUIENTE BLOQUE...

/**
 * -----------------------------------------------------------------------------
 * 6. COMPONENTES: GESTIÓN DE AGENTES Y PANEL DE CONTROL
 * -----------------------------------------------------------------------------
 */
function AgentsManager({ agents, leads, onOpenLead, onSaveAgent, onDeleteAgent, searchTerm }) {
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({ nombre: '', telefono: '', email: '', foto: '', estados: '', mensaje: '' });
    const filtered = agents.filter(a => (a.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSave = async (e) => { 
        e.preventDefault(); 
        await onSaveAgent(formData); 
        setIsEditing(false); 
        setFormData({ nombre: '', telefono: '', email: '', foto: '', estados: '', mensaje: '' }); 
    };

    if (selectedAgent) {
        const agentLeads = leads.filter(l => l.assignedAgentId === selectedAgent.id);
        return (
            <div className="space-y-6 animate-in fade-in">
                <button onClick={() => setSelectedAgent(null)} className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-black transition-colors">
                    <RotateCcw size={16}/> Volver al listado
                </button>
                <div className="bg-white p-8 rounded-[40px] border border-slate-100 flex items-center gap-8 shadow-sm">
                    <img src={selectedAgent.foto || "https://ui-avatars.com/api/?name="+selectedAgent.nombre} className="w-24 h-24 rounded-[32px] object-cover border-4 border-slate-50"/>
                    <div className="flex-1">
                        <h2 className="text-3xl font-black text-slate-900">{selectedAgent.nombre}</h2>
                        <div className="flex gap-4 mt-2">
                            <span className="flex items-center gap-1 text-xs text-slate-400 font-bold"><MapPin size={14}/> {selectedAgent.estados}</span>
                            <span className="flex items-center gap-1 text-xs text-slate-400 font-bold"><Mail size={14}/> {selectedAgent.email}</span>
                        </div>
                    </div>
                    <div className="text-center bg-indigo-600 p-6 rounded-[32px] text-white shadow-xl shadow-indigo-100">
                        <span className="block text-3xl font-black">{agentLeads.length}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest">Leads Activos</span>
                    </div>
                </div>
                <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b text-[10px] font-bold text-slate-400 uppercase">
                            <tr><th className="p-6">Nombre del Prospecto</th><th className="p-6">Estado</th><th className="p-6">Fecha Asignación</th><th className="p-6 text-center">Acción</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {agentLeads.map(l => (
                                <tr key={l.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => onOpenLead(l)}>
                                    <td className="p-6 font-bold">{l.nombre}</td>
                                    <td className="p-6"><span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase">{l.status}</span></td>
                                    <td className="p-6 text-xs text-slate-400 font-medium">{formatFirestoreDate(l.assignedAt || l.createdAt)}</td>
                                    <td className="p-6 text-center"><ExternalLink size={14} className="mx-auto text-slate-300"/></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900">Agentes del Equipo</h2>
                <button onClick={() => setIsEditing(true)} className="bg-black text-white px-6 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 shadow-xl hover:scale-105 transition-transform">
                    <UserPlus size={16}/> Registrar Agente
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filtered.map(a => (
                    <div key={a.id} className="bg-white rounded-[40px] p-8 border border-slate-100 hover:shadow-2xl transition-all cursor-pointer group" onClick={() => setSelectedAgent(a)}>
                        <div className="flex items-center gap-5 mb-6">
                            <img src={a.foto || "https://ui-avatars.com/api/?name="+a.nombre} className="w-16 h-16 rounded-[24px] object-cover shadow-md group-hover:scale-110 transition-transform"/>
                            <div className="min-w-0">
                                <h3 className="font-bold text-slate-900 text-lg truncate">{a.nombre}</h3>
                                <p className="text-xs text-slate-400 font-medium truncate">{a.email}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
                            <div className="flex items-center gap-1 bg-slate-50 p-2 rounded-lg"><MapPin size={12} className="text-indigo-400"/> {a.estados || 'N/A'}</div>
                            <div className="flex items-center gap-1 bg-slate-50 p-2 rounded-lg"><Phone size={12} className="text-indigo-400"/> {a.telefono || 'N/A'}</div>
                        </div>
                        <div className="mt-6 flex gap-2">
                            <button className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">Ver Perfil</button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteAgent([a.id]); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16}/></button>
                        </div>
                    </div>
                ))}
            </div>
            {isEditing && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <form onSubmit={handleSave} className="bg-white p-10 rounded-[48px] shadow-2xl w-full max-w-lg space-y-6 animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center"><h3 className="text-2xl font-black">Nuevo Agente</h3><button type="button" onClick={() => setIsEditing(false)} className="p-2 bg-slate-100 rounded-full"><X/></button></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Nombre Completo</label><input required className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej: Juan Pérez"/></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Email Corporativo</label><input required type="email" className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="juan@correo.com"/></div>
                        </div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">URL de la Foto</label><input className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={formData.foto} onChange={e => setFormData({...formData, foto: e.target.value})} placeholder="https://..."/></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Estados (Licencia)</label><input className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={formData.estados} onChange={e => setFormData({...formData, estados: e.target.value})} placeholder="FL, TX, CA"/></div>
                            <div><label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">Teléfono</label><input className="w-full p-4 bg-slate-50 border-0 rounded-2xl text-sm font-bold" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} placeholder="+1..."/></div>
                        </div>
                        <button className="w-full bg-slate-900 text-white py-5 rounded-[24px] font-black text-sm shadow-xl hover:bg-black transition-all">Guardar en Base de Datos</button>
                    </form>
                </div>
            )}
        </div>
    );
}

/**
 * -----------------------------------------------------------------------------
 * 7. ADMIN BRAIN (ESTRUCTURA DE LÓGICA Y WEBHOOKS)
 * -----------------------------------------------------------------------------
 */
function AdminBrain({ aiConfig, onSaveConfig }) {
    const [c, setC] = useState(aiConfig);
    const [saving, setSaving] = useState(false);
    const [authModal, setAuthModal] = useState(false);
    const [pass, setPass] = useState('');
    const [webhookUnlocked, setWebhookUnlocked] = useState(false);

    const handleSave = async () => { setSaving(true); await onSaveConfig(c); setSaving(false); };
    const handleDayToggle = (d) => {
        const enabled = !c.schedule?.[d]?.enabled;
        const slots = enabled ? [{start: '09:00', end: '18:00'}] : [];
        setC({...c, schedule: {...c.schedule, [d]: {enabled, slots}}});
    };

    return (
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 animate-in fade-in">
            <div className="md:col-span-2 space-y-6">
                <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm space-y-10">
                    <div className="flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Sparkles size={24}/></div><h3 className="text-2xl font-black text-slate-900">Configuración de Inteligencia</h3></div>
                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block">Prompt de Comportamiento (System Prompt)</label>
                        <textarea className="w-full h-80 p-8 bg-slate-50 rounded-[40px] border-0 text-sm font-medium leading-relaxed resize-none focus:ring-4 focus:ring-indigo-100 transition-all" value={c.systemPrompt} onChange={e => setC({...c, systemPrompt: e.target.value})} />
                        <p className="text-[10px] text-slate-400 italic font-medium px-4">Lucy usará estas instrucciones para interactuar con los prospectos. Sea específico con el protocolo.</p>
                    </div>
                    <div className="bg-slate-50 p-8 rounded-[40px] border border-slate-100 space-y-6">
                        <div className="flex justify-between items-center"><label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Integraciones Webhook (Zapier/Make)</label><button onClick={() => setAuthModal(true)} className="text-indigo-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Lock size={12}/> Desbloquear</button></div>
                        <div className="space-y-4">
                            <div><label className="text-[9px] font-bold text-slate-400 mb-1 block">Webhook Nuevo Lead</label><input type={webhookUnlocked ? "text" : "password"} className="w-full p-4 bg-white border border-slate-100 rounded-2xl text-xs" value={c.webhookUrl} disabled={!webhookUnlocked} onChange={e => setC({...c, webhookUrl: e.target.value})}/></div>
                            <div><label className="text-[9px] font-bold text-slate-400 mb-1 block">Webhook Notificación Asignación</label><input className="w-full p-4 bg-white border border-slate-100 rounded-2xl text-xs" value={c.assignmentWebhookUrl} onChange={e => setC({...c, assignmentWebhookUrl: e.target.value})}/></div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="space-y-6">
                <div className="bg-slate-900 p-10 rounded-[48px] text-white space-y-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10"><Clock size={120}/></div>
                    <h3 className="text-xl font-bold flex items-center gap-2">Horarios de Agentes</h3>
                    <div className="space-y-4">
                        {['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(d => (
                            <div key={d} className="flex items-center justify-between border-b border-white/10 pb-4">
                                <div className="flex items-center gap-3"><input type="checkbox" className="w-4 h-4 rounded accent-indigo-500" checked={c.schedule?.[d]?.enabled} onChange={() => handleDayToggle(d)} /><span className="text-[11px] font-black uppercase tracking-widest">{d}</span></div>
                                {c.schedule?.[d]?.enabled ? <div className="text-[10px] font-bold text-indigo-400">09:00 - 18:00</div> : <span className="text-[10px] font-bold text-white/20 uppercase">Cerrado</span>}
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSave} className="w-full bg-indigo-600 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-900/40">{saving ? 'Actualizando...' : 'Guardar Configuración'}</button>
                </div>
                <div className="bg-white p-8 rounded-[40px] border border-slate-100 text-center space-y-4">
                    <div className="p-3 bg-amber-50 text-amber-500 w-fit mx-auto rounded-2xl"><AlertCircle size={24}/></div>
                    <h4 className="font-bold text-slate-900">Modo Vacaciones</h4>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Al activar este modo, Lucy informará automáticamente a los usuarios que no hay agentes disponibles de inmediato.</p>
                    <button onClick={() => setC({...c, vacationMode: !c.vacationMode})} className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all ${c.vacationMode ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-white border-slate-100 text-slate-400'}`}>{c.vacationMode ? 'Activado' : 'Desactivado'}</button>
                </div>
            </div>
            {authModal && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
                    <form onSubmit={(e) => { e.preventDefault(); if(pass === 'admin') { setWebhookUnlocked(true); setAuthModal(false); } }} className="bg-white p-12 rounded-[48px] w-full max-w-xs text-center space-y-6 shadow-2xl animate-in zoom-in">
                        <div className="p-4 bg-rose-50 text-rose-500 w-fit mx-auto rounded-3xl"><Lock size={32}/></div>
                        <h4 className="text-xl font-bold">Validar Acceso</h4>
                        <input type="password" autoFocus className="w-full p-4 bg-slate-50 rounded-2xl border-0 text-center font-bold" placeholder="Clave Administrador" value={pass} onChange={e => setPass(e.target.value)}/>
                        <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold">Confirmar</button>
                        <button type="button" onClick={() => setAuthModal(false)} className="text-[10px] font-black uppercase text-slate-300">Cancelar</button>
                    </form>
                </div>
            )}
        </div>
    );
}

/**
 * -----------------------------------------------------------------------------
 * 8. CLIENT CHAT (LÓGICA HÍBRIDA FINAL)
 * -----------------------------------------------------------------------------
 */
function ClientChat({ aiConfig, onSaveLead }) {
    const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hola, soy Lucy. Me especializo en ayudar a familias a que sus seres queridos nunca enfrenten una carga económica inesperada.\n\nMi objetivo es escucharle y explicarle los beneficios de protección disponibles para usted.\n\n¿Con quién tengo el gusto de hablar hoy?' }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [uiState, setUiState] = useState(null);
    const scrollRef = useRef(null);
    const agentStatus = useMemo(() => getAgentStatus(aiConfig), [aiConfig]);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, loading]);

    const send = async (override = null) => {
        const text = override || input;
        if (!text.trim() || loading) return;

        setUiState(null); setInput(''); setLoading(true);
        const nextM = [...msgs, { role: 'user', content: text }];
        setMsgs(nextM);

        try {
            const now = new Date();
            const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
            const tomorrow = days[(now.getDay() + 1) % 7];
            const isTomorrowOff = !aiConfig?.schedule?.[tomorrow]?.enabled;

            const prompt = `
                ${aiConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPT}
                CONTEXTO TEMPORAL: Hoy es ${days[now.getDay()]}. Mañana es ${tomorrow}.
                ${isTomorrowOff ? `ALERTA: Mañana ${tomorrow} estamos CERRADOS. Si el usuario pide agendar para mañana, infórmale educadamente.` : `Mañana estamos abiertos.`}
                HORARIOS: ${getScheduleText(aiConfig?.schedule)}
                HISTORIAL: ${nextM.map(m => `${m.role}: ${m.content}`).join('\n')}
            `;

            const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }] }] });
            const raw = res.candidates[0].content.parts[0].text;
            
            if (raw.includes('[MODE:HEALTH]')) setUiState('health');
            else if (raw.includes('[MODE:SMOKER]')) setUiState('smoker');
            else if (raw.includes('[MODE:BUDGET]')) setUiState('budget');
            else if (raw.includes('[MODE:CLOSING]')) setUiState('closing');

            const jsonMatch = raw.match(/```json([\s\S]*?)```/);
            if (jsonMatch) {
                const data = JSON.parse(jsonMatch[1]);
                if (data.action === 'data_ready') {
                    const isScheduleIntent = nextM.some(m => m.content.toLowerCase().includes('programar') || m.content.toLowerCase().includes('después'));
                    onSaveLead({ ...data, horario_preferido: isScheduleIntent ? "Programada" : "Inmediata", fullChat: nextM });
                }
            }
            setMsgs([...nextM, { role: 'assistant', content: cleanAiMessage(raw) }]);
        } catch (e) { setMsgs([...nextM, { role: 'assistant', content: "Lo siento, tuve una pequeña interrupción. ¿Podría repetirme eso?" }]); }
        setLoading(false);
    };

    const QuickBtn = ({ label, value, icon: Icon }) => (
        <button onClick={() => send(value)} disabled={loading} className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-100 rounded-2xl shadow-sm hover:bg-indigo-50 text-sm font-bold transition-all active:scale-95 text-slate-700">
            {Icon && <Icon size={16} className="text-indigo-500" />} {label}
        </button>
    );

    return (
        <div className="max-w-[480px] mx-auto h-full flex flex-col bg-white rounded-[40px] shadow-2xl border border-slate-100 overflow-hidden font-sans">
            <div className="p-6 border-b flex items-center justify-between bg-white/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-4">
                    <LucyAvatar className="w-12 h-12 shadow-md" />
                    <div><h2 className="font-black text-slate-900 text-lg">Lucy</h2><div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">En Línea</p></div></div>
                </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#F8F9FB] no-scrollbar">
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                        <div className={`max-w-[85%] px-5 py-3.5 rounded-[24px] text-[15px] leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-800 rounded-bl-none border border-slate-50'}`}>
                            <RichText content={m.content} />
                        </div>
                    </div>
                ))}
                {loading && <div className="flex justify-start"><div className="bg-white px-4 py-2 rounded-2xl flex gap-1"><span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]"></span><span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]"></span></div></div>}
                {!loading && uiState === 'health' && (
                    <div className="flex flex-wrap gap-2 pl-2 animate-in fade-in">
                        <QuickBtn label="Salud Excelente" value="Mi salud es excelente" icon={Check} />
                        <QuickBtn label="Salud Regular" value="Mi salud es buena/regular" icon={Activity} />
                        <QuickBtn label="Condiciones serias" value="Tengo condiciones crónicas" icon={AlertCircle} />
                    </div>
                )}
                {!loading && uiState === 'closing' && (
                    <div className="flex flex-col gap-3 px-6 animate-in zoom-in">
                        <button onClick={() => send("Deseo hablar con un agente AHORA MISMO")} disabled={!agentStatus.isAgentAvailable} className={`w-full font-black py-4 rounded-[20px] transition-all text-sm shadow-xl flex items-center justify-center gap-2 ${agentStatus.isAgentAvailable ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                            {agentStatus.isAgentAvailable ? <Zap size={18}/> : <Moon size={18}/>}
                            {agentStatus.isAgentAvailable ? 'Hablar con un Agente AHORA' : 'Cerrado en este momento'}
                        </button>
                        <button onClick={() => send("Quiero PROGRAMAR una llamada")} className="w-full bg-white text-indigo-600 font-bold py-4 rounded-[20px] border-2 border-indigo-600 hover:bg-indigo-50 transition-all text-sm">Programar para después</button>
                    </div>
                )}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-6 bg-white border-t flex gap-3 items-center">
                <input value={input} onChange={e => setInput(e.target.value)} placeholder="Escriba un mensaje..." className="flex-1 bg-slate-50 rounded-2xl px-6 py-4 text-[15px] focus:ring-4 focus:ring-indigo-50 outline-none transition-all" />
                <button disabled={loading || !input.trim()} className="w-14 h-14 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all"><Send size={22}/></button>
            </form>
        </div>
    );
}

/**
 * -----------------------------------------------------------------------------
 * 9. LANDING VIEW FINAL
 * -----------------------------------------------------------------------------
 */
function LandingView({ onStartChat, onOpenLogin }) {
    return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white space-y-12 animate-in fade-in">
            <div className="relative"><div className="absolute inset-0 bg-rose-200 rounded-full blur-3xl opacity-30 animate-pulse"></div><LucyAvatar className="w-40 h-40 border-8 border-white shadow-2xl relative z-10" /></div>
            <div className="space-y-4 max-w-md mx-auto">
                <h1 className="text-5xl font-black tracking-tighter text-slate-900 leading-tight">Hola, soy Lucy 👋</h1>
                <p className="text-slate-500 text-xl font-medium leading-relaxed">Su asistente experta en **Gastos Finales**. Hablemos sobre cómo proteger el futuro de su familia.</p>
            </div>
            <div className="w-full max-w-sm space-y-4">
                <button onClick={onStartChat} className="w-full bg-slate-900 text-white py-6 rounded-[32px] font-black text-xl shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-3">Hablar con Lucy <ArrowRight/></button>
                <button onClick={onOpenLogin} className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-slate-500 transition-colors">Portal de Administración</button>
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
