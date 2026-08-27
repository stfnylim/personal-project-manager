import type { PmData, Project, TaskOp } from '../api';
import { daysSince } from '../api';
import { Markdown } from '../markdown';
import { ActionButton, StatTile, StatusBadge, TaskItem, UrgencyBadge } from '../components';

function ProjectRow({ p, note }: { p: Project; note?: string }) {
  return (
    <li className="row">
      <a href={`#/p/${encodeURIComponent(p.id)}`}>{p.name}</a>
      <StatusBadge status={p.status} />
      <UrgencyBadge urgency={p.urgency} />
      {note && <span className="meta">{note}</span>}
    </li>
  );
}

export function Home({
  data,
  canWrite,
  taskChange,
}: {
  data: PmData;
  canWrite: boolean;
  taskChange: (projectId: string, text: string, op: TaskOp, state?: string) => Promise<boolean>;
}) {
  const count = (s: string) => data.projects.filter((p) => p.status === s).length;
  const attention = data.projects.filter(
    (p) => p.status === 'blocked' || (p.status === 'active' && p.urgency === 'high'),
  );
  const stale = data.projects.filter(
    (p) => p.status !== 'done' && (daysSince(p.last_update) ?? 0) > 7,
  );
  const broken = data.projects.filter((p) => p.issues);
  const latest = [...data.updates]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 5);

  const openTasks = (data.tasks ?? []).filter((t) => t.done !== 'done');
  const projectsWithOpen = [...new Set(openTasks.map((t) => t.project))];

  return (
    <div className="home-grid">
    <div className="stack home-main">
      <section className="card">
        <div className="card-head">
          <h2>Summary</h2>
          {data.brief?.generated && <span className="meta">generated {data.brief.generated}</span>}
        </div>
        {data.brief?.markdown ? <Markdown text={data.brief.markdown} /> : <p className="meta">No brief yet.</p>}
      </section>

      <div className="tiles">
        <StatTile label="active" value={count('active')} kind="accent" />
        <StatTile label="blocked" value={count('blocked')} kind="serious" />
        <StatTile label="backlog" value={count('backlog')} kind="muted" />
        <StatTile label="done" value={count('done')} kind="good" />
      </div>

      {attention.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Needs attention</h2>
            <span className="meta">blocked, or active + high urgency</span>
          </div>
          <ul className="plain-list">
            {attention.map((p) => (
              <ProjectRow key={p.id} p={p} />
            ))}
          </ul>
        </section>
      )}

      {stale.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Gone quiet</h2>
            <span className="meta">no log entry in over a week</span>
          </div>
          <ul className="plain-list">
            {stale.map((p) => (
              <ProjectRow key={p.id} p={p} note={`${daysSince(p.last_update)} days`} />
            ))}
          </ul>
        </section>
      )}

      {broken.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>File issues</h2>
            <span className="meta">the sync couldn't fully parse these</span>
          </div>
          <ul className="plain-list">
            {broken.map((p) => (
              <li className="row" key={p.id}>
                <a href={`#/p/${encodeURIComponent(p.id)}`}>{p.name}</a>
                <span className="issues">⚠ {p.issues}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Latest activity</h2>
        </div>
        {latest.length === 0 && <p className="meta">No updates yet.</p>}
        <ul className="plain-list">
          {latest.map((u, i) => (
            <li className="activity-row" key={i}>
              <span className="meta mono">{u.timestamp}</span>
              <a href={`#/p/${encodeURIComponent(u.project)}`}>{u.project}</a>
              <span className="activity-entry">{u.entry.split('\n')[0]}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>

    <aside className="home-rail">
      <section className="card">
        <div className="card-head">
          <h2>Next actions</h2>
          {data.actionsGenerated && <span className="meta">curated {data.actionsGenerated}</span>}
        </div>
        {(data.actions ?? []).length === 0 && (
          <p className="meta">Nothing curated yet — the PM brain adds actions on its next run.</p>
        )}
        {[...new Set((data.actions ?? []).map((a) => a.project))].map((proj) => (
          <div className="action-group" key={proj}>
            <a className="action-project" href={`#/p/${encodeURIComponent(proj)}`}>
              {proj}
            </a>
            <div className="prompt-row">
              {(data.actions ?? [])
                .filter((a) => a.project === proj)
                .map((a, i) => (
                  <ActionButton key={i} action={a} />
                ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Open tasks</h2>
          <span className="meta">{openTasks.length}</span>
        </div>
        {openTasks.length === 0 && <p className="meta">Nothing open.</p>}
        {projectsWithOpen.map((proj) => (
          <div className="action-group" key={proj}>
            <a className="action-project" href={`#/p/${encodeURIComponent(proj)}`}>
              {proj}
            </a>
            <ul className="task-list">
              {openTasks
                .filter((t) => t.project === proj)
                .map((t, i) => (
                  <TaskItem
                    key={i}
                    t={t}
                    onTask={canWrite ? (op, state) => taskChange(t.project, t.task, op, state) : undefined}
                  />
                ))}
            </ul>
          </div>
        ))}
      </section>
    </aside>
    </div>
  );
}
