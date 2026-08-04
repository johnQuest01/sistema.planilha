import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './estilos/base.css';

// Bloqueia o zoom do NAVEGADOR no app inteiro (pinça, duplo-toque e pinça do
// trackpad), sem afetar o scroll nem o zoom livre das fotos (o visor trata os
// próprios gestos com touch-action: none).
function bloquearZoomNavegador(): void {
  const prevenir = (e: Event): void => e.preventDefault();
  // iOS Safari: a pinça dispara estes eventos não-padrão (o touch-action nem
  // sempre segura o zoom do "visual viewport" no Safari).
  document.addEventListener('gesturestart', prevenir, { passive: false });
  document.addEventListener('gesturechange', prevenir, { passive: false });
  document.addEventListener('gestureend', prevenir, { passive: false });
  // Desktop/trackpad: ctrl+roda (pinça do trackpad) dá zoom na página.
  document.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
}
bloquearZoomNavegador();

const raiz = document.getElementById('root');
if (raiz === null) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
