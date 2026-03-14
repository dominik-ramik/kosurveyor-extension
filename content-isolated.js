// KoSurveyor CORS Companion — content script (ISOLATED world)
//
// Bridges between the PAGE (MAIN world) and the extension background.
// Has access to chrome.* APIs; cannot touch the page's JS objects directly.
//
// On startup: reads the configured Kobo server URL from storage and sends it
// to content-main.js via a CustomEvent so the fetch interceptor knows which
// origin to intercept.
//
// At runtime: forwards fetch proxy requests from MAIN world to background SW
// and dispatches responses back.

const DEFAULT_KOBO_SERVER = 'https://kf.kobotoolbox.org'

// ── Send config to MAIN world as soon as storage is read ────────────────────
chrome.storage.sync.get({ koboServerUrl: DEFAULT_KOBO_SERVER }, (items) => {
  let origin = DEFAULT_KOBO_SERVER
  try {
    origin = new URL(items.koboServerUrl).origin
  } catch { /* use default */ }

  window.dispatchEvent(new CustomEvent('kosurveyor-init', {
    detail: { koboOrigin: origin }
  }))
})

// ── Also forward any storage changes while the page is open ─────────────────
chrome.storage.onChanged.addListener((changes) => {
  if (changes.koboServerUrl) {
    let origin = DEFAULT_KOBO_SERVER
    try {
      origin = new URL(changes.koboServerUrl.newValue).origin
    } catch { /* use default */ }
    window.dispatchEvent(new CustomEvent('kosurveyor-init', {
      detail: { koboOrigin: origin }
    }))
  }
})

// ── Proxy bridge ─────────────────────────────────────────────────────────────
window.addEventListener('kosurveyor-request', (event) => {
  const { requestId, url, method, headers } = event.detail

  try {
    // Check if the extension was disabled, uninstalled, or updated.
    // If it was, the runtime or sendMessage API will be undefined.
    if (!chrome.runtime || !chrome.runtime.sendMessage) {
      throw new Error('Extension context invalidated (disabled or updated). Please refresh the page.')
    }

    chrome.runtime.sendMessage(
      { type: 'kobo-fetch', id: requestId, url, method, headers },
      (response) => {
        if (chrome.runtime.lastError) {
          window.dispatchEvent(new CustomEvent(`kosurveyor-response-${requestId}`, {
            detail: { error: chrome.runtime.lastError.message }
          }))
          return
        }
        window.dispatchEvent(new CustomEvent(`kosurveyor-response-${requestId}`, {
          detail: response
        }))
      }
    )
  } catch (error) {
    // If we catch an error (like the context being invalidated), 
    // dispatch it back immediately so the fetch() Promise rejects and doesn't hang.
    window.dispatchEvent(new CustomEvent(`kosurveyor-response-${requestId}`, {
      detail: { error: error.message }
    }))
  }
})