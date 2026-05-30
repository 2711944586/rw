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

/**
 * Navigate to a given route. Unmounts current view, loads and mounts the new one.
 * @param {string} route - Target route name
 */
async function navigate(route) {
  if (!VIEW_MAP[route]) {
    route = DEFAULT_ROUTE;
  }

  // Skip if already on this route
  if (route === currentRoute) return;

  // Unmount current view
  if (currentView && typeof currentView.unmount === 'function') {
    currentView.unmount();
  }

  currentRoute = route;

  // Update hash without triggering hashchange
  const newHash = `#/${route}`;
  if (window.location.hash !== newHash) {
    window.history.replaceState(null, '', newHash);
  }

  // Load and mount new view
  try {
    const viewModule = await loadView(route);
    currentView = viewModule;
    if (appContainer && typeof viewModule.mount === 'function') {
      viewModule.mount(appContainer);
    }
  } catch (err) {
    console.error(`[Router] Failed to load view "${route}":`, err);
    currentView = null;
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
  appContainer = container;
  window.addEventListener('hashchange', onHashChange);

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
  window.removeEventListener('hashchange', onHashChange);
  if (currentView && typeof currentView.unmount === 'function') {
    currentView.unmount();
  }
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
