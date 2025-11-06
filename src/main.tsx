import { useEffect, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
// import { useRegisterSW } from 'virtual:pwa-register/react'

// Safe, optional PWA registration without hooks:

export function PWARegisterSafe() {
  useEffect(() => {
    // Dynamically import so missing module never breaks build/dev
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        try {
          registerSW({ immediate: true });
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        // PWA plugin not present — that's fine
      });
  }, []);
  return null;
}


// export function PWAUpdater() {
//  useRegisterSW({
//    onRegisteredSW(_swUrl, _reg) {
      // noop
//    },
//    onNeedRefresh() {
      // show a toast/button that calls updateServiceWorker()
//    },
//    onOfflineReady() {
      // show “ready to work offline”
//    },
//  })
//  return null
// }

console.log("[main] Booting React root…");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary title="App crashed">
      <App />
    </ErrorBoundary>
    <PWARegisterSafe />
  </StrictMode>,
)


