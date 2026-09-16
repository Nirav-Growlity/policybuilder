export type DraftSave<T> = (payload: T) => Promise<void>;

export function createDraftAutosave<T>(delayMs = 900) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { payload: T; save: DraftSave<T> } | null = null;
  let saving = false;
  let cancelled = false;

  function schedule(payload: T, save: DraftSave<T>) {
    if (cancelled) return;
    pending = { payload, save };
    if (saving || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  }

  async function run() {
    if (cancelled || saving || !pending) return;
    const next = pending;
    pending = null;
    saving = true;
    try {
      await next.save(next.payload);
    } catch {
      // The caller reports the save failure. Do not replay a stale payload.
      pending = null;
    } finally {
      saving = false;
      if (!cancelled && pending && timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void run();
        }, delayMs);
      }
    }
  }

  return {
    schedule,
    cancel() {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
