// KoSurveyor CORS Companion — options page script

const DEFAULT_KOBO_SERVER = 'https://kf.kobotoolbox.org'

const input   = document.getElementById('serverUrl')
const saveBtn = document.getElementById('saveBtn')
const status  = document.getElementById('status')
const permNote = document.getElementById('permNote')

function showStatus(message, isError = false) {
  status.textContent = message
  status.className = isError ? 'error' : 'ok'
}

// ── Load current setting ─────────────────────────────────────────────────────
chrome.storage.sync.get({ koboServerUrl: DEFAULT_KOBO_SERVER }, (items) => {
  input.value = items.koboServerUrl
})

// ── Save ─────────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  const raw = input.value.trim().replace(/\/$/, '') // strip trailing slash

  if (!raw) {
    showStatus('Please enter a URL.', true)
    return
  }

  let origin
  try {
    origin = new URL(raw).origin
  } catch {
    showStatus('Invalid URL. Example: https://kobo.example.org', true)
    return
  }

  if (!origin.startsWith('https://')) {
    showStatus('URL must use HTTPS.', true)
    return
  }

  const isDefault = (origin === new URL(DEFAULT_KOBO_SERVER).origin)

  // For non-default servers, request host permission dynamically
  if (!isDefault) {
    permNote.style.display = 'block'
    const granted = await chrome.permissions.request({
      origins: [`${origin}/*`]
    })
    permNote.style.display = 'none'

    if (!granted) {
      showStatus('Permission denied. The extension cannot access that server.', true)
      return
    }
  }

  // ── Test the connection before saving ───────────────────────────────────────
  showStatus(`Testing connection to ${origin}...`)
  
  try {
    // Ping the KoboToolbox API v2 endpoint requesting JSON format
    const response = await fetch(`${origin}/api/v2/?format=json`);
    
    // If it returns 404 Not Found, it's a valid website but not a Kobo server
    if (response.status === 404) {
      showStatus(`Test failed: No KoboToolbox API found at this address.`, true)
      return
    }

    // Optional: If you wanted to be extremely strict, you could even do:
    // const data = await response.json(); 
    // to verify the response body, but checking the status is usually plenty!

  } catch (error) {
    // A TypeError here means the server didn't respond, the domain doesn't exist, 
    // or the connection was actively refused.
    showStatus(`Test failed: Could not connect to the server. Check the URL.`, true)
    return
  }

  // ── Final Save ─────────────────────────────────────────────────────────────
  chrome.storage.sync.set({ koboServerUrl: origin }, () => {
    if (chrome.runtime.lastError) {
      showStatus('Save failed: ' + chrome.runtime.lastError.message, true)
      return
    }
    showStatus(`✓ Saved and verified! Extension will proxy requests to: ${origin}`)
    input.value = origin
  })
})