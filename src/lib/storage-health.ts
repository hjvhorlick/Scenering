/**
 * How much room this browser has left, and how to get some of it back.
 *
 * THE PROBLEM THIS ANSWERS: an upload can fail because the DEVICE is full, not
 * because the file or the site's allowance is wrong. Chromium reports it as
 * `Failed to write blobs (IOError)` while `navigator.storage.estimate()` still
 * shows a healthy quota, so the message the customer saw blamed the video.
 *
 * Scenering is itself a large tenant of that disk: uploaded clips, finished
 * renders in the Vault, generated voiceovers, and — the invisible one —
 * `.part` staging files left behind by any render that was cancelled or lost
 * with its tab. None of that is visible to the customer, and all of it is
 * competing with the next upload. This module measures the allowance and
 * clears only what is provably unused.
 */

import { pruneUnusedVideos, storedVideoBytes } from "./custom-video";
import { vaultBytes } from "./render-vault";
import { clearStaleRenderScratch, formatStorageBytes } from "./render-output-store";

export { formatStorageBytes };

export interface StorageSnapshot {
  /** Bytes the whole origin occupies. */
  usage: number;
  /** Bytes the browser will let this origin use. */
  quota: number;
  /** Bytes still available. */
  free: number;
  /** 0–1, for a meter. */
  usedRatio: number;
}

/** The origin's allowance, or `null` where the browser will not say. */
export async function storageSnapshot(): Promise<StorageSnapshot | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    const quota = Number(estimate?.quota) || 0;
    if (quota <= 0) return null;
    const usage = Math.max(0, Number(estimate?.usage) || 0);
    return {
      usage,
      quota,
      free: Math.max(0, quota - usage),
      usedRatio: Math.min(1, usage / quota),
    };
  } catch {
    return null;
  }
}

export interface StorageBreakdown {
  snapshot: StorageSnapshot | null;
  /** Finished renders waiting in the Vault. */
  vaultBytes: number;
  /** Uploaded clips kept for saved projects. */
  uploadBytes: number;
}

/** What this site is using, and the two pieces a customer can act on. */
export async function storageBreakdown(): Promise<StorageBreakdown> {
  const [snapshot, vault, uploads] = await Promise.all([
    storageSnapshot(),
    vaultBytes().catch(() => 0),
    storedVideoBytes(),
  ]);
  return { snapshot, vaultBytes: vault, uploadBytes: uploads };
}

/**
 * One line that answers "what happened to my disk?".
 *
 * The Vault is named first because it is normally the largest thing here and
 * the only part the customer can delete deliberately — a finished render they
 * have already downloaded is theirs to remove, and removing it is what makes
 * room for the footage they are trying to upload now.
 */
export function describeBreakdown(breakdown: StorageBreakdown): string {
  const { snapshot } = breakdown;
  if (!snapshot) return "";
  const head = `Scenering is using ${formatStorageBytes(snapshot.usage)} of the ${formatStorageBytes(snapshot.quota)} this browser allows (${formatStorageBytes(snapshot.free)} free).`;
  const parts: string[] = [];
  if (breakdown.vaultBytes > 0) {
    parts.push(`finished renders in the Vault: ${formatStorageBytes(breakdown.vaultBytes)}`);
  }
  if (breakdown.uploadBytes > 0) {
    parts.push(`uploaded clips: ${formatStorageBytes(breakdown.uploadBytes)}`);
  }
  const detail = parts.length > 0 ? ` Of that, ${parts.join("; ")}.` : "";
  const action = breakdown.vaultBytes > 0
    ? " Delete renders you have already downloaded from the Vault to free the most space."
    : "";
  return `${head}${detail}${action}`;
}

export interface SpaceCleanup {
  /** Bytes the origin's usage dropped by, measured before and after. */
  freedBytes: number;
  /** Unreferenced uploads removed. */
  removedUploads: number;
  /** Abandoned `.part` render files removed. */
  removedScratchFiles: number;
}

/**
 * Clears what this site can prove it no longer needs:
 *
 *  - uploaded clips that no saved project references (never one in use, and
 *    never one uploaded in this session);
 *  - `.part` render files older than an hour, left by renders that never
 *    finished.
 *
 * It deliberately does NOT touch finished renders in the Vault, generated
 * voiceovers, or images/music a project points at: those are the customer's
 * work, and deleting them to make room is their decision, not a side effect of
 * an upload. The message names the Vault so they can clear it themselves.
 */
export async function releaseSceneringSpace(): Promise<SpaceCleanup> {
  const before = await storageSnapshot();

  let removedUploads = 0;
  try {
    removedUploads = await pruneUnusedVideos();
  } catch {
    /* storage unavailable or blocked; the scratch sweep may still help */
  }

  let scratchFiles = 0;
  try {
    const scratch = await clearStaleRenderScratch();
    scratchFiles = scratch.files;
  } catch {
    /* OPFS unavailable in this browser */
  }

  const after = await storageSnapshot();
  const freedBytes = before && after ? Math.max(0, before.usage - after.usage) : 0;

  return { freedBytes, removedUploads, removedScratchFiles: scratchFiles };
}

/**
 * A sentence fit to print after a cleanup: what was cleared, and whether it
 * made a noticeable difference.
 */
export function describeCleanup(result: SpaceCleanup): string {
  const parts: string[] = [];
  if (result.removedUploads > 0) {
    parts.push(`${result.removedUploads} unused upload${result.removedUploads === 1 ? "" : "s"}`);
  }
  if (result.removedScratchFiles > 0) {
    parts.push(
      `${result.removedScratchFiles} abandoned render file${result.removedScratchFiles === 1 ? "" : "s"}`,
    );
  }
  if (parts.length === 0) {
    return "Nothing left to clear — Scenering is not holding unused files on this device. Free space in the device's own settings, or delete finished videos from the Vault.";
  }
  const cleared = parts.join(" and ");
  if (result.freedBytes > 0) {
    return `Freed ${formatStorageBytes(result.freedBytes)}: ${cleared}. You can try the upload again now.`;
  }
  return `Cleared ${cleared}. If the upload still will not fit, free space in the device's own settings or delete finished videos from the Vault.`;
}
