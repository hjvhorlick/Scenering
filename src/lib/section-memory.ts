import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Per-project memory of the choices made inside each section.
 *
 * The owner's rule (2026-10-16): "the application must remember the last
 * choice made in any section", so the user can go forward and backward as they
 * want. Project settings and scene edits already have their own stores; this
 * holds the choices that used to live only while a section was on screen —
 * two-voice rotation, Voice B, the sample speed, which tab, shelf or panel was
 * open — so leaving a section and coming back, or reloading, finds them as
 * they were.
 *
 * One localStorage entry per project. Every value is validated when it is read
 * back, so a stale or corrupt entry falls back to the default instead of
 * breaking a screen. Without a project there is nothing to remember into.
 */

export const SECTION_MEMORY_PREFIX = "scenering_section_memory_";

export type SectionId = "setup" | "voiceover" | "captions" | "studio" | "render";
type ProjectKey = number | string | null | undefined;
type Memory = Record<string, Record<string, unknown>>;

export function sectionMemoryKey(projectId: number | string): string {
  return `${SECTION_MEMORY_PREFIX}${projectId}`;
}

function hasProject(projectId: ProjectKey): projectId is number | string {
  return projectId !== null && projectId !== undefined && projectId !== "";
}

function readMemory(projectId: number | string): Memory {
  try {
    const parsed = JSON.parse(localStorage.getItem(sectionMemoryKey(projectId)) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Memory) : {};
  } catch {
    return {};
  }
}

/** The remembered value, or `fallback` when there is none or it is not valid any more. */
export function recallChoice<T>(
  projectId: ProjectKey,
  section: SectionId,
  field: string,
  fallback: T,
  isValid: (value: unknown) => value is T
): T {
  if (!hasProject(projectId)) return fallback;
  const sectionMemory = readMemory(projectId)[section];
  if (!sectionMemory || typeof sectionMemory !== "object") return fallback;
  const value = (sectionMemory as Record<string, unknown>)[field];
  return isValid(value) ? value : fallback;
}

export function rememberChoice(projectId: ProjectKey, section: SectionId, field: string, value: unknown): void {
  if (!hasProject(projectId)) return;
  try {
    const memory = readMemory(projectId);
    const sectionMemory = memory[section] && typeof memory[section] === "object" ? memory[section] : {};
    memory[section] = { ...sectionMemory, [field]: value };
    localStorage.setItem(sectionMemoryKey(projectId), JSON.stringify(memory));
  } catch {
    /* storage full or unavailable: the choice still applies on screen */
  }
}

/** Removes a deleted project's memory. */
export function forgetSectionMemory(projectId: number | string): void {
  try {
    localStorage.removeItem(sectionMemoryKey(projectId));
  } catch {}
}

/* ---- validators for remembered values ---------------------------------- */

export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export function oneOf<T extends string | number>(allowed: readonly T[]) {
  return (value: unknown): value is T => allowed.includes(value as T);
}

export function numberBetween(min: number, max: number) {
  return (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/**
 * `useState`, remembered per project: the section starts from the last choice
 * made in it and every change is written back. Switching project loads that
 * project's own choices.
 */
export function useRememberedChoice<T>(
  projectId: ProjectKey,
  section: SectionId,
  field: string,
  fallback: T,
  isValid: (value: unknown) => value is T
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => recallChoice(projectId, section, field, fallback, isValid));
  const latest = useRef(value);
  latest.current = value;

  const loadedFor = useRef(projectId);
  useEffect(() => {
    if (loadedFor.current === projectId) return;
    loadedFor.current = projectId;
    const recalled = recallChoice(projectId, section, field, fallback, isValid);
    latest.current = recalled;
    setValue(recalled);
    // Only a project switch reloads; fallback/isValid are fixed per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (previous: T) => T)(latest.current) : next;
      latest.current = resolved;
      setValue(resolved);
      rememberChoice(projectId, section, field, resolved);
    },
    [projectId, section, field]
  );

  return [value, update];
}
