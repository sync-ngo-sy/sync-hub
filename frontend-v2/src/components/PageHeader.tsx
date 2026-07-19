import type { ReactNode } from 'react'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-5">
      <div>
        {eyebrow && (
          <p className="mb-3 font-sans text-xs tracking-[0.16em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="m-0 text-5xl leading-[0.94] font-semibold tracking-[-0.06em]">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-[68ch] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap justify-end gap-2.5">{actions}</div>}
    </header>
  )
}
