export type DraftSave<T> = (payload: T) => Promise<void>;

export function createDraftAutosave<T>(delayMs = 900) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { payload: T; save: DraftSave<T> } | null = null;
  let saving = false;
  let cancelled = false;
  let failure: unknown = null;
  let drainPromise: Promise<void> | null = null;
  let resolveIdle: (() => void) | null = null;

  function idlePromise(): Promise<void> {
    return new Promise((resolve) => { resolveIdle = resolve; });
  }

  function scheduleDrain() {
    if (cancelled || saving || !pending || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, delayMs);
  }

  function schedule(payload: T, save: DraftSave<T>) {
    if (cancelled) return;
    pending = { payload, save };
    failure = null;
    scheduleDrain();
  }

  async function drain() {
    if (cancelled || saving || !pending) return;
    saving = true;
    drainPromise = idlePromise();
    try {
      while (!cancelled && pending) {
        const next = pending;
        pending = null;
        try {
          await next.save(next.payload);
        } catch (error) {
          // The caller owns visible error state. Retain the failure so a
          // navigation flush cannot mistake it for a completed save.
          failure = error;
          pending = null;
          break;
        }
      }
    } finally {
      saving = false;
      const resolve = resolveIdle;
      resolveIdle = null;
      resolve?.();
      drainPromise = null;
      scheduleDrain();
    }
  }

  async function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!saving && pending) void drain();
    if (saving && drainPromise) await drainPromise;
    if (pending && !cancelled) return flush();
    if (failure) throw failure;
  }

  return {
    schedule,
    flush,
    isSaving: () => saving,
    hasPending: () => pending !== null,
    cancel() {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
      if (!saving) {
        const resolve = resolveIdle;
        resolveIdle = null;
        resolve?.();
      }
    },
  };
}
