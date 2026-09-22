import { describe, expect, it } from "vitest";
import { createBrowserStorage } from "../../src/infrastructure/browser-storage.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

describe("browser storage", () => {
  it("encapsulates reads, writes, and grouped removal", () => {
    const memory = createMemoryStorage();
    const storage = createBrowserStorage(memory);

    expect(storage.write("state", "saved")).toBe(true);
    expect(storage.read("state")).toBe("saved");
    expect(storage.removeMany(["state", "legacy"])).toBe(true);
    expect(memory.values.size).toBe(0);
    expect(storage.available).toBe(true);
  });

  it("reports denied storage without leaking exceptions", () => {
    const deniedStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      }
    };
    const storage = createBrowserStorage(deniedStorage);

    expect(storage.read("state")).toBeNull();
    expect(storage.write("state", "saved")).toBe(false);
    expect(storage.remove("state")).toBe(false);
    expect(storage.removeMany(["state", "legacy"])).toBe(false);
    expect(storage.available).toBe(false);
  });
});
