/**
 * Lightweight pub/sub event bus for cross-module communication.
 *
 * Supported events:
 *   plan:generated, task:completed, review:result, retro:daily,
 *   retro:weekly, retro:monthly, sync:success, sync:error,
 *   calibration:complete, calibration:tierFallback, state:changed
 */

const listeners = new Map();

function normalizeEventName(event) {
  return typeof event === 'string' ? event.trim() : '';
}

function isJsonCloneSafe(value, seen = new Set()) {
  if (value == null) return true;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return true;
  if (valueType === 'number') return Number.isFinite(value);
  if (valueType !== 'object') return false;

  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((item) => isJsonCloneSafe(item, seen));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  return Object.values(value).every((item) => isJsonCloneSafe(item, seen));
}

function cloneEventPayload(payload) {
  if (payload == null || typeof payload !== 'object') return payload;

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(payload);
    } catch {
      // Fall through to the JSON path for plain data.
    }
  }

  if (!isJsonCloneSafe(payload)) return payload;

  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) return payload;
    return JSON.parse(serialized);
  } catch {
    return payload;
  }
}

export const EVENTS = Object.freeze({
  PLAN_GENERATED: 'plan:generated',
  TASK_COMPLETED: 'task:completed',
  REVIEW_RESULT: 'review:result',
  RETRO_DAILY: 'retro:daily',
  RETRO_WEEKLY: 'retro:weekly',
  RETRO_MONTHLY: 'retro:monthly',
  SYNC_SUCCESS: 'sync:success',
  SYNC_ERROR: 'sync:error',
  CALIBRATION_COMPLETE: 'calibration:complete',
  CALIBRATION_TIER_FALLBACK: 'calibration:tierFallback',
  STATE_CHANGED: 'state:changed',
});

export const EventBus = {
  /**
   * Subscribe to an event.
   * @param {string} event - Event name
   * @param {Function} handler - Callback receiving the event payload
   * @returns {boolean} Whether the handler was registered
   */
  on(event, handler) {
    const eventName = normalizeEventName(event);
    if (!eventName || typeof handler !== 'function') return false;

    if (!listeners.has(eventName)) {
      listeners.set(eventName, []);
    }
    const handlers = listeners.get(eventName);
    if (handlers.includes(handler)) return false;

    handlers.push(handler);
    return true;
  },

  /**
   * Unsubscribe from an event.
   * @param {string} event - Event name
   * @param {Function} handler - The same function reference passed to `on`
   * @returns {boolean} Whether the handler was removed
   */
  off(event, handler) {
    const eventName = normalizeEventName(event);
    const handlers = eventName ? listeners.get(eventName) : null;
    if (!handlers) return false;

    const idx = handlers.indexOf(handler);
    if (idx === -1) return false;

    handlers.splice(idx, 1);
    if (handlers.length === 0) {
      listeners.delete(eventName);
    }
    return true;
  },

  /**
   * Emit an event, calling all registered handlers with the payload.
   * Listener errors are isolated so one module cannot block later subscribers.
   * @param {string} event - Event name
   * @param {*} payload - Data passed to each handler
   * @returns {{ delivered: number, errors: Array<{ error: unknown }> }}
   */
  emit(event, payload) {
    const eventName = normalizeEventName(event);
    const handlers = eventName ? listeners.get(eventName) : null;
    const summary = { delivered: 0, errors: [] };
    if (!handlers) return summary;

    for (const handler of [...handlers]) {
      try {
        handler(cloneEventPayload(payload));
        summary.delivered += 1;
      } catch (error) {
        summary.errors.push({ error });
      }
    }

    return summary;
  },
};
