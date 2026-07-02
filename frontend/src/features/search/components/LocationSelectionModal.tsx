// frontend/src/features/search/components/LocationSelectionModal.tsx
import {useState, useEffect, useMemo, useRef} from "react";
import {FilterSelectionModalBase} from "./FilterSelectionModalBase";
import {getCleanCountry} from "../utils/countryFlags";
import {ElevatorCounter} from "./ElevatorCounter";
import type {SearchFilterOptions} from "@/lib/contracts";
import locationFilledIcon from "../../../../src/assets/location_filled.svg";

const FALLBACK_LOCATIONS: string[] = [
  "United Arab Emirates",
  "Saudi Arabia",
  "United Kingdom",
  "United States",
  "Canada",
  "Germany",
  "Singapore",
  "India",
  "Egypt",
  "Jordan",
  "Lebanon",
  "Turkey",
  "France",
  "Australia",
  "Brazil",
  "Japan",
  "Spain",
  "Italy",
  "Netherlands",
  "Switzerland",
  "Pakistan",
  "Argentina",
  "Austria",
  "Belgium",
  "China",
  "Denmark",
  "Greece",
  "Hong Kong",
  "Ireland",
  "Mexico",
  "Norway",
  "Portugal",
  "Russia",
  "South Africa",
  "South Korea",
  "Sweden"
];

type LocationSelectionModalProps = {
  isOpen: boolean;
  isAnimating: boolean;
  onClose: () => void;
  location: string;
  onSetLocation: (value: string) => void;
  filterOptions: SearchFilterOptions | null;
  hideAnyPlace?: boolean;
};

interface CountryProfile {
  name: string;
  flagUrl: string | null;
}

export function LocationSelectionModal({
                                         isOpen,
                                         isAnimating,
                                         onClose,
                                         location,
                                         onSetLocation,
                                         filterOptions,
                                         hideAnyPlace = false,
                                       }: LocationSelectionModalProps) {
  const [locationSearch, setLocationSearch] = useState("");
  const modalGridRef = useRef<HTMLDivElement>(null);
  const [modalGridHeight, setModalGridHeight] = useState<number | string>("auto");

  const selectedCountry = useMemo<string>(() => {
    return location && location.trim().toLowerCase() !== "any place"
      ? location.trim()
      : "";
  }, [location]);

  const liveLocations = filterOptions?.locations;

  const allLocations = useMemo<CountryProfile[]>(() => {
    const rawList: string[] = liveLocations && liveLocations.length > 0
      ? liveLocations
      : FALLBACK_LOCATIONS;

    const mappedProfiles = rawList
      .map((loc) => getCleanCountry(loc))
      .filter((p): p is CountryProfile => p.name !== "Any Place");

    const seenNames = new Set<string>();
    return mappedProfiles.filter((p) => {
      const lower = p.name.toLowerCase();
      if (seenNames.has(lower)) return false;
      seenNames.add(lower);
      return true;
    });
  }, [liveLocations]);

  const activeCountryProfile = useMemo(() => {
    if (!selectedCountry) return null;
    return allLocations.find((item) => item.name === selectedCountry) || null;
  }, [allLocations, selectedCountry]);

  const filteredLocations = useMemo<CountryProfile[]>(() => {
    if (!locationSearch) return allLocations;

    const normalizedQuery = locationSearch.toLowerCase().replace(/[\s.,]/g, "");

    return allLocations.filter((item) => {
      const normalizedTarget = item.name.toLowerCase().replace(/[\s.,]/g, "");
      return normalizedTarget.includes(normalizedQuery);
    });
  }, [allLocations, locationSearch]);

  useEffect(() => {
    if (!isOpen) return;
    const measureAndSetHeight = () => {
      const gridElement = modalGridRef.current;
      if (gridElement) {
        const heightThreshold = window.innerHeight * 0.4;
        setModalGridHeight(Math.min(gridElement.scrollHeight, heightThreshold));
      }
    };
    const frameId = setTimeout(measureAndSetHeight, 12);
    window.addEventListener("resize", measureAndSetHeight);
    return () => {
      clearTimeout(frameId);
      window.removeEventListener("resize", measureAndSetHeight);
    };
  }, [filteredLocations, isOpen]);

  function handleSelectAnyPlace() {
    onSetLocation("");
  }

  function handleToggleLocation(countryName: string) {
    if (selectedCountry === countryName) {
      onSetLocation("");
    } else {
      onSetLocation(countryName);
    }
  }

  const isAnyPlaceActive = !selectedCountry;

  return (
    <FilterSelectionModalBase
      isOpen={isOpen}
      isAnimating={isAnimating}
      onClose={onClose}
      title="Select Location"
      iconSrc={locationFilledIcon}
      searchPlaceholder="Search countries..."
      searchValue={locationSearch}
      onSearchChange={setLocationSearch}
      onClear={() => onSetLocation("")}
      isClearDisabled={isAnyPlaceActive}
      onApply={onClose}
      isApplyDisabled={false}
      gridHeight={modalGridHeight}
      gridRef={modalGridRef}
      columnsClass="grid-cols-3"
      counterElement={
        !isAnyPlaceActive && (
          <>
            <span className="text-[var(--text-soft)] font-normal select-none">•</span>
            <div className="group flex items-center select-none cursor-pointer">
              <span className="text-sm font-semibold text-[var(--primary)] flex items-center gap-1">
                <ElevatorCounter value={1}/> Selected
              </span>

              {}
              <div
                className="flex items-center gap-2 overflow-hidden max-w-0 opacity-0 group-hover:max-w-[240px] group-hover:opacity-100 transition-all duration-300 ease-in-out">
                <img
                  src={activeCountryProfile?.flagUrl || "https://hatscripts.github.io/circle-flags/flags/xx.svg"}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-full object-cover shrink-0 ml-1.5"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                  }}
                />
                <span className="text-xs font-semibold text-[var(--text-muted)] whitespace-nowrap">
                  {selectedCountry}
                </span>
              </div>
            </div>
          </>
        )
      }
    >
      {!hideAnyPlace && (
        <button
          type="button"
          onClick={handleSelectAnyPlace}
          className={`col-span-3 w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
                        ${isAnyPlaceActive
            ? "bg-[var(--primary)] text-[#39393a]"
            : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
          }`}
        >
          <span className="truncate leading-none self-center">Any Place</span>
        </button>
      )}

      {!hideAnyPlace && <div className="col-span-3 h-1.5 pointer-events-none"/>}

      {filteredLocations.length > 0 ? (
        filteredLocations.map((item) => {
          const isChecked = selectedCountry === item.name;
          return (
            <button
              key={item.name}
              type="button"
              onClick={() => handleToggleLocation(item.name)}
              className={`w-full min-h-[38px] px-3 py-1.5 rounded-full text-sm font-semibold tracking-wide border-0 outline-none flex items-center justify-start gap-2.5 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-0
                ${isChecked
                ? "bg-[var(--primary)] text-[#39393a]"
                : "bg-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--border-strong)] hover:text-[var(--text)]"
              }`}
            >
              <img
                src={item.flagUrl || "https://hatscripts.github.io/circle-flags/flags/xx.svg"}
                alt=""
                width={18}
                height={18}
                className="rounded-full shrink-0 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://hatscripts.github.io/circle-flags/flags/xx.svg";
                }}
              />
              <span className="truncate leading-none self-center">{item.name}</span>
            </button>
          );
        })
      ) : (
        <div className="col-span-3 text-center py-8 text-sm text-[var(--text-soft)]">
          No locations found matching "{locationSearch}"
        </div>
      )}
    </FilterSelectionModalBase>
  );
}
