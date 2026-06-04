import { ArrowRight, MessageSquareText } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "@/components/ui";
import type { SearchSortOption } from "@/features/search/searchState";

type SearchSummaryBarProps = {
  compareHref: string | null;
  count: number;
  sortBy: SearchSortOption;
  topChatHref: string | null;
  onSortChange: (value: SearchSortOption) => void;
};

export function SearchSummaryBar({ compareHref, count, sortBy, topChatHref, onSortChange }: SearchSummaryBarProps) {
  return (
    <Panel className="search-summary-bar">
      <div className="search-summary-bar__main">
        <strong>Loaded {count} candidates</strong>
        <p>Results append automatically as you scroll. Sort applies to the loaded result set without changing the active search frame.</p>
        {topChatHref || compareHref ? (
          <div className="search-summary-actions">
            {topChatHref ? (
              <Link className="button button--secondary" to={topChatHref}>
                Ask Agent
                <MessageSquareText size={16} />
              </Link>
            ) : null}
            {compareHref ? (
              <Link className="button button--primary" to={compareHref}>
                Compare Top Matches
                <ArrowRight size={16} />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="search-summary-bar__controls">
        <label className="search-sort">
          <span>Sort by</span>
          <select className="form-select" value={sortBy} onChange={(event) => onSortChange(event.target.value as SearchSortOption)}>
            <option value="best-match">Best match</option>
            <option value="experience-desc">Most experience</option>
            <option value="experience-asc">Least experience</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
          </select>
        </label>
      </div>
    </Panel>
  );
}
