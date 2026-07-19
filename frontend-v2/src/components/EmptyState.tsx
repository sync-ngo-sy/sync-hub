import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title: string
  detail: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, detail, action, className }: EmptyStateProps) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <div className="flex flex-col items-start gap-3 p-6">
        <Inbox aria-hidden="true" className="text-primary" size={18} />
        <h2 className="text-base font-medium">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{detail}</p>
        {action}
      </div>
    </Card>
  )
}
