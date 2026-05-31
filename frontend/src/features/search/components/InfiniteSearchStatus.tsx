import type { RefObject } from "react";
import { ArrowUp, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/ui";
import type { SearchRequest } from "@/features/search/searchState";

type InfiniteSearchStatusProps = {
  error: string | null;
  loadingMore: boolean;
  nextCursor: number | null;
  queryInputRef: RefObject<HTMLInputElement>;
  request: SearchRequest | null;
  resultCount: number;
  onRetry: () => void;
};

export function InfiniteSearchStatus({
  error,
  loadingMore,
  nextCursor,
  queryInputRef,
  request,
  resultCount,
  onRetry,
}: InfiniteSearchStatusProps) {
  if (error) {
    return (
      <Panel className="infinite-scroll-panel">
        <strong>Could not load more results</strong>
        <p>{error}</p>
        {request && nextCursor !== null ? (
          <button className="button button--secondary" type="button" onClick={onRetry} disabled={loadingMore}>
            Retry
          </button>
        ) : null}
      </Panel>
    );
  }

  if (loadingMore) {
    return (
      <Panel className="infinite-scroll-panel">
        <strong>Loading more candidates</strong>
        <p>Fetching the next ranked slice from the search index.</p>
      </Panel>
    );
  }

  if (nextCursor !== null) {
    return (
      <Panel className="infinite-scroll-panel">
        <strong>Keep scrolling</strong>
        <p>The next page will load automatically as this section enters the viewport.</p>
      </Panel>
    );
  }

  return (
    <Panel className="infinite-scroll-panel infinite-scroll-panel--complete">
      <div className="infinite-scroll-panel__badge">
        <CheckCircle2 size={16} />
        <span>Search complete</span>
      </div>
      <strong>{resultCount} ranked candidates loaded</strong>
      <p>You’ve reached the end of this ranked result set. Broaden the search frame or adjust filters to surface more profiles.</p>
      <div className="infinite-scroll-panel__actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <ArrowUp size={14} />
          Back to Top
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            window.setTimeout(() => queryInputRef.current?.focus(), 180);
          }}
        >
          Refine Search
        </button>
      </div>
    </Panel>
  );
}
