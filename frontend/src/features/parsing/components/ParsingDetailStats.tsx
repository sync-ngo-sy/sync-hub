import { StatCard } from "@/components/ui";
import type { ParsingDocumentDetail } from "@/lib/contracts";

type ParsingDetailStatsProps = {
  detail: ParsingDocumentDetail;
  fetching: boolean;
};

export function ParsingDetailStats({ detail, fetching }: ParsingDetailStatsProps) {
  return (
    <div className="stats-grid">
      <StatCard label="Parse coverage" value={`${detail.parsedPercentage}%`} delta={detail.qualityBand} />
      <StatCard
        label="Extraction confidence"
        value={`${detail.extractionConfidence}%`}
        delta={fetching ? "Refreshing" : detail.status}
        tone="secondary"
      />
      <StatCard label="Raw text length" value={detail.rawTextLength.toLocaleString()} delta="characters" tone="tertiary" />
      <StatCard label="Warnings" value={`${detail.warnings.length}`} delta={`${detail.missingFields.length} missing`} />
    </div>
  );
}
