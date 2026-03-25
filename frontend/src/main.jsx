import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes/AppRoutes';
import { clearChunkRecoveryQueryParam, isDynamicImportFailure, recoverFromChunkFailure } from './utils/chunkRecovery';
import { installDevErrorOverlay } from './utils/devErrorOverlay';

import './styles.scss';

if (import.meta.env.DEV) {
  installDevErrorOverlay();
}

clearChunkRecoveryQueryParam();

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  recoverFromChunkFailure();
});

window.addEventListener('unhandledrejection', (event) => {
  if (!isDynamicImportFailure(event.reason)) {
    return;
  }
  event.preventDefault();
  recoverFromChunkFailure();
});

window.addEventListener('error', (event) => {
  const errorLike = event.error || event.message;
  if (!isDynamicImportFailure(errorLike)) {
    return;
  }
  recoverFromChunkFailure();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <AppRoutes />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
