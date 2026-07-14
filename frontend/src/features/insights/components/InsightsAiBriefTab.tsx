import { Bot, Download, FileText, LoaderCircle, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Panel, Tag } from "@/components/ui";
import {
  formatReportTypeLabel,
  exportInsightReportJson,
  exportInsightReportMarkdown,
  getActiveTicketStepIndex,
  getInsightReportTicketSteps,
  INSIGHT_REPORT_TYPES,
} from "@/features/insights/insightReport.helpers";
import { readInsightsAiBriefHandoff } from "@/features/insights/insightsDashboard.helpers";
import { cn } from "@/lib/cn";
import type { InsightReportRunDetail, InsightReportType, InsightsDashboardSnapshot, InsightsGapAnalysis } from "@/lib/contracts";
import { resolveGapRequirements } from "@/lib/insightsGap";
import { platformApi } from "@/lib/platformApi";

type InsightsAiBriefTabProps = {
  gapAnalysis: InsightsGapAnalysis;
  onOpenSearch: (skills: string[], query?: string) => void;
  snapshot: InsightsDashboardSnapshot;
  tenantIds: string[];
};

export function InsightsAiBriefTab({ gapAnalysis, onOpenSearch, snapshot, tenantIds }: InsightsAiBriefTabProps) {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState<InsightReportType>("corpus_overview");
  const [focusDraft, setFocusDraft] = useState("");
  const [targetSkills, setTargetSkills] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    const handoff = readInsightsAiBriefHandoff();
    if (!handoff) {
      return;
    }
    setReportType(handoff.reportType);
    if (handoff.focus) {
      setFocusDraft(handoff.focus);
    }
    if (handoff.targetSkills?.length) {
      setTargetSkills(handoff.targetSkills);
    }
  }, []);

  const selectedTemplate = INSIGHT_REPORT_TYPES.find((item) => item.id === reportType) ?? INSIGHT_REPORT_TYPES[0];
  const defaultFocus = useMemo(() => {
    if (reportType === "gap_brief") {
      return snapshot.gapAnalysis.targetRole ?? "Cloud Engineer with Kubernetes and Terraform";
    }
    if (reportType === "job_family_analysis") {
      return snapshot.jobFamilies[0]?.label ?? "Backend Engineering";
    }
    return "";
  }, [reportType, snapshot.gapAnalysis.targetRole, snapshot.jobFamilies]);

  useEffect(() => {
    setFocusDraft(defaultFocus);
  }, [defaultFocus, reportType]);

  const historyQuery = useQuery({
    queryKey: ["insight-report-runs", tenantIds.join("|")],
    queryFn: () => platformApi.listInsightReportRuns(tenantIds, 12),
    enabled: tenantIds.length > 0,
  });

  const activeRunQuery = useQuery({
    queryKey: ["insight-report-run", activeRunId],
    queryFn: () => platformApi.getInsightReportRun(activeRunId ?? ""),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.run.status;
      return status === "queued" || status === "running" ? 1200 : false;
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const corpusSkills = snapshot.skillsFrequency.map((item) => item.skill);
      const resolvedSkills = targetSkills.length
        ? targetSkills
        : resolveGapRequirements(
          { targetRole: focusDraft.trim() || undefined, targetSkills },
          corpusSkills,
        );
      return platformApi.startInsightReport(
        {
          reportType,
          focus: focusDraft.trim() || undefined,
          targetRole: focusDraft.trim() || undefined,
          targetSkills: reportType === "gap_brief" ? resolvedSkills : undefined,
        },
        tenantIds,
      );
    },
    onSuccess: (detail) => {
      setActiveRunId(detail.run.id);
      void queryClient.invalidateQueries({ queryKey: ["insight-report-runs", tenantIds.join("|")] });
    },
  });

  const activeDetail: InsightReportRunDetail | undefined = activeRunQuery.data ?? generateMutation.data;
  const activeStatus = activeDetail?.run.status ?? (generateMutation.isPending ? "running" : null);
  const ticketSteps = getInsightReportTicketSteps(activeStatus ?? "queued");
  const activeStepIndex = getActiveTicketStepIndex(activeStatus ?? "queued");
  const report = activeDetail?.report;
  const isGenerating = generateMutation.isPending || activeStatus === "queued" || activeStatus === "running";

  function runAssistantPrompt(prompt: string) {
    const normalized = prompt.toLowerCase();
    if (normalized.includes("search") || normalized.includes("matching candidates")) {
      const skills = gapAnalysis.targetSkills.length ? gapAnalysis.targetSkills : targetSkills;
      onOpenSearch(skills, skills.join(" "));
      return;
    }
    if (normalized.includes("gap brief")) {
      setReportType("gap_brief");
      if (gapAnalysis.targetRole) {
        setFocusDraft(gapAnalysis.targetRole);
      }
      if (gapAnalysis.targetSkills.length) {
        setTargetSkills(gapAnalysis.targetSkills);
      }
    }
  }

  return (
    <div id="insights-panel-tab4" className="insights-tab-panel" role="tabpanel" aria-labelledby="insights-tab4">
      <div className="ai-brief-grid">
        <Panel className="table-card ai-brief-panel">
          <div className="panel-heading-row">
            <div>
              <Tag tone="primary">AI insight</Tag>
              <h3>Generate grounded report</h3>
            </div>
            {isGenerating ? <Tag tone="warning">Ticket in progress</Tag> : null}
          </div>

          <div className="ai-brief-types" role="radiogroup" aria-label="Report type">
            {INSIGHT_REPORT_TYPES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn("ai-brief-type", reportType === option.id && "ai-brief-type--active")}
                aria-pressed={reportType === option.id}
                onClick={() => setReportType(option.id)}
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>

          <form
            className="ai-brief-form"
            onSubmit={(event) => {
              event.preventDefault();
              generateMutation.mutate();
            }}
          >
            <label className="ai-brief-form__field">
              <span>{reportType === "corpus_overview" ? "Optional focus" : "Focus requirement"}</span>
              <input
                value={focusDraft}
                onChange={(event) => setFocusDraft(event.target.value)}
                placeholder={selectedTemplate.placeholder}
                aria-label={selectedTemplate.placeholder}
              />
            </label>
            <button className="button button--primary" type="submit" disabled={isGenerating || !tenantIds.length}>
              {isGenerating ? (
                <>
                  <LoaderCircle size={16} className="spin-icon" />
                  Generating brief
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Open report ticket
                </>
              )}
            </button>
          </form>

          {generateMutation.error ? (
            <p className="ai-brief-error" role="alert">
              {String(generateMutation.error)}
            </p>
          ) : null}

          <div className="ai-brief-ticket" aria-live="polite">
            <div className="ai-brief-ticket__header">
              <FileText size={18} />
              <div>
                <strong>Report ticket</strong>
                <span>{activeDetail?.run.id ? `Run ${activeDetail.run.id.slice(0, 8)}` : "No active ticket yet"}</span>
              </div>
            </div>
            <ol className="ai-brief-ticket__steps">
              {ticketSteps.map((step, index) => (
                <li
                  key={step.id}
                  className={cn(
                    "ai-brief-ticket__step",
                    index < activeStepIndex && "ai-brief-ticket__step--done",
                    index === activeStepIndex && "ai-brief-ticket__step--active",
                    activeStatus === "failed" && index === activeStepIndex && "ai-brief-ticket__step--failed",
                  )}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            {activeDetail?.run.failureReason ? (
              <p className="ai-brief-error">{activeDetail.run.failureReason}</p>
            ) : null}
          </div>
        </Panel>

        <div className="ai-brief-stack">
          <Panel className="table-card ai-brief-panel">
            <div className="panel-heading-row">
              <div>
                <Tag tone="success">Report output</Tag>
                <h3>{report?.title ?? "Waiting for report"}</h3>
              </div>
              <div className="ai-brief-export-row">
                {report && activeDetail?.run ? (
                  <>
                    <button
                      className="button button--secondary ai-brief-export"
                      type="button"
                      onClick={() => exportInsightReportMarkdown(report, activeDetail.run)}
                    >
                      <Download size={16} />
                      Markdown
                    </button>
                    <button
                      className="button button--secondary ai-brief-export"
                      type="button"
                      onClick={() => exportInsightReportJson(report, activeDetail.run)}
                    >
                      <Download size={16} />
                      JSON
                    </button>
                  </>
                ) : null}
                {activeDetail?.run.llmProvider ? (
                  <Tag tone="primary">{activeDetail.run.llmProvider}</Tag>
                ) : null}
              </div>
            </div>

            {!report ? (
              <p className="muted">
                Open a ticket to generate a grounded brief from the current corpus snapshot, taxonomy mix, and gap signals.
              </p>
            ) : (
              <div className="ai-brief-report">
                <section className="ai-brief-report__summary">
                  <h4>Executive summary</h4>
                  <p>{report.executiveSummary}</p>
                </section>

                {report.sections.map((section) => (
                  <section key={section.title} className="ai-brief-report__section">
                    <h4>{section.title}</h4>
                    <p>{section.body}</p>
                    {section.citations.length ? (
                      <div className="ai-brief-citations">
                        {section.citations.map((citation) => (
                          <Tag key={`${section.title}-${citation.metricKey}`} tone="primary">
                            {citation.label}: {citation.value}
                          </Tag>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}

                <section className="ai-brief-report__lists">
                  <div>
                    <h4>Recommendations</h4>
                    <ul className="bullet-list">
                      {report.recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Risks</h4>
                    <ul className="bullet-list">
                      {report.risks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="ai-brief-assistant">
                  <div className="ai-brief-assistant__header">
                    <Bot size={18} />
                    <div>
                      <strong>Assistant prompts</strong>
                      <span>Suggested follow-ups to act on this brief</span>
                    </div>
                  </div>
                  <div className="ai-brief-assistant__prompts">
                    {report.assistantPrompts.map((prompt) => (
                      <button key={prompt} type="button" className="ai-brief-assistant__prompt" onClick={() => runAssistantPrompt(prompt)}>
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </Panel>

          <Panel className="table-card ai-brief-panel">
            <div className="panel-heading-row">
              <div>
                <Tag tone="primary">Recent tickets</Tag>
                <h3>Report history</h3>
              </div>
            </div>
            {!historyQuery.data?.length ? (
              <p className="muted">Generated reports will appear here for quick recall.</p>
            ) : (
              <div className="ai-brief-history">
                {historyQuery.data.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    className={cn("ai-brief-history__item", activeRunId === run.id && "ai-brief-history__item--active")}
                    onClick={() => setActiveRunId(run.id)}
                  >
                    <strong>{formatReportTypeLabel(run.reportType)}</strong>
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                    <Tag tone={run.status === "completed" ? "success" : run.status === "failed" ? "warning" : "primary"}>
                      {run.status}
                    </Tag>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
