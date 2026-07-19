import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxSharedProps {
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  disabled?: boolean
  className?: string
}

interface ComboboxSingleProps extends ComboboxSharedProps {
  multiple?: false
  value: string
  onChange: (value: string) => void
}

interface ComboboxMultipleProps extends ComboboxSharedProps {
  multiple: true
  value: string[]
  onChange: (value: string[]) => void
  creatable?: boolean
  /** Splits one typed/pasted entry into multiple values, e.g. "React, Node" → ["React", "Node"]. */
  normalizeInput?: (input: string) => string[]
}

export type ComboboxProps = ComboboxSingleProps | ComboboxMultipleProps

function matches(option: ComboboxOption, query: string) {
  return option.label.toLowerCase().includes(query.trim().toLowerCase())
}

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder = 'Select',
    searchPlaceholder = 'Search…',
    emptyLabel = 'No matching values',
    disabled = false,
    className,
  } = props

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedOption = !props.multiple
    ? (options.find((option) => option.value === props.value) ?? null)
    : null
  const selectedValues = props.multiple ? props.value : []

  const visibleOptions = options
    .filter((option) => (props.multiple ? !selectedValues.includes(option.value) : true))
    .filter((option) => matches(option, query))

  const trimmedQuery = query.trim()
  const creatableValues =
    props.multiple && trimmedQuery
      ? Array.from(
          new Set(
            (props.normalizeInput ?? ((input: string) => [input.trim()].filter(Boolean)))(
              query,
            ).filter(
              (value) =>
                !props.value.includes(value) &&
                !options.some((option) => option.label.toLowerCase() === value.toLowerCase()),
            ),
          ),
        )
      : []
  const canCreate = props.multiple && props.creatable && creatableValues.length > 0

  function handleSelect(optionValue: string) {
    if (props.multiple) {
      props.onChange([...props.value, optionValue])
      setQuery('')
      return
    }

    props.onChange(optionValue === props.value ? '' : optionValue)
    setOpen(false)
  }

  function handleCreate() {
    if (!props.multiple || !creatableValues.length) {
      return
    }

    props.onChange([...props.value, ...creatableValues])
    setQuery('')
  }

  function removeValue(valueToRemove: string) {
    if (!props.multiple) {
      return
    }

    props.onChange(props.value.filter((value) => value !== valueToRemove))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {props.multiple ? (
        <div
          className={cn(
            'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          {selectedValues.map((value) => {
            const label = options.find((option) => option.value === value)?.label ?? value
            return (
              <Badge key={value} variant="secondary" className="gap-1 pr-1">
                {label}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={disabled}
                  aria-label={`Remove ${label}`}
                  onClick={() => removeValue(value)}
                  className="size-4 rounded-full"
                >
                  <X size={12} />
                </Button>
              </Badge>
            )
          })}
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              role="combobox"
              aria-expanded={open}
              disabled={disabled}
              className="min-w-24 flex-1 justify-between px-1.5 font-normal"
            >
              <span className="text-muted-foreground">{placeholder}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
        </div>
      ) : (
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('h-auto min-h-8 w-full justify-between font-normal', className)}
          >
            <span className={cn(!selectedOption && 'text-muted-foreground')}>
              {selectedOption?.label ?? placeholder}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            {canCreate && (
              <CommandGroup>
                <CommandItem onSelect={handleCreate}>
                  Add &quot;{creatableValues.join('", "')}&quot;
                </CommandItem>
              </CommandGroup>
            )}
            {!visibleOptions.length && !canCreate && <CommandEmpty>{emptyLabel}</CommandEmpty>}
            {visibleOptions.length > 0 && (
              <CommandGroup>
                {visibleOptions.map((option) => {
                  const isSelected = !props.multiple && option.value === props.value
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => {
                        handleSelect(option.value)
                      }}
                      data-checked={isSelected ? 'true' : undefined}
                    >
                      {option.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
