import { useEffect } from 'https://esm.sh/react@18.2.0';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { firebaseConfig, GOOGLE_API_KEY } from './config.js';

// --- INICIALIZACIÓN FIREBASE ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// --- UTILIDADES DE FORMATO ---
export function cleanAiMessage(text) { 
    if (!text) return ''; 
    let cleaned = text.replace(new RegExp('\\[Botón:.*?\\]', 'gi'), '').replace(new RegExp('\\[Button:.*?\\]', 'gi'), '');
    return cleaned.split('***').join('').split('---').join('').trim();
}

export function formatFirestoreDate(ts) { 
    if (!ts) return 'Reciente'; 
    return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); 
}

export function getJsDate(ts) { 
    if (!ts) return new Date(); 
    return ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000); 
}

// Convertir horario a texto para la IA
export function formatScheduleForAI(schedule) {
    if (!schedule) return "No hay horario definido.";
    const days = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return days.map(day => {
        const config = schedule[day];
        if (!config || !config.enabled) return `${day}: CERRADO`;
        const shifts = config.shifts || [{start: config.start, end: config.end}];
        const shiftsText = shifts.map(s => `${s.start} a ${s.end}`).join(' Y ');
        return `${day}: ${shiftsText}`;
    }).join('\n');
}

// Lógica de disponibilidad
export const getAgentStatus = (config) => {
  const now = new Date();
  if (config.vacationMode && config.vacationStart && config.vacationEnd) {
     const vStart = new Date(config.vacationStart + 'T00:00:00'); 
     const vEnd = new Date(config.vacationEnd + 'T23:59:59'); 
     if (now >= vStart && now <= vEnd) return { isAgentAvailable: false, isVacation: true, resumeDate: new Date(vEnd.setDate(vEnd.getDate() + 1)) };
  }
  const day = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'][now.getDay()];
  const sch = config.schedule?.[day];
  if (!sch || !sch.enabled) return { isAgentAvailable: false, message: "Cerrado hoy" };

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const shifts = sch.shifts || (sch.start ? [{start: sch.start, end: sch.end}] : []);
  
  const isOpen = shifts.some(shift => {
      if (!shift.start || !shift.end) return false;
      const [sH, sM] = shift.start.split(':').map(Number);
      const [eH, eM] = shift.end.split(':').map(Number);
      const startMins = sH * 60 + sM;
      const endMins = eH * 60 + eM;
      return nowMins >= startMins && nowMins < endMins;
  });

  return { isAgentAvailable: isOpen, message: isOpen ? "Agentes Disponibles" : "Cerrado ahora" };
};

// API Call IA
const rateLimit = { lastCall: 0, count: 0, check: function() { const now = Date.now(); if (now - this.lastCall < 2000) return false; this.lastCall = now; this.count++; if (this.count > 50) return false; return true; } };

export async function fetchGeminiWithRetry(payload) {
  if (!rateLimit.check()) throw new Error("Espera unos segundos.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GOOGLE_API_KEY}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`Error API: ${res.status}`);
    return await res.json();
  } catch (e) { console.error("Connection failed:", e); throw new Error("Error conexión"); }
}

export function useInactivityTimer(action, timeout = 600000) {
    useEffect(() => {
        let timer;
        const resetTimer = () => { clearTimeout(timer); timer = setTimeout(action, timeout); };
        ['mousemove','click','keypress','touchstart'].forEach(e => window.addEventListener(e, resetTimer));
        resetTimer();
        return () => { clearTimeout(timer); ['mousemove','click','keypress','touchstart'].forEach(e => window.removeEventListener(e, resetTimer)); };
    }, [action, timeout]);
}
