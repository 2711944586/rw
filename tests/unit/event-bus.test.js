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
    EventBus.on('test:event', handler);
    EventBus.emit('test:event', { data: 42 });
    expect(handler).toHaveBeenCalledWith({ data: 42 });
    EventBus.off('test:event', handler);
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

  it('does not call handler after off()', () => {
    const handler = vi.fn();
    EventBus.on('remove:test', handler);
    EventBus.off('remove:test', handler);
    EventBus.emit('remove:test', 'x');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not throw when emitting an event with no listeners', () => {
    expect(() => EventBus.emit('nonexistent', {})).not.toThrow();
  });

  it('does not throw when calling off() for an unregistered event', () => {
    expect(() => EventBus.off('nope', () => {})).not.toThrow();
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
