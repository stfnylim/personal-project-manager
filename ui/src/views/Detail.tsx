import type { EditableField, Source, TaskOp } from '../api';
import type { SourceState } from '../App';
import { CopyButton, ProgressBar, RepoLink, SrcTag, StatusControl, TaskItem, UrgencyControl } from '../components';
import { addProjectPrompt, taskStartPrompt } from '../prompts';

export function Detail({
  states,
  sources,
  path,
  setField,
  taskChange,
}: {
  states: SourceState[];
  sources: Source[];
  /** route remainder after #/p/ — "<srcId>/<projectId>" (or a bare legacy "<projectId>") */
  path: string;
  setField: (srcId: string, projectId: string, field: EditableField, value: string) => Promise<boolean>;
  taskChange: (srcId: string, projectId: string, text: string, op: TaskOp, state?: string) => Promise<boolean>;
}) {
  const slash = path.indexOf('/');
  let srcId = slash > 0 ? decodeURIComponent(path.slice(0, slash)) : '';
  let id = decodeURIComponent(slash > 0 ? path.slice(slash + 1) : path);

  let st = states.find((s) => s.source.id === srcId);
  if (!st) {
    // legacy or truncated link: find the project by id across sources
    st = states.find((s) => s.data?.projects.some((p) => p.id === id));
    if (st) srcId = st.source.id;
  }
  const p = st?.data?.projects.find((x) => x.id === id);
  const entries = (st?.data?.updates ?? [])
    .filter((u) => u.project === id)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  if (!p || !st) {
    return (
      <div className="card">
        <p>No project "{id}".</p>
        <p>
          <a href="#/projects">← All projects</a>
        </p>
      </div>
    );
  }

  const source = st.source;
  const canWrite = Boolean(source.writeSecret);
  const multi = sources.length > 1;
  const tasks = (st.data?.tasks ?? []).filter((t) => t.project === id);

  return (
    <div className="stack">
      <a className="back" href="#/projects">
        ← All projects
      </a>
      <section className="card">
        <div className="card-head detail-head">
          <h2>{p.name}</h2>
          <span className="badges">
            {multi && <SrcTag source={source} sources={sources} />}
            <StatusControl status={p.status} onChange={canWrite ? (v) => setField(srcId, p.id, 'status', v) : undefined} />
            <UrgencyControl urgency={p.urgency} onChange={canWrite ? (v) => setField(srcId, p.id, 'urgency', v) : undefined} />
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
          <CopyButton label="chat prompt for this project" text={addProjectPrompt(source.projectsDir, p.id)} />
          <RepoLink repo={p.repo} />
        </div>
      </section>
      {tasks.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Tasks</h2>
            <span className="meta">start copies a kickoff prompt for that task</span>
          </div>
          <ul className="task-list">
            {tasks.map((t, i) => (
              <TaskItem
                key={i}
                t={t}
                dir={source.projectsDir}
                startText={taskStartPrompt(
                  {
                    project: p,
                    updates: st.data?.updates.filter((u) => u.project === id) ?? [],
                    openSiblings: tasks.filter((x) => x.done !== 'done' && x.task !== t.task).map((x) => x.task),
                    dir: source.projectsDir,
                  },
                  t.task,
                )}
                onTask={canWrite ? (op, state) => taskChange(srcId, id, t.task, op, state) : undefined}
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
