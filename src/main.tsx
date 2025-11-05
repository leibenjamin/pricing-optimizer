import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PWAUpdater() {
  useRegisterSW({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onRegisteredSW(_swUrl, _reg) {
      // noop
    },
    onNeedRefresh() {
      // show a toast/button that calls updateServiceWorker()
    },
    onOfflineReady() {
      // show “ready to work offline”
    },
  })
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <PWAUpdater />
  </StrictMode>,
)
