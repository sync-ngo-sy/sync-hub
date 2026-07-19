interface ScorePillProps {
  score: number
  label?: string
}

export function ScorePill({ score, label = 'Match' }: ScorePillProps) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <strong className="dashboard-number text-primary">{Math.round(score)}%</strong>
      {label && <span className="caption-label">{label}</span>}
    </div>
  )
}
