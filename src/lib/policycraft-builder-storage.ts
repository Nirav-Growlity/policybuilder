export interface PolicyCraftBuilderStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

export interface PolicyCraftBuilderStorageController {
  storage: PolicyCraftBuilderStorage;
  setScope: (userId: string, organizationId: number) => void;
  clearScope: () => void;
  getScopeKey: () => string | null;
}

export function policyCraftBuilderStorageKey(name: string, scopeKey: string): string {
  return `${name}:v2:${encodeURIComponent(scopeKey)}`;
}

export function createPolicyCraftBuilderStorage(
  getStorage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = () =>
    typeof window === "undefined" ? null : window.localStorage,
): PolicyCraftBuilderStorageController {
  let scopeKey: string | null = null;

  function currentKey(name: string): string | null {
    return scopeKey ? policyCraftBuilderStorageKey(name, scopeKey) : null;
  }

  return {
    storage: {
      getItem(name) {
        const key = currentKey(name);
        return key ? getStorage()?.getItem(key) ?? null : null;
      },
      setItem(name, value) {
        const key = currentKey(name);
        if (key) getStorage()?.setItem(key, value);
      },
      removeItem(name) {
        const key = currentKey(name);
        if (key) getStorage()?.removeItem(key);
      },
    },
    setScope(userId, organizationId) {
      if (!userId || !Number.isInteger(organizationId) || organizationId <= 0) {
        throw new Error("A valid user and organization are required for builder storage.");
      }
      scopeKey = `${userId}:${organizationId}`;
    },
    clearScope() {
      scopeKey = null;
    },
    getScopeKey: () => scopeKey,
  };
}

export const policyCraftBuilderStorage = createPolicyCraftBuilderStorage();

let transitionQueue: Promise<void> = Promise.resolve();

/** Serializes account/org rehydration so an unmounted route cannot win a late race. */
export function runPolicyCraftBuilderStorageTransition<T>(transition: () => Promise<T>): Promise<T> {
  const result = transitionQueue.then(transition, transition);
  transitionQueue = result.then(() => undefined, () => undefined);
  return result;
}
