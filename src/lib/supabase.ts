import { createClient } from "@supabase/supabase-js";
import type { Project, Scene } from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const EDGE_FUNCTION_BASE =
  supabaseUrl && supabaseUrl.startsWith("http")
    ? `${supabaseUrl}/functions/v1`
    : "/api";

// --- Local Storage Mock for Supabase ---
const STORAGE_KEY_PROJECTS = "scenering_projects_v1";
const STORAGE_KEY_SCENES = "scenering_scenes_v1";

function loadStorage<T>(key: string, fallback: T[] = []): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveStorage<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

class MockQueryBuilder<T extends Record<string, any>> implements PromiseLike<{ data: any; error: any }> {
  private tableName: string;
  private action: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private insertData: any = null;
  private updateData: any = null;
  private filters: Array<(item: T) => boolean> = [];
  private orderComparator: ((a: T, b: T) => number) | null = null;
  private isSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_columns = "*") {
    // If it's already insert/update/upsert, select() just signals we want returned rows
    return this;
  }

  insert(values: any | any[]) {
    this.action = "insert";
    this.insertData = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: any | any[]) {
    this.action = "upsert";
    this.insertData = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: any) {
    this.action = "update";
    this.updateData = values;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((item: any) => String(item[column]) === String(value));
    return this;
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.orderComparator = (a: any, b: any) => {
      const valA = a[column];
      const valB = b[column];
      if (valA === valB) return 0;
      if (valA == null) return ascending ? 1 : -1;
      if (valB == null) return ascending ? -1 : 1;
      return ascending ? (valA > valB ? 1 : -1) : valA < valB ? 1 : -1;
    };
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  private execute(): { data: any; error: any } {
    const storageKey = this.tableName === "projects" ? STORAGE_KEY_PROJECTS : STORAGE_KEY_SCENES;
    let items = loadStorage<T>(storageKey);

    if (this.action === "insert") {
      const now = new Date().toISOString();
      const currentMaxId = items.reduce((max: number, item: any) => Math.max(max, typeof item.id === "number" ? item.id : 0), 0);
      let nextId = Math.max(Date.now(), currentMaxId + 1);

      const createdList: any[] = [];
      for (const val of this.insertData) {
        const item: any = {
          id: nextId++,
          created_at: now,
          updated_at: now,
          ...val,
        };
        items.push(item);
        createdList.push(item);
      }
      saveStorage(storageKey, items);

      return {
        data: this.isSingle ? (createdList[0] ?? null) : createdList,
        error: null,
      };
    }

    if (this.action === "upsert") {
      const now = new Date().toISOString();
      const currentMaxId = items.reduce((max: number, item: any) => Math.max(max, typeof item.id === "number" ? item.id : 0), 0);
      let nextId = Math.max(Date.now(), currentMaxId + 1);

      const resultList: any[] = [];
      for (const val of this.insertData) {
        const existingIdx = val.id != null ? items.findIndex((i: any) => String(i.id) === String(val.id)) : -1;
        if (existingIdx >= 0) {
          const updated = {
            ...items[existingIdx],
            ...val,
            updated_at: now,
          };
          items[existingIdx] = updated;
          resultList.push(updated);
        } else {
          const created = {
            id: val.id ?? nextId++,
            created_at: now,
            updated_at: now,
            ...val,
          };
          items.push(created);
          resultList.push(created);
        }
      }
      saveStorage(storageKey, items);

      return {
        data: this.isSingle ? (resultList[0] ?? null) : resultList,
        error: null,
      };
    }

    if (this.action === "update") {
      const now = new Date().toISOString();
      const updatedList: any[] = [];

      items = items.map((item: any) => {
        const matches = this.filters.every((fn) => fn(item));
        if (matches) {
          const updated = {
            ...item,
            ...this.updateData,
            updated_at: now,
          };
          updatedList.push(updated);
          return updated;
        }
        return item;
      }) as any;

      saveStorage(storageKey, items);

      return {
        data: this.isSingle ? (updatedList[0] ?? null) : updatedList,
        error: null,
      };
    }

    if (this.action === "delete") {
      const beforeCount = items.length;
      const matchedIds: number[] = [];
      items = items.filter((item: any) => {
        const matches = this.filters.every((fn) => fn(item));
        if (matches) matchedIds.push(item.id);
        return !matches;
      });

      if (items.length !== beforeCount) {
        saveStorage(storageKey, items);

        // If deleting a project, also cascade-delete scenes for that project
        if (this.tableName === "projects" && matchedIds.length > 0) {
          const scenes = loadStorage<Scene>(STORAGE_KEY_SCENES);
          const matchedIdStrings = matchedIds.map(String);
          const remainingScenes = scenes.filter((s) => !matchedIdStrings.includes(String(s.project_id)));
          const deletedScenes = scenes.filter((s) => matchedIdStrings.includes(String(s.project_id)));
          saveStorage(STORAGE_KEY_SCENES, remainingScenes);

          // Deep clean all associated project settings, inserts, and scene metadata from localStorage
          for (const pid of matchedIds) {
            try {
              localStorage.removeItem(`scenering_inserts_${pid}`);
              localStorage.removeItem(`scenering_project_settings_${pid}`);
              localStorage.removeItem(`scenering_project_script_${pid}`);
              localStorage.removeItem(`scenering_project_title_${pid}`);
              localStorage.removeItem(`scenering_project_${pid}_scenes`);
              localStorage.removeItem(`scenering_project_${pid}_credits`);
            } catch {}
          }
          for (const ds of deletedScenes) {
            try {
              localStorage.removeItem(`scenering_scene_meta_${ds.id}`);
              localStorage.removeItem(`scenering_project_${ds.project_id}_scene_meta_${ds.id}`);
            } catch {}
          }
        }
      }

      return { data: null, error: null };
    }

    // Default: select
    let filtered = items.filter((item) => this.filters.every((fn) => fn(item)));
    if (this.orderComparator) {
      filtered = [...filtered].sort(this.orderComparator);
    }

    if (this.isSingle) {
      return { data: filtered[0] ?? null, error: null };
    }

    return { data: filtered, error: null };
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    try {
      const result = this.execute();
      const value = onfulfilled ? onfulfilled(result) : (result as any);
      return Promise.resolve(value);
    } catch (err) {
      if (onrejected) {
        return Promise.resolve(onrejected(err));
      }
      return Promise.reject(err);
    }
  }
}

const mockSupabase = {
  from(tableName: "projects" | "scenes") {
    return new MockQueryBuilder(tableName);
  },
};

// Use real client if keys are provided, otherwise use localStorage-backed mock
export const supabase =
  supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http")
    ? createClient(supabaseUrl, supabaseAnonKey)
    : (mockSupabase as any);
