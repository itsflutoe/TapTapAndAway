import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initInstallPromptCapture, registerServiceWorker } from './lib/pwa';

registerServiceWorker();
initInstallPromptCapture();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
