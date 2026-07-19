import { captionLabelClassName, dashboardNumberClassName } from '@/lib/typography'
import { cn } from '@/lib/utils'

interface ScorePillProps {
  score: number
  label?: string
}

export function ScorePill({ score, label = 'Match' }: ScorePillProps) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <strong className={cn(dashboardNumberClassName, 'text-primary')}>{Math.round(score)}%</strong>
      {label && <span className={captionLabelClassName}>{label}</span>}
    </div>
  )
}
