import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

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
      <button
        type="button"
        className={cn("filter-multiselect__control", open && "filter-multiselect__control--open")}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <div className="filter-multiselect__values">
          {values.length ? (
            values.map((value) => (
              <span key={value} className="filter-multiselect__chip">
                {value}
                <span
                  role="button"
                  tabIndex={0}
                  className="filter-multiselect__chip-action"
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
                </span>
              </span>
            ))
          ) : (
            <span className="filter-multiselect__placeholder">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={16} className={cn("filter-multiselect__chevron", open && "filter-multiselect__chevron--open")} />
      </button>

      {open ? (
        <div className="filter-multiselect__menu">
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
              <button type="button" className="filter-multiselect__option filter-multiselect__option--create" onClick={() => addValues(creatableValues)}>
                <strong>Add</strong>
                <span>{creatableValues.join(", ")}</span>
              </button>
            ) : null}

            {filteredOptions.slice(0, 10).map((option) => (
              <button key={option} type="button" className="filter-multiselect__option" onClick={() => addValues([option])}>
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
