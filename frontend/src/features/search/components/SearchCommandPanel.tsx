import React, { type FormEvent, type RefObject, useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Panel } from "@/components/ui";
import { ElevatorCounter } from "./ElevatorCounter";
import { AnimatedPlaceholder } from "./AnimatedPlaceholder";
import { SkillsSelectionModal } from "./SkillsSelectionModal";
import { LocationSelectionModal } from "./LocationSelectionModal";
import { SenioritySelectionModal } from "./SenioritySelectionModal";
import { CompanySelectionModal } from "./CompanySelectionModal";
import type { SearchFilterOptions } from "@/lib/contracts";
import { getCleanCountry } from "../utils/countryFlags";
import type { SearchSortOption } from "@/features/search/searchState";

import skillsOutlinedIcon from "../../../../src/assets/skills_outlined.svg";
import skillsFilledIcon from "../../../../src/assets/skills_filled.svg";
import locationOutlinedIcon from "../../../../src/assets/location_outlined.svg";
import locationFilledIcon from "../../../../src/assets/location_filled.svg";
import seniorityOutlinedIcon from "../../../../src/assets/seniority_outlined.svg";
import seniorityFilledIcon from "../../../../src/assets/seniority_filled.svg";
import companyIcon from "../../../../src/assets/company.svg";
import clockIcon from "../../../../src/assets/clock.svg";
import searchIcon from "../../../../src/assets/search.svg";
import aiOutlinedIcon from "../../../../src/assets/ai_outlined.svg";
import aiFilledIcon from "../../../../src/assets/ai_filled.svg";
import cardViewOutlinedIcon from "../../../../src/assets/card_view_outlined.svg";
import cardViewFilledIcon from "../../../../src/assets/card_view_filled.svg";
import listViewOutlinedIcon from "../../../../src/assets/list_view_outlined.svg";
import listViewFilledIcon from "../../../../src/assets/list_view_filled.svg";
import chevronUpIcon from "../../../../src/assets/chevron_up.svg";

const PLACEHOLDERS = [
  "Engineer OR Developer",
  "Senior Solid.js",
  "Sales and Marketing",
  "Junior Rust or C++",
  "Flutter or Kotlin Developer",
  "Remote Java Developer",
  "React Native Developer",
  "Data Scientist",
  "DevOps Kubernetes"
];

const SORT_OPTIONS = [
  { value: "best-match", label: "Best Match" },
  { value: "experience-desc", label: "Most Experience" },
  { value: "experience-asc", label: "Least Experience" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
] as const;

interface FilterChip {
  readonly name: "Skills" | "Location" | "Seniority" | "Company";
  readonly unselectedIcon: string;
  readonly selectedIcon: string;
}

const FILTER_CHIPS: readonly FilterChip[] = [
  { name: "Skills", unselectedIcon: skillsOutlinedIcon, selectedIcon: skillsFilledIcon },
  { name: "Location", unselectedIcon: locationOutlinedIcon, selectedIcon: locationFilledIcon },
  { name: "Seniority", unselectedIcon: seniorityOutlinedIcon, selectedIcon: seniorityFilledIcon },
  { name: "Company", unselectedIcon: companyIcon, selectedIcon: companyIcon },
];

type SearchCommandPanelProps = {
  companies: string[];
  filterOptions: SearchFilterOptions | null;
  loading: boolean;
  location: string;
  minYears: number;
  query: string;
  queryInputRef: RefObject<HTMLInputElement>;
  seniority: string;
  skills: string[];
  onExecute: () => void;
  onSetCompanies: (values: string[]) => void;
  onSetLocation: (value: string) => void;
  onSetMinYears: (value: number) => void;
  onSetQuery: (value: string) => void;
  onSetSeniority: (value: string) => void;
  onSetSkills: (values: string[]) => void;
  compareHref: string | null;
  count: number;
  sortBy: SearchSortOption;
  topChatHref: string | null;
  hasResults: boolean;
  onSortChange: (value: SearchSortOption) => void;
  viewMode?: "card" | "list";
  onViewModeChange?: (mode: "card" | "list") => void;
};

export function SearchCommandPanel({
                                     companies,
                                     filterOptions,
                                     loading,
                                     location,
                                     minYears,
                                     query,
                                     queryInputRef,
                                     seniority,
                                     skills,
                                     onExecute,
                                     onSetCompanies,
                                     onSetLocation,
                                     onSetMinYears,
                                     onSetQuery,
                                     onSetSeniority,
                                     onSetSkills,
                                     compareHref,
                                     count,
                                     sortBy,
                                     topChatHref,
                                     hasResults,
                                     onSortChange,
                                     viewMode: propViewMode,
                                     onViewModeChange,
                                   }: SearchCommandPanelProps) {
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [isSkillsModalOpen, setIsSkillsModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSeniorityModalOpen, setIsSeniorityModalOpen] = useState(false);
  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isAiHovered, setIsAiHovered] = useState(false);

  // Initialize from storage or default to card
  const [localViewMode, setLocalViewMode] = useState<"card" | "list">(
    () => (localStorage.getItem("search-view-mode") as "card" | "list") || "card"
  );
  const activeViewMode = propViewMode ?? localViewMode;

  const formRef = useRef<HTMLFormElement>(null);
  const searchBtnRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const [searchBtnWidth, setSearchBtnWidth] = useState<number | null>(null);

  const summaryRef = useRef<HTMLDivElement>(null);
  const [summaryHeight, setSummaryHeight] = useState<number | string>(0);

  const selectedLocationsCount = useMemo<number>(() => {
    return location && location.trim().toLowerCase() !== "any place" ? 1 : 0;
  }, [location]);

  const selectedCountryProfile = useMemo(() => {
    if (location && location.trim().toLowerCase() !== "any place") {
      return getCleanCountry(location);
    }
    return null;
  }, [location]);

  const selectedSenioritiesCount = useMemo<number>(() => {
    return seniority && seniority.trim().toLowerCase() !== "any seniority" ? 1 : 0;
  }, [seniority]);

  const skillsLength = skills.length;
  const companiesLength = companies.length;

  const isSearchDisabled = useMemo<boolean>(() => {
    return (
      !query.trim() &&
      !seniority &&
      minYears <= 0 &&
      !location.trim() &&
      skillsLength === 0 &&
      companiesLength === 0
    );
  }, [query, seniority, minYears, location, skillsLength, companiesLength]);

  useEffect(() => {
    if (searchBtnRef.current) {
      setSearchBtnWidth(searchBtnRef.current.getBoundingClientRect().width);
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchBtnRef.current) {
      searchBtnRef.current.style.width = "auto";
      const targetWidth = searchBtnRef.current.getBoundingClientRect().width;
      if (searchBtnWidth !== null) {
        searchBtnRef.current.style.width = `${searchBtnWidth}px`;
      }
      searchBtnRef.current.offsetHeight;
      setSearchBtnWidth(targetWidth);
    }
  }, [loading]);

  useEffect(() => {
    if (hasResults) {
      if (summaryRef.current) {
        setSummaryHeight(summaryRef.current.scrollHeight);
        const timer = setTimeout(() => setSummaryHeight("auto"), 300);
        return () => clearTimeout(timer);
      }
    } else {
      if (summaryRef.current) {
        setSummaryHeight(summaryRef.current.scrollHeight);
        summaryRef.current.offsetHeight;
        const frame = requestAnimationFrame(() => setSummaryHeight(0));
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [hasResults, count, compareHref, topChatHref]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isSearchDisabled) onExecute();
  }

  function handleDivSubmit() {
    if (!loading && !isSearchDisabled) formRef.current?.requestSubmit();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleDivSubmit();
    }
  }

  function handleOpenModal(modalType: "skills" | "location" | "seniority" | "company") {
    if (modalType === "skills") setIsSkillsModalOpen(true);
    else if (modalType === "location") setIsLocationModalOpen(true);
    else if (modalType === "seniority") setIsSeniorityModalOpen(true);
    else setIsCompanyModalOpen(true);

    requestAnimationFrame(() => setIsAnimating(true));
  }

  function handleCloseModal() {
    setIsAnimating(false);
    setTimeout(() => {
      setIsSkillsModalOpen(false);
      setIsLocationModalOpen(false);
      setIsSeniorityModalOpen(false);
      setIsCompanyModalOpen(false);
    }, 300);
  }

  function handleToggleChip(chipName: "Skills" | "Location" | "Seniority" | "Company") {
    if (chipName === "Skills") return handleOpenModal("skills");
    if (chipName === "Location") return handleOpenModal("location");
    if (chipName === "Seniority") return handleOpenModal("seniority");
    if (chipName === "Company") return handleOpenModal("company");

    setSelectedChips((prev) =>
      prev.includes(chipName) ? prev.filter((item) => item !== chipName) : [...prev, chipName]
    );
  }

  function handleQueryChange(value: string) {
    const capitalized = value.replace(/(^\w|\s\w)/g, (match) => match.toUpperCase());
    onSetQuery(capitalized);
  }

  // View state modifier with dynamic background broadcast integration
  function handleViewToggle(mode: "card" | "list") {
    setLocalViewMode(mode);
    localStorage.setItem("search-view-mode", mode);
    window.dispatchEvent(new CustomEvent("search-view-mode-sync", { detail: mode }));
    if (onViewModeChange) {
      onViewModeChange(mode);
    }
  }

  const currentSortLabel = useMemo(() => {
    return SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label || "Best Match";
  }, [sortBy]);

  return (
    <form ref={formRef} className="search-console-form relative z-0 outline-none focus:outline-none focus:ring-0" onSubmit={handleSubmit}>
      <Panel className="search-command-panel !border-none !z-0 outline-none focus:outline-none focus:ring-0">
        <div
          className="w-full pt-4 pb-4"
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            minHeight: "40px"
          }}
        >
          {/* FILTER CHIPS (ALL DIVS, NO BOLD) */}
          <div className="shrink-0 flex items-center gap-2">
            {FILTER_CHIPS.map((chip) => {
              const isSelected =
                chip.name === "Skills"
                  ? skillsLength > 0
                  : chip.name === "Location"
                    ? true
                    : chip.name === "Seniority"
                      ? true
                      : chip.name === "Company"
                        ? true
                        : selectedChips.includes(chip.name);

              return (
                <div
                  key={chip.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleChip(chip.name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleToggleChip(chip.name);
                    }
                  }}
                  className={`px-4 rounded-full text-sm font-normal tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center gap-2 h-10
                    ${isSelected
                    ? "bg-[var(--primary)] text-[#39393a]"
                    : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                  }`}
                >
                  <img
                    src={isSelected ? chip.selectedIcon : chip.unselectedIcon}
                    alt=""
                    width={16}
                    height={16}
                    className="transition-all duration-200"
                    style={{
                      display: "block",
                      filter: isSelected ? "brightness(0) saturate(100%) opacity(0.8)" : "opacity(0.7)"
                    }}
                  />
                  <span className="flex items-center gap-1.5 leading-none font-normal">
                    {chip.name}

                    {chip.name === "Skills" && skillsLength > 0 && (
                      <>
                        <span>•</span>
                        <ElevatorCounter value={skillsLength} className="self-center" />
                      </>
                    )}

                    {chip.name === "Location" && (
                      <>
                        <span>•</span>
                        {selectedLocationsCount > 0 ? (
                          <img
                            src={selectedCountryProfile?.flagUrl || "https://hatscripts.github.io/circle-flags/flags/xx.svg"}
                            alt={location}
                            width={20}
                            height={20}
                            className="rounded-full shrink-0 object-cover self-center"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                            }}
                            style={{
                              border: "1.5px solid #ffffff",
                              display: "block"
                            }}
                          />
                        ) : (
                          <span className="font-normal opacity-90">Any</span>
                        )}
                      </>
                    )}

                    {chip.name === "Seniority" && (
                      <>
                        <span>•</span>
                        {selectedSenioritiesCount > 0 ? (
                          <ElevatorCounter value={selectedSenioritiesCount} className="self-center" />
                        ) : (
                          <span className="font-normal opacity-90">Any</span>
                        )}
                      </>
                    )}

                    {chip.name === "Company" && (
                      <>
                        <span>•</span>
                        {companiesLength > 0 ? (
                          <ElevatorCounter value={companiesLength} className="self-center" />
                        ) : (
                          <span className="font-normal opacity-90">Any</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* === RIGHT INPUTS (YEARS, SEARCH BAR) === */}
          <div className="flex-1 flex items-center justify-end gap-2">
            <label
              className="search-field flex-1 max-w-[240px] transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 flex items-center gap-2.5 h-10 outline-none focus:outline-none focus:ring-0"
            >
              <img src={clockIcon} alt="" width={22} height={22} className="opacity-90 shrink-0 brightness-100" />
              <input
                type="number"
                aria-label="Years of Experience"
                value={minYears || ""}
                min={0}
                onChange={(event) => onSetMinYears(event.target.value ? Number(event.target.value) : 0)}
                placeholder="Years of Experience"
                className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-base placeholder-[var(--text-muted)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none h-full p-0"
              />
            </label>

            <label
              className="search-field flex-1 max-w-[320px] transition-all duration-300 ease-in-out focus-within:ring-4 focus-within:ring-[var(--primary)]/20 !rounded-full pl-3.5 pr-5 relative flex items-center gap-2.5 h-10 outline-none focus:outline-none focus:ring-0"
            >
              <img src={searchIcon} alt="" width={22} height={22} className="opacity-90 shrink-0 brightness-100" />
              <div className="relative flex-1 flex items-center h-full">
                <input
                  ref={queryInputRef}
                  aria-label="Search candidates"
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder=""
                  className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 w-full text-base text-[var(--text)] z-[1] p-0 relative h-full"
                />
                {!query && (
                  <span className="absolute left-0 pointer-events-none select-none z-0 flex items-center h-full">
                    <AnimatedPlaceholder placeholders={PLACEHOLDERS} />
                  </span>
                )}
              </div>
            </label>

            {/* SEARCH DIV BUTTON */}
            <div
              ref={searchBtnRef}
              role="button"
              tabIndex={loading || isSearchDisabled ? -1 : 0}
              onClick={handleDivSubmit}
              onKeyDown={handleKeyDown}
              className={`group rounded-full px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-10 !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0
                ${loading || isSearchDisabled
                ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-60 [--icon-filter:brightness(0)_saturate(100%)_invert(91%)_sepia(5%)_saturate(702%)_hue-rotate(124deg)_opacity(0.8)]"
                : "bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer [--icon-filter:brightness(0)_saturate(100%)_invert(21%)_sepia(3%)_saturate(137%)_hue-rotate(201deg)_opacity(0.8)] hover:[--icon-filter:brightness(0)_saturate(100%)_invert(100%)_sepia(10%)_saturate(151%)_hue-rotate(113deg)]"
              }`}
              style={{
                boxSizing: "border-box",
                width: searchBtnWidth ? `${searchBtnWidth}px` : "auto",
                transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1), background-color 300ms ease-in-out, color 300ms ease-in-out"
              }}
            >
              <img
                src={searchIcon}
                alt=""
                width={16}
                height={16}
                className="transition-all duration-300 ease-in-out shrink-0"
                style={{ display: "block", filter: "var(--icon-filter)" }}
              />
              <span className="text-sm tracking-wide shrink-0 whitespace-nowrap leading-none font-normal">
                {loading ? "Searching.." : "Search"}
              </span>
            </div>

            <input type="submit" className="hidden" disabled={loading || isSearchDisabled} />
          </div>
        </div>

        {/* === SMOOTHLY EXPANDING INTEGRATED SUMMARY BAR === */}
        <div
          ref={summaryRef}
          style={{
            height: summaryHeight,
            overflow: "visible",
            transition: "height 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease-in-out",
            opacity: hasResults ? 1 : 0,
          }}
          className="w-full outline-none focus:outline-none focus:ring-0 relative z-10"
        >
          <div
            style={{ borderTop: "1.5px solid var(--border-strong)" }}
            className="pt-4 flex flex-col gap-3 pb-2"
          >
            {/* Row 1: Found Matches count (left) & Smooth Horizontal Expanding Sort (right) */}
            <div className="flex items-center justify-between w-full relative h-10">
              <div className="text-[17px] pb-4 ml-2 md:text-[19px] font-normal text-[var(--text)] select-none">
                Found {count} Matches
              </div>

              {/* Horizontal Expanding Custom Sort Control (280px matches the view toggles width & rounded-xl matches new style) */}
              <div ref={sortDropdownRef} className="relative shrink-0 w-[280px] h-10 z-50">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isSortOpen) setIsSortOpen(true); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      if (!isSortOpen) setIsSortOpen(true);
                    }
                  }}
                  className="absolute right-0 top-0 h-10 border rounded-xl bg-[#303031] flex items-center overflow-hidden transition-all duration-300 ease-in-out cursor-pointer select-none"
                  style={{
                    borderColor: "var(--border)",
                    width: isSortOpen ? "760px" : "280px",
                    maxWidth: "calc(100vw - 2rem)"
                  }}
                >
                  {/* COLLAPSED VIEW (Fades & slides leftwards out of view when open) */}
                  <div
                    className="absolute left-4 flex items-center justify-between pointer-events-none transition-all duration-300"
                    style={{
                      opacity: isSortOpen ? 0 : 1,
                      transform: isSortOpen ? "translateX(-20px)" : "translateX(0)",
                      width: "calc(100% - 3.5rem)",
                      visibility: isSortOpen ? "hidden" : "visible",
                    }}
                  >
                    <span className="text-[15px] font-normal text-[var(--text-muted)]">Sort by</span>
                    <span className="text-[15px] text-[var(--text)] font-normal truncate max-w-[170px] mr-1">
                      {currentSortLabel}
                    </span>
                  </div>

                  {/* HORIZONTAL EXPANDED VIEW CHIPS (Smoothly slide out leftwards from the right next to chevron) */}
                  <div
                    className="flex items-center gap-2 flex-1 min-w-0 pl-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{
                      opacity: isSortOpen ? 1 : 0,
                      transform: isSortOpen ? "translateX(0)" : "translateX(60px)",
                      pointerEvents: isSortOpen ? "auto" : "none",
                      visibility: isSortOpen ? "visible" : "hidden",
                    }}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <div
                        key={option.value}
                        role="button"
                        tabIndex={isSortOpen ? 0 : -1}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSortChange(option.value as SearchSortOption);
                          setIsSortOpen(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            onSortChange(option.value as SearchSortOption);
                            setIsSortOpen(false);
                          }
                        }}
                        className={`px-3.5 py-1 rounded-full text-[15px] transition-colors duration-150 whitespace-nowrap cursor-pointer font-normal shrink-0
                          ${sortBy === option.value
                          ? "bg-[var(--primary)] text-[#39393a]"
                          : "text-[var(--text-muted)] hover:bg-[#282829] hover:text-[var(--text)]"
                        }`}
                      >
                        {option.label}
                      </div>
                    ))}
                  </div>

                  {/* ROTATING WHITE CHEVRON BUTTON */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSortOpen(!isSortOpen);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        setIsSortOpen(!isSortOpen);
                      }
                    }}
                    className="w-10 h-10 rounded-full flex items-center justify-center mr-1 shrink-0 cursor-pointer absolute right-0"
                  >
                    <img
                      src={chevronUpIcon}
                      alt={isSortOpen ? "Collapse" : "Expand"}
                      width={18}
                      height={18}
                      className="transition-transform duration-300 ease-in-out opacity-100 shrink-0"
                      style={{
                        transform: isSortOpen ? "rotate(90deg)" : "rotate(-90deg)",
                        filter: "brightness(0) invert(1)",
                        display: "block"
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Action Buttons (left) & Card/List View Buttons (right) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full relative z-0">

              {/* Action buttons (Left side) */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {topChatHref && (
                  <Link
                    className="group !rounded-xl text-[15px] flex items-center justify-center gap-1.5 !transform-none !scale-100 transition-all duration-300 ease-in-out outline-none focus:outline-none focus:ring-0 font-normal h-10 px-5"
                    style={{
                      border: "1.5px solid",
                      borderColor: isAiHovered ? "transparent" : "var(--border-strong)",
                      backgroundColor: isAiHovered ? "var(--border-strong)" : "transparent",
                      color: isAiHovered ? "var(--text)" : "var(--text-muted)"
                    }}
                    onMouseEnter={() => setIsAiHovered(true)}
                    onMouseLeave={() => setIsAiHovered(false)}
                    to={topChatHref}
                  >
                    <span className="text-[15px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal transition-colors duration-300 ease-in-out">
                      Ask SYNC AI
                    </span>
                    <img
                      src={isAiHovered ? aiFilledIcon : aiOutlinedIcon}
                      alt=""
                      width={16}
                      height={16}
                      className="transition-all duration-300 shrink-0"
                      style={{
                        opacity: isAiHovered ? 1 : 0.7
                      }}
                    />
                  </Link>
                )}
                {compareHref && (
                  <Link
                    className="group !rounded-xl px-5 select-none shrink-0 flex items-center justify-center gap-1.5 h-10 transition-all duration-300 ease-in-out !transform-none !scale-100 whitespace-nowrap overflow-hidden outline-none focus:outline-none focus:ring-0 bg-[var(--primary)] text-[#39393a] hover:bg-[var(--primary-strong)] hover:text-[var(--text)] cursor-pointer text-[15px]"
                    to={compareHref}
                  >
                    <span className="text-[15px] tracking-wide shrink-0 whitespace-nowrap leading-none font-normal transition-colors duration-300 ease-in-out">
                      Compare Top Matches
                    </span>
                    <ArrowRight size={16} className="transition-all duration-300 ease-in-out shrink-0" />
                  </Link>
                )}
              </div>

              {/* View Toggle buttons (Right side) - DIV ONLY / NO BOLD / text-[15px] TEXT / 280px Width & Rounded XL */}
              <div className="flex items-center gap-2 shrink-0 w-[280px]">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleViewToggle("card")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleViewToggle("card");
                    }
                  }}
                  className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center gap-2 h-10 font-normal px-2
                    ${activeViewMode === "card"
                    ? "bg-[var(--primary)] text-[#39393a]"
                    : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                  }`}
                >
                  <img
                    src={activeViewMode === "card" ? cardViewFilledIcon : cardViewOutlinedIcon}
                    alt=""
                    width={16}
                    height={16}
                    className="transition-all duration-200 shrink-0"
                    style={{
                      display: "block",
                      filter: activeViewMode === "card" ? "brightness(0) saturate(100%) opacity(0.8)" : "opacity(0.7)"
                    }}
                  />
                  <span className="leading-none font-normal truncate">Card View</span>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleViewToggle("list")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleViewToggle("list");
                    }
                  }}
                  className={`flex-1 rounded-xl text-[15px] tracking-wide transition-colors duration-200 select-none cursor-pointer border-0 outline-none focus:outline-none focus:ring-0 flex items-center justify-center gap-2 h-10 font-normal px-2
                    ${activeViewMode === "list"
                    ? "bg-[var(--primary)] text-[#39393a]"
                    : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
                  }`}
                >
                  <img
                    src={activeViewMode === "list" ? listViewFilledIcon : listViewOutlinedIcon}
                    alt=""
                    width={18}
                    height={18}
                    className="transition-all duration-200 shrink-0"
                    style={{
                      display: "block",
                      filter: activeViewMode === "list" ? "brightness(0) saturate(100%) opacity(0.8)" : "opacity(0.7)"
                    }}
                  />
                  <span className="leading-none font-normal truncate">Table View</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </Panel>

      {/* MODALS */}
      <SkillsSelectionModal
        isOpen={isSkillsModalOpen}
        isAnimating={isAnimating}
        onClose={handleCloseModal}
        skills={skills}
        onSetSkills={onSetSkills}
        filterOptions={filterOptions}
      />

      <LocationSelectionModal
        isOpen={isLocationModalOpen}
        isAnimating={isAnimating}
        onClose={handleCloseModal}
        location={location}
        onSetLocation={onSetLocation}
        filterOptions={filterOptions}
      />

      <SenioritySelectionModal
        isOpen={isSeniorityModalOpen}
        isAnimating={isAnimating}
        onClose={handleCloseModal}
        seniority={seniority}
        onSetSeniority={onSetSeniority}
      />

      <CompanySelectionModal
        isOpen={isCompanyModalOpen}
        isAnimating={isAnimating}
        onClose={handleCloseModal}
        companies={companies}
        onSetCompanies={onSetCompanies}
        filterOptions={filterOptions}
      />
    </form>
  );
}
