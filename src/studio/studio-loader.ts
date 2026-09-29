import type { ComponentType } from "react";

/**
 * One shared studio download for the landing page and the sign-in door.
 *
 * The public page starts this request as soon as Scenering boots. Importing the
 * module loads and parses the editor, its render engine and its styles while
 * the visitor is reading the landing page or entering a passphrase. The studio
 * is not mounted before authentication — project data stays behind the door —
 * but there is no second application download after a successful sign-in.
 */
export type StudioComponent = ComponentType;

let readyStudio: StudioComponent | null = null;
let studioRequest: Promise<StudioComponent> | null = null;

/** Start (or reuse) the single studio-module request. */
export function preloadStudio(): Promise<StudioComponent> {
  if (readyStudio) return Promise.resolve(readyStudio);
  if (studioRequest) return studioRequest;

  const request = import("../App").then((module) => {
    readyStudio = module.default;
    return readyStudio;
  });
  studioRequest = request;

  // A transient network failure must not permanently poison the sign-in door.
  // The eager caller handles its own rejection; a later sign-in can retry.
  void request.catch(() => {
    if (studioRequest === request) studioRequest = null;
  });

  return request;
}

/** Synchronous hand-off used on the sign-in render path. */
export function getPreloadedStudio(): StudioComponent | null {
  return readyStudio;
}
