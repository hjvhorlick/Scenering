let persistenceRequest: Promise<boolean> | null = null;
let persistenceGranted: boolean | undefined;

/** Ask the browser not to evict cached Piper voice files under storage pressure.
 * `retryDenied` is for a fresh, explicit user gesture, not every scene in a batch.
 */
export function requestPiperStoragePersistence(retryDenied = false): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage) return Promise.resolve(false);
  if (persistenceRequest) return persistenceRequest;
  if (persistenceGranted === true || (persistenceGranted === false && !retryDenied)) {
    return Promise.resolve(persistenceGranted);
  }

  const storage = navigator.storage as StorageManager & {
    persist?: () => Promise<boolean>;
    persisted?: () => Promise<boolean>;
  };
  const attempt = (async () => {
    try {
      // persist() is idempotent for an origin already marked persistent and
      // is invoked synchronously during the user gesture when available.
      if (storage.persist) return await storage.persist();
      return storage.persisted ? await storage.persisted() : false;
    } catch {
      return false;
    }
  })();
  persistenceRequest = attempt;
  void attempt.then((persisted) => {
    persistenceGranted = persisted;
    if (persistenceRequest === attempt) persistenceRequest = null;
  });
  return attempt;
}
