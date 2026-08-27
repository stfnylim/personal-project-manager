import type { PmData } from '../api';
import { ProgressBar, StatusControl, UrgencyBadge } from '../components';

export function Detail({
  data,
  id,
  canWrite,
  setStatus,
}: {
  data: PmData;
  id: string;
  canWrite: boolean;
  setStatus: (projectId: string, status: string) => Promise<boolean>;
}) {
  const p = data.projects.find((x) => x.id === id);
  const entries = data.updates
    .filter((u) => u.project === id)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  if (!p) {
    return (
      <div className="card">
        <p>No project "{id}".</p>
        <p>
          <a href="#/projects">← All projects</a>
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <a className="back" href="#/projects">
        ← All projects
      </a>
      <section className="card">
        <div className="card-head detail-head">
          <h2>{p.name}</h2>
          <span className="badges">
            <StatusControl status={p.status} onChange={canWrite ? (s) => setStatus(p.id, s) : undefined} />
            <UrgencyBadge urgency={p.urgency} />
            {p.horizon && <span className="chip chip-static">{p.horizon} term</span>}
          </span>
        </div>
        <p>{p.summary}</p>
        <ProgressBar progress={p.progress} />
        {p.issues && <p className="issues">⚠ {p.issues}</p>}
        <p className="meta">
          id: {p.id} · last update {p.last_update}
        </p>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Log</h2>
          <span className="meta">newest first</span>
        </div>
        {entries.length === 0 && <p className="meta">No log entries.</p>}
        <div className="timeline">
          {entries.map((u, i) => (
            <div className="entry" key={i}>
              <div className="entry-ts meta mono">{u.timestamp}</div>
              <div className="entry-text">{u.entry}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
