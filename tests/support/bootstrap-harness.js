/**
 * Integration harness for the production entry (`src/app.js`).
 *
 * `app.js` skips its bootstrap under Vitest so the pure state layer can be
 * imported without rewiring the page. That is why the production orchestrator
 * historically had no behavioural tests at all — only source-text pattern
 * matching. Setting `globalThis.__RW_BOOTSTRAP__` opts this one import back into
 * the real bootstrap, against the real `index.html` markup, so DOM-level
 * behaviour can be asserted by driving the page instead of grepping the source.
 *
 * Usage (inside a `@vitest-environment jsdom` test file):
 *
 *   const app = await mountProductionApp();
 *   document.getElementById('authOpenBtn').click();
 *   expect(document.getElementById('authDialog').open).toBe(true);
 */
import fs from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';

const INDEX_HTML = path.resolve(process.cwd(), 'index.html');
const BOOTSTRAP_FLAG = '__RW_BOOTSTRAP__';

/**
 * jsdom omits a few browser APIs the app legitimately uses. Without these the
 * bootstrap throws from a timer instead of from app code, which would make the
 * harness look broken. Each polyfill is a no-op stub, not behaviour.
 */
function installJsdomGaps() {
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = function scrollTo() {};
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  // jsdom defines `window.scrollTo` but only to log "Not implemented", so it
  // has to be replaced unconditionally rather than only when absent.
  window.scrollTo = function scrollTo() {};
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
  }
  if (typeof window.requestIdleCallback !== 'function') {
    window.requestIdleCallback = (callback) => window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 50 }),
      0
    );
    window.cancelIdleCallback = (handle) => window.clearTimeout(handle);
  }
  // jsdom parses <dialog> and tracks `.open`, but does not implement the modal
  // methods the app calls.
  if (typeof HTMLDialogElement !== 'undefined') {
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
      };
    }
    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      HTMLDialogElement.prototype.close = function close() {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      };
    }
  }
}

installJsdomGaps();

function readBodyMarkup() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const match = html.match(/<body([^>]*)>([\s\S]*?)<\/body>/i);
  if (!match) throw new Error('index.html has no <body> to mount.');
  return {
    attributes: match[1],
    content: match[2].replace(/<script[\s\S]*?<\/script>/gi, ''),
  };
}

async function waitForBootstrap(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.__rwDebug?.health?.().appStarted === true) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('bootstrapApp did not finish within the timeout.');
}

/**
 * Mount the production app against the real page markup.
 *
 * @param {{ seedStorage?: Record<string, string>, keepStorage?: boolean }} [options]
 * @returns {Promise<object>} the `window.__rwDebug` surface
 */
export async function mountProductionApp(options = {}) {
  const { seedStorage = null, keepStorage = false } = options;
  const { attributes, content } = readBodyMarkup();

  document.body.innerHTML = content;
  const density = /\bdata-density="([^"]*)"/.exec(attributes)?.[1];
  if (density) document.body.setAttribute('data-density', density);

  if (!keepStorage) window.localStorage.clear();
  for (const [key, value] of Object.entries(seedStorage || {})) {
    window.localStorage.setItem(key, value);
  }

  globalThis[BOOTSTRAP_FLAG] = true;
  vi.resetModules();
  try {
    await import('../../src/app.js');
  } finally {
    delete globalThis[BOOTSTRAP_FLAG];
  }
  await waitForBootstrap();
  return window.__rwDebug;
}

/** Navigate the mounted app to a view and wait for it to become active. */
export async function goToView(viewId) {
  window.__rwDebug.route(viewId);
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (document.querySelector('.view.active')?.id === viewId) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`View "${viewId}" never became active.`);
}

/**
 * jsdom does not implement blob downloads. This stubs the three browser APIs the
 * export flows use and records what each "download" would have contained.
 *
 * @returns {{ downloads: Array<{name: string, text: string}>, restore: () => void }}
 */
export function captureDownloads() {
  const downloads = [];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalClick = HTMLAnchorElement.prototype.click;
  // Keyed by the mock object URL. A WeakMap cannot be iterated, so this has to
  // be a plain Map.
  const blobsByHref = new Map();

  URL.createObjectURL = (blob) => {
    const href = `blob:mock/${blobsByHref.size}`;
    blobsByHref.set(href, blob);
    return href;
  };
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function click() {
    const href = this.getAttribute('href');
    const blob = blobsByHref.get(href);
    if (blob) {
      downloads.push({
        name: this.getAttribute('download') || '',
        text: typeof blob.text === 'function' ? blob.text() : String(blob),
      });
    }
  };

  return {
    downloads,
    restore() {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      HTMLAnchorElement.prototype.click = originalClick;
      blobsByHref.clear();
    },
  };
}

/** Resolve a captured download's body to text. */
export async function downloadText(download) {
  return typeof download.text === 'string' ? download.text : await download.text;
}
