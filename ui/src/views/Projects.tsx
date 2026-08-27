import { useState } from 'react';
import type { EditableField, Project, Source, Tagged } from '../api';
import { projHref } from '../api';
import type { SourceState } from '../App';
import { CopyButton, ProgressBar, SrcTag, StatusControl, UrgencyControl } from '../components';
import { taskStartPrompt } from '../prompts';

const STATUS_ORDER: Record<string, number> = { active: 0, blocked: 1, backlog: 2, done: 3 };
const URGENCY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
type SortCol = 'name' | 'status' | 'urgency' | 'progress' | 'last_update';

function pct(p: Project): number {
  const m = p.progress.match(/^(\d+)\/(\d+)$/);
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0;
}

export function Projects({
  states,
  sources,
  showSrc,
  setField,
}: {
  states: SourceState[];
  sources: Source[];
  showSrc: boolean;
  setField: (srcId: string, projectId: string, field: EditableField, value: string) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: 'last_update', dir: -1 });

  const projects: Tagged<Project>[] = states.flatMap((s) =>
    (s.data?.projects ?? []).map((p) => ({ ...p, srcId: s.source.id })),
  );
  const allTasks = states.flatMap((s) => (s.data?.tasks ?? []).map((t) => ({ ...t, srcId: s.source.id })));

  const statuses = ['all', 'active', 'blocked', 'backlog', 'done'];
  const count = (st: string) => (st === 'all' ? projects.length : projects.filter((p) => p.status === st).length);

  const cmp = (a: Tagged<Project>, b: Tagged<Project>): number => {
    switch (sort.col) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
        return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      case 'urgency':
        return (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9);
      case 'progress':
        return pct(a) - pct(b);
      default:
        return a.last_update < b.last_update ? -1 : a.last_update > b.last_update ? 1 : 0;
    }
  };
  const shown = projects.filter((p) => filter === 'all' || p.status === filter);
  shown.sort((a, b) => cmp(a, b) * sort.dir);

  const clickSort = (col: SortCol) =>
    setSort((s) =>
      s.col === col
        ? { col, dir: (s.dir * -1) as 1 | -1 }
        : { col, dir: col === 'last_update' || col === 'progress' ? -1 : 1 },
    );

  const arrow = (col: SortCol) => (sort.col === col ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');

  const srcOf = (id: string) => sources.find((s) => s.id === id);
  const canWrite = (id: string) => Boolean(srcOf(id)?.writeSecret);

  return (
    <div className="stack">
      <div className="filters" role="group" aria-label="Filter by status">
        {statuses.map((s) => (
          <button key={s} className={`chip ${filter === s ? 'chip-on' : ''}`} onClick={() => setFilter(s)}>
            {s} <span className="meta">{count(s)}</span>
          </button>
        ))}
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <button onClick={() => clickSort('name')}>Project{arrow('name')}</button>
              </th>
              <th>
                <button onClick={() => clickSort('status')}>Status{arrow('status')}</button>
              </th>
              <th>Horizon</th>
              <th>
                <button onClick={() => clickSort('urgency')}>Urgency{arrow('urgency')}</button>
              </th>
              <th>
                <button onClick={() => clickSort('progress')}>Progress{arrow('progress')}</button>
              </th>
              <th>
                <button onClick={() => clickSort('last_update')}>Last update{arrow('last_update')}</button>
              </th>
              <th>Next</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={`${p.srcId}/${p.id}`}>
                <td>
                  <div className="cell-name">
                    <a href={projHref(p.srcId, p.id)}>{p.name}</a>
                    {showSrc && <SrcTag source={srcOf(p.srcId)} sources={sources} />}
                    {p.issues && (
                      <span className="issues" title={p.issues}>
                        ⚠
                      </span>
                    )}
                  </div>
                  <div className="meta cell-summary">{p.summary}</div>
                </td>
                <td>
                  <StatusControl
                    status={p.status}
                    onChange={canWrite(p.srcId) ? (v) => setField(p.srcId, p.id, 'status', v) : undefined}
                  />
                </td>
                <td className="meta">{p.horizon}</td>
                <td>
                  <UrgencyControl
                    urgency={p.urgency}
                    onChange={canWrite(p.srcId) ? (v) => setField(p.srcId, p.id, 'urgency', v) : undefined}
                  />
                </td>
                <td>
                  <ProgressBar progress={p.progress} />
                </td>
                <td className="meta mono">{p.last_update}</td>
                <td className="next-cell">
                  {(() => {
                    const open = allTasks.filter((t) => t.srcId === p.srcId && t.project === p.id && t.done !== 'done');
                    const next = open.find((t) => t.done === 'wip') ?? open[0]; // prefer in-progress
                    if (!next) return null;
                    const src = states.find((s) => s.source.id === p.srcId);
                    const prompt = taskStartPrompt(
                      {
                        project: p,
                        updates: src?.data?.updates.filter((u) => u.project === p.id) ?? [],
                        openSiblings: open.filter((t) => t.task !== next.task).map((t) => t.task),
                        dir: srcOf(p.srcId)?.projectsDir,
                      },
                      next.task,
                    );
                    return <CopyButton label="⚡ start next" text={prompt} />;
                  })()}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="meta">
                  Nothing with status "{filter}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
