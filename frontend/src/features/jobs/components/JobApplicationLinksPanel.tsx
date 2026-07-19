import { FormEvent, useMemo, useState } from "react";
import { Copy, Link2, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, Panel, Tag } from "@/components/ui";
import type { JobApplicationLinkInput, JobPosting } from "@/lib/contracts";
import { platformApi } from "@/lib/platformApi";
import { formatDate, trackedApplicationLinkHref } from "@/features/jobs/jobPresentation";

type JobApplicationLinksPanelProps = {
  job: JobPosting;
};

type LinkFormState = {
  sourceCategoryId: string;
  label: string;
  sourceDetail: string;
  campaignName: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
};

const emptyLinkForm = (): LinkFormState => ({
  sourceCategoryId: "",
  label: "",
  sourceDetail: "",
  campaignName: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
});

export function JobApplicationLinksPanel({ job }: JobApplicationLinksPanelProps) {
  const queryClient = useQueryClient();
  const [categoryName, setCategoryName] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [linkForm, setLinkForm] = useState<LinkFormState>(emptyLinkForm);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["job-application-source-categories", job.tenantId],
    queryFn: () => platformApi.listJobApplicationSourceCategories(job.tenantId),
    enabled: Boolean(job.tenantId),
  });
  const linksQuery = useQuery({
    queryKey: ["job-application-links", job.id],
    queryFn: () => platformApi.listJobApplicationLinks(job.id),
    enabled: Boolean(job.id),
  });

  const saveCategoryMutation = useMutation({
    mutationFn: () => platformApi.saveJobApplicationSourceCategory({
      tenantId: job.tenantId,
      name: categoryName.trim(),
      description: categoryDescription.trim(),
    }),
    onSuccess: () => {
      setCategoryName("");
      setCategoryDescription("");
      void queryClient.invalidateQueries({ queryKey: ["job-application-source-categories", job.tenantId] });
    },
  });

  const saveLinkMutation = useMutation({
    mutationFn: (input: JobApplicationLinkInput) => platformApi.saveJobApplicationLink(input),
    onSuccess: () => {
      setLinkForm(emptyLinkForm());
      void queryClient.invalidateQueries({ queryKey: ["job-application-links", job.id] });
    },
  });

  const deactivateLinkMutation = useMutation({
    mutationFn: (linkId: string) => {
      const link = linksQuery.data?.find((item) => item.id === linkId);
      if (!link) {
        throw new Error("Application link was not found.");
      }
      return platformApi.saveJobApplicationLink({
        jobId: job.id,
        linkId,
        sourceCategoryId: link.sourceCategoryId,
        label: link.label,
        sourceDetail: link.sourceDetail,
        campaignName: link.campaignName,
        utmSource: link.utmSource ?? undefined,
        utmMedium: link.utmMedium ?? undefined,
        utmCampaign: link.utmCampaign ?? undefined,
        utmTerm: link.utmTerm ?? undefined,
        utmContent: link.utmContent ?? undefined,
        isActive: false,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["job-application-links", job.id] });
    },
  });

  const activeCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => category.isActive),
    [categoriesQuery.data],
  );

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryName.trim()) {
      return;
    }
    await saveCategoryMutation.mutateAsync();
  }

  async function handleCreateLink(event: FormEvent) {
    event.preventDefault();
    if (!linkForm.sourceCategoryId) {
      return;
    }
    await saveLinkMutation.mutateAsync({
      jobId: job.id,
      sourceCategoryId: linkForm.sourceCategoryId,
      label: linkForm.label.trim(),
      sourceDetail: linkForm.sourceDetail.trim(),
      campaignName: linkForm.campaignName.trim(),
      utmSource: linkForm.utmSource.trim() || undefined,
      utmMedium: linkForm.utmMedium.trim() || undefined,
      utmCampaign: linkForm.utmCampaign.trim() || undefined,
    });
  }

  async function copyTrackedLink(token: string) {
    const href = trackedApplicationLinkHref(job, token);
    if (!href) {
      return;
    }
    const absoluteUrl = `${window.location.origin}${window.location.pathname}${href}`;
    await navigator.clipboard.writeText(absoluteUrl);
    setCopyMessage("Tracked link copied.");
    window.setTimeout(() => setCopyMessage(null), 2000);
  }

  if (!job.publicSlug) {
    return (
      <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
        <div className="p-6">
          <EmptyState
            title="Public slug required"
            detail="Set a public slug on this job before creating tracked application links."
          />
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {copyMessage ? <div className="status-banner">{copyMessage}</div> : null}
      {saveCategoryMutation.error ? <div className="status-banner">{String(saveCategoryMutation.error)}</div> : null}
      {saveLinkMutation.error ? <div className="status-banner">{String(saveLinkMutation.error)}</div> : null}
      {deactivateLinkMutation.error ? <div className="status-banner">{String(deactivateLinkMutation.error)}</div> : null}

      <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
        <div className="p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)] m-0">Source categories</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
              Define reusable channels such as LinkedIn, job boards, or referral programs.
            </p>
          </div>

          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleCreateCategory}>
            <label className="parser-field">
              <span>Category name</span>
              <input
                className="form-input"
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="LinkedIn"
                required
              />
            </label>
            <label className="parser-field">
              <span>Description</span>
              <input
                className="form-input"
                value={categoryDescription}
                onChange={(event) => setCategoryDescription(event.target.value)}
                placeholder="Paid social campaigns"
              />
            </label>
            <button
              className="button button--secondary self-end"
              type="submit"
              disabled={saveCategoryMutation.isPending}
            >
              <Plus size={16} />
              Add category
            </button>
          </form>

          {activeCategories.length ? (
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((category) => (
                <Tag key={category.id}>{category.name}</Tag>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] m-0">No source categories yet.</p>
          )}
        </div>
      </Panel>

      <Panel className="!border-none relative overflow-hidden rounded-[var(--radius,22px)]">
        <div className="p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)] m-0">Tracked application links</h2>
            <p className="text-sm text-[var(--text-muted)] mt-1 m-0">
              Create multiple links per job. Attribution is resolved server-side from the ref token only.
            </p>
          </div>

          <form className="job-editor" onSubmit={handleCreateLink}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="parser-field">
                <span>Source category</span>
                <select
                  className="form-select"
                  value={linkForm.sourceCategoryId}
                  onChange={(event) => setLinkForm((current) => ({ ...current, sourceCategoryId: event.target.value }))}
                  required
                >
                  <option value="">Select category</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label className="parser-field">
                <span>Link label</span>
                <input
                  className="form-input"
                  value={linkForm.label}
                  onChange={(event) => setLinkForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Spring hiring push"
                />
              </label>
              <label className="parser-field">
                <span>Source detail / platform</span>
                <input
                  className="form-input"
                  value={linkForm.sourceDetail}
                  onChange={(event) => setLinkForm((current) => ({ ...current, sourceDetail: event.target.value }))}
                  placeholder="LinkedIn Jobs"
                />
              </label>
              <label className="parser-field">
                <span>Campaign</span>
                <input
                  className="form-input"
                  value={linkForm.campaignName}
                  onChange={(event) => setLinkForm((current) => ({ ...current, campaignName: event.target.value }))}
                  placeholder="backend-engineer-q2"
                />
              </label>
              <label className="parser-field">
                <span>UTM source</span>
                <input
                  className="form-input"
                  value={linkForm.utmSource}
                  onChange={(event) => setLinkForm((current) => ({ ...current, utmSource: event.target.value }))}
                />
              </label>
              <label className="parser-field">
                <span>UTM medium</span>
                <input
                  className="form-input"
                  value={linkForm.utmMedium}
                  onChange={(event) => setLinkForm((current) => ({ ...current, utmMedium: event.target.value }))}
                />
              </label>
              <label className="parser-field md:col-span-2">
                <span>UTM campaign</span>
                <input
                  className="form-input"
                  value={linkForm.utmCampaign}
                  onChange={(event) => setLinkForm((current) => ({ ...current, utmCampaign: event.target.value }))}
                />
              </label>
            </div>
            <button className="button button--primary" type="submit" disabled={saveLinkMutation.isPending || !activeCategories.length}>
              <Link2 size={16} />
              Create tracked link
            </button>
          </form>

          {linksQuery.data?.length ? (
            <div className="flex flex-col gap-3">
              {linksQuery.data.map((link) => (
                <div key={link.id} className="flex flex-col gap-3 p-4 bg-[var(--border)] rounded-2xl md:flex-row md:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm text-[var(--text)]">{link.label || link.sourceCategoryName}</strong>
                      <Tag tone={link.isActive ? "success" : "neutral"}>{link.isActive ? "Active" : "Inactive"}</Tag>
                      <Tag>{link.sourceCategoryName}</Tag>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1 m-0">
                      {link.sourceDetail || "No platform detail"}
                      {link.campaignName ? ` · ${link.campaignName}` : ""}
                      {` · Created ${formatDate(link.createdAt)}`}
                    </p>
                    <code className="text-xs text-[var(--text-muted)] break-all">{trackedApplicationLinkHref(job, link.token)}</code>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="button button--secondary button--compact"
                      type="button"
                      onClick={() => void copyTrackedLink(link.token)}
                      disabled={!link.isActive}
                    >
                      <Copy size={14} />
                      Copy link
                    </button>
                    {link.isActive ? (
                      <button
                        className="button button--secondary button--compact"
                        type="button"
                        onClick={() => deactivateLinkMutation.mutate(link.id)}
                        disabled={deactivateLinkMutation.isPending}
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)] m-0">No tracked links created for this job yet.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
