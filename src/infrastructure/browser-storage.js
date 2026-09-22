export function createBrowserStorage(storage) {
  let available = true;

  function read(key) {
    try {
      return storage.getItem(key);
    } catch {
      available = false;
      return null;
    }
  }

  function write(key, value) {
    try {
      storage.setItem(key, value);
      available = true;
      return true;
    } catch {
      available = false;
      return false;
    }
  }

  function remove(key) {
    try {
      storage.removeItem(key);
      available = true;
      return true;
    } catch {
      available = false;
      return false;
    }
  }

  function removeMany(keys) {
    const removed = keys.map(remove).every(Boolean);
    available = removed;
    return removed;
  }

  return Object.freeze({
    get available() {
      return available;
    },
    read,
    write,
    remove,
    removeMany
  });
}
