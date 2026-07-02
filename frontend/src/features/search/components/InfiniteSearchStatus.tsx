import type { RefObject } from "react";
import type { SearchRequest } from "@/features/search/searchState";

import checkCirclePrimaryIcon from "../../../../src/assets/check_circle_primary.svg";
import arrowUpIcon from "../../../../src/assets/arrow_up.svg";
import networkErrorIcon from "../../../../src/assets/network_error.svg";
import circleDownIcon from "../../../../src/assets/circle_down.svg";

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
  const actionButtonClasses = "px-4 rounded-full text-base font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center h-10 gap-1.5 bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] active:scale-95";

  if (error) {
    return (
      <div className="bg-[#39393a] border border-[var(--border)] rounded-xl p-5 flex flex-col items-center gap-3 text-center mt-4">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-400/10 text-red-400 text-sm font-semibold select-none">
          <img src={networkErrorIcon} alt="" width={16} height={16} className="opacity-90" style={{ display: "block" }} />
          <span>Network Error</span>
        </div>
        <p className="text-base text-[var(--text-muted)] m-0 max-w-md">{error}</p>
        {request && nextCursor !== null ? (
          <button className={actionButtonClasses} type="button" onClick={onRetry} disabled={loadingMore}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (loadingMore) {
    return (
      <div className="py-8 flex flex-col items-center gap-4 text-center">
        {/* Custom Loading Indicator */}
        <div
          className="animate-spin"
          style={{
            width: '32px',
            height: '32px',
            border: '4px solid rgba(0, 133, 126, 0.2)',
            borderTopColor: '#00857e',
            borderRadius: '50%',
            display: 'inline-block'
          }}
        ></div>

        <p className="text-lg font-semibold text-[var(--text)] m-0">Loading More Candidates..</p>
        <p className="text-base text-[var(--text-muted)] m-0">Fetching the next ranked slice.</p>
      </div>
    );
  }

  if (nextCursor !== null) {
    return (
      <div className="py-8 flex flex-col items-center gap-3 text-center">
        <img src={circleDownIcon} alt="" width={28} height={28} className="opacity-60 animate-bounce" style={{ display: "block" }} />
        <p className="text-lg font-medium text-[var(--text-muted)] m-0">Keep scrolling to load more candidates automatically</p>
      </div>
    );
  }

  return (
    <div className="bg-[#39393a] border border-[var(--border)] rounded-xl p-5 flex flex-col items-center gap-3 text-center mt-4">
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-semibold select-none">
        <img src={checkCirclePrimaryIcon} alt="" width={16} height={16} className="opacity-90" style={{ display: "block" }} />
        <span>Search Complete</span>
      </div>

      <p className="text-lg font-semibold text-[var(--text)] m-0">
        {resultCount} Ranked Candidates Loaded
      </p>

      <p className="text-base text-[var(--text-muted)] m-0 max-w-sm">
        End of results. Adjust filters to find more.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
        <button
          className={actionButtonClasses}
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <img src={arrowUpIcon} alt="" width={16} height={16} className="opacity-80" style={{ display: "block" }} />
          Back To Top
        </button>
        <button
          className={actionButtonClasses}
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            window.setTimeout(() => queryInputRef.current?.focus(), 180);
          }}
        >
          Refine Search
        </button>
      </div>
    </div>
  );
}
