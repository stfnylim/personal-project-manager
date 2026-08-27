import type { Source } from '../api';
import { SourceForm } from './Sources';

/** First-run screen: no sources connected yet. */
export function Connect({ onConnect }: { onConnect: (list: Source[]) => void }) {
  return (
    <div className="connect-wrap">
      <div className="card connect">
        <h1>Project Manager</h1>
        <p className="meta">
          Connect a sheet endpoint. The URL and token are kept in this browser only — nothing is
          stored on the server or in the page. You can add more sources (e.g. Work and Life) later
          under "Sources".
        </p>
        <SourceForm existing={[]} onAdded={onConnect} />
        <p className="meta small">
          Ask whoever runs the sync for these values, or open a link that already has
          ?src=…&amp;token=… — it fills this in automatically.
        </p>
      </div>
    </div>
  );
}
