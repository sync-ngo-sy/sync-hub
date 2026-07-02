import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import searchIcon from "../../../../src/assets/search.svg";
import closeIcon from "../../../../src/assets/close.svg";

type FilterSelectionModalBaseProps = {
  isOpen: boolean;
  isAnimating: boolean;
  onClose: () => void;
  title: string;
  iconSrc: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (val: string) => void;
  onClear: () => void;
  isClearDisabled: boolean;
  onApply: () => void;
  isApplyDisabled: boolean;
  counterElement?: React.ReactNode;
  gridHeight: number | string;
  gridRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  columnsClass?: string; // Add optional column layout config
};

export function FilterSelectionModalBase({
                                           isOpen,
                                           isAnimating,
                                           onClose,
                                           title,
                                           iconSrc,
                                           searchPlaceholder,
                                           searchValue,
                                           onSearchChange,
                                           onClear,
                                           isClearDisabled,
                                           onApply,
                                           isApplyDisabled,
                                           counterElement,
                                           gridHeight,
                                           gridRef,
                                           children,
                                           columnsClass = "grid-cols-4",
                                         }: FilterSelectionModalBaseProps) {
  const [mounted, setMounted] = useState(false);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        modalSearchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const capitalized = e.target.value.replace(/(^\w|\s\w)/g, (match) => match.toUpperCase());
    onSearchChange(capitalized);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ease-in-out cursor-default outline-none focus:outline-none focus:ring-0
        ${isAnimating ? "bg-black/60 backdrop-blur-md" : "bg-black/0 backdrop-blur-none pointer-events-none"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-[#39393a] border border-[var(--border)] rounded-[var(--radius)] shadow-[var(--shadow)] overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300 ease-in-out outline-none focus:outline-none focus:ring-0"
        style={{
          transform: isAnimating ? "scale(100%)" : "scale(95%)",
          opacity: isAnimating ? 1 : 0,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
          <h3 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
            <img
              src={iconSrc}
              alt=""
              width={18}
              height={16}
              style={{ filter: "brightness(0) saturate(100%) invert(80%) sepia(21%) saturate(983%) hue-rotate(125deg)" }}
            />
            <span>{title}</span>
            {counterElement}
          </h3>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-[12px] flex items-center justify-center bg-[var(--border)] hover:bg-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all duration-200 outline-none border-0 cursor-pointer focus:outline-none focus:ring-0"
          >
            <img src={closeIcon} alt="Close" width={14} height={14} className="opacity-90" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <label className="search-field flex items-center justify-between gap-2.5 !rounded-full pl-3.5 pr-3.5 h-10 transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20">
            <div className="flex items-center gap-2.5 flex-1 min-w-0 h-full">
              <img src={searchIcon} alt="" width={18} height={18} className="opacity-70 shrink-0 self-center" />
              <input
                ref={modalSearchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={handleInputChange}
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-base text-[var(--text)] placeholder-[var(--text-muted)] h-full p-0 self-center"
              />
            </div>
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="shrink-0 outline-none border-0 bg-transparent cursor-pointer flex items-center justify-center mr-[1px] p-1 h-full self-center focus:outline-none focus:ring-0"
              >
                <img src={closeIcon} alt="Clear search" width={16} height={16} className="opacity-75 hover:opacity-100 transition-opacity block" />
              </button>
            )}
          </label>
        </div>

        {/* Scrollable grid area with dynamic columnsClass */}
        <div className="flex-1 relative min-h-0 overflow-hidden px-5">
          <div className="absolute top-0 left-5 right-5 h-8 bg-gradient-to-b from-[#39393a] to-transparent z-10 pointer-events-none" />

          <div
            style={{
              height: typeof gridHeight === "number" ? `${gridHeight}px` : gridHeight,
              transition: "height 300ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            className="overflow-y-auto w-full select-none outline-none focus:outline-none focus:ring-0"
          >
            <div ref={gridRef} className={`py-6 grid ${columnsClass} gap-2.5 w-full justify-items-center content-start`}>
              {children}
            </div>
          </div>

          <div className="absolute bottom-0 left-5 right-5 h-12 bg-gradient-to-t from-[#39393a] to-transparent z-10 pointer-events-none" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 bg-[#39393a]/30 border-t border-[var(--border)] select-none">
          <button
            type="button"
            onClick={onClear}
            disabled={isClearDisabled}
            className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 outline-none border-0 focus:outline-none focus:ring-0
              ${!isClearDisabled
              ? "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)] cursor-pointer active:scale-95"
              : "bg-[#2e2e2f] text-[var(--text-muted)]/20 cursor-not-allowed scale-95"
            }`}
          >
            Clear
          </button>

          <button
            type="button"
            onClick={onApply}
            disabled={isApplyDisabled}
            className={`px-6 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 outline-none border-0 focus:outline-none focus:ring-0
              ${!isApplyDisabled
              ? "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary)]/90 cursor-pointer active:scale-95 shadow-md shadow-[var(--primary)]/10"
              : "bg-[#2e2e2f] text-[var(--text-muted)]/20 cursor-not-allowed scale-95"
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
