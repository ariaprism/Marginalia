import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { hydrateSharedLibrary, watchSharedLibrary } from './data/local/sharedLibrary'
import { OAuthConsent } from './features/cloud/OAuthConsent'
import { oauthConsentRequest } from './features/cloud/oauthConsentRoute'

async function start() {
  const consentRequest = oauthConsentRequest()
  if (consentRequest) {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <OAuthConsent authorizationId={consentRequest.authorizationId} />
      </StrictMode>,
    )
    return
  }
  try {
    await hydrateSharedLibrary()
  } catch (error) {
    console.error('固定本地书房暂时无法连接', error)
  }
  watchSharedLibrary()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })
  })
}
