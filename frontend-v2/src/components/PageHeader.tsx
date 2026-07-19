import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-3 font-sans text-xs font-medium tracking-[0.12em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="m-0 text-3xl leading-[1.08] font-medium tracking-[-0.045em]">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap gap-2.5 sm:w-auto sm:justify-end">{actions}</div>
      )}
    </header>
  )
}
