/**
 * Immutable updates for entities that live inside the single app snapshot.
 * This module does not touch localStorage. `commit` calls the one writer.
 */
import { WRITE_CONTRACT } from '../../core/write-contract.js';

export function replaceSessions(state, session) {
  if (!session?.id || !state) return state;
  const current = Array.isArray(state.sessions) ? state.sessions : [];
  const sessions = [...current.filter((item) => item?.id !== session.id), session].slice(-40);
  return { ...state, sessions };
}

export function replaceMistake(state, mistake) {
  if (!mistake?.id || !state) return state;
  const current = Array.isArray(state.mistakes) ? state.mistakes : [];
  return { ...state, mistakes: [...current.filter((item) => item?.id !== mistake.id), mistake] };
}

export function createEntityRepository({ read, commit, storageKey = WRITE_CONTRACT.storageKey }) {
  if (storageKey !== WRITE_CONTRACT.storageKey) {
    throw new Error('实体仓库只能写入约定的学习状态键。');
  }
  return {
    storageKey,
    read,
    commit(next) {
      return commit(next);
    },
  };
}
