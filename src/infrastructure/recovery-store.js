import { STORAGE_KEYS } from "../core/storage-contract.js";

const DATABASE_NAME = "pku-swm-420-recovery";
const DATABASE_VERSION = 1;
const STORE_NAME = "documents";
const STATE_ID = "app-state";

let operationQueue = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
function enqueue(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => undefined);
  return result;
}

function localStorageFor(options) {
  if (Object.hasOwn(options, "storage")) return options.storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function indexedDbFor(options) {
  if (Object.hasOwn(options, "indexedDB")) return options.indexedDB;
  try {
    return globalThis.indexedDB;
  } catch {
    return null;
  }
}

function savedAtFromPayload(payload) {
  try {
    const state = JSON.parse(payload);
    const savedAt = Date.parse(state?.settings?.lastSavedAt || state?.lastSavedAt || "");
    return Number.isFinite(savedAt) ? savedAt : 0;
  } catch {
    return 0;
  }
}

function openDatabase(indexedDB, databaseName) {
  if (!indexedDB?.open) return Promise.reject(new Error("IndexedDB is unavailable"));

  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error || new Error("Could not open the local recovery store"));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error("The local recovery store is blocked by another tab"));
    };
  });
}

function transact(database, mode, action, value) {
  return new Promise((resolve, reject) => {
    let result;
    try {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action === "get"
        ? store.get(value)
        : action === "put"
          ? store.put(value)
          : store.delete(value);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error || new Error("Local recovery request failed"));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error("Local recovery transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("Local recovery transaction was aborted"));
    } catch (error) {
      reject(error);
    }
  });
}

async function withDatabase(options, operation) {
  const indexedDB = indexedDbFor(options);
  const database = await openDatabase(indexedDB, options.databaseName || DATABASE_NAME);
  try {
    return await operation(database);
  } finally {
    database.close();
  }
}

/**
 * Restore the newest usable copy before the application reads its synchronous
 * localStorage state. IndexedDB remains a recovery mirror, not the live store.
 * @param {{storage?: Storage, indexedDB?: IDBFactory, key?: string, databaseName?: string}} [options]
 * @returns {Promise<{ok: boolean, restored: boolean, source: "local" | "indexeddb" | "none"}>}
 */
export function restoreLocalState(options = {}) {
  return enqueue(async () => {
    const storage = localStorageFor(options);
    const key = options.key || STORAGE_KEYS.APP_STATE;
    if (!storage) return { ok: false, restored: false, source: "none" };

    let localPayload = null;
    try {
      localPayload = storage.getItem(key);
    } catch {
      return { ok: false, restored: false, source: "none" };
    }

    try {
      return await withDatabase(options, async (database) => {
        const recovery = await transact(database, "readonly", "get", STATE_ID);
        const recoveryPayload = typeof recovery?.payload === "string" ? recovery.payload : "";
        const localSavedAt = savedAtFromPayload(localPayload || "");
        const recoverySavedAt = Math.max(Number(recovery?.savedAt) || 0, savedAtFromPayload(recoveryPayload));

        if (recoveryPayload && (!localPayload || recoverySavedAt > localSavedAt)) {
          storage.setItem(key, recoveryPayload);
          return { ok: true, restored: true, source: "indexeddb" };
        }

        if (localPayload) {
          await transact(database, "readwrite", "put", {
            id: STATE_ID,
            payload: localPayload,
            savedAt: localSavedAt || Date.now()
          });
          return { ok: true, restored: false, source: "local" };
        }

        return { ok: true, restored: false, source: "none" };
      });
    } catch {
      return { ok: false, restored: false, source: "none" };
    }
  });
}

/**
 * Queue a secondary IndexedDB copy after a local state write.
 * @param {string} payload
 * @param {{indexedDB?: IDBFactory, databaseName?: string}} [options]
 * @returns {Promise<boolean>}
 */
export function persistRecoveryCopy(payload, options = {}) {
  if (typeof payload !== "string" || payload === "") return Promise.resolve(false);

  return enqueue(async () => {
    try {
      await withDatabase(options, async (database) => {
        await transact(database, "readwrite", "put", {
          id: STATE_ID,
          payload,
          savedAt: savedAtFromPayload(payload) || Date.now()
        });
      });
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Delete the recovery copy when the user explicitly clears local application data.
 * @param {{indexedDB?: IDBFactory, databaseName?: string}} [options]
 * @returns {Promise<boolean>}
 */
export function clearRecoveryCopy(options = {}) {
  return enqueue(async () => {
    try {
      await withDatabase(options, (database) => transact(database, "readwrite", "delete", STATE_ID));
      return true;
    } catch {
      return false;
    }
  });
}
