import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PlatformScopeControl } from "@/components/PlatformScopeControl";
import { PageIntro } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { usePlatformScope } from "@/lib/platformScope";
import { JobEditor } from "@/features/jobs/components/JobEditor";
import { emptyJobForm } from "@/features/jobs/jobForm";

export function JobPostingCreatePage() {
  const navigate = useNavigate();
  const { currentTenant } = useAuth();
  const {
    currentWorkspace,
    isAllScope,
    isPlatformAdmin,
    resolvedTenantIds,
    scopeMode,
    setScopeMode,
    setWorkspaceId,
    workspaceOptions,
  } = usePlatformScope();
  const tenantId = currentWorkspace?.id ?? currentTenant?.id ?? resolvedTenantIds[0] ?? "mock-tenant";
  const initialForm = useMemo(() => emptyJobForm(tenantId), [tenantId]);

  return (
    <div className="page-stack" style={{ width: "100%", maxWidth: "100%" }}>
      <PageIntro
        actions={
          <div className="job-page-actions">
            <PlatformScopeControl
              isPlatformAdmin={isPlatformAdmin}
              scopeMode={scopeMode}
              currentWorkspace={currentWorkspace}
              workspaceOptions={workspaceOptions}
              onChangeScopeMode={setScopeMode}
              onChangeWorkspace={setWorkspaceId}
            />
            <Link className="button button--secondary" to="/jobs">
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />

      {isAllScope ? <div className="status-banner">This posting will be created in the currently selected workspace.</div> : null}

      {/* Added inline styles to force full width and override any shifting margins */}
      <div className="job-form-page" style={{ width: "100%", maxWidth: "100%", margin: 0 }}>
        <JobEditor initialForm={initialForm} onSaved={(job) => navigate(`/jobs/${job.id}`)} />
      </div>
    </div>
  );
}
