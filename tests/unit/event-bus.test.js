import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, EVENTS } from '../../src/core/event-bus.js';

describe('EventBus', () => {
  beforeEach(() => {
    // Clear all listeners between tests by unsubscribing via a fresh emit check
    // We need to reset internal state - subscribe a dummy and remove it
    // Since listeners is module-private, we rely on off() for cleanup
  });

  it('calls handler when event is emitted', () => {
    const handler = vi.fn();
    expect(EventBus.on('test:event', handler)).toBe(true);
    EventBus.emit('test:event', { data: 42 });
    expect(handler).toHaveBeenCalledWith({ data: 42 });
    expect(EventBus.off('test:event', handler)).toBe(true);
  });

  it('supports multiple handlers for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    EventBus.on('multi', h1);
    EventBus.on('multi', h2);
    EventBus.emit('multi', 'payload');
    expect(h1).toHaveBeenCalledWith('payload');
    expect(h2).toHaveBeenCalledWith('payload');
    EventBus.off('multi', h1);
    EventBus.off('multi', h2);
  });

  it('gives each handler a defensive copy of cloneable object payloads', () => {
    const payload = { items: [{ id: 1 }] };
    const first = vi.fn((received) => {
      received.items.push({ id: 2 });
    });
    const second = vi.fn();

    EventBus.on('payload:isolation', first);
    EventBus.on('payload:isolation', second);

    try {
      const result = EventBus.emit('payload:isolation', payload);

      expect(result).toEqual({ delivered: 2, errors: [] });
      expect(second).toHaveBeenCalledWith({ items: [{ id: 1 }] });
      expect(payload).toEqual({ items: [{ id: 1 }] });
    } finally {
      EventBus.off('payload:isolation', first);
      EventBus.off('payload:isolation', second);
    }
  });

  it('preserves non-cloneable payloads without throwing', () => {
    const payload = { run: () => 'ok' };
    const handler = vi.fn();
    EventBus.on('payload:function', handler);

    try {
      expect(EventBus.emit('payload:function', payload)).toEqual({ delivered: 1, errors: [] });
      expect(handler).toHaveBeenCalledWith(payload);
    } finally {
      EventBus.off('payload:function', handler);
    }
  });

  it('does not call handler after off()', () => {
    const handler = vi.fn();
    EventBus.on('remove:test', handler);
    expect(EventBus.off('remove:test', handler)).toBe(true);
    EventBus.emit('remove:test', 'x');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when emitting an event with no listeners', () => {
    let result;
    expect(() => {
      result = EventBus.emit('nonexistent', {});
    }).not.toThrow();
    expect(result).toEqual({ delivered: 0, errors: [] });
  });

  it('does not throw when calling off() for an unregistered event', () => {
    expect(() => EventBus.off('nope', () => {})).not.toThrow();
    expect(EventBus.off('nope', () => {})).toBe(false);
  });

  it('only removes the specific handler reference on off()', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    EventBus.on('specific', h1);
    EventBus.on('specific', h2);
    EventBus.off('specific', h1);
    EventBus.emit('specific', 'val');
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith('val');
    EventBus.off('specific', h2);
  });

  it('ignores duplicate handler registrations for the same event', () => {
    const handler = vi.fn();

    try {
      expect(EventBus.on('dedupe:event', handler)).toBe(true);
      expect(EventBus.on('dedupe:event', handler)).toBe(false);

      const result = EventBus.emit('dedupe:event', 'payload');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('payload');
      expect(result).toEqual({ delivered: 1, errors: [] });
    } finally {
      EventBus.off('dedupe:event', handler);
    }
  });

  it('rejects invalid event names and non-function handlers', () => {
    expect(EventBus.on('', vi.fn())).toBe(false);
    expect(EventBus.on('   ', vi.fn())).toBe(false);
    expect(EventBus.on(null, vi.fn())).toBe(false);
    expect(EventBus.on('invalid:handler', null)).toBe(false);
    expect(EventBus.on('invalid:handler', { handle: vi.fn() })).toBe(false);

    expect(EventBus.emit('', 'payload')).toEqual({ delivered: 0, errors: [] });
    expect(EventBus.emit('invalid:handler', 'payload')).toEqual({ delivered: 0, errors: [] });
  });

  it('normalizes event names consistently across on off and emit', () => {
    const handler = vi.fn();

    expect(EventBus.on(' spaced:event ', handler)).toBe(true);
    expect(EventBus.emit('spaced:event', 1)).toEqual({ delivered: 1, errors: [] });
    expect(handler).toHaveBeenCalledWith(1);

    expect(EventBus.off(' spaced:event ', handler)).toBe(true);
    expect(EventBus.emit('spaced:event', 2)).toEqual({ delivered: 0, errors: [] });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handler removing itself during emit does not break iteration', () => {
    const selfRemove = vi.fn(() => {
      EventBus.off('self:remove', selfRemove);
    });
    const after = vi.fn();
    EventBus.on('self:remove', selfRemove);
    EventBus.on('self:remove', after);
    EventBus.emit('self:remove', null);
    expect(selfRemove).toHaveBeenCalled();
    expect(after).toHaveBeenCalled();
    EventBus.off('self:remove', after);
  });

  it('isolates handler errors and continues dispatching later subscribers', () => {
    const error = new Error('listener failed');
    const throwingHandler = vi.fn(() => {
      throw error;
    });
    const after = vi.fn();

    EventBus.on('error:isolation', throwingHandler);
    EventBus.on('error:isolation', after);

    try {
      let result;
      expect(() => {
        result = EventBus.emit('error:isolation', { id: 7 });
      }).not.toThrow();

      expect(throwingHandler).toHaveBeenCalledWith({ id: 7 });
      expect(after).toHaveBeenCalledWith({ id: 7 });
      expect(result.delivered).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe(error);
    } finally {
      EventBus.off('error:isolation', throwingHandler);
      EventBus.off('error:isolation', after);
    }
  });

  it('exports all expected event constants', () => {
    expect(EVENTS.PLAN_GENERATED).toBe('plan:generated');
    expect(EVENTS.TASK_COMPLETED).toBe('task:completed');
    expect(EVENTS.REVIEW_RESULT).toBe('review:result');
    expect(EVENTS.RETRO_DAILY).toBe('retro:daily');
    expect(EVENTS.RETRO_WEEKLY).toBe('retro:weekly');
    expect(EVENTS.RETRO_MONTHLY).toBe('retro:monthly');
    expect(EVENTS.SYNC_SUCCESS).toBe('sync:success');
    expect(EVENTS.SYNC_ERROR).toBe('sync:error');
    expect(EVENTS.CALIBRATION_COMPLETE).toBe('calibration:complete');
    expect(EVENTS.CALIBRATION_TIER_FALLBACK).toBe('calibration:tierFallback');
    expect(EVENTS.STATE_CHANGED).toBe('state:changed');
  });
});
