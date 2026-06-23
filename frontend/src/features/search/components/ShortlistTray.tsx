import { BookmarkCheck, Download, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui";

type ShortlistTrayProps = {
  clearing: boolean;
  count: number;
  error: string | null;
  onClear: () => void;
  onExport: () => void;
  onOpen: () => void;
};

export function ShortlistTray({ clearing, count, error, onClear, onExport, onOpen }: ShortlistTrayProps) {
  if (!count && !error) {
    return null;
  }

  return (
    <Panel className="shortlist-tray">
      <div className="shortlist-tray__main">
        <span className="shortlist-tray__icon">
          <BookmarkCheck size={18} />
        </span>
        <div>
          <strong>{count ? `${count} shortlisted` : "Shortlist needs attention"}</strong>
          <p>{error ?? "Saved to your account. Review the list before exporting."}</p>
        </div>
      </div>
      <div className="shortlist-tray__actions">
        <button className="button button--primary" type="button" onClick={onOpen} disabled={!count}>
          <BookmarkCheck size={16} />
          Review
        </button>
        <button className="button button--secondary" type="button" onClick={onExport} disabled={!count}>
          <Download size={16} />
          Export CSV
        </button>
        <button className="button button--secondary" type="button" onClick={onClear} disabled={!count || clearing}>
          <Trash2 size={16} />
          {clearing ? "Clearing..." : "Clear"}
        </button>
      </div>
    </Panel>
  );
}
