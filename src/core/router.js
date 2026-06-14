/**
 * Hash-based Router with lazy-loading view modules.
 *
 * Uses dynamic import() to load view modules on demand.
 * Each view module exports: { mount(container), unmount() }
 *
 * Pre-loads today-view during idle time via requestIdleCallback.
 * Emits 'state:changed' via EventBus on route transitions.
 */

import { EventBus, EVENTS } from './event-bus.js';

/**
 * Map of route names to lazy-loading factory functions.
 * Each factory returns a Promise resolving to a view module with mount/unmount.
 */
const VIEW_MAP = {
  'today':     () => import('../views/today-view.js'),
  'weekly':    () => import('../views/weekly-view.js'),
  'reviews':   () => import('../views/reviews-view.js'),
  'records':   () => import('../views/records-view.js'),
  'settings':  () => import('../views/settings-view.js'),
  'facts':     () => import('../views/fact-index-view.js'),
  'showcase':  () => import('../views/showcase-view.js'),
  'retro':     () => import('../views/retrospective-view.js'),
};

const DEFAULT_ROUTE = 'today';

/** Cache for already-loaded view modules */
const moduleCache = new Map();

/** Currently active route name */
let currentRoute = null;

/** Currently mounted view module (has mount/unmount) */
let currentView = null;

/** The container element for view rendering */
let appContainer = null;

/** Monotonic token used to ignore stale async navigations */
let navigationToken = 0;

/** Whether the global hashchange listener has been registered */
let isListening = false;

/**
 * Extract route name from the URL hash.
 * @returns {string} Route name (defaults to 'today')
 */
function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  return hash && VIEW_MAP[hash] ? hash : DEFAULT_ROUTE;
}

/**
 * Load a view module, using cache when available.
 * @param {string} route - Route name from VIEW_MAP
 * @returns {Promise<{mount: Function, unmount: Function}>}
 */
async function loadView(route) {
  if (moduleCache.has(route)) {
    return moduleCache.get(route);
  }
  const loader = VIEW_MAP[route];
  if (!loader) {
    throw new Error(`Unknown route: ${route}`);
  }
  const module = await loader();
  moduleCache.set(route, module);
  return module;
}

function safelyUnmountView(view) {
  if (view && typeof view.unmount === 'function') {
    try {
      view.unmount();
    } catch (err) {
      console.warn('[Router] Failed to unmount current view:', err);
    }
  }
}

/**
 * Safely unmount the current view without blocking route recovery.
 */
function unmountCurrentView() {
  const view = currentView;
  currentView = null;
  safelyUnmountView(view);
}

/**
 * Navigate to a given route. Unmounts current view, loads and mounts the new one.
 * @param {string} route - Target route name
 */
async function navigate(route) {
  if (!VIEW_MAP[route]) {
    route = DEFAULT_ROUTE;
  }

  // Skip if already mounted on this route. If the previous load failed, allow retry.
  if (route === currentRoute && currentView) return;

  // Unmount current view
  unmountCurrentView();

  const token = ++navigationToken;
  currentRoute = route;

  // Update hash without triggering hashchange
  const newHash = `#/${route}`;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash);
  }

  // Load and mount new view
  let viewModule;
  try {
    viewModule = await loadView(route);
    if (token !== navigationToken || route !== currentRoute) return;

    if (!appContainer) {
      currentView = null;
      return;
    }
    if (typeof viewModule.mount !== 'function') {
      throw new Error(`View "${route}" does not export mount()`);
    }

    viewModule.mount(appContainer);
    currentView = viewModule;
  } catch (err) {
    if (token !== navigationToken || route !== currentRoute) return;

    safelyUnmountView(viewModule);
    console.error(`[Router] Failed to load view "${route}":`, err);
    currentView = null;
    if (appContainer) {
      const error = document.createElement('div');
      error.className = 'route-error';
      error.setAttribute('role', 'alert');
      error.textContent = '页面加载失败，请刷新后重试。';
      appContainer.replaceChildren(error);
    }
  }

  // Notify state change
  EventBus.emit(EVENTS.STATE_CHANGED, { path: 'router.currentRoute', value: route });
}

/**
 * Get the currently active route name.
 * @returns {string|null}
 */
function getCurrentRoute() {
  return currentRoute;
}

/**
 * Handle hash change events from browser navigation.
 */
function onHashChange() {
  const route = parseHash();
  navigate(route);
}

/**
 * Pre-load the today-view module during browser idle time.
 */
function preloadTodayView() {
  const preload = () => {
    loadView('today').catch(() => {
      // Silently ignore preload failures
    });
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(preload);
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(preload, 200);
  }
}

/**
 * Initialize the router.
 * @param {HTMLElement} container - The DOM element to mount views into
 */
function init(container) {
  const containerChanged = appContainer && appContainer !== container;
  if (containerChanged) {
    navigationToken += 1;
    unmountCurrentView();
    currentRoute = null;
    currentView = null;
  }

  appContainer = container;
  if (!isListening) {
    window.addEventListener('hashchange', onHashChange);
    isListening = true;
  }

  // Navigate to the initial route
  const initialRoute = parseHash();
  navigate(initialRoute);

  // Pre-load today-view on idle
  preloadTodayView();
}

/**
 * Destroy the router, removing listeners and unmounting current view.
 */
function destroy() {
  navigationToken += 1;
  if (isListening) {
    window.removeEventListener('hashchange', onHashChange);
    isListening = false;
  }
  unmountCurrentView();
  currentRoute = null;
  currentView = null;
  appContainer = null;
  moduleCache.clear();
}

export const Router = {
  init,
  destroy,
  navigate,
  getCurrentRoute,
  /** Exposed for testing */
  _parseHash: parseHash,
  _VIEW_MAP: VIEW_MAP,
};
