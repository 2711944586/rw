import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  clearRecoveryCopy,
  persistRecoveryCopy,
  restoreLocalState
} from "../../src/infrastructure/recovery-store.js";

let nextDatabase = 0;

function fixture() {
  const storageData = new Map();
  const storage = {
    getItem(key) {
      return storageData.get(key) ?? null;
    },
    setItem(key, value) {
      storageData.set(key, String(value));
    },
    removeItem(key) {
      storageData.delete(key);
    }
  };
  const options = {
    storage,
    indexedDB: new IDBFactory(),
    key: "state",
    databaseName: `recovery-test-${nextDatabase++}`
  };
  return { storage, options };
}

function statePayload(name, lastSavedAt) {
  return JSON.stringify({ name, settings: { lastSavedAt } });
}

describe("local state recovery store", () => {
  it("copies an existing local state and can restore it after the local entry is missing", async () => {
    const { storage, options } = fixture();
    const payload = statePayload("current", "2026-10-07T10:00:00.000Z");
    storage.setItem("state", payload);

    await expect(restoreLocalState(options)).resolves.toEqual({
      ok: true,
      restored: false,
      source: "local"
    });
    storage.removeItem("state");

    await expect(restoreLocalState(options)).resolves.toEqual({
      ok: true,
      restored: true,
      source: "indexeddb"
    });
    expect(storage.getItem("state")).toBe(payload);
  });

  it("restores the newer recovery copy over a stale local copy", async () => {
    const { storage, options } = fixture();
    const local = statePayload("older", "2026-10-07T10:00:00.000Z");
    const recovery = statePayload("newer", "2026-10-07T10:01:00.000Z");
    storage.setItem("state", local);
    await expect(persistRecoveryCopy(recovery, options)).resolves.toBe(true);

    await expect(restoreLocalState(options)).resolves.toEqual({
      ok: true,
      restored: true,
      source: "indexeddb"
    });
    expect(storage.getItem("state")).toBe(recovery);
  });

  it("keeps a newer local write and updates the recovery copy", async () => {
    const { storage, options } = fixture();
    const recovery = statePayload("older", "2026-10-07T10:00:00.000Z");
    const local = statePayload("newer", "2026-10-07T10:01:00.000Z");
    await expect(persistRecoveryCopy(recovery, options)).resolves.toBe(true);
    storage.setItem("state", local);

    await expect(restoreLocalState(options)).resolves.toEqual({
      ok: true,
      restored: false,
      source: "local"
    });
    storage.removeItem("state");
    await restoreLocalState(options);
    expect(storage.getItem("state")).toBe(local);
  });

  it("removes the recovery copy after an explicit local data clear", async () => {
    const { storage, options } = fixture();
    storage.setItem("state", statePayload("sensitive", "2026-10-07T10:00:00.000Z"));
    await restoreLocalState(options);
    await expect(clearRecoveryCopy(options)).resolves.toBe(true);
    storage.removeItem("state");

    await expect(restoreLocalState(options)).resolves.toEqual({
      ok: true,
      restored: false,
      source: "none"
    });
  });

  it("degrades to local-only storage when IndexedDB is unavailable", async () => {
    const { storage } = fixture();
    storage.setItem("state", statePayload("local", "2026-10-07T10:00:00.000Z"));

    await expect(restoreLocalState({ storage, indexedDB: null, key: "state" })).resolves.toEqual({
      ok: false,
      restored: false,
      source: "none"
    });
    await expect(persistRecoveryCopy("payload", { indexedDB: null })).resolves.toBe(false);
  });

  it("closes a database request that succeeds after another tab blocked it", async () => {
    const database = {
      objectStoreNames: { contains: () => true },
      close: vi.fn()
    };
    const indexedDB = {
      open: () => {
        const request = { result: database, error: null };
        Object.defineProperty(request, "onblocked", {
          set(handler) {
            setTimeout(() => handler(), 0);
          }
        });
        Object.defineProperty(request, "onsuccess", {
          set(handler) {
            setTimeout(() => handler(), 10);
          }
        });
        return request;
      }
    };
    const storage = { getItem: () => null, setItem: vi.fn() };

    await expect(restoreLocalState({ storage, indexedDB, key: "state" })).resolves.toEqual({
      ok: false,
      restored: false,
      source: "none"
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
