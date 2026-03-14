// KoSurveyor CORS Companion — background service worker
//
// Runs in the extension background context — no CORS restrictions.
// Receives fetch requests from content-isolated.js, validates the URL against
// the configured Kobo server, executes the fetch, and returns the response.
//
// The allowed Kobo server URL is read from chrome.storage.sync on every request
// so changes in the options page take effect immediately without reloading.

const DEFAULT_KOBO_SERVER = 'https://kf.kobotoolbox.org'

async function getAllowedOrigin() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ koboServerUrl: DEFAULT_KOBO_SERVER }, (items) => {
      try {
        const url = new URL(items.koboServerUrl)
        resolve(url.origin) // e.g. "https://kf.kobotoolbox.org"
      } catch {
        resolve(new URL(DEFAULT_KOBO_SERVER).origin)
      }
    })
  })
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'kobo-fetch') return false
  if (!sender.tab) return false

  const { url, method, headers } = message

  getAllowedOrigin().then((allowedOrigin) => {
    // Guard: only proxy requests to the configured Kobo server
    let requestOrigin
    try {
      requestOrigin = new URL(url).origin
    } catch {
      sendResponse({ error: 'Invalid URL: ' + url })
      return
    }

    if (requestOrigin !== allowedOrigin) {
      sendResponse({ error: `URL not permitted. Expected origin: ${allowedOrigin}, got: ${requestOrigin}` })
      return
    }

    fetch(url, { method: method || 'GET', headers: headers || {} })
      .then(async (res) => {
        const buffer = await res.arrayBuffer()
        const body = Array.from(new Uint8Array(buffer))
        const responseHeaders = {}
        res.headers.forEach((value, key) => { responseHeaders[key] = value })
        sendResponse({
          ok: res.ok,
          status: res.status,
          statusText: res.statusText,
          headers: responseHeaders,
          body
        })
      })
      .catch((err) => {
        sendResponse({ error: err.message })
      })
  })

  return true // Keep message channel open for async sendResponse
})
