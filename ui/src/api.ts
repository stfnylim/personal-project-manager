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
  done: string; // 'done' | 'open'
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

export interface Endpoint {
  url: string;
  token: string;
  /** Present only in local builds (baked from config.work.json) — enables edits. */
  writeSecret?: string;
}

/** Injected by vite.config.ts from config.work.json for local builds; null in hosted/CI builds. */
declare const __PM_ENDPOINT__: Endpoint | null;

const KEY = 'pm-endpoint';

/** Endpoint priority: ?src=…&token=… (stored, then scrubbed) → baked-in → localStorage. */
export function loadEndpoint(): Endpoint | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');
    const token = params.get('token');
    if (src && token) {
      const ep: Endpoint = { url: src, token };
      saveEndpoint(ep);
      // ?stay=1 keeps the credentials in the URL instead of scrubbing them —
      // for iframe embeds (e.g. a Notion embed block) where localStorage may not
      // survive between visits. Only use stay-links inside private pages.
      if (!params.get('stay')) {
        history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      return ep;
    }
  } catch {
    /* ignore */
  }
  const baked = typeof __PM_ENDPOINT__ === 'undefined' ? null : __PM_ENDPOINT__;
  if (baked) return baked;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ep = JSON.parse(raw) as Endpoint;
      if (ep && ep.url && ep.token) return ep;
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

export function saveEndpoint(ep: Endpoint): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ep));
  } catch {
    /* storage unavailable — session-only connection */
  }
}

export function clearEndpoint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchData(ep: Endpoint): Promise<PmData> {
  const res = await fetch(`${ep.url}?token=${encodeURIComponent(ep.token)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as PmData;
  if (!data.ok) throw new Error(data.error || 'endpoint returned an error');
  return data;
}

export type EditableField = 'status' | 'urgency';

/** Queue a field change via the webhook. The sheet cell updates immediately;
 *  the sync applies it to project.md (+ log entry) on its next run. */
export async function setProjectField(
  ep: Endpoint,
  projectId: string,
  field: EditableField,
  value: string,
): Promise<void> {
  if (!ep.writeSecret) throw new Error('this connection is read-only');
  const res = await fetch(ep.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: ep.writeSecret, action: 'setField', projectId, field, value }),
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
