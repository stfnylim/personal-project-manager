import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionRow, TaskOp, TaskRow } from './api';
import { taskPrompt } from './prompts';

const STATUS_VALUES = ['active', 'blocked', 'backlog', 'done'];
const URGENCY_VALUES = ['high', 'medium', 'low'];

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

/** A badge whose label is a native select — used for dashboard-editable fields.
 *  The select is controlled by the data, so a failed write snaps back on rerender. */
function BadgeSelect({
  value,
  values,
  kindMap,
  label,
  onChange,
}: {
  value: string;
  values: string[];
  kindMap: Record<string, string>;
  label: string;
  onChange: (value: string) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const known = values.includes(value);
  return (
    <span className={`badge badge-${kindMap[value] ?? 'muted'}`}>
      <span className="dot" aria-hidden />
      <select
        className="status-select"
        aria-label={label}
        value={known ? value : ''}
        disabled={busy}
        onChange={(e) => {
          setBusy(true);
          void onChange(e.target.value).finally(() => setBusy(false));
        }}
      >
        {!known && <option value="">{value || 'unknown'}</option>}
        {values.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </span>
  );
}

export function StatusControl({ status, onChange }: { status: string; onChange?: (v: string) => Promise<boolean> }) {
  if (!onChange) return <StatusBadge status={status} />;
  return <BadgeSelect value={status} values={STATUS_VALUES} kindMap={STATUS_KIND} label="Project status" onChange={onChange} />;
}

export function UrgencyControl({ urgency, onChange }: { urgency: string; onChange?: (v: string) => Promise<boolean> }) {
  if (!onChange) return <UrgencyBadge urgency={urgency} />;
  return <BadgeSelect value={urgency} values={URGENCY_VALUES} kindMap={URGENCY_KIND} label="Project urgency" onChange={onChange} />;
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

/** Copies text to the clipboard with a brief "copied" confirmation. */
export function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard API unavailable (older browser / odd context) — textarea fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1600);
  };
  return (
    <button className={done ? 'copied' : undefined} onClick={() => void copy()}>
      {done ? 'copied ✓' : label}
    </button>
  );
}

/** One brain-curated action: search/url open a tab, chat copies a kickoff prompt. */
export function ActionButton({ action }: { action: ActionRow }) {
  if (action.type === 'chat') {
    return <CopyButton label={action.label} text={taskPrompt(action.project, action.payload)} />;
  }
  const href =
    action.type === 'search'
      ? `https://www.google.com/search?q=${encodeURIComponent(action.payload)}`
      : action.payload;
  if (action.type === 'url' && !/^https:\/\//.test(href)) return null;
  return (
    <button title={action.type === 'search' ? `search: ${action.payload}` : href} onClick={() => window.open(href, '_blank', 'noopener')}>
      {action.label} ↗
    </button>
  );
}

/** One task row: tri-state glyph, text, state/delete controls (write builds only), start button. */
export function TaskItem({
  t,
  onTask,
}: {
  t: TaskRow;
  onTask?: (op: TaskOp, state?: string) => Promise<boolean>;
}) {
  const cls = t.done === 'done' ? 'task-done' : t.done === 'wip' ? 'task-wip' : undefined;
  const glyph = t.done === 'done' ? '☑' : t.done === 'wip' ? '◐' : '☐';
  return (
    <li className={cls}>
      <span className="task-box" aria-hidden>
        {glyph}
      </span>
      <span className="task-text">{t.task}</span>
      {onTask && (
        <span className="task-ctl">
          {t.done === 'open' && (
            <button title="mark in progress" onClick={() => void onTask('task_state', 'wip')}>
              ▶
            </button>
          )}
          <button
            className="danger"
            title="delete this task"
            onClick={() => {
              if (window.confirm(`Delete task: "${t.task}"?`)) void onTask('task_delete');
            }}
          >
            ✕
          </button>
        </span>
      )}
      {t.done !== 'done' && <CopyButton label="start" text={taskPrompt(t.project, t.task)} />}
    </li>
  );
}

/** Opens the project's code folder in VS Code (vscode:// deep link). */
export function RepoLink({ repo }: { repo?: string }) {
  if (!repo) return null;
  const href = `vscode://file/${repo.replace(/\\/g, '/')}`;
  return (
    <a className="repo-link" href={href} title={repo}>
      open repo in VS Code
    </a>
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
