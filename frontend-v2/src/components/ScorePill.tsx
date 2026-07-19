import { captionLabelClassName } from '@/lib/typography'

interface ScorePillProps {
  score: number
  label?: string
}

export function ScorePill({ score, label = 'Match' }: ScorePillProps) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <strong className="text-3xl leading-none font-bold text-primary">{Math.round(score)}%</strong>
      {label && <span className={captionLabelClassName}>{label}</span>}
    </div>
  )
}
