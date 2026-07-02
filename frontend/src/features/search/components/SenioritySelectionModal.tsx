import { useState, useEffect, useMemo, useRef } from "react";
import { FilterSelectionModalBase } from "./FilterSelectionModalBase";
import { ElevatorCounter } from "./ElevatorCounter";
import seniorityFilledIcon from "../../../../src/assets/seniority_filled.svg";

const SENIORITY_LEVELS: string[] = [
  "Junior",
  "Mid",
  "Senior",
  "Staff",
  "Staff+"
];

type SenioritySelectionModalProps = {
  isOpen: boolean;
  isAnimating: boolean;
  onClose: () => void;
  seniority: string;
  onSetSeniority: (value: string) => void;
};

export function SenioritySelectionModal({
                                          isOpen,
                                          isAnimating,
                                          onClose,
                                          seniority,
                                          onSetSeniority,
                                        }: SenioritySelectionModalProps) {
  const [senioritySearch, setSenioritySearch] = useState("");
  const modalGridRef = useRef<HTMLDivElement>(null);
  const [modalGridHeight, setModalGridHeight] = useState<number | string>("auto");

  const selectedLevel = useMemo<string>(() => {
    return seniority && seniority.trim().toLowerCase() !== "any seniority"
      ? seniority.trim()
      : "";
  }, [seniority]);

  const filteredSeniorities = useMemo<string[]>(() => {
    if (!senioritySearch) return SENIORITY_LEVELS;
    // Normalize query by removing all spaces, dots, and commas
    const normalizedQuery = senioritySearch.toLowerCase().replace(/[\s.,]/g, "");

    return SENIORITY_LEVELS.filter((level) => {
      const normalizedTarget = level.toLowerCase().replace(/[\s.,]/g, "");
      return normalizedTarget.includes(normalizedQuery);
    });
  }, [senioritySearch]);

  useEffect(() => {
    if (!isOpen) return;
    const handleSizingAdjustment = () => {
      const containerNode = modalGridRef.current;
      if (containerNode) {
        const maximumVerticalExtent = window.innerHeight * 0.4;
        setModalGridHeight(Math.min(containerNode.scrollHeight, maximumVerticalExtent));
      }
    };
    const timerId = setTimeout(handleSizingAdjustment, 18);
    window.addEventListener("resize", handleSizingAdjustment);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener("resize", handleSizingAdjustment);
    };
  }, [filteredSeniorities, isOpen]);

  function handleSelectAnySeniority() {
    onSetSeniority("");
  }

  function handleToggleSeniority(levelName: string) {
    if (selectedLevel === levelName) {
      onSetSeniority("");
    } else {
      onSetSeniority(levelName);
    }
  }

  const isAnySeniorityActive = !selectedLevel;

  return (
    <FilterSelectionModalBase
      isOpen={isOpen}
      isAnimating={isAnimating}
      onClose={onClose}
      title="Select Seniority"
      iconSrc={seniorityFilledIcon}
      searchPlaceholder="Search seniority..."
      searchValue={senioritySearch}
      onSearchChange={setSenioritySearch}
      onClear={() => onSetSeniority("")}
      isClearDisabled={isAnySeniorityActive}
      onApply={onClose}
      isApplyDisabled={false}
      gridHeight={modalGridHeight}
      gridRef={modalGridRef}
      columnsClass="grid-cols-2"
      counterElement={
        !isAnySeniorityActive && (
          <>
            <span className="text-[var(--text-soft)] font-normal select-none">•</span>
            <span className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
              <ElevatorCounter value={1} /> Selected
            </span>
          </>
        )
      }
    >
      <button
        type="button"
        onClick={handleSelectAnySeniority}
        className={`col-span-2 w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
          ${isAnySeniorityActive
          ? "bg-[var(--primary)] text-[#39393a]"
          : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
        }`}
      >
        <span className="truncate leading-none self-center">Any Seniority</span>
      </button>

      <div className="col-span-2 h-1.5 pointer-events-none" />

      {filteredSeniorities.length > 0 ? (
        filteredSeniorities.map((level) => {
          const isChecked = selectedLevel === level;
          const isStaffPlus = level === "Staff+";
          return (
            <button
              key={level}
              type="button"
              onClick={() => handleToggleSeniority(level)}
              className={`${isStaffPlus ? "col-span-2" : "col-span-1"} w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
                ${isChecked
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <span className="truncate leading-none self-center">{level}</span>
            </button>
          );
        })
      ) : (
        <div className="col-span-2 text-center py-8 text-sm text-[var(--text-soft)]">
          No seniority matching "{senioritySearch}"
        </div>
      )}
    </FilterSelectionModalBase>
  );
}
