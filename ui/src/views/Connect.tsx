import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Endpoint } from '../api';
import { fetchData, saveEndpoint } from '../api';

export function Connect({ onConnect }: { onConnect: (ep: Endpoint) => void }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ep: Endpoint = { url: url.trim(), token: token.trim() };
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(ep.url)) {
      setError('That does not look like an Apps Script /exec URL.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await fetchData(ep);
      saveEndpoint(ep);
      onConnect(ep);
    } catch (err) {
      setError(`Could not connect: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="connect-wrap">
      <form className="card connect" onSubmit={(e) => void submit(e)}>
        <h1>Work PM</h1>
        <p className="meta">
          Connect to the sheet endpoint. The URL and token are kept in this browser only — nothing
          is stored on the server or in the page.
        </p>
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
        <button disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
        <p className="meta small">
          Ask whoever runs the sync for these two values, or open a link that already has
          ?src=…&amp;token=… — it fills this in automatically.
        </p>
      </form>
    </div>
  );
}
