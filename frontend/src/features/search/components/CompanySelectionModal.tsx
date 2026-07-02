import { useState, useEffect, useMemo, useRef } from "react";
import { FilterSelectionModalBase } from "./FilterSelectionModalBase";
import { ElevatorCounter } from "./ElevatorCounter";
import type { SearchFilterOptions } from "@/lib/contracts";
import companyIcon from "../../../../src/assets/company.svg";

const FALLBACK_COMPANIES: string[] = [
  "Google",
  "Meta",
  "Apple",
  "Netflix",
  "Amazon",
  "Microsoft",
  "Stripe",
  "Airbnb",
  "Uber",
  "Figma",
  "Vercel",
  "Supabase",
  "OpenAI",
  "Datadog",
  "Snowflake",
  "Cloudflare"
];

type CompanySelectionModalProps = {
  isOpen: boolean;
  isAnimating: boolean;
  onClose: () => void;
  companies: string[];
  onSetCompanies: (values: string[]) => void;
  filterOptions: SearchFilterOptions | null;
};

export function CompanySelectionModal({
                                        isOpen,
                                        isAnimating,
                                        onClose,
                                        companies,
                                        onSetCompanies,
                                        filterOptions,
                                      }: CompanySelectionModalProps) {
  const [companySearch, setCompanySearch] = useState("");
  const modalGridRef = useRef<HTMLDivElement>(null);
  const [modalGridHeight, setModalGridHeight] = useState<number | string>("auto");

  const selectedCompanies = useMemo<string[]>(() => {
    return companies.filter((c) => Boolean(c) && c.toLowerCase() !== "any company");
  }, [companies]);

  const liveCompanies = filterOptions?.companies;

  const allCompanies = useMemo<string[]>(() => {
    const rawList: string[] = liveCompanies && liveCompanies.length > 0
      ? liveCompanies
      : FALLBACK_COMPANIES;

    const seenNames = new Set<string>();
    return rawList.filter((company) => {
      const normalized = company.trim();
      if (!normalized || normalized.toLowerCase() === "any company") return false;
      const lower = normalized.toLowerCase();
      if (seenNames.has(lower)) return false;
      seenNames.add(lower);
      return true;
    });
  }, [liveCompanies]);

  const filteredCompanies = useMemo<string[]>(() => {
    if (!companySearch) return allCompanies;
    // Normalize query by removing all spaces, dots, and commas
    const normalizedQuery = companySearch.toLowerCase().replace(/[\s.,]/g, "");

    return allCompanies.filter((item) => {
      const normalizedTarget = item.toLowerCase().replace(/[\s.,]/g, "");
      return normalizedTarget.includes(normalizedQuery);
    });
  }, [allCompanies, companySearch]);

  useEffect(() => {
    if (!isOpen) return;
    const calculateAvailableHeight = () => {
      const currentGrid = modalGridRef.current;
      if (currentGrid) {
        const viewPortLimit = window.innerHeight * 0.4;
        setModalGridHeight(Math.min(currentGrid.scrollHeight, viewPortLimit));
      }
    };
    const handlerId = setTimeout(calculateAvailableHeight, 15);
    window.addEventListener("resize", calculateAvailableHeight);
    return () => {
      clearTimeout(handlerId);
      window.removeEventListener("resize", calculateAvailableHeight);
    };
  }, [filteredCompanies, isOpen]);

  function handleSelectAnyCompany() {
    onSetCompanies([]);
  }

  function handleToggleCompany(companyName: string) {
    const nextSelection = selectedCompanies.includes(companyName)
      ? selectedCompanies.filter((c) => c !== companyName)
      : [...selectedCompanies, companyName];
    onSetCompanies(nextSelection);
  }

  const isAnyCompanyActive = selectedCompanies.length === 0;

  return (
    <FilterSelectionModalBase
      isOpen={isOpen}
      isAnimating={isAnimating}
      onClose={onClose}
      title="Select Company"
      iconSrc={companyIcon}
      searchPlaceholder="Search companies..."
      searchValue={companySearch}
      onSearchChange={setCompanySearch}
      onClear={() => onSetCompanies([])}
      isClearDisabled={isAnyCompanyActive}
      onApply={onClose}
      isApplyDisabled={false}
      gridHeight={modalGridHeight}
      gridRef={modalGridRef}
      columnsClass="grid-cols-2"
      counterElement={
        !isAnyCompanyActive && (
          <>
            <span className="text-[var(--text-soft)] font-normal select-none">•</span>
            <span className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
              <ElevatorCounter value={selectedCompanies.length} /> Selected
            </span>
          </>
        )
      }
    >
      <button
        type="button"
        onClick={handleSelectAnyCompany}
        className={`col-span-2 w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
          ${isAnyCompanyActive
          ? "bg-[var(--primary)] text-[#39393a]"
          : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
        }`}
      >
        <span className="truncate leading-none self-center">Any Company</span>
      </button>

      <div className="col-span-2 h-1.5 pointer-events-none" />

      {filteredCompanies.length > 0 ? (
        filteredCompanies.map((name) => {
          const isChecked = selectedCompanies.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => handleToggleCompany(name)}
              className={`w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
                ${isChecked
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <span className="truncate leading-none self-center">{name}</span>
            </button>
          );
        })
      ) : (
        <div className="col-span-2 text-center py-8 text-sm text-[var(--text-soft)]">
          No companies found matching "{companySearch}"
        </div>
      )}
    </FilterSelectionModalBase>
  );
}
