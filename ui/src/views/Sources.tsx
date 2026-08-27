import { useState } from 'react';
import type { FormEvent } from 'react';
import type { PmData, Source } from '../api';
import { addSource, fetchData, isBaked, removeSource, slugify } from '../api';
import type { SourceState } from '../App';
import { SrcTag } from '../components';

/** Add-a-source form: validates the endpoint by fetching before saving. */
export function SourceForm({ existing, onAdded }: { existing: Source[]; onAdded: (list: Source[]) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = { label: label.trim(), url: url.trim(), token: token.trim() };
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(trimmed.url)) {
      setError('That does not look like an Apps Script /exec URL.');
      return;
    }
    if (existing.some((s) => s.url === trimmed.url)) {
      setError('That endpoint is already connected.');
      return;
    }
    const src: Source = { id: slugify(trimmed.label || `pm-${existing.length + 1}`), label: trimmed.label || `PM ${existing.length + 1}`, url: trimmed.url, token: trimmed.token };
    setBusy(true);
    setError('');
    try {
      await fetchData(src);
      onAdded(addSource(src));
      setLabel('');
      setUrl('');
      setToken('');
    } catch (err) {
      setError(`Could not connect: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="add-source" onSubmit={(e) => void submit(e)}>
      <label>
        Name
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Work, Life, …" required />
      </label>
      <label>
        Endpoint URL
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          required
        />
      </label>
      <label>
        Read token
        <input value={token} onChange={(e) => setToken(e.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? 'Checking…' : 'Add source'}</button>
    </form>
  );
}

function sourceNote(data?: PmData, error?: string): string {
  if (error) return `unreachable: ${error}`;
  if (!data) return 'loading…';
  return `${data.projects.length} project${data.projects.length === 1 ? '' : 's'} · synced ${data.lastSync || '—'}`;
}

export function Sources({
  sources,
  states,
  onChanged,
}: {
  sources: Source[];
  states: Record<string, SourceState>;
  onChanged: (list: Source[]) => void;
}) {
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <h2>Connected sources</h2>
          <span className="meta">each source is an independent PM instance — its own files, sheet, and endpoint</span>
        </div>
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.id}>
              <span className="source-name">
                <SrcTag source={s} sources={sources} dotOnly />
                {s.label}
              </span>
              {s.writeSecret ? (
                <span className="chip chip-static" title="this build carries the write secret — edits allowed">
                  editable
                </span>
              ) : (
                <span className="chip chip-static" title="no write secret — the dashboard can read but not edit">
                  read-only
                </span>
              )}
              <span className="source-url" title={s.url}>
                {s.url}
              </span>
              <span className="source-meta">
                <span className="meta">{sourceNote(states[s.id]?.data, states[s.id]?.error)}</span>
                {isBaked(s) ? (
                  <span className="meta small" title="built into this dashboard file — rebuild to change">
                    built-in
                  </span>
                ) : (
                  <button
                    className="ghost"
                    title="Forget this source on this browser"
                    onClick={() => onChanged(removeSource(s.id))}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Add a source</h2>
          <span className="meta">values stay in this browser only</span>
        </div>
        <SourceForm existing={sources} onAdded={onChanged} />
      </section>
    </div>
  );
}
