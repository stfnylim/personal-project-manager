import type { EditableField, PmData, TaskOp } from '../api';
import { CopyButton, ProgressBar, RepoLink, StatusControl, TaskItem, UrgencyControl } from '../components';
import { addProjectPrompt } from '../prompts';

export function Detail({
  data,
  id,
  canWrite,
  setField,
  taskChange,
}: {
  data: PmData;
  id: string;
  canWrite: boolean;
  setField: (projectId: string, field: EditableField, value: string) => Promise<boolean>;
  taskChange: (projectId: string, text: string, op: TaskOp, state?: string) => Promise<boolean>;
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
          <CopyButton label="chat prompt for this project" text={addProjectPrompt(p.id)} />
          <RepoLink repo={p.repo} />
        </div>
      </section>
      {(data.tasks ?? []).some((t) => t.project === id) && (
        <section className="card">
          <div className="card-head">
            <h2>Tasks</h2>
            <span className="meta">start copies a kickoff prompt for that task</span>
          </div>
          <ul className="task-list">
            {(data.tasks ?? [])
              .filter((t) => t.project === id)
              .map((t, i) => (
                <TaskItem
                  key={i}
                  t={t}
                  onTask={canWrite ? (op, state) => taskChange(id, t.task, op, state) : undefined}
                />
              ))}
          </ul>
        </section>
      )}
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
