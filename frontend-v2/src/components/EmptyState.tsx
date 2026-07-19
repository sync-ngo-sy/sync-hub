import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface EmptyStateProps {
  title: string
  detail: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ title, detail, action, className }: EmptyStateProps) {
  return (
    <Card className={className}>
      <div className="flex flex-col items-start gap-3 p-7">
        <Sparkles className="text-primary" size={18} />
        <strong>{title}</strong>
        <p className="text-muted-foreground">{detail}</p>
        {action}
      </div>
    </Card>
  )
}
