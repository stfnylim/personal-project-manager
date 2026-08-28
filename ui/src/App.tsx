import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EditableField, PmData, Source, TaskOp } from './api';
import { fetchData, loadSources, sendTaskChange, setProjectField } from './api';
import { Connect } from './views/Connect';
import { Home } from './views/Home';
import { Projects } from './views/Projects';
import { Detail } from './views/Detail';
import { Sources } from './views/Sources';
import { CopyButton, sourceColor } from './components';
import { addProjectPrompt, newProjectPrompt } from './prompts';

const REFRESH_MS = 5 * 60 * 1000;
const SCOPE_KEY = 'pm-scope';

// Inside an iframe (e.g. a Notion embed) the page collapses to one column with a
// single scroll context — nested scrollbars in a small fixed-height frame are noise.
const EMBEDDED = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

export interface SourceState {
  source: Source;
  data?: PmData;
  error?: string;
}

function loadScope(): string {
  try {
    return localStorage.getItem(SCOPE_KEY) || 'all';
  } catch {
    return 'all';
  }
}

export function App() {
  const [sources, setSources] = useState<Source[]>(loadSources);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState(window.location.hash);
  const [scope, setScopeRaw] = useState(loadScope);

  const setScope = (s: string) => {
    setScopeRaw(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async () => {
    if (sources.length === 0) return;
    setLoading(true);
    await Promise.all(
      sources.map(async (source) => {
        try {
          const data = await fetchData(source);
          setStates((m) => ({ ...m, [source.id]: { source, data } }));
        } catch (err) {
          setStates((m) => ({ ...m, [source.id]: { source, data: m[source.id]?.data, error: (err as Error).message } }));
        }
      }),
    );
    setLoading(false);
  }, [sources]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const bySrc = useCallback((srcId: string) => sources.find((s) => s.id === srcId), [sources]);

  const setField = useCallback(
    async (srcId: string, projectId: string, field: EditableField, value: string): Promise<boolean> => {
      const source = bySrc(srcId);
      if (!source) return false;
      try {
        await setProjectField(source, projectId, field, value);
        setStates((m) => {
          const st = m[srcId];
          if (!st?.data) return m;
          const data = {
            ...st.data,
            projects: st.data.projects.map((p) => (p.id === projectId ? { ...p, [field]: value } : p)),
          };
          return { ...m, [srcId]: { ...st, data, error: undefined } };
        });
        return true;
      } catch (err) {
        setStates((m) => ({ ...m, [srcId]: { ...m[srcId], source, error: `${field} change failed: ${(err as Error).message}` } }));
        return false;
      }
    },
    [bySrc],
  );

  const taskChange = useCallback(
    async (srcId: string, projectId: string, text: string, op: TaskOp, state?: string): Promise<boolean> => {
      const source = bySrc(srcId);
      if (!source) return false;
      try {
        await sendTaskChange(source, projectId, op, text, state);
        setStates((m) => {
          const st = m[srcId];
          if (!st?.data) return m;
          const tasks = (st.data.tasks ?? []).flatMap((t) => {
            if (t.project !== projectId || t.task !== text) return [t];
            return op === 'task_delete' ? [] : [{ ...t, done: state ?? t.done }];
          });
          return { ...m, [srcId]: { ...st, data: { ...st.data, tasks }, error: undefined } };
        });
        return true;
      } catch (err) {
        setStates((m) => ({ ...m, [srcId]: { ...m[srcId], source, error: `task change failed: ${(err as Error).message}` } }));
        return false;
      }
    },
    [bySrc],
  );

  const onSourcesChanged = (list: Source[]) => {
    setSources(list);
    setStates((m) => {
      const next: Record<string, SourceState> = {};
      for (const s of list) if (m[s.id]) next[s.id] = m[s.id];
      return next;
    });
    if (scope !== 'all' && !list.some((s) => s.id === scope)) setScope('all');
  };

  // scope: 'all' or a source id; with one source there is nothing to switch
  const multi = sources.length > 1;
  const scopedIds = useMemo(
    () => (scope === 'all' || !multi ? sources.map((s) => s.id) : [scope]),
    [scope, multi, sources],
  );
  const scopedStates = scopedIds.map((id) => states[id]).filter((s): s is SourceState => Boolean(s));
  const anyData = scopedStates.some((s) => s.data);
  const errors = Object.values(states).filter((s) => s.error);

  if (sources.length === 0) return <Connect onConnect={onSourcesChanged} />;

  const onProjects = route === '#/projects' || route.startsWith('#/p/');
  const onSources = route === '#/sources';
  // merged views tag rows with their source; scoped/single views don't need tags
  const showSrc = multi && scope === 'all';
  const brand = multi ? 'PM' : `${sources[0].label} PM`;

  // topbar prompt buttons need one target instance: the scoped source, or the
  // only source — in merged scope they wait until a scope chip is picked
  const promptSource = !multi ? sources[0] : scope !== 'all' ? bySrc(scope) : undefined;

  const oldestSync = scopedStates
    .map((s) => s.data?.lastSync)
    .filter(Boolean)
    .sort()[0];

  return (
    <div className={EMBEDDED ? 'app app-embed' : 'app'}>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            {brand}
          </a>
          {multi && (
            <div className="scope" role="group" aria-label="Source scope">
              <button className={`chip ${scope === 'all' ? 'chip-on' : ''}`} onClick={() => setScope('all')}>
                All
              </button>
              {sources.map((s, i) => (
                <button
                  key={s.id}
                  className={`chip ${scope === s.id ? 'chip-on' : ''}`}
                  onClick={() => setScope(s.id)}
                >
                  <span className="dot" style={{ background: sourceColor(i) }} aria-hidden />
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <nav>
            <a href="#/" aria-current={!onProjects && !onSources ? 'page' : undefined}>
              Overview
            </a>
            <a href="#/projects" aria-current={onProjects ? 'page' : undefined}>
              Projects
            </a>
          </nav>
          {promptSource && (
            <div className="topbar-prompts">
              <CopyButton label="new project prompt" text={newProjectPrompt(promptSource.projectsDir)} />
              <CopyButton label="add project prompt" text={addProjectPrompt(promptSource.projectsDir)} />
            </div>
          )}
          <div className="topbar-right">
            {oldestSync && <span className="meta">synced {oldestSync}</span>}
            <button onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <a className="chip" href="#/sources" aria-current={onSources ? 'page' : undefined}>
              Sources
            </a>
          </div>
        </div>
      </header>
      <main>
        {errors.map((s) => (
          <div className="banner error" role="alert" key={s.source.id}>
            {multi ? `${s.source.label}: ` : ''}couldn't reach the endpoint: {s.error}
          </div>
        ))}
        {!anyData && loading && <p className="meta">Loading…</p>}
        {onSources ? (
          <Sources sources={sources} states={states} onChanged={onSourcesChanged} />
        ) : anyData ? (
          route.startsWith('#/p/') ? (
            <Detail
              states={scopedStates}
              sources={sources}
              path={route.slice(4)}
              setField={setField}
              taskChange={taskChange}
            />
          ) : route === '#/projects' ? (
            <Projects states={scopedStates} sources={sources} showSrc={showSrc} setField={setField} />
          ) : (
            <Home states={scopedStates} sources={sources} showSrc={showSrc} taskChange={taskChange} />
          )
        ) : null}
      </main>
    </div>
  );
}
