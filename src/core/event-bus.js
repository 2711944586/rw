/**
 * Lightweight pub/sub event bus for cross-module communication.
 *
 * Supported events:
 *   plan:generated, task:completed, review:result, retro:daily,
 *   retro:weekly, retro:monthly, sync:success, sync:error,
 *   calibration:complete, calibration:tierFallback, state:changed
 */

const listeners = new Map();

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
   */
  on(event, handler) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(handler);
  },

  /**
   * Unsubscribe from an event.
   * @param {string} event - Event name
   * @param {Function} handler - The same function reference passed to `on`
   */
  off(event, handler) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  },

  /**
   * Emit an event, calling all registered handlers with the payload.
   * @param {string} event - Event name
   * @param {*} payload - Data passed to each handler
   */
  emit(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      handler(payload);
    }
  },
};
