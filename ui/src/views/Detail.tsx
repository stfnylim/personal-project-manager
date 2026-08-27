import type { EditableField, PmData } from '../api';
import { CopyButton, ProgressBar, StatusControl, UrgencyControl } from '../components';
import { addProjectPrompt } from '../prompts';

export function Detail({
  data,
  id,
  canWrite,
  setField,
}: {
  data: PmData;
  id: string;
  canWrite: boolean;
  setField: (projectId: string, field: EditableField, value: string) => Promise<boolean>;
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
            <StatusControl status={p.status} onChange={canWrite ? (v) => setField(p.id, 'status', v) : undefined} />
            <UrgencyControl urgency={p.urgency} onChange={canWrite ? (v) => setField(p.id, 'urgency', v) : undefined} />
            {p.horizon && <span className="chip chip-static">{p.horizon} term</span>}
          </span>
        </div>
        <p>{p.summary}</p>
        <ProgressBar progress={p.progress} />
        {p.issues && <p className="issues">⚠ {p.issues}</p>}
        <p className="meta">
          id: {p.id} · last update {p.last_update}
        </p>
        <div className="prompt-row">
          <CopyButton label="copy chat prompt for this project" text={addProjectPrompt(p.id)} />
        </div>
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
