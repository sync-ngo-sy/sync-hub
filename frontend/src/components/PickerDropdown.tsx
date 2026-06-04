import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { useDropdownPlacement } from "@/lib/dropdownPlacement";

export type PickerOption = {
  value: string;
  label: string;
};

type PickerDropdownProps = {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel?: string;
};

export function PickerDropdown({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel = "No values available",
}: PickerDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const menuPlacement = useDropdownPlacement(rootRef, open);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const displayValue = selectedOption?.label ?? (value.trim() || placeholder);

  return (
    <div ref={rootRef} className="picker-dropdown">
      <button
        type="button"
        className={cn("picker-dropdown__trigger", open && "picker-dropdown__trigger--open")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("picker-dropdown__value", !value.trim() && "picker-dropdown__value--placeholder")}>
          {displayValue}
        </span>
        <ChevronDown size={14} className={cn("picker-dropdown__chevron", open && "picker-dropdown__chevron--open")} />
      </button>

      {open ? (
        <div
          className={cn("picker-dropdown__menu", menuPlacement.direction === "above" && "picker-dropdown__menu--above")}
          role="listbox"
          style={{ maxHeight: menuPlacement.maxHeight }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={cn("picker-dropdown__option", !value && "picker-dropdown__option--active")}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span>{placeholder}</span>
            {!value ? <Check size={14} /> : null}
          </button>

          {options.length ? (
            options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn("picker-dropdown__option", isSelected && "picker-dropdown__option--active")}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected ? <Check size={14} /> : null}
                </button>
              );
            })
          ) : (
            <div className="picker-dropdown__empty">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
