// Programmatic navigations that leave the builder (such as signing out from the
// account menu) are not seen by its anchor/popstate/beforeunload guards. The
// builder registers its save flush here so those callers can await it first.
type NavigationFlush = () => Promise<void>;

let activeFlush: NavigationFlush | null = null;

export function registerNavigationFlush(flush: NavigationFlush): () => void {
  activeFlush = flush;
  return () => {
    if (activeFlush === flush) activeFlush = null;
  };
}

/** Resolves once any pending builder save has landed; rejects if it cannot. */
export async function flushPendingNavigation(): Promise<void> {
  await activeFlush?.();
}
