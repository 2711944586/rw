/**
 * The one production write path for learner state.
 * A second localStorage key for the same snapshot is not allowed.
 */
import { SCHEMA_VERSION } from '../config/app-config.js';
import { STORAGE_KEYS } from './storage-contract.js';

export const WRITE_CONTRACT = Object.freeze({
  storageKey: STORAGE_KEYS.APP_STATE,
  schemaVersion: SCHEMA_VERSION,
  writer: 'saveState',
  cloud: 'profiles.settings jsonb plus the existing study tables',
});
