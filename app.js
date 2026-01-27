import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';

// Importamos el componente principal desde el archivo de componentes
import { App } from './components.js';

// Conectamos React al HTML
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
