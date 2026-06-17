import { Panel } from "@/components/ui";
import { CandidateListSkeletonRows } from "@/features/candidates/components/CandidateListSkeletonRows";

export function CandidateListSkeleton() {
  return (
    <Panel className="table-card candidate-list-panel" aria-busy="true" aria-label="Loading candidates">
      <CandidateListSkeletonRows />
    </Panel>
  );
}
