export function CandidateListSkeletonRows() {
  return (
    <div className="candidate-list-skeleton">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="candidate-list-skeleton__row">
          <span className="stat-card__skeleton candidate-list-skeleton__cell candidate-list-skeleton__cell--name" />
          <span className="stat-card__skeleton candidate-list-skeleton__cell" />
          <span className="stat-card__skeleton candidate-list-skeleton__cell" />
          <span className="stat-card__skeleton candidate-list-skeleton__cell candidate-list-skeleton__cell--small" />
        </div>
      ))}
    </div>
  );
}
