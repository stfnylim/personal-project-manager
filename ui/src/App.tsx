import { useCallback, useEffect, useState } from 'react';
import type { Endpoint, PmData } from './api';
import { clearEndpoint, fetchData, loadEndpoint, setProjectStatus } from './api';
import { Connect } from './views/Connect';
import { Home } from './views/Home';
import { Projects } from './views/Projects';
import { Detail } from './views/Detail';

const REFRESH_MS = 5 * 60 * 1000;

export function App() {
  const [endpoint, setEndpoint] = useState<Endpoint | null>(loadEndpoint);
  const [data, setData] = useState<PmData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refresh = useCallback(async () => {
    if (!endpoint) return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchData(endpoint));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const setStatus = useCallback(
    async (projectId: string, status: string): Promise<boolean> => {
      if (!endpoint) return false;
      try {
        await setProjectStatus(endpoint, projectId, status);
        setData((d) =>
          d ? { ...d, projects: d.projects.map((p) => (p.id === projectId ? { ...p, status } : p)) } : d,
        );
        setError('');
        return true;
      } catch (err) {
        setError(`Status change failed: ${(err as Error).message}`);
        return false;
      }
    },
    [endpoint],
  );

  if (!endpoint) return <Connect onConnect={setEndpoint} />;

  const canWrite = Boolean(endpoint.writeSecret);

  const disconnect = () => {
    clearEndpoint();
    setEndpoint(null);
    setData(null);
  };

  const onProjects = route === '#/projects' || route.startsWith('#/p/');

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            Work PM
          </a>
          <nav>
            <a href="#/" aria-current={!onProjects ? 'page' : undefined}>
              Overview
            </a>
            <a href="#/projects" aria-current={onProjects ? 'page' : undefined}>
              Projects
            </a>
          </nav>
          <div className="topbar-right">
            {data?.lastSync && <span className="meta">synced {data.lastSync}</span>}
            <button onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button className="ghost" onClick={disconnect} title="Forget the stored endpoint on this browser">
              Disconnect
            </button>
          </div>
        </div>
      </header>
      <main>
        {error && (
          <div className="banner error" role="alert">
            Couldn't reach the endpoint: {error}
          </div>
        )}
        {!data && loading && <p className="meta">Loading…</p>}
        {data &&
          (route.startsWith('#/p/') ? (
            <Detail data={data} id={decodeURIComponent(route.slice(4))} canWrite={canWrite} setStatus={setStatus} />
          ) : route === '#/projects' ? (
            <Projects data={data} canWrite={canWrite} setStatus={setStatus} />
          ) : (
            <Home data={data} />
          ))}
      </main>
    </div>
  );
}
