# KoSurveyor browser extension

A Chrome/Edge extension that enables the [KoSurveyor (under development)](https://kosurveyor.netlify.app) web app to communicate with KoboToolbox servers by proxying API requests through the extension's background service worker, bypassing browser CORS restrictions.

## Why is this needed?

KoSurveyor is a fully client-side application — it has no backend server. When the Postprocess branch needs to fetch submissions and media from KoboToolbox, the browser blocks the requests due to CORS policy. This extension transparently intercepts `fetch()` calls directed at the configured KoboToolbox server and routes them through the extension's service worker, which is not subject to CORS.

## Why is it safe?

- **It only does one thing.** The extension's sole purpose is forwarding KoboToolbox API requests to get around CORS restrictions. It cannot read page content, access your files, or interact with any website other than KoSurveyor.
- **Your credentials are never touched.** The extension does not read, store, or log your KoboToolbox username, password, or any other account data. Your login details go directly to KoboToolbox — the extension just carries them, the same way a postal worker delivers a sealed letter without opening it.
- **It only talks to KoboToolbox.** The extension will refuse to relay requests to any address other than the KoboToolbox server you have configured. It cannot be used as a general-purpose proxy.
- **Server addresses are verified before use.** When you (or the app) set a KoboToolbox server address, the extension checks that a real KoboToolbox instance is actually running there before accepting it. Addresses that fail the check are silently rejected and your previous setting is kept.
- **You approve any non-standard server.** If a custom server address is entered, the browser itself will ask you to explicitly grant permission to access that domain. Nothing is saved without your approval.
- **Page isolation.** Content scripts run only on `https://kosurveyor.netlify.app` and `localhost`. The extension is entirely inactive on all other websites.

## How it works

1. **Content script (MAIN world)** overrides `window.fetch` on the KoSurveyor page. Calls targeting the configured Kobo server are intercepted; all others pass through unmodified.
2. **Content script (ISOLATED world)** bridges between the page and the extension background using `CustomEvent` messaging and `chrome.runtime.sendMessage`.
3. **Background service worker** receives the proxied request, validates that the target URL matches the configured Kobo server, executes the fetch, and returns the full response (status, headers, body) back to the page.

The extension also sets `window.__kosurveyorExtension = true` and `window.__kosurveyorOrigin` so the web app can detect extension availability and the active server URL.

## Features

- Proxies all KoboToolbox API requests (`GET` only) through the extension background — no CORS errors
- Configurable Kobo server URL via the extension options page (default: `https://kf.kobotoolbox.org`)
- Connection test on save — verifies the server has a valid KoboToolbox API before accepting the URL
- Dynamic host permission request for custom (non-default) Kobo servers
- Zero persistence of credentials — the extension never stores or reads Kobo usernames or passwords nor any other kind of data; it only forwards the `Authorization` header provided by the app

## Installation

1. **From the Chrome Web Store** — search for *KoSurveyor proxy* or follow the link from the KoSurveyor app.
2. **Manual / development install:**
   - Clone this repository
   - Open `chrome://extensions` in Chrome or `edge://extensions` in Edge
   - Enable **Developer mode**
   - Click **Load unpacked** and select the extension folder

## Configuration

Right-click the extension icon → **Options** (or click the extension icon and choose *Options*).

| Setting | Description |
|---|---|
| **KoboToolbox Server URL** | The base URL of your Kobo instance. Default: `https://kf.kobotoolbox.org`. Teams using a self-hosted instance enter their own URL here. Must be HTTPS. |

When a non-default server is entered, Chrome will prompt for permission to access that domain. The connection is tested before saving.

## Supported browsers

Google Chrome and Microsoft Edge (Chromium-based). Firefox and Safari are **not** supported due to Manifest V3 and API differences.

## License

CC BY-SA 4.0

This license requires that reusers give credit to the creator. It allows reusers to distribute, remix, adapt, and build upon the material in any medium or format, even for commercial purposes. If others remix, adapt, or build upon the material, they must license the modified material under identical terms.