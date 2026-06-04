import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { EmptyState, PageIntro } from "@/components/ui";
import { ExtractedProfilePanel } from "@/features/parsing/components/ExtractedProfilePanel";
import { FieldCoveragePanel } from "@/features/parsing/components/FieldCoveragePanel";
import { OptimizationHintsPanel } from "@/features/parsing/components/OptimizationHintsPanel";
import { ParsedContentPanel } from "@/features/parsing/components/ParsedContentPanel";
import { ParsingDetailSkeleton } from "@/features/parsing/components/ParsingDetailSkeleton";
import { ParsingDetailStats } from "@/features/parsing/components/ParsingDetailStats";
import { ParsingWarningsPanel } from "@/features/parsing/components/ParsingWarningsPanel";
import { ProcessingMetadataPanel } from "@/features/parsing/components/ProcessingMetadataPanel";
import { RawTextPreviewPanel } from "@/features/parsing/components/RawTextPreviewPanel";
import { useParsingDocumentDetail } from "@/features/parsing/hooks/useParsingDocumentDetail";

export function ParsingDetailPage() {
  const { documentId } = useParams();
  const parsingDetail = useParsingDocumentDetail(documentId);

  if (!documentId) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Document not selected"
          detail="Choose a parsed document from the parsing overview to inspect its extracted fields and parser diagnostics."
          action={
            <Link className="button button--secondary" to="/admin/parsing">
              Back to Parsing Overview
            </Link>
          }
        />
      </div>
    );
  }

  if ((parsingDetail.enabled && parsingDetail.loading) || (parsingDetail.fetching && !parsingDetail.hasLoaded)) {
    return <ParsingDetailSkeleton />;
  }

  if (parsingDetail.enabled && !parsingDetail.loading && !parsingDetail.isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Parsing diagnostics are restricted to platform admins."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  if (!parsingDetail.detail) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Document not found"
          detail="This document is not available in the admin workspace scope for the current user."
          action={
            <Link className="button button--secondary" to="/admin/parsing">
              Back to Parsing Overview
            </Link>
          }
        />
      </div>
    );
  }

  const { detail } = parsingDetail;

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow={`Admin \u00b7 ${parsingDetail.workspaceName}`}
        title={detail.originalFilename}
        description="Inspect exactly what the parser extracted, how strong the field coverage is, and where to tune the parser before scaling up the platform corpus."
        actions={
          <>
            <button
              className="button button--primary"
              onClick={() => void parsingDetail.handleOpenOriginalCv()}
              type="button"
              disabled={parsingDetail.openingOriginal || !parsingDetail.canOpenOriginal}
            >
              <ExternalLink size={14} />
              {parsingDetail.openingOriginal ? "Opening CV..." : "Open Original CV"}
            </button>
            <Link className="button button--secondary" to="/admin/parsing">
              <ArrowLeft size={14} />
              Back to Overview
            </Link>
          </>
        }
      />

      {parsingDetail.error ? <div className="status-banner">{parsingDetail.error}</div> : null}

      <ParsingDetailStats detail={detail} fetching={parsingDetail.fetching} />

      <div className="detail-grid">
        <div className="page-stack">
          <FieldCoveragePanel detail={detail} />
          <ExtractedProfilePanel detail={detail} />
          <ParsedContentPanel detail={detail} />
          <RawTextPreviewPanel detail={detail} />
        </div>

        <div className="page-stack">
          <ProcessingMetadataPanel detail={detail} workspaceName={parsingDetail.workspaceName} />
          <ParsingWarningsPanel detail={detail} />
          <OptimizationHintsPanel detail={detail} />
        </div>
      </div>
    </div>
  );
}
