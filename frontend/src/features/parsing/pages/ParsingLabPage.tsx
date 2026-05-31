import { FlaskConical } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro } from "@/components/ui";
import { ParserProfileForm } from "@/features/parsing/components/ParserProfileForm";
import { ParserProfileList } from "@/features/parsing/components/ParserProfileList";
import { ParsingLabStats } from "@/features/parsing/components/ParsingLabStats";
import { useParsingLab } from "@/features/parsing/hooks/useParsingLab";

export function ParsingLabPage() {
  const parsingLab = useParsingLab();

  if (parsingLab.enabled && !parsingLab.loading && !parsingLab.isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Parsing Lab is restricted to platform admins."
          action={
            <Link className="button button--secondary" to="/search">
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Admin"
        title="Parsing lab"
        description="Manage versioned parser profiles, prompt templates, and publish controls in one place. Profiles stay workspace-specific, but this lab is available across the full platform."
        actions={
          <>
            <Link className="button button--secondary" to="/admin/settings">
              Runtime settings (search / ask)
            </Link>
            <Link className="button button--secondary" to="/admin/parsing">
              View parsing quality
            </Link>
            <button className="button button--primary" onClick={parsingLab.handleCreateDraft} type="button" disabled={!parsingLab.canEdit}>
              <FlaskConical size={14} />
              New Draft
            </button>
          </>
        }
      />

      {parsingLab.error ? <div className="status-banner">{parsingLab.error}</div> : null}
      {parsingLab.notice ? <div className="status-banner">{parsingLab.notice}</div> : null}

      <ParsingLabStats
        activeProfile={parsingLab.activeProfile}
        adminMemberships={parsingLab.adminMemberships}
        fetching={parsingLab.fetching}
        profiles={parsingLab.profiles}
        workspacesRepresented={parsingLab.workspacesRepresented}
      />

      <div className="page-stack">
        <ParserProfileList
          canEdit={parsingLab.canEdit}
          onCreateDraft={parsingLab.handleCreateDraft}
          onSelectProfile={parsingLab.handleSelectProfile}
          profiles={parsingLab.profiles}
          selectedId={parsingLab.selectedId}
          workspaceNameById={parsingLab.workspaceNameById}
        />

        <ParserProfileForm
          canEdit={parsingLab.canEdit}
          form={parsingLab.form}
          onPublish={() => void parsingLab.handlePublish()}
          onSave={() => void parsingLab.handleSave()}
          publishing={parsingLab.publishing}
          resolvedWorkspaceName={parsingLab.resolvedWorkspaceName}
          saving={parsingLab.saving}
          selectedProfile={parsingLab.selectedProfile}
          setForm={parsingLab.setForm}
        />
      </div>
    </div>
  );
}
