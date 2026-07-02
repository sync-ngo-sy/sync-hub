import { useState, useEffect, useMemo, useRef } from "react";
import { ElevatorCounter } from "./ElevatorCounter";
import { FilterSelectionModalBase } from "./FilterSelectionModalBase";
import type { SearchFilterOptions } from "@/lib/contracts";
import skillsFilledIcon from "../../../../src/assets/skills_filled.svg";

type SkillsSelectionModalProps = {
  isOpen: boolean;
  isAnimating: boolean;
  onClose: () => void;
  skills: string[];
  onSetSkills: (values: string[]) => void;
  filterOptions: SearchFilterOptions | null;
};

export function SkillsSelectionModal({
                                       isOpen,
                                       isAnimating,
                                       onClose,
                                       skills,
                                       onSetSkills,
                                       filterOptions,
                                     }: SkillsSelectionModalProps) {
  const [skillsSearch, setSkillsSearch] = useState("");
  const [isCustomInputOpen, setIsCustomInputOpen] = useState(false);
  const [customSkillVal, setCustomSkillVal] = useState("");

  const modalGridRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);
  const [modalGridHeight, setModalGridHeight] = useState<number | string>("auto");

  //  Stable serialized keys computed inside useMemo so React tracks them
  const liveSkillsKey = useMemo<string>(
    () => filterOptions?.skills?.join("||") ?? "",
    [filterOptions?.skills]
  );

  const selectedKey = useMemo<string>(
    () => skills.join("||"),
    [skills]
  );

  // Deserialize back into arrays from stable keys
  const liveSkillsArr = useMemo<string[]>(
    () => (liveSkillsKey.length > 0 ? liveSkillsKey.split("||") : []),
    [liveSkillsKey]
  );

  const selectedArr = useMemo<string[]>(
    () => (selectedKey.length > 0 ? selectedKey.split("||") : []),
    [selectedKey]
  );

  // Filtered live-skills list
  const filteredSkills = useMemo<string[]>(() => {
    if (!skillsSearch) return liveSkillsArr;
    const q = skillsSearch.toLowerCase().replace(/[\s.,]/g, "");
    return liveSkillsArr.filter((s) =>
      s.toLowerCase().replace(/[\s.,]/g, "").includes(q)
    );
  }, [liveSkillsArr, skillsSearch]);

  // Final ordered render list
  // Custom-added chips pinned to top, then filtered live DB skills below
  const orderedRenderList = useMemo<string[]>(() => {
    const liveSet = new Set(liveSkillsArr.map((s) => s.toLowerCase()));
    const customAdded = selectedArr.filter((s) => !liveSet.has(s.toLowerCase()));

    const q = skillsSearch.toLowerCase().replace(/[\s.,]/g, "");
    const matchingCustom = customAdded.filter((s) => {
      if (!skillsSearch) return true;
      return s.toLowerCase().replace(/[\s.,]/g, "").includes(q);
    });

    return [...matchingCustom, ...filteredSkills];
  }, [liveSkillsArr, selectedArr, filteredSkills, skillsSearch]);

  // Focus custom input when it opens
  useEffect(() => {
    if (!isCustomInputOpen) return;
    const t = setTimeout(() => customInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [isCustomInputOpen]);

  // Recalculate scrollable grid height
  useEffect(() => {
    if (!isOpen) return;
    const recalc = () => {
      const el = modalGridRef.current;
      if (el) {
        setModalGridHeight(Math.min(el.scrollHeight, window.innerHeight * 0.45));
      }
    };
    const t = setTimeout(recalc, 25);
    window.addEventListener("resize", recalc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", recalc);
    };
  }, [orderedRenderList, isOpen, isCustomInputOpen]);

  // Handlers
  function handleToggleSkill(skill: string) {
    const next = skills.includes(skill)
      ? skills.filter((s) => s !== skill)
      : [...skills, skill];
    onSetSkills(next);
  }

  function handleCustomInputChange(value: string) {
    setCustomSkillVal(value.replace(/(^\w|\s\w)/g, (m) => m.toUpperCase()));
  }

  function handleAddCustomSkill() {
    const clean = customSkillVal.trim();
    if (!clean) return;
    if (!skills.includes(clean)) onSetSkills([...skills, clean]);
    setCustomSkillVal("");
    setIsCustomInputOpen(false);
  }

  function handleCancelCustomSkill() {
    setCustomSkillVal("");
    setIsCustomInputOpen(false);
  }

  const isAnySkillSelected  = skills.length > 0;
  const isAddButtonDisabled = !customSkillVal.trim();

  return (
    <FilterSelectionModalBase
      isOpen={isOpen}
      isAnimating={isAnimating}
      onClose={onClose}
      title="Select Skills"
      iconSrc={skillsFilledIcon}
      searchPlaceholder="Search skills..."
      searchValue={skillsSearch}
      onSearchChange={setSkillsSearch}
      onClear={() => onSetSkills([])}
      isClearDisabled={!isAnySkillSelected}
      onApply={onClose}
      isApplyDisabled={!isAnySkillSelected}
      gridHeight={modalGridHeight}
      gridRef={modalGridRef}
      counterElement={
        isAnySkillSelected && (
          <>
            <span className="text-[var(--text-soft)] font-normal select-none">•</span>
            <span className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
              <ElevatorCounter value={skills.length} /> Selected
            </span>
          </>
        )
      }
    >
      {/* "Didn't find the skill? Add it" row */}
      <div className="col-span-4 w-full flex flex-col items-start justify-start select-none pl-1 mb-2">

        {/* Prompt text — hides when input opens */}
        <div
          className={`w-full flex items-center justify-start transition-all duration-300 ease-in-out overflow-hidden
            ${isCustomInputOpen ? "max-h-0 opacity-0" : "max-h-10 opacity-100"}`}
        >
          <span className="text-xs font-medium text-[var(--text-muted)]">
            Didn't find the skill?{" "}
            <button
              type="button"
              onClick={() => setIsCustomInputOpen(true)}
              className="text-[var(--primary)] font-bold bg-transparent border-0 outline-none p-0 cursor-pointer inline underline decoration-transparent hover:decoration-[var(--primary)] transition-all duration-300 underline-offset-2"
            >
              Add it
            </button>
          </span>
        </div>

        {/* Expandable input area */}
        <div
          className={`w-full max-w-[280px] flex flex-col items-start gap-2.5 transition-all duration-300 ease-in-out overflow-hidden
            ${isCustomInputOpen ? "max-h-[120px] opacity-100 pb-4" : "max-h-0 opacity-0 pointer-events-none"}`}
        >
          <div className="w-full bg-[#2e2e2f] border border-[var(--border)] rounded-full px-3.5 py-1.5 flex items-center transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20">
            <input
              ref={customInputRef}
              type="text"
              value={customSkillVal}
              onChange={(e) => handleCustomInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isAddButtonDisabled) {
                  e.preventDefault();
                  handleAddCustomSkill();
                }
              }}
              placeholder="Skill..."
              className="bg-transparent border-none outline-none text-sm text-[var(--text)] placeholder-[var(--text-muted)] w-full text-start p-0"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isAddButtonDisabled}
              onClick={handleAddCustomSkill}
              className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-300 border-0
                ${!isAddButtonDisabled
                ? "bg-[var(--primary)] text-[#39393a] cursor-pointer hover:bg-[var(--primary)]/90 active:scale-95 shadow-md shadow-[var(--primary)]/10"
                : "bg-[#2e2e2f] text-[var(--text-muted)]/30 cursor-not-allowed scale-95"
              }`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={handleCancelCustomSkill}
              className="px-4 py-1.5 bg-[var(--border)] text-[var(--text-muted)] text-xs font-semibold rounded-full cursor-pointer hover:bg-[var(--border-strong)] hover:text-[var(--text)] transition-all active:scale-95 border-0"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/*Skill chip grid*/}
      {orderedRenderList.length > 0 ? (
        orderedRenderList.map((skill) => {
          const isChecked = skills.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              onClick={() => handleToggleSkill(skill)}
              className={`w-full min-h-[38px] px-2 py-1.5 rounded-full text-xs font-semibold tracking-wide border-0 outline-none flex items-center justify-center text-center leading-tight transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
                ${isChecked
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <span className="truncate">{skill}</span>
            </button>
          );
        })
      ) : (
        <div className="col-span-4 text-center py-8 text-sm text-[var(--text-soft)]">
          No skills found matching "{skillsSearch}"
        </div>
      )}
    </FilterSelectionModalBase>
  );
}
