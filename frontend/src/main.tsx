import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './premium.css';
import './real.css';
import './market-live.css';
import './strategy.css';
import './cloud-paper.css';
import './accessibility.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

// Cache only the app shell; live financial evidence remains network-only.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname))) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/atlas-sw.js',{scope:'/'}).catch(() => {});
  },{once:true});
}
