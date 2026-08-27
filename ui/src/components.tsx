import type { ReactNode } from 'react';

// Status colors are reserved roles (dataviz status palette); every badge pairs
// the color dot with a text label so meaning never rides on color alone.
const STATUS_KIND: Record<string, string> = {
  active: 'accent',
  blocked: 'serious',
  backlog: 'muted',
  done: 'good',
};
const URGENCY_KIND: Record<string, string> = {
  high: 'critical',
  medium: 'warning',
  low: 'muted',
};

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <span className={`badge badge-${kind}`}>
      <span className="dot" aria-hidden />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge kind={STATUS_KIND[status] ?? 'muted'}>{status || 'unknown'}</Badge>;
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return <Badge kind={URGENCY_KIND[urgency] ?? 'muted'}>{urgency || '—'}</Badge>;
}

export function ProgressBar({ progress }: { progress: string }) {
  const m = progress.match(/^(\d+)\/(\d+)$/);
  const pct = m && Number(m[2]) > 0 ? Math.round((Number(m[1]) / Number(m[2])) * 100) : 0;
  return (
    <span className="progress" title={m ? `${pct}% of tasks done` : 'no tasks'}>
      <span className="progress-track">
        <span className="progress-fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="progress-label mono">{m ? progress : '—'}</span>
    </span>
  );
}

export function StatTile({ label, value, kind }: { label: string; value: number | string; kind?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">
        {kind ? <span className={`dot dot-${kind}`} aria-hidden /> : null}
        {label}
      </div>
    </div>
  );
}
