import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDropdownPlacement } from "@/lib/dropdownPlacement";

type FilterMultiSelectProps = {
  options: string[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  normalizeInput?: (input: string) => string[];
  emptyLabel?: string;
};

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function FilterMultiSelect({
  options,
  values,
  onChange,
  placeholder = "Add values",
  searchPlaceholder = "Search values",
  normalizeInput = (input) => [input.trim()].filter(Boolean),
  emptyLabel = "No matching values",
}: FilterMultiSelectProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const menuPlacement = useDropdownPlacement(rootRef, open, 320);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const filteredOptions = useMemo(() => {
    const normalizedDraft = draft.trim().toLowerCase();
    return options.filter((option) => {
      if (values.includes(option)) {
        return false;
      }

      return !normalizedDraft || option.toLowerCase().includes(normalizedDraft);
    });
  }, [draft, options, values]);

  const creatableValues = useMemo(() => {
    const nextValues = normalizeInput(draft).filter((value) => !values.includes(value));
    return dedupe(nextValues);
  }, [draft, normalizeInput, values]);

  function updateValues(nextValues: string[]) {
    onChange(dedupe(nextValues));
  }

  function addValues(nextValues: string[]) {
    if (!nextValues.length) {
      return;
    }

    updateValues([...values, ...nextValues]);
    setDraft("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function removeValue(value: string) {
    updateValues(values.filter((item) => item !== value));
  }

  return (
    <div ref={rootRef} className="filter-multiselect">
      <div
        className={cn("filter-multiselect__control", open && "filter-multiselect__control--open")}
        role="combobox"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <div className="filter-multiselect__values">
          {values.length ? (
            values.map((value) => (
              <span key={value} className="filter-multiselect__chip">
                {value}
                <button
                  type="button"
                  className="filter-multiselect__chip-action"
                  aria-label={`Remove ${value}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    removeValue(value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      removeValue(value);
                    }
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="filter-multiselect__placeholder">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={cn("filter-multiselect__chevron", open && "filter-multiselect__chevron--open")} />
      </div>

      {open ? (
        <div
          className={cn("filter-multiselect__menu", menuPlacement.direction === "above" && "filter-multiselect__menu--above")}
          style={{ maxHeight: menuPlacement.maxHeight }}
          role="listbox"
        >
          <div className="filter-multiselect__search">
            <Search size={14} />
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === ",") && draft.trim()) {
                  event.preventDefault();
                  addValues(creatableValues.length ? creatableValues : normalizeInput(draft));
                }

                if (event.key === "Backspace" && !draft && values.length) {
                  removeValue(values[values.length - 1]);
                }

                if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
            />
          </div>

          <div className="filter-multiselect__options">
            {creatableValues.length && draft.trim() ? (
              <button type="button" className="filter-multiselect__option filter-multiselect__option--create" onClick={() => addValues(creatableValues)} role="option" aria-selected={false}>
                <strong>Add</strong>
                <span>{creatableValues.join(", ")}</span>
              </button>
            ) : null}

            {filteredOptions.map((option) => (
              <button key={option} type="button" className="filter-multiselect__option" onClick={() => addValues([option])} role="option" aria-selected={false}>
                {option}
              </button>
            ))}

            {!filteredOptions.length && !creatableValues.length ? (
              <div className="filter-multiselect__empty">{emptyLabel}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
