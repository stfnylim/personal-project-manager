export interface Project {
  id: string;
  name: string;
  status: string;
  horizon: string;
  urgency: string;
  progress: string; // "3/9"
  summary: string;
  last_update: string;
  issues: string;
  repo?: string;
}

export interface Update {
  timestamp: string;
  project: string;
  entry: string;
}

export interface TaskRow {
  project: string;
  done: string; // 'done' | 'wip' | 'open'
  task: string;
}

export interface ActionRow {
  project: string;
  label: string;
  type: string; // 'search' | 'url' | 'chat'
  payload: string;
}

export interface Brief {
  generated: string;
  markdown: string;
}

export interface PmData {
  ok: boolean;
  error?: string;
  projects: Project[];
  updates: Update[];
  tasks?: TaskRow[]; // absent until the Apps Script is redeployed with the Tasks tab
  actions?: ActionRow[];
  actionsGenerated?: string;
  brief: Brief | null;
  lastSync: string;
}

/** One connected PM instance (its own sheet + endpoint). The dashboard merges
 *  any number of these client-side; the instances share no data server-side. */
export interface Source {
  id: string; // slug of label — stable key, also used in #/p/<src>/<id> routes
  label: string; // "Work", "Life"
  url: string;
  token: string;
  /** Present only for baked local builds (or typed in) — enables edits on this source. */
  writeSecret?: string;
  /** That machine's projects folder — used to compose chat prompts for this source. */
  projectsDir?: string;
}

/** A row tagged with the source it came from (merged views). */
export type Tagged<T> = T & { srcId: string };

/** Injected by vite.config.ts from PM_CONFIG (comma-separable) for local builds; null in hosted/CI builds. */
declare const __PM_SOURCES__: Source[] | null;

const KEY = 'pm-sources';
const LEGACY_KEY = 'pm-endpoint';

export function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'pm'
  );
}

function loadStored(): Source[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const list = JSON.parse(raw) as Source[];
      if (Array.isArray(list)) return list.filter((s) => s && s.url && s.token && s.id);
    }
    // one-time migration from the single-endpoint era
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const ep = JSON.parse(legacy) as { url?: string; token?: string; writeSecret?: string };
      localStorage.removeItem(LEGACY_KEY);
      if (ep && ep.url && ep.token) {
        const migrated: Source[] = [{ id: 'pm', label: 'PM', url: ep.url, token: ep.token, writeSecret: ep.writeSecret }];
        saveStored(migrated);
        return migrated;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return [];
}

function saveStored(list: Source[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — session-only */
  }
}

function bakedSources(): Source[] {
  return typeof __PM_SOURCES__ === 'undefined' || !__PM_SOURCES__ ? [] : __PM_SOURCES__;
}

/** Sources named in the URL: repeated ?src=…&token=…&label=… triples add several
 *  at once (params are zipped in order). ?stay=1 keeps them in the URL for
 *  iframe embeds (e.g. Notion) where localStorage may not survive between visits. */
function paramSources(): Source[] {
  try {
    const params = new URLSearchParams(window.location.search);
    const urls = params.getAll('src');
    const tokens = params.getAll('token');
    const labels = params.getAll('label');
    const list: Source[] = [];
    urls.forEach((url, i) => {
      const token = tokens[i];
      if (!url || !token) return;
      const label = labels[i] || `PM ${i + 1}`;
      list.push({ id: slugify(label), label, url, token });
    });
    if (list.length && !params.get('stay')) {
      history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
    return list;
  } catch {
    return [];
  }
}

/** Baked sources first (they carry write secrets), then stored, then URL params —
 *  deduped by endpoint URL, earlier wins. Param sources are persisted so a
 *  one-time link keeps working on later visits. */
export function loadSources(): Source[] {
  const baked = bakedSources();
  const stored = loadStored();
  const fromParams = paramSources();
  const merged: Source[] = [];
  const seen = new Set<string>();
  for (const s of [...baked, ...stored, ...fromParams]) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    // avoid id collisions between instances that picked the same label
    let id = s.id;
    let n = 2;
    while (merged.some((m) => m.id === id)) id = `${s.id}-${n++}`;
    merged.push({ ...s, id });
  }
  const newStored = merged.filter((s) => !baked.some((b) => b.url === s.url));
  if (newStored.length !== stored.length) saveStored(newStored);
  return merged;
}

/** Persist a runtime-added source. Baked sources live in the built file, not storage. */
export function addSource(s: Source): Source[] {
  const stored = loadStored();
  if (!stored.some((x) => x.url === s.url)) saveStored([...stored, s]);
  return loadSources();
}

export function removeSource(id: string): Source[] {
  saveStored(loadStored().filter((s) => s.id !== id));
  return loadSources();
}

export function isBaked(s: Source): boolean {
  return bakedSources().some((b) => b.url === s.url);
}

export function clearStoredSources(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchData(src: Source): Promise<PmData> {
  const res = await fetch(`${src.url}?token=${encodeURIComponent(src.token)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as PmData;
  if (!data.ok) throw new Error(data.error || 'endpoint returned an error');
  return data;
}

export type EditableField = 'status' | 'urgency';

/** Queue a field change via the source's webhook. The sheet cell updates immediately;
 *  that instance's sync applies it to project.md (+ log entry) on its next run. */
export async function setProjectField(
  src: Source,
  projectId: string,
  field: EditableField,
  value: string,
): Promise<void> {
  if (!src.writeSecret) throw new Error('this connection is read-only');
  const res = await fetch(src.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: src.writeSecret, action: 'setField', projectId, field, value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || 'write failed');
}

export type TaskOp = 'task_state' | 'task_delete';

/** Queue a task edit (re-state or delete). The sheet's Tasks tab updates immediately;
 *  the sync applies it to project.md on its next run. Tasks are matched by exact text. */
export async function sendTaskChange(
  src: Source,
  projectId: string,
  op: TaskOp,
  text: string,
  state?: string,
): Promise<void> {
  if (!src.writeSecret) throw new Error('this connection is read-only');
  const value = JSON.stringify(state ? { text, state } : { text });
  const res = await fetch(src.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: src.writeSecret, action: 'setField', projectId, field: op, value }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error || 'write failed');
}

export function daysSince(ts: string): number | null {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}

export function projHref(srcId: string, projectId: string): string {
  return `#/p/${encodeURIComponent(srcId)}/${encodeURIComponent(projectId)}`;
}
