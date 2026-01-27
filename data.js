import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';

// --- TUS CREDENCIALES ---
const firebaseConfig = {
  apiKey: "AIzaSyCh_eweHfWdALF3VtFHh1UM0AkiH-8I9Uo",
  authDomain: "lucy-ai-11572.firebaseapp.com",
  projectId: "lucy-ai-11572",
  storageBucket: "lucy-ai-11572.firebasestorage.app",
  messagingSenderId: "979126041068",
  appId: "1:979126041068:web:e605f2bf9528424e26e8c9",
  measurementId: "G-4L08BMRY61"
};

// API KEY IA (Dividida)
const partA = "AIzaSyB9qP1gjlqrrdANqvh";
const partB = "I2hY5KAirqByeI9Q";
export const GOOGLE_API_KEY = partA + partB;

// --- INICIALIZACIÓN ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const APP_ID = 'lucy-production-v1';

// --- CONFIGURACIÓN ESTATICA ---
export const IMAGES = { lucy: "https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" };

export const DEFAULT_SCHEDULE = { 
    lunes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    martes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    miercoles: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    jueves: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    viernes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    sabado: { enabled: false, shifts: [{start: '10:00', end: '14:00'}] }, 
    domingo: { enabled: false, shifts: [{start: '10:00', end: '14:00'}] } 
};

// --- UTILIDADES ---
export function cleanAiMessage(text) { 
    if (!text) return ''; 
    let cleaned = text.replace(new RegExp('\\[Botón:.*?\\]', 'gi'), '').replace(new RegExp('\\[Button:.*?\\]', 'gi'), '');
    return cleaned.split('***').join('').split('---').join('').trim();
}

export function formatFirestoreDate(ts) { if (!ts) return 'Reciente'; return ts.toDate ? ts.toDate().toLocaleDateString('en-US') : new Date(ts.seconds * 1000).toLocaleDateString('en-US'); }
export function getJsDate(ts) { if (!ts) return new Date(); return ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000); }

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
