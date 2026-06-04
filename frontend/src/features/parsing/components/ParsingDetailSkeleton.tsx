import { Panel } from "@/components/ui";

export function ParsingDetailSkeleton() {
  return (
    <div className="page-stack" aria-busy="true" aria-label="Loading parsing document diagnostics">
      <Panel className="table-card parsing-detail-skeleton__header">
        <div className="stack">
          <span className="stat-card__skeleton parsing-skeleton__subtitle" />
          <span className="stat-card__skeleton parsing-detail-skeleton__title" />
          <span className="stat-card__skeleton parsing-detail-skeleton__copy" />
        </div>
      </Panel>

      <div className="stats-grid">
        {["coverage", "confidence", "text", "warnings"].map((item) => (
          <Panel key={item} className="stat-card stat-card--loading">
            <div className="stat-card__header">
              <span className="stat-card__skeleton stat-card__skeleton--label" />
              <span className="stat-card__skeleton stat-card__skeleton--icon" />
            </div>
            <div className="stat-card__value-row">
              <span className="stat-card__skeleton stat-card__skeleton--value" />
              <span className="stat-card__skeleton stat-card__skeleton--delta" />
            </div>
          </Panel>
        ))}
      </div>

      <div className="detail-grid">
        <div className="page-stack">
          {["fields", "profile", "content", "raw"].map((section) => (
            <Panel key={section} className="table-card parsing-skeleton-card">
              <div className="stack">
                <span className="stat-card__skeleton parsing-skeleton__title" />
                <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                <div className="parsing-detail-skeleton__grid">
                  {Array.from({ length: section === "raw" ? 3 : 4 }).map((_, index) => (
                    <div key={index} className="parsing-skeleton-note">
                      <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                      <span className="stat-card__skeleton parsing-skeleton__line" />
                      <span className="stat-card__skeleton parsing-skeleton__line parsing-skeleton__line--short" />
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
        </div>

        <div className="page-stack">
          {["metadata", "warnings", "hints"].map((section) => (
            <Panel key={section} className="table-card parsing-skeleton-card">
              <div className="stack">
                <span className="stat-card__skeleton parsing-skeleton__title" />
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="parsing-skeleton-note">
                    <span className="stat-card__skeleton parsing-skeleton__subtitle" />
                    <span className="stat-card__skeleton parsing-skeleton__line" />
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}
