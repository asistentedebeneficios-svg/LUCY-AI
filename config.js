// --- CREDENCIALES DE PRODUCCIÓN ---

export const firebaseConfig = {
  apiKey: "AIzaSyCh_eweHfWdALF3VtFHh1UM0AkiH-8I9Uo",
  authDomain: "lucy-ai-11572.firebaseapp.com",
  projectId: "lucy-ai-11572",
  storageBucket: "lucy-ai-11572.firebasestorage.app",
  messagingSenderId: "979126041068",
  appId: "1:979126041068:web:e605f2bf9528424e26e8c9",
  measurementId: "G-4L08BMRY61"
};

export const APP_ID = 'lucy-production-v1';

// API KEY IA (Dividida por seguridad)
const partA = "AIzaSyB9qP1gjlqrrdANqvh";
const partB = "I2hY5KAirqByeI9Q";
export const GOOGLE_API_KEY = partA + partB;

// --- RECURSOS ---
export const IMAGES = { 
    lucy: "https://imnufit.com/wp-content/uploads/2026/01/IMG_0014.jpeg" 
};

export const DEFAULT_SCHEDULE = { 
    lunes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    martes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    miercoles: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    jueves: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    viernes: { enabled: true, shifts: [{start: '09:00', end: '18:00'}] }, 
    sabado: { enabled: false, shifts: [{start: '10:00', end: '14:00'}] }, 
    domingo: { enabled: false, shifts: [{start: '10:00', end: '14:00'}] } 
};
