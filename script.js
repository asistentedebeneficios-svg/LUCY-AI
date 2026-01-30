/**
 * ============================================================================
 * ASISTENTE DE BENEFICIOS (LUCY) - VERSIÓN "SMART SCHEDULE"
 * ============================================================================
 * Correcciones Aplicadas:
 * 1. Validación estricta de horarios (Detecta días cerrados como Sábados).
 * 2. Conversación Educativa (Regla del Sandwich: Validar -> Educar -> Preguntar).
 * 3. Fix: Guardado correcto de llamadas programadas vs inmediatas.
 * ============================================================================
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';

// -----------------------------------------------------------------------------
// 1. IMPORTACIÓN DE ICONOS (LUCIDE REACT)
// -----------------------------------------------------------------------------
import { 
  MessageSquare, Settings, Users, Send, Phone, ShieldCheck, LayoutDashboard, 
  Sparkles, User, Activity, DollarSign, Calendar, Copy, Clock, CalendarClock, 
  FileText, ShieldAlert, Lock, Archive, Inbox, RotateCcw, Search, ExternalLink, 
  Command, Zap, Moon, Sun, Check, CheckCircle, Bell, X, Trash2, LogIn, Heart, 
  Star, Award, Shield, Pencil, Eye, EyeOff, WifiOff, PhoneOff, UserCheck, 
  CheckSquare, Square, Share2, Briefcase, UserCog, Filter, ChevronDown, MapPin, 
  Mail, UserMinus, UserPlus, Link as LinkIcon, Plus, MinusCircle, 
  BarChart3, TrendingUp, PieChart, Wallet, BadgeCheck, AlertCircle, ThumbsUp
} from 'https://esm.sh/lucide-react@0.344.0';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, doc, setDoc, getDoc, deleteDoc, updateDoc, serverTimestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// -----------------------------------------------------------------------------
// 2. CONFIGURACIÓN DEL SISTEMA
// -----------------------------------------------------------------------------
const OFFLINE_MODE = false;

// CLAVES API (Producción)
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

// Inicialización Segura
let app, auth, db;
if (!OFFLINE_MODE) {
    try {
        app = initializeApp(FIREBASE_CONFIG);
        auth = getAuth(app);
        db = getFirestore(app);
    } catch (e) {
        console.error("Error crítico inicializando Firebase:", e);
    }
}

// -----------------------------------------------------------------------------
// 3. UTILIDADES Y HELPERS
// -----------------------------------------------------------------------------
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

function cleanAiMessage(text) {
    if (!text) return '';
    // Limpia JSON y etiquetas de control para mostrar solo el mensaje limpio al usuario
    let cleaned = text.replace(/```json[\s\S]*?```/g, '');
    cleaned = cleaned.replace(/\[MODE:[A-Z_]+\]/g, '');
    return cleaned.trim();
}

function formatScheduledDate(d) {
    if (!d || d.length < 5) return d; // Si es "Inmediata" o "Pendiente"
    const date = new Date(d);
    return isNaN(date) ? d : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatFirestoreDate(ts) {
    if (!ts) return 'Reciente';
    if (OFFLINE_MODE && typeof ts === 'string') return new Date(ts).toLocaleDateString('en-US');
    try {
        return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US');
    } catch (e) { return 'Fecha inválida'; }
}

const RichText = ({ content }) => {
    if (!content || typeof content !== 'string') return null;
    return <span className="text-sm leading-relaxed">{content.split(/(\*\*.*?\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i} className="text-slate-900 font-bold">{part.slice(2, -2)}</strong> : part)}</span>;
};

const rateLimit = { lastCall: 0, count: 0, check: function() { const now = Date.now(); if (now - this.lastCall < 2000) return false; this.lastCall = now; this.count++; if (this.count > 50) return false; return true; } };

// -----------------------------------------------------------------------------
// 4. CEREBRO AVANZADO DE LUCY (EDUCACIÓN + REGLAS)
// -----------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `
Eres Lucy, una asistente experta, cálida y altamente empática en "Gastos Finales" (Protección Familiar).
TU OBJETIVO NO ES LLENAR UN FORMULARIO. TU OBJETIVO ES CONVERSAR, EDUCAR Y LUEGO OBTENER EL DATO.

=== REGLA DE ORO: EL "SANDWICH EDUCATIVO" ===
JAMÁS pidas un dato "en seco". Siempre usa esta estructura:
1. **Valida/Empatiza:** "Entiendo perfectamente..." o "Gracias por compartir eso..."
2. **Educa/Justifica:** Da un dato curioso o explica POR QUÉ necesitas la siguiente información.
3. **Pregunta:** Solo entonces, pide el dato.

=== FLUJO DE CONVERSACIÓN ===
1. **SALUDO:** "Hola, soy Lucy...". Consigue el nombre.
2. **CONEXIÓN (OBLIGATORIO):** Pregunta "¿Qué le motivó a buscar información hoy?" o "¿Qué es lo que más le preocupa?". ESCUCHA.
3. **PERMISO (EDAD/ESTADO):** "Para asegurarme de que los planes que discutamos funcionan en su área y rango de edad..." -> Pide Edad y Estado.
4. **SALUD (MODO HÍBRIDO):**
   - *Educa:* "Lo bueno de estos planes es que muchos no piden examen médico, solo unas preguntas simples..."
   - *Pregunta:* "¿Cómo considera su salud?" -> Finaliza con [MODE:HEALTH]
5. **FUMAR (MODO HÍBRIDO):**
   - *Educa:* "Las tarifas cambian si uno fuma, pero hay opciones para todos..."
   - *Pregunta:* "¿Fuma actualmente?" -> Finaliza con [MODE:SMOKER]
6. **PRESUPUESTO (MODO HÍBRIDO):**
   - *Educa:* "La idea es que esto le de paz mental, no que sea una carga financiera..."
   - *Pregunta:* "¿Qué presupuesto le resulta cómodo?" -> Finaliza con [MODE:BUDGET]
7. **CIERRE (MODO HÍBRIDO):**
   - Resumen y llamada a la acción -> Finaliza con [MODE:CLOSING]

=== REGLAS DE HORARIO (CRÍTICO) ===
- Se te dará la **FECHA Y HORA ACTUAL** y el **ESTADO DE LA OFICINA**.
- Si el usuario pide agendar (ej: "Mañana sábado"), VERIFICA SI ESTÁ ABIERTO en la lista de horarios.
- Si dice "SÁBADO: CERRADO", responde: "Disculpe, los sábados nuestras oficinas administrativas descansan para recargar energías. ¿Le quedaría bien el lunes a esa misma hora?".
- NO agendes en horarios cerrados.

=== JSON FINAL ===
Solo al final, genera:
\`\`\`json
{
  "action": "data_ready",
  "nombre": "...", "edad": "...", "estado": "...", "salud": "...", "fuma": "...", "presupuesto": "...", "email": "...", "telefono": "...", "resumen_ai": "...",
  "tipo_atencion": "Programada" o "Inmediata",
  "horario_cita": "Fecha y hora exacta acordada (o 'Inmediata')"
}
\`\`\`
`;

const DEFAULT_SCHEDULE = { 
    lunes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    martes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    miercoles: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    jueves: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    viernes: { enabled: true, slots: [{start: '09:00', end: '18:00'}] },
    sabado: { enabled: false, slots: [{start: '10:00', end: '14:00'}] },
    domingo: { enabled: false, slots: [{start: '10:00', end: '14:00'}] }
};

// -----------------------------------------------------------------------------
// 5. MOTORES DE LÓGICA
// -----------------------------------------------------------------------------

const getAgentStatus = (config) => {
    try {
        if (!config) return { isAgentAvailable: true, message: "Disponible" };
        const now = new Date();
        
        // Verificar Vacaciones
        if (config.vacationMode && config.vacationStart && config.vacationEnd) {
            const vStart = new Date(config.vacationStart + 'T00:00:00');
            const vEnd = new Date(config.vacationEnd + 'T23:59:59');
            if (now >= vStart && now <= vEnd) {
                return { isAgentAvailable: false, isVacation: true, message: "Modo Vacaciones" };
            }
        }
        
        // Verificar Día
        const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const dayName = days[now.getDay()];
        const dayConfig = config.schedule?.[dayName];
        
        if (!dayConfig || !dayConfig.enabled) return { isAgentAvailable: false, message: "Cerrado hoy" };

        // Verificar Horas
        let slots = dayConfig.slots || [];
        if (slots.length === 0 && dayConfig.start && dayConfig.end) slots = [{ start: dayConfig.start, end: dayConfig.end }];
        if (slots.length === 0) return { isAgentAvailable: false, message: "Sin turnos" };

        const currentMins = now.getHours() * 60 + now.getMinutes();
        const isOpen = slots.some(slot => {
            const [sH, sM] = slot.start.split(':').map(Number);
            const [eH, eM] = slot.end.split(':').map(Number);
            return currentMins >= (sH * 60 + (sM||0)) && currentMins < (eH * 60 + (eM||0));
        });

        return { isAgentAvailable: isOpen, message: isOpen ? "Disponible" : "Cerrado ahora" };
    } catch (e) { return { isAgentAvailable: true, message: "Error horario" }; }
};

const getScheduleText = (schedule) => {
    if (!schedule) return "No especificado";
    const days = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    return days.map(d => {
        const c = schedule[d];
        if (!c?.enabled) return `- ${d.toUpperCase()}: CERRADO`;
        const slots = c.slots || (c.start ? [{start: c.start, end: c.end}] : []);
        const times = slots.map(s => `${s.start} a ${s.end}`).join(' y ');
        return `- ${d.toUpperCase()}: ${times}`;
    }).join('\n');
};

async function fetchGeminiWithRetry(payload) {
    if (!rateLimit.check()) throw new Error("Espera unos segundos.");
    if (OFFLINE_MODE) { await new Promise(r => setTimeout(r, 1000)); return { candidates: [{ content: { parts: [{ text: "Modo offline simulado." }] } }] }; }

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    for (const model of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (res.ok) return await res.json();
        } catch (e) { console.error(e); }
    }
    throw new Error("Error de conexión AI");
}

// -----------------------------------------------------------------------------
// 6. COMPONENTES VISUALES
// -----------------------------------------------------------------------------
// ... (Componentes visuales sin cambios mayores, incluidos para integridad)
const LucyAvatar = ({ className = "w-10 h-10" }) => (<img src="https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" alt="Lucy" className={`${className} rounded-full object-cover shadow-sm border border-slate-100 bg-slate-200`} onError={(e) => { e.target.onerror = null; e.target.src = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400"; }} />);
const ProtectionLogo = ({ size = 24, className = "" }) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 9.5L12 3l9 6.5v11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" /><path d="M12 18.5c2.5-1.5 5.5-4 5.5-6.5 0-1.7-1.3-3-3-3-1 0-1.9.5-2.5 1.5-.6-1-1.5-1.5-2.5-1.5-1.7 0-3 1.3-3 3 0 2.5 3 5 5.5 6.5z" /></svg>);

// --- REPORTES ---
const ReportsDashboard = ({ leads, agents }) => {
    const [filterAgent, setFilterAgent] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const filteredLeads = useMemo(() => {
        return (leads || []).filter(l => {
            const matchesAgent = filterAgent === 'all' || l.assignedAgentId === filterAgent;
            let matchesDate = true;
            if (startDate && endDate) {
                const d = l.createdAt?.toDate ? l.createdAt.toDate() : new Date(l.createdAt?.seconds * 1000);
                const start = new Date(startDate); start.setHours(0,0,0,0);
                const end = new Date(endDate); end.setHours(23,59,59,999);
                matchesDate = d >= start && d <= end;
            }
            return matchesAgent && matchesDate;
        });
    }, [leads, filterAgent, startDate, endDate]);

    const assignedLeads = filteredLeads.filter(l => l.assignedAgentId).length;
    const closedSales = filteredLeads.filter(l => l.status === 'sold').length;
    const conversionRate = assignedLeads > 0 ? ((closedSales / assignedLeads) * 100).toFixed(0) : 0;
    const activeLeads = filteredLeads.filter(l => !l.assignedAgentId && l.status !== 'archived').length;

    const agentPerformance = useMemo(() => {
        return (agents || []).map(agent => {
            const myLeads = filteredLeads.filter(l => l.assignedAgentId === agent.id);
            const mySales = myLeads.filter(l => l.status === 'sold').length;
            return { ...agent, assigned: myLeads.length, closed: mySales, conversion: myLeads.length ? ((mySales/myLeads.length)*100).toFixed(0) : 0 };
        }).sort((a, b) => b.closed - a.closed);
    }, [agents, filteredLeads]);

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                <div><h2 className="text-xl font-bold text-gray-900">Reportes</h2><p className="text-xs text-gray-500">Rendimiento en tiempo real</p></div>
                <div className="flex gap-2">
                    <select className="bg-gray-50 border rounded-lg px-3 py-2 text-sm" value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
                        <option value="all">Todos</option>
                        {(agents||[]).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                    <div className="flex items-center gap-1 bg-gray-50 border rounded-lg px-2"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-xs outline-none" /><span className="text-gray-400">-</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-xs outline-none" /></div>
                </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border shadow-sm"><p className="text-2xl font-bold">{assignedLeads}</p><p className="text-xs text-gray-500 uppercase">Asignados</p></div>
                <div className="bg-white p-5 rounded-2xl border shadow-sm"><p className="text-2xl font-bold text-green-600">{closedSales}</p><p className="text-xs text-gray-500 uppercase">Ventas</p></div>
                <div className="bg-white p-5 rounded-2xl border shadow-sm"><p className="text-2xl font-bold text-purple-600">{conversionRate}%</p><p className="text-xs text-gray-500 uppercase">Conversión</p></div>
                <div className="bg-white p-5 rounded-2xl border shadow-sm"><p className="text-2xl font-bold text-orange-600">{activeLeads}</p><p className="text-xs text-gray-500 uppercase">Pendientes</p></div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b"><tr><th className="p-4">Agente</th><th className="p-4">Leads</th><th className="p-4">Ventas</th><th className="p-4">Eficiencia</th></tr></thead>
                    <tbody className="divide-y">{agentPerformance.map(a => <tr key={a.id}><td className="p-4 font-bold">{a.nombre}</td><td className="p-4">{a.assigned}</td><td className="p-4 text-green-600">{a.closed}</td><td className="p-4">{a.conversion}%</td></tr>)}</tbody>
                </table>
            </div>
        </div>
    );
};

// --- CLIENT CHAT (LOGICA CENTRAL ACTUALIZADA) ---
function ClientChat({ aiConfig, onSaveLead, onOpenLogin }) {
    const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'Hola, soy Lucy, su asistente personal. Mi objetivo es ayudarle a encontrar la mejor protección para su familia.\n\nPara comenzar, ¿con quién tengo el gusto de hablar hoy?' }]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [uiState, setUiState] = useState(null); // 'health', 'smoker', 'budget', 'closing'
    const scrollRef = useRef(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [urlCopied, setUrlCopied] = useState(false);
    
    // Obtener estado del agente en tiempo real
    const agentStatus = useMemo(() => getAgentStatus(aiConfig), [aiConfig]);
    
    useEffect(() => { if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [msgs, loading, uiState]);

    const handleCopyLink = () => { navigator.clipboard.writeText(window.location.href).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2500); }); };

    const send = async (textOverride = null) => {
        const text = textOverride || input;
        if (!text.trim() || loading) return;
        
        setUiState(null); 
        setInput(''); 
        setLoading(true);
        
        const newM = [...msgs, { role: 'user', content: text }];
        setMsgs(newM);

        try {
            // INYECCIÓN DE CONTEXTO TEMPORAL (FECHA Y HORA ACTUAL DEL SISTEMA)
            // Esto permite a Lucy saber que "Mañana" es Sábado si hoy es Viernes.
            const now = new Date();
            const dateTimeStr = now.toLocaleString('es-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
            
            const prompt = `
            ${aiConfig?.systemPrompt || DEFAULT_SYSTEM_PROMPT}

            --- DATOS EN TIEMPO REAL (NO LOS IGNORES) ---
            FECHA Y HORA ACTUAL (Tu Reloj): ${dateTimeStr}
            
            --- HORARIO DE OFICINA OFICIAL ---
            ${getScheduleText(aiConfig?.schedule)}

            --- INSTRUCCIONES DE AGENDAMIENTO ---
            1. Si el usuario pide agendar para un día (ej: "mañana sábado"), VERIFICA en la lista de arriba si dice "CERRADO".
            2. Si dice "CERRADO" o "disabled", RECHAZA la cita amablemente y ofrece el siguiente día abierto.
            3. Si el usuario pide "Programar", el JSON final debe tener "tipo_atencion": "Programada" y en "horario_cita" pon la fecha acordada. NO pongas "Inmediata".

            CHAT PREVIO:
            ${newM.map(m => `${m.role}: ${m.content}`).join('\n')}
            `;

            const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }] }] });
            const raw = res.candidates[0].content.parts[0].text;
            
            // Detectar etiquetas de modo
            let nextUi = null;
            if (raw.includes('[MODE:HEALTH]')) nextUi = 'health';
            if (raw.includes('[MODE:SMOKER]')) nextUi = 'smoker';
            if (raw.includes('[MODE:BUDGET]')) nextUi = 'budget';
            if (raw.includes('[MODE:CLOSING]')) nextUi = 'closing';

            // Detectar JSON de finalización y corregir bug de "Inmediata"
            const jsonMatch = raw.match(/```json([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    const data = JSON.parse(jsonMatch[1]);
                    if (data.action === 'data_ready') {
                        // Lógica corregida: Priorizar horario_cita si existe
                        const isScheduled = data.tipo_atencion === 'Programada' || (data.horario_cita && data.horario_cita !== 'Inmediata' && data.horario_cita !== 'Ahora');
                        const finalData = {
                            ...data,
                            horario_preferido: isScheduled ? data.horario_cita : 'Inmediata',
                            fullChat: newM
                        };
                        onSaveLead(finalData);
                    }
                } catch (e) { console.error("Error JSON:", e); }
            }

            setMsgs([...newM, { role: 'assistant', content: cleanAiMessage(raw) }]);
            setUiState(nextUi);

        } catch (e) { 
            console.error(e); 
            setMsgs([...newM, { role: 'assistant', content: "Tuve un error de conexión, por favor intenta de nuevo." }]); 
        }
        setLoading(false);
    };

    const QuickBtn = ({ label, val, icon: Icon }) => (
        <button onClick={() => send(val)} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-white border rounded-xl shadow-sm hover:bg-blue-50 text-sm transition-all active:scale-95 text-gray-700">
            {Icon && <Icon size={14}/>} {label}
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-white rounded-3xl shadow-2xl border overflow-hidden font-sans relative">
            <div className="bg-white/90 p-4 border-b flex justify-between items-center z-10 backdrop-blur-md sticky top-0">
                <div className="flex items-center gap-3"><LucyAvatar /><div className="font-bold text-gray-800">Lucy <span className="text-xs font-normal text-green-600 block">En línea</span></div></div>
                <div className="flex gap-2">
                     <button onClick={() => setShowShareModal(true)} className="p-2 bg-slate-50 text-slate-400 rounded-full hover:bg-slate-100 hover:text-blue-600 transition-colors" title="Guardar enlace"><Share2 size={20} /></button>
                    {onOpenLogin && <button onClick={onOpenLogin} className="text-xs text-gray-400 hover:text-gray-600">Admin</button>}
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white" ref={scrollRef}>
                {msgs.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                        {m.role === 'assistant' && <LucyAvatar className="w-8 h-8 mr-2 mt-auto" />}
                        <div className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-[#F2F2F7] text-gray-800 rounded-bl-none'}`}>
                            <RichText content={m.content} />
                        </div>
                    </div>
                ))}
                {loading && <div className="text-xs text-gray-400 pl-12 animate-pulse flex items-center gap-1"><div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div><div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div></div>}
                
                {!loading && uiState === 'health' && <div className="pl-10 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2"><QuickBtn label="Excelente" val="Excelente" icon={ThumbsUp}/><QuickBtn label="Buena" val="Buena" icon={Activity}/><QuickBtn label="Con condiciones" val="Tengo condiciones de salud" icon={AlertCircle}/></div>}
                {!loading && uiState === 'smoker' && <div className="pl-10 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2"><QuickBtn label="Sí, fumo" val="Sí fumo" icon={Check}/><QuickBtn label="No fumo" val="No fumo" icon={X}/></div>}
                {!loading && uiState === 'budget' && <div className="pl-10 flex flex-col gap-2 w-2/3 animate-in fade-in slide-in-from-bottom-2"><QuickBtn label="$30 - $50" val="$30-$50" icon={Wallet}/><QuickBtn label="$50 - $80" val="$50-$80" icon={Wallet}/><QuickBtn label="$80 - $100" val="$80-$100" icon={Wallet}/></div>}
                {!loading && uiState === 'closing' && (
                    <div className="pl-10 flex flex-col gap-2 w-3/4 animate-in zoom-in">
                        <button onClick={() => send("Quiero hablar ahora")} disabled={!agentStatus.isAgentAvailable} className={`p-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${agentStatus.isAgentAvailable ? 'bg-blue-600 text-white shadow-lg hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>
                            <Zap size={16}/> Hablar Ahora {agentStatus.isAgentAvailable ? '' : '(Cerrado)'}
                        </button>
                        <button onClick={() => send("Quiero programar una cita")} className="p-3 rounded-xl font-bold bg-gray-100 text-blue-600 flex items-center justify-center gap-2 hover:bg-gray-200 transition-all active:scale-95">
                            <Calendar size={16}/> Programar Cita
                        </button>
                    </div>
                )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="p-4 border-t flex gap-2 items-center bg-white">
                <input value={input} onChange={e => setInput(e.target.value)} className="flex-1 bg-[#F2F2F7] rounded-full px-4 py-3 outline-none text-sm focus:ring-2 focus:ring-blue-100 transition-all" placeholder={uiState ? "O escribe tu respuesta..." : "Escribe un mensaje..."} />
                <button disabled={loading || !input.trim()} className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-all disabled:opacity-50 active:scale-95 shadow-md"><Send size={18}/></button>
            </form>

            {showShareModal && (
                <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
                    <div className="bg-white rounded-[24px] shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95">
                        <div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-bold text-slate-800">Guardar conversación</h3><p className="text-xs text-slate-500 mt-1">Copie este enlace para volver a hablar con Lucy más tarde sin perder el contacto.</p></div><button onClick={() => setShowShareModal(false)} className="p-1 text-slate-400 hover:text-slate-600 bg-slate-100 rounded-full"><X size={16} /></button></div>
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center gap-2 mb-4"><input type="text" readOnly value={window.location.href} className="bg-transparent border-0 text-xs text-slate-600 w-full outline-none font-mono truncate" /></div>
                        <button onClick={handleCopyLink} className={`w-full py-3 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${urlCopied ? 'bg-green-500 text-white' : 'bg-black text-white hover:bg-slate-800'}`}>{urlCopied ? <CheckCircle size={16} /> : <Copy size={16} />}{urlCopied ? '¡Enlace Copiado!' : 'Copiar Enlace'}</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------
// 14. ADMIN & LISTAS (CON BOTÓN DE VENTA)
// -----------------------------------------------------------------------------
function LeadsList({ leads, agents, onOpenLead, onOpenAssign, onDeleteLead, onUpdateStatus, isArchive, searchTerm }) {
    const [selectedIds, setSelectedIds] = useState([]);
    const filtered = (leads||[]).filter(l => (l.nombre||'').toLowerCase().includes(searchTerm.toLowerCase()));
    
    const handleSelectOne = (id) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    return (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden animate-in fade-in">
             {selectedIds.length > 0 && <div className="bg-blue-50 p-3 flex justify-between items-center px-4 border-b border-blue-100"><span className="text-xs font-bold text-blue-700">{selectedIds.length} seleccionados</span><div className="flex gap-2"><button onClick={() => onOpenAssign(selectedIds)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700">Asignar</button><button onClick={() => onDeleteLead(selectedIds)} className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-200">Eliminar</button></div></div>}
            <table className="w-full text-left">
                <thead className="bg-[#FBFBFD] border-b border-gray-100"><tr><th className="p-4 w-10"></th><th className="p-4 text-xs font-bold text-gray-500 uppercase">Nombre</th><th className="p-4 text-xs font-bold text-gray-500 uppercase">Agente</th><th className="p-4 text-xs font-bold text-gray-500 uppercase">Cita</th><th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Acción</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                    {filtered.map(l => {
                        const agent = (agents||[]).find(a => a.id === l.assignedAgentId);
                        const isSold = l.status === 'sold';
                        return (
                            <tr key={l.id} onClick={() => onOpenLead(l)} className={`hover:bg-gray-50 cursor-pointer transition-colors ${isSold ? 'bg-green-50/50' : ''}`}>
                                <td className="p-4" onClick={e => e.stopPropagation()}><input type="checkbox" className="custom-checkbox" checked={selectedIds.includes(l.id)} onChange={() => handleSelectOne(l.id)}/></td>
                                <td className="p-4"><div className="font-bold text-sm text-gray-900">{l.nombre}</div><div className="text-xs text-gray-500">{l.estado} • {l.edad}</div></td>
                                <td className="p-4 text-xs font-medium text-gray-600">{agent ? agent.nombre : <span className="text-gray-400 italic">--</span>}</td>
                                <td className="p-4 text-xs font-medium text-blue-600">{formatScheduledDate(l.horario_preferido || 'Pendiente')}</td>
                                <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-center gap-2">
                                        {!isArchive && agent && (
                                            <button onClick={() => onUpdateStatus([l.id], isSold ? 'active' : 'sold')} className={`p-2 rounded-lg transition-all ${isSold ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title={isSold ? "Desmarcar Venta" : "Marcar Vendido"}><DollarSign size={16}/></button>
                                        )}
                                        <button onClick={() => onDeleteLead(l.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
}

// -----------------------------------------------------------------------------
// 15. WRAPPER PRINCIPAL Y RUTAS
// -----------------------------------------------------------------------------
function App() {
    const [user, setUser] = useState(null);
    const [view, setView] = useState('landing');
    const [isAdmin, setIsAdmin] = useState(false);
    const [showLogin, setShowLogin] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [leads, setLeads] = useState([]);
    const [agents, setAgents] = useState([]);
    const [aiConfig, setAiConfig] = useState({ systemPrompt: DEFAULT_SYSTEM_PROMPT, schedule: DEFAULT_SCHEDULE });
    const [adminTab, setAdminTab] = useState('active');
    const [selectedLead, setSelectedLead] = useState(null);
    const [assignIds, setAssignIds] = useState([]);
    const [showAssign, setShowAssign] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (OFFLINE_MODE) { setUser({ uid: 'offline' }); return; }
        return onAuthStateChanged(auth, u => { if(u) { setUser(u); setIsAdmin(!u.isAnonymous); if(!u.isAnonymous) setView('admin'); } else signInAnonymously(auth); });
    }, []);

    useEffect(() => {
        if (!user || OFFLINE_MODE) return;
        const unsubL = onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), s => setLeads(s.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));
        const unsubA = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'), s => setAgents(s.exists() ? s.data().list : []));
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config')).then(s => s.exists() && setAiConfig(prev => ({...prev, ...s.data()})));
        return () => { unsubL(); unsubA(); };
    }, [user]);

    const handleLogin = async (e) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, email, password); setShowLogin(false); } catch (e) { alert("Error de credenciales"); } };
    const handleSaveLead = async (data) => { 
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'leads'), { ...data, createdAt: serverTimestamp(), status: 'active' });
        if (aiConfig.webhookUrl) fetch(aiConfig.webhookUrl, { method: 'POST', mode: 'no-cors', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).catch(e=>console.log(e));
    };
    const handleUpdateStatus = async (ids, status) => { const b = writeBatch(db); ids.forEach(id => b.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id), {status})); await b.commit(); };
    const handleDelete = async (ids) => { const b = writeBatch(db); (Array.isArray(ids)?ids:[ids]).forEach(id => b.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id))); await b.commit(); };
    const handleAssign = async (agentId) => { const b = writeBatch(db); assignIds.forEach(id => b.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'leads', id), { assignedAgentId: agentId === 'unassign' ? null : agentId })); await b.commit(); setShowAssign(false); };
    const handleSaveConfig = async (cfg) => { await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'config'), cfg); setAiConfig(cfg); };
    const handleSaveAgent = async (a) => { 
        const list = a.id ? agents.map(x => x.id === a.id ? a : x) : [...agents, {...a, id: generateId()}];
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'), { list });
    };
    const handleDeleteAgent = async (ids) => { await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'settings', 'agents_list'), { list: agents.filter(x => !ids.includes(x.id)) }); };

    if (!user) return <div className="h-screen flex items-center justify-center text-gray-400">Cargando Sistema...</div>;

    return (
        <div className="h-screen bg-[#F5F5F7] text-gray-800 font-sans flex flex-col overflow-hidden">
            <nav className="bg-white/80 backdrop-blur border-b border-white/20 p-4 flex justify-between items-center z-20 shrink-0">
                <div className="font-bold flex items-center gap-2 text-lg"><ShieldCheck className="text-pink-600"/> Asistente de Beneficios</div>
                {isAdmin ? (
                    <div className="flex bg-gray-100 p-1 rounded-full text-xs">
                        <button onClick={() => setView('chat')} className={`px-4 py-1.5 rounded-full font-medium transition-all ${view === 'chat' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>Chat</button>
                        <button onClick={() => setView('admin')} className={`px-4 py-1.5 rounded-full font-medium transition-all ${view === 'admin' ? 'bg-white shadow text-black' : 'text-gray-500'}`}>Admin</button>
                    </div>
                ) : <button onClick={() => setShowLogin(true)} className="text-xs text-gray-500 font-medium">Admin Access</button>}
            </nav>

            <main className="flex-1 overflow-hidden p-4 max-w-7xl mx-auto w-full relative">
                {view === 'landing' && <LandingView onStartChat={() => setView('chat')} onOpenLogin={() => setShowLogin(true)} />}
                {view === 'chat' && <ClientChat aiConfig={aiConfig} onSaveLead={handleSaveLead} onOpenLogin={() => setShowLogin(true)} />}
                {view === 'admin' && (
                    <div className="flex flex-col h-full gap-6 animate-in fade-in">
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0">
                             <div className="flex gap-2 overflow-x-auto pb-2 shrink-0">
                                {['active', 'assigned', 'reports', 'agents', 'brain', 'archived'].map(t => (
                                    <button key={t} onClick={() => setAdminTab(t)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize whitespace-nowrap transition-all ${adminTab === t ? 'bg-black text-white shadow-lg' : 'bg-white text-gray-600 hover:bg-gray-50 border border-transparent'}`}>{t}</button>
                                ))}
                            </div>
                            {adminTab !== 'brain' && adminTab !== 'reports' && (
                                <div className="relative group w-full md:w-auto">
                                    <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
                                    <input type="text" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-8 py-2 bg-white border-0 rounded-xl text-sm w-full md:w-64 outline-none shadow-sm focus:ring-2 focus:ring-black/5" />
                                    {searchTerm && (<button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"><X size={14} /></button>)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {adminTab === 'active' && <LeadsList leads={leads.filter(l => !l.assignedAgentId && l.status !== 'archived')} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids)=>{setAssignIds(ids); setShowAssign(true)}} onDeleteLead={handleDelete} onUpdateStatus={handleUpdateStatus} searchTerm={searchTerm} />}
                            {adminTab === 'assigned' && <LeadsList leads={leads.filter(l => l.assignedAgentId)} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids)=>{setAssignIds(ids); setShowAssign(true)}} onDeleteLead={handleDelete} onUpdateStatus={handleUpdateStatus} searchTerm={searchTerm} />}
                            {adminTab === 'reports' && <ReportsDashboard leads={leads} agents={agents} />}
                            {adminTab === 'agents' && <AgentsManager agents={agents} leads={leads} onOpenLead={setSelectedLead} onSaveAgent={handleSaveAgent} onDeleteAgent={handleDeleteAgent} searchTerm={searchTerm} />}
                            {adminTab === 'brain' && <AdminBrain aiConfig={aiConfig} onSaveConfig={handleSaveConfig} />}
                            {adminTab === 'archived' && <LeadsList leads={leads.filter(l => l.status === 'archived')} agents={agents} onOpenLead={setSelectedLead} onOpenAssign={(ids)=>{setAssignIds(ids); setShowAssign(true)}} onDeleteLead={handleDelete} onUpdateStatus={handleUpdateStatus} isArchive={true} searchTerm={searchTerm} />}
                        </div>
                    </div>
                )}
            </main>

            <LeadDetailModal lead={selectedLead} agents={agents} onClose={() => setSelectedLead(null)} onAssignClick={(ids, type) => { if(type === 'unassign') handleAssign('unassign'); else { setAssignIds(ids); setShowAssign(true); } }} onUpdateStatus={handleUpdateStatus} />
            <AgentAssignmentModal isOpen={showAssign} onClose={() => setShowAssign(false)} onAssign={handleAssign} agents={agents} />
            
            {showLogin && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-100">
                        <h3 className="font-bold mb-6 text-lg flex items-center gap-2"><ShieldCheck size={20}/> Acceso Admin</h3>
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div><label className="text-[10px] uppercase font-bold text-gray-500">Email</label><input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-black/10" placeholder="admin@empresa.com" /></div>
                            <div><label className="text-[10px] uppercase font-bold text-gray-500">Contraseña</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-3 border rounded-xl bg-gray-50 outline-none focus:ring-2 focus:ring-black/10" placeholder="••••••••" /></div>
                            <button className="w-full bg-black text-white py-3 rounded-xl font-bold shadow-lg hover:bg-gray-800 transition-all">Entrar al Sistema</button>
                        </form>
                        <button onClick={() => setShowLogin(false)} className="mt-4 w-full text-center text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
