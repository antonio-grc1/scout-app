import './lib/pdfPolyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { useToastStore } from './store/toastStore';
import { iniciarAccesibilidadAutomatica } from './lib/accesibilidadAuto';

// Registra el Service Worker de la PWA solicitando confirmación al usuario antes de recargar
const updateSW = registerSW({
  onNeedRefresh() {
    useToastStore
      .getState()
      .mostrarToastAccion(
        'Hay una nueva versión disponible de la aplicación.',
        'Actualizar',
        () => updateSW(true),
        20000,
      );
  },
});

// Asocia etiquetas huérfanas y nombra campos/botones de solo ícono (ver lib/accesibilidadAuto.ts)
iniciarAccesibilidadAutomatica();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
