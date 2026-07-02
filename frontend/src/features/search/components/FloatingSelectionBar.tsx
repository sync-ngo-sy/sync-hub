import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { buildChatHref } from "@/lib/chatAgent";

type FloatingSelectionBarProps = {
  selectedIds: Set<string>;
  onClear: () => void;
  onViewSelected: () => void;
  onCompare: () => void;
};

export function FloatingSelectionBar({
                                       selectedIds,
                                       onClear,
                                       onViewSelected,
                                       onCompare,
                                     }: FloatingSelectionBarProps) {
  const isVisible = selectedIds.size > 0;
  const isSingle = selectedIds.size === 1;

  const aiHref = selectedIds.size >= 2
    ? buildChatHref(
      Array.from(selectedIds),
      "Compare these candidates side-by-side and highlight their relative strengths and weaknesses.",
    )
    : null;

  return (
    <div
      className="fixed z-50 flex items-center gap-5 px-6 py-3.5 rounded-full shadow-2xl border border-[var(--border-strong)]"
      style={{
        bottom: "24px",
        left: "50%",
        transform: `translateX(-50%) translateY(${isVisible ? "0px" : "120px"})`,
        opacity: isVisible ? 1 : 0,
        visibility: isVisible ? "visible" : "hidden",
        backgroundColor: "rgba(30, 30, 31, 0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxSizing: "border-box",
        transition:
          "transform 350ms cubic-bezier(0.16, 1, 0.3, 1), opacity 250ms ease-in-out, visibility 250ms ease-in-out",
      }}
    >
      <span className="text-[14px] font-normal text-white whitespace-nowrap select-none">
        {selectedIds.size} {selectedIds.size === 1 ? "candidate" : "candidates"} selected
      </span>

      <div className="w-px h-5 bg-neutral-700" />

      <button
        onClick={onClear}
        className="text-[13px] font-normal text-neutral-400 hover:text-white transition-colors duration-150 outline-none cursor-pointer border-0 bg-transparent p-0"
      >
        Clear Candidates
      </button>

      <button
        onClick={onViewSelected}
        className="px-5 select-none shrink-0 flex items-center justify-center h-10 rounded-full text-sm font-normal bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] transition-colors duration-150 outline-none cursor-pointer border-0"
      >
        View Selected
      </button>

      {/* 1 selected → open picker modal | 2+ selected → go to AI chat */}
      {isSingle ? (
        <button
          type="button"
          onClick={onCompare}
          className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-10 whitespace-nowrap outline-none focus:outline-none focus:ring-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer text-sm font-normal border-0"
          style={{
            boxSizing: "border-box",
            transition: "background-color 300ms ease-in-out, color 300ms ease-in-out",
          }}
        >
          <span className="leading-none transition-colors duration-300 ease-in-out">
            Compare
          </span>
          <ArrowRight size={16} className="transition-all duration-300 ease-in-out shrink-0" />
        </button>
      ) : (
        <Link
          to={aiHref ?? "#"}
          className="group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-10 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer text-sm font-normal"
          style={{
            boxSizing: "border-box",
            transition: "background-color 300ms ease-in-out, color 300ms ease-in-out",
          }}
        >
          <span className="leading-none transition-colors duration-300 ease-in-out">
            AI Compare
          </span>
          <ArrowRight size={16} className="transition-all duration-300 ease-in-out shrink-0" />
        </Link>
      )}
    </div>
  );
}
