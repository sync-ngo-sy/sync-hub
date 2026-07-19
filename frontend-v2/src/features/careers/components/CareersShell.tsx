import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function CareersShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-svh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between px-6">
          <Link to="/careers" className="flex items-center gap-3" aria-label="SYNC careers home">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
              S
            </span>
            <span className="text-lg font-medium tracking-[-0.03em]">SYNC Careers</span>
          </Link>
          <span className="caption-label hidden sm:block">Build what hiring needs next</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">{children}</div>
    </main>
  )
}
