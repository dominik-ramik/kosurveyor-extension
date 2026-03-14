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

// ── 1. Listen for "Read from extension" (App -> Extension) ──────────────────
window.addEventListener('kosurveyor-get-origin', () => {
  chrome.storage.sync.get({ koboServerUrl: DEFAULT_KOBO_SERVER }, (items) => {
    window.dispatchEvent(new CustomEvent('kosurveyor-origin', {
      detail: { origin: items.koboServerUrl }
    }));
  });
});

// ── 2. Listen for "Apply" (App -> Extension) ───────────────────────────────
window.addEventListener('kosurveyor-set-origin', async (event) => {
  const { url } = event.detail;
  if (!url) return;

  let origin;
  try {
    origin = new URL(url).origin;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
      detail: { success: false, error: 'Invalid URL format' }
    }));
    return;
  }

  if (!origin.startsWith('https://')) {
    window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
      detail: { success: false, error: 'URL must use HTTPS.' }
    }));
    return;
  }

  const isDefault = (origin === 'https://kf.kobotoolbox.org');

  try {
    // Request permission via the background script (since content scripts can't)
    if (!isDefault) {
      chrome.runtime.sendMessage({ type: 'request-kobo-permission', origin }, (response) => {
        if (!response?.granted) {
          window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
            detail: { success: false, error: 'Permission denied by user' }
          }));
          return;
        }
        validateAndSaveOrigin(origin);
      });
    } else {
      validateAndSaveOrigin(origin);
    }
  } catch (error) {
    window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
      detail: { success: false, error: error.message }
    }));
  }
});

function validateAndSaveOrigin(origin) {
  // Test the connection by pinging the KoboToolbox API via the background script
  chrome.runtime.sendMessage({ type: 'kobo-validate-server', origin }, (result) => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
        detail: { success: false, error: chrome.runtime.lastError.message }
      }));
      return;
    }
    if (!result?.valid) {
      window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
        detail: { success: false, error: result?.error || 'Server validation failed.' }
      }));
      return;
    }
    saveOriginToStorage(origin);
  });
}

function saveOriginToStorage(origin) {
  chrome.storage.sync.set({ koboServerUrl: origin }, () => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
        detail: { success: false, error: chrome.runtime.lastError.message }
      }));
    } else {
      // Notify the app that it was successful
      window.dispatchEvent(new CustomEvent('kosurveyor-set-origin-status', {
        detail: { success: true, origin: origin }
      }));
      // Note: chrome.storage.onChanged in this same file will automatically 
      // fire 'kosurveyor-init' to update content-main.js
    }
  });
}