/**
 * Cross-tab session claim. This key is a lock, not a second copy of app state.
 */
export const SESSION_LOCK_KEY = 'pku_swm_420_session_lock';

function storageOf(storage) {
  return storage || globalThis.localStorage;
}

export function readSessionLock(storage) {
  try {
    const raw = storageOf(storage)?.getItem(SESSION_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSessionLock(session, storage) {
  if (!session?.id) return false;
  try {
    storageOf(storage)?.setItem(SESSION_LOCK_KEY, JSON.stringify({
      id: session.id,
      taskId: session.taskId || '',
      status: session.status || '',
      updatedAt: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clearSessionLock(storage) {
  try {
    storageOf(storage)?.removeItem(SESSION_LOCK_KEY);
    return true;
  } catch {
    return false;
  }
}

export function lockHeldByOtherTab(session, storage, now = Date.now()) {
  const lock = readSessionLock(storage);
  if (!lock || !session || lock.id !== session.id || lock.status !== 'running') return false;
  const age = now - Date.parse(lock.updatedAt);
  return Number.isFinite(age) && age >= 0 && age < 20000;
}
