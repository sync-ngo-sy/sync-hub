import { useEffect, useMemo, useState } from "react";
import { Building2, Link as LinkIcon, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { AccountProvisionResult, MembershipRole, TenantAdminSummary } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";

type ProvisionMode = "new-workspace" | "existing-workspace";

const MEMBERSHIP_ROLES: MembershipRole[] = ["owner", "admin", "recruiter", "viewer"];

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const emptyNewWorkspaceForm = {
  email: "",
  password: "",
  fullName: "",
  tenantName: "",
  tenantSlug: "",
  tenantIcon: "",
  role: "owner" as MembershipRole,
};

const emptyExistingWorkspaceForm = {
  email: "",
  password: "",
  fullName: "",
  tenantSlug: "",
  role: "recruiter" as MembershipRole,
};

function ResultCard({ result }: { result: AccountProvisionResult }) {
  return (
    <div className="evidence-card">
      <div className="signal-row">
        <strong>Account ready</strong>
        <Tag tone="success">{result.role}</Tag>
      </div>
      <p>
        <strong>{result.email}</strong> can sign in to <strong>{result.tenantName}</strong> ({result.tenantSlug}).
      </p>
      <div className="skill-list">
        <Tag>user {result.userId.slice(0, 8)}…</Tag>
        <Tag>tenant {result.tenantId.slice(0, 8)}…</Tag>
        <Tag>folder {result.folderName}</Tag>
      </div>
    </div>
  );
}

export function AccountProvisioningPage() {
  const { enabled, isAdmin, loading } = useAuth();
  const [mode, setMode] = useState<ProvisionMode>("new-workspace");
  const [tenants, setTenants] = useState<TenantAdminSummary[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [newWorkspaceForm, setNewWorkspaceForm] = useState(emptyNewWorkspaceForm);
  const [existingWorkspaceForm, setExistingWorkspaceForm] = useState(emptyExistingWorkspaceForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<AccountProvisionResult | null>(null);

  const suggestedSlug = useMemo(
    () => slugify(newWorkspaceForm.tenantSlug || newWorkspaceForm.tenantName),
    [newWorkspaceForm.tenantName, newWorkspaceForm.tenantSlug],
  );

  useEffect(() => {
    if (enabled && loading) {
      return;
    }
    if (enabled && !isAdmin) {
      return;
    }

    let active = true;
    setTenantsLoading(true);
    platformApi
      .listAdminTenants()
      .then((rows) => {
        if (active) {
          setTenants(rows);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load workspaces.");
        }
      })
      .finally(() => {
        if (active) {
          setTenantsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [enabled, isAdmin, loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setLastResult(null);

    try {
      if (mode === "new-workspace") {
        const result = await platformApi.createTenantAccount({
          email: newWorkspaceForm.email,
          password: newWorkspaceForm.password,
          tenantName: newWorkspaceForm.tenantName,
          tenantSlug: slugTouched ? newWorkspaceForm.tenantSlug : suggestedSlug,
          tenantIcon: newWorkspaceForm.tenantIcon,
          fullName: newWorkspaceForm.fullName,
          role: newWorkspaceForm.role,
        });
        setLastResult(result);
        setNotice(`Created workspace ${result.tenantName} and login for ${result.email}.`);
        setNewWorkspaceForm(emptyNewWorkspaceForm);
        setSlugTouched(false);
      } else {
        const result = await platformApi.addUserToTenant({
          email: existingWorkspaceForm.email,
          password: existingWorkspaceForm.password,
          tenantSlug: existingWorkspaceForm.tenantSlug,
          fullName: existingWorkspaceForm.fullName,
          role: existingWorkspaceForm.role,
        });
        setLastResult(result);
        setNotice(`Added ${result.email} to ${result.tenantName}.`);
        setExistingWorkspaceForm(emptyExistingWorkspaceForm);
      }

      const rows = await platformApi.listAdminTenants();
      setTenants(rows);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Account provisioning failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (enabled && !loading && !isAdmin) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Account provisioning is restricted to platform admins."
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
        title="Account provisioning"
        description="Create workspace owner accounts or add recruiters to an existing tenant. This replaces the tenant_admin.py CLI for day-to-day onboarding."
        actions={
          <>
            <Link className="button button--secondary" to="/admin">
              Platform dashboard
            </Link>
            <Link className="button button--secondary" to="/admin/settings">
              Runtime settings
            </Link>
          </>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}
      {notice ? <div className="status-banner">{notice}</div> : null}
      {lastResult ? <ResultCard result={lastResult} /> : null}

      <div className="admin-grid">
        <Panel className="table-card">
          <div className="stack">
            <div className="skill-list">
              <Building2 size={16} />
              <h3>Provision account</h3>
            </div>

            <div className="skill-list">
              <button
                type="button"
                className={mode === "new-workspace" ? "button button--primary" : "button button--secondary"}
                onClick={() => setMode("new-workspace")}
              >
                <UserPlus size={14} />
                New workspace
              </button>
              <button
                type="button"
                className={mode === "existing-workspace" ? "button button--primary" : "button button--secondary"}
                onClick={() => setMode("existing-workspace")}
              >
                <Users size={14} />
                Existing workspace
              </button>
            </div>

            <form className="stack" onSubmit={handleSubmit}>
              {mode === "new-workspace" ? (
                <div className="parser-form-grid">
                  <label className="parser-field parser-field--full">
                    <span>Workspace name</span>
                    <input
                      className="form-input"
                      value={newWorkspaceForm.tenantName}
                      onChange={(event) => setNewWorkspaceForm((current) => ({ ...current, tenantName: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="parser-field">
                    <span>Workspace slug</span>
                    <input
                      className="form-input"
                      value={slugTouched ? newWorkspaceForm.tenantSlug : suggestedSlug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setNewWorkspaceForm((current) => ({ ...current, tenantSlug: event.target.value }));
                      }}
                      placeholder={suggestedSlug || "auto-generated"}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Icon URL (optional)</span>
                    <input
                      className="form-input"
                      value={newWorkspaceForm.tenantIcon}
                      onChange={(event) => setNewWorkspaceForm((current) => ({ ...current, tenantIcon: event.target.value }))}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Owner email</span>
                    <input
                      className="form-input"
                      type="email"
                      value={newWorkspaceForm.email}
                      onChange={(event) => setNewWorkspaceForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="parser-field">
                    <span>Password</span>
                    <input
                      className="form-input"
                      type="password"
                      value={newWorkspaceForm.password}
                      onChange={(event) => setNewWorkspaceForm((current) => ({ ...current, password: event.target.value }))}
                      required
                      minLength={8}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Full name (optional)</span>
                    <input
                      className="form-input"
                      value={newWorkspaceForm.fullName}
                      onChange={(event) => setNewWorkspaceForm((current) => ({ ...current, fullName: event.target.value }))}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Role</span>
                    <select
                      className="form-select"
                      value={newWorkspaceForm.role}
                      onChange={(event) =>
                        setNewWorkspaceForm((current) => ({ ...current, role: event.target.value as MembershipRole }))
                      }
                    >
                      {MEMBERSHIP_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="parser-form-grid">
                  <label className="parser-field parser-field--full">
                    <span>Workspace</span>
                    <select
                      className="form-select"
                      value={existingWorkspaceForm.tenantSlug}
                      onChange={(event) =>
                        setExistingWorkspaceForm((current) => ({ ...current, tenantSlug: event.target.value }))
                      }
                      required
                    >
                      <option value="" disabled>
                        Select workspace
                      </option>
                      {tenants.map((tenant) => (
                        <option key={tenant.tenantId} value={tenant.slug}>
                          {tenant.name} ({tenant.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="parser-field">
                    <span>Email</span>
                    <input
                      className="form-input"
                      type="email"
                      value={existingWorkspaceForm.email}
                      onChange={(event) => setExistingWorkspaceForm((current) => ({ ...current, email: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="parser-field">
                    <span>Password</span>
                    <input
                      className="form-input"
                      type="password"
                      value={existingWorkspaceForm.password}
                      onChange={(event) => setExistingWorkspaceForm((current) => ({ ...current, password: event.target.value }))}
                      required
                      minLength={8}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Full name (optional)</span>
                    <input
                      className="form-input"
                      value={existingWorkspaceForm.fullName}
                      onChange={(event) => setExistingWorkspaceForm((current) => ({ ...current, fullName: event.target.value }))}
                    />
                  </label>
                  <label className="parser-field">
                    <span>Role</span>
                    <select
                      className="form-select"
                      value={existingWorkspaceForm.role}
                      onChange={(event) =>
                        setExistingWorkspaceForm((current) => ({ ...current, role: event.target.value as MembershipRole }))
                      }
                    >
                      {MEMBERSHIP_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <div className="skill-list">
                <button className="button button--primary" type="submit" disabled={submitting}>
                  {submitting ? "Creating account…" : mode === "new-workspace" ? "Create workspace account" : "Add user to workspace"}
                </button>
              </div>
            </form>

            <div className="evidence-card">
              <div className="skill-list">
                <LinkIcon size={16} />
                <strong>After creation</strong>
              </div>
              <p>Share the email and password securely. Folder sync still uses tenant_admin.py ensure-workspace-folders if you need local or Drive folders.</p>
            </div>
          </div>
        </Panel>

        <Panel className="table-card">
          <div className="stack">
            <div className="signal-row">
              <div>
                <h3>Workspaces</h3>
                <p>{tenantsLoading ? "Loading tenants…" : `${tenants.length} workspaces on the platform.`}</p>
              </div>
              <Tag tone="primary">{tenants.length}</Tag>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Members</th>
                  <th>CVs</th>
                  <th>Candidates</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.tenantId}>
                    <td>
                      <strong>{tenant.name}</strong>
                      <div className="muted">{tenant.slug}</div>
                    </td>
                    <td>{tenant.membershipCount}</td>
                    <td>{tenant.documentCount.toLocaleString()}</td>
                    <td>{tenant.candidateCount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
