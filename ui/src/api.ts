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
}

export interface Update {
  timestamp: string;
  project: string;
  entry: string;
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
  brief: Brief | null;
  lastSync: string;
}

export interface Endpoint {
  url: string;
  token: string;
}

const KEY = 'pm-endpoint';

/** Endpoint from ?src=…&token=… (stored, then scrubbed from the URL) or localStorage. */
export function loadEndpoint(): Endpoint | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');
    const token = params.get('token');
    if (src && token) {
      const ep: Endpoint = { url: src, token };
      saveEndpoint(ep);
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      return ep;
    }
  } catch {
    /* ignore */
  }
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

export function daysSince(ts: string): number | null {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const then = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor((Date.now() - then.getTime()) / 86400000);
}
