/**
 * Browser-compatible mock for Node.js async_hooks module
 * Used to prevent errors when gov-tracker's logger tries to use AsyncLocalStorage
 */

class AsyncLocalStorage {
  constructor() {
    this.store = new Map();
  }

  run(store, callback, ...args) {
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = new Map();
    }
  }

  getStore() {
    return this.store;
  }

  enterWith(store) {
    this.store = store;
  }

  disable() {
    this.store = new Map();
  }
}

export { AsyncLocalStorage };

const asyncHooksModule = { AsyncLocalStorage };
export default asyncHooksModule;
