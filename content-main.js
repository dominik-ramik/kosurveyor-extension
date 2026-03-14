// KoSurveyor CORS Companion — content script (MAIN world)
//
// Overrides window.fetch in the page's JS context.
// Intercepts fetch() calls to the configured Kobo server origin and routes
// them through the extension background worker (no CORS restrictions there).
// All other fetch calls are passed through to the original window.fetch.
//
// The Kobo origin is received from content-isolated.js via the kosurveyor-init
// event, which fires as soon as chrome.storage is read on page load.
// Until the config arrives, calls to the default kf.kobotoolbox.org are already
// intercepted; any configured custom server is set once the event fires.

; (function () {
  const DEFAULT_KOBO_ORIGIN = 'https://kf.kobotoolbox.org'
  const originalFetch = window.fetch.bind(window)

  // Start with the default; updated when kosurveyor-init fires
  let koboOrigin = DEFAULT_KOBO_ORIGIN

  // Receive configured origin from isolated world
  window.addEventListener('kosurveyor-init', (event) => {
    koboOrigin = event.detail.koboOrigin
  })

  window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : String(input)

    if (!url.startsWith(koboOrigin) && !url.startsWith(DEFAULT_KOBO_ORIGIN)) {
      return originalFetch(input, init)
    }

    // Only intercept if this URL matches the currently configured origin
    let requestOrigin
    try {
      requestOrigin = new URL(url).origin
    } catch {
      return originalFetch(input, init)
    }

    if (requestOrigin !== koboOrigin) {
      return originalFetch(input, init)
    }

    // ── Collect headers ────────────────────────────────────────────────────
    const headers = {}
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => { headers[key] = value })
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([key, value]) => { headers[key] = value })
      } else {
        Object.assign(headers, init.headers)
      }
    } else if (input instanceof Request) {
      input.headers.forEach((value, key) => { headers[key] = value })
    }

    const method = (init && init.method) || (input instanceof Request && input.method) || 'GET'

    // ── Route through extension background via isolated world ──────────────
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID()

      const handler = (event) => {
        const response = event.detail
        if (response.error) {
          reject(new TypeError('KoSurveyor extension fetch error: ' + response.error))
          return
        }
        const bodyBuffer = new Uint8Array(response.body).buffer
        resolve(new Response(bodyBuffer, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers)
        }))
      }

      window.addEventListener(`kosurveyor-response-${requestId}`, handler, { once: true })
      window.dispatchEvent(new CustomEvent('kosurveyor-request', {
        detail: { requestId, url, method, headers }
      }))
    })
  }

  // Expose initial default just in case it's checked immediately
  window.__kosurveyorOrigin = koboOrigin

  // Flag the app can check to confirm the extension is active
  window.__kosurveyorExtension = true
})()
