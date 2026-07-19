import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { captionLabelClassName } from '@/lib/typography'
import { cn } from '@/lib/utils'

const statCardIconVariants = cva('flex size-8.5 items-center justify-center rounded-xl border', {
  variants: {
    tone: {
      primary: 'border-primary/14 bg-primary/8 text-primary',
      secondary: 'border-border bg-muted text-muted-foreground',
      tertiary: 'border-success/18 bg-success/10 text-success',
    },
  },
  defaultVariants: {
    tone: 'primary',
  },
})

type StatCardProps = {
  label: string
  value: string
  delta?: string
  icon?: ReactNode
  loading?: boolean
  className?: string
} & VariantProps<typeof statCardIconVariants>

export function StatCard({
  label,
  value,
  delta,
  tone,
  icon,
  loading = false,
  className,
}: StatCardProps) {
  return (
    <Card className={cn('gap-0 p-5.5', className)}>
      <div className="flex items-center justify-between gap-3">
        {loading ? (
          <Skeleton className="h-3 w-[62%] max-w-35 rounded-full" />
        ) : (
          <span className={captionLabelClassName}>{label}</span>
        )}
        {loading ? (
          <Skeleton className="size-8.5 rounded-xl" />
        ) : (
          icon && <span className={statCardIconVariants({ tone })}>{icon}</span>
        )}
      </div>
      <div className="mt-4.5 flex items-end gap-3">
        {loading ? (
          <Skeleton className="h-8 w-24 rounded-full" />
        ) : (
          <strong className="text-3xl leading-none font-semibold">{value}</strong>
        )}
        {loading
          ? delta !== undefined && <Skeleton className="h-6 w-21.5 rounded-full" />
          : delta && (
              <span className="rounded-full bg-primary/12 px-2 py-1 text-xs font-bold text-primary">
                {delta}
              </span>
            )}
      </div>
    </Card>
  )
}
