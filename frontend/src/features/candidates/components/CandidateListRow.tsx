import { Link } from "react-router-dom";
import { Tag } from "@/components/ui";
import { formatUpdatedAt } from "@/features/candidates/candidateListState";
import type { CandidateListItem } from "@/lib/contracts";

type CandidateListRowProps = {
  item: CandidateListItem;
  showWorkspace: boolean;
};

export function CandidateListRow({ item, showWorkspace }: CandidateListRowProps) {
  return (
    <tr>
      <td>
        <Link className="candidate-list__name-link" to={`/dossier/${item.candidateId}`}>
          <strong>{item.name}</strong>
        </Link>
        {item.email ? <span className="candidate-list__email">{item.email}</span> : null}
      </td>
      <td>
        <Tag tone="success">{item.stage}</Tag>
      </td>
      <td>{item.appliedRole || item.primaryRole || "—"}</td>
      <td>{item.location || "—"}</td>
      <td>
        <Tag>{item.source.replace(/_/g, " ")}</Tag>
      </td>
      {showWorkspace ? <td>{item.tenantId.slice(0, 8)}</td> : null}
      <td>{formatUpdatedAt(item.updatedAt)}</td>
    </tr>
  );
}
