/**
 * Live status of the render job.
 *
 * The render loop can outlive the render screen (that is the whole point: you
 * can walk away from the page and the video keeps rendering), so the job's
 * state lives in this module instead of inside the React component. Any part
 * of the app can subscribe — the header shows a progress pill, and the render
 * screen re-attaches to a job that is already running.
 */

export interface RenderJobStatus {
  active: boolean;
  /** 0 … 1 */
  progress: number;
  stage: string;
  title: string;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  /** vault id of the render this job produced (set on success) */
  lastVaultId: string | null;
}

const STATUS: RenderJobStatus = {
  active: false,
  progress: 0,
  stage: "",
  title: "",
  startedAt: null,
  finishedAt: null,
  error: null,
  lastVaultId: null,
};

type Listener = (status: RenderJobStatus) => void;
const listeners = new Set<Listener>();

export function getRenderStatus(): RenderJobStatus {
  return { ...STATUS };
}

export function setRenderStatus(patch: Partial<RenderJobStatus>): void {
  Object.assign(STATUS, patch);
  const snapshot = getRenderStatus();
  listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {}
  });
}

export function subscribeRenderStatus(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Clears a finished/error state so the UI stops advertising it. */
export function dismissRenderStatus(): void {
  setRenderStatus({
    active: false,
    progress: 0,
    stage: "",
    error: null,
    finishedAt: null,
    lastVaultId: null,
  });
}

/** True while a render is running or a finished render is still unseen. */
export function renderNeedsAttention(status: RenderJobStatus): boolean {
  return status.active || (!!status.finishedAt && !status.error);
}
