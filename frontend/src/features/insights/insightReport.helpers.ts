import type {
  InsightReportResult,
  InsightReportRun,
  InsightReportRunStatus,
  InsightReportType,
  InsightsDashboardSnapshot,
} from "@/lib/contracts";
import { formatNumber, formatPercent } from "@/features/insights/insightsDashboard.helpers";
export type InsightReportTicketStep = {
  id: string;
  label: string;
  detail: string;
};

export const INSIGHT_REPORT_TYPES: Array<{
  id: InsightReportType;
  label: string;
  detail: string;
  placeholder: string;
}> = [
  {
    id: "corpus_overview",
    label: "Corpus overview",
    detail: "Executive brief across volume, families, seniority, and geo coverage.",
    placeholder: "Optional focus, e.g. Backend Engineering",
  },
  {
    id: "gap_brief",
    label: "Gap brief",
    detail: "Role requirement coverage, missing skills, and upskilling signals.",
    placeholder: "e.g. Cloud Engineer with Kubernetes and Terraform",
  },
  {
    id: "job_family_analysis",
    label: "Job family focus",
    detail: "Deep read on one production taxonomy family and its seniority bench.",
    placeholder: "e.g. Backend Engineering",
  },
];

export function getInsightReportTicketSteps(status: InsightReportRunStatus): InsightReportTicketStep[] {
  const steps: InsightReportTicketStep[] = [
    {
      id: "queued",
      label: "Ticket opened",
      detail: "Report request accepted and queued for generation.",
    },
    {
      id: "running",
      label: "Gathering corpus",
      detail: "Reading dashboard metrics, taxonomy, and gap signals.",
    },
    {
      id: "generating",
      label: "Drafting brief",
      detail: "Synthesizing grounded recommendations and assistant prompts.",
    },
    {
      id: "completed",
      label: "Report ready",
      detail: "Brief is available to review, share, or act on.",
    },
  ];

  const activeIndex = status === "queued"
    ? 0
    : status === "running"
    ? 1
    : status === "completed"
    ? 3
    : 2;

  return steps.map((step, index) => ({
    ...step,
    detail: status === "failed" && index === activeIndex
      ? "Generation failed before the brief could be finalized."
      : step.detail,
  }));
}

export function getActiveTicketStepIndex(status: InsightReportRunStatus) {
  if (status === "queued") {
    return 0;
  }
  if (status === "running") {
    return 1;
  }
  if (status === "completed") {
    return 3;
  }
  return 2;
}

export function buildMockInsightReport(
  snapshot: InsightsDashboardSnapshot,
  reportType: InsightReportType,
  focus?: string,
) {
  const totalCvs = snapshot.metrics.find((metric) => metric.key === "total_cvs_indexed")?.value ?? 0;
  const avgSkills = snapshot.metrics.find((metric) => metric.key === "avg_skills_per_profile")?.value ?? 0;
  const topFamily = snapshot.jobFamilies[0]?.label ?? "Unclassified";
  const topLocation = snapshot.profilesByLocation[0]?.label ?? "Unknown";
  const focusLabel = focus?.trim() || snapshot.gapAnalysis.targetRole || topFamily;
  const gap = snapshot.gapAnalysis;
  const title = reportType === "gap_brief"
    ? `Gap brief: ${focusLabel}`
    : reportType === "job_family_analysis"
    ? `Job family analysis: ${focusLabel}`
    : "Corpus intelligence brief";

  return {
    title,
    executiveSummary: reportType === "gap_brief"
      ? `The corpus indexes ${formatNumber(totalCvs)} profiles. For ${focusLabel}, ${formatNumber(gap.fullyMatchingCandidates)} profiles fully match and ${formatNumber(gap.partiallyMatchingCandidates)} are partial matches.`
      : `This workspace indexes ${formatNumber(totalCvs)} CVs averaging ${avgSkills.toFixed(1)} skills per profile, led by ${topFamily} and concentrated in ${topLocation}.`,
    sections: [
      {
        title: "Corpus snapshot",
        body: `Total indexed profiles: ${formatNumber(totalCvs)}. Average skills per profile: ${avgSkills.toFixed(1)}.`,
        citations: [
          { metricKey: "total_cvs_indexed", label: "Total CVs indexed", value: formatNumber(totalCvs) },
          { metricKey: "avg_skills_per_profile", label: "Average skills per profile", value: avgSkills.toFixed(1) },
        ],
      },
      {
        title: reportType === "gap_brief" ? "Requirement coverage" : "Production taxonomy",
        body: reportType === "gap_brief"
          ? `Fully matching profiles cover ${formatPercent(gap.fullyMatchingCandidates && totalCvs ? (gap.fullyMatchingCandidates / totalCvs) * 100 : 0)} of the indexed corpus for the resolved requirement set.`
          : `${topFamily} is the largest job family in the current taxonomy mix.`,
        citations: reportType === "gap_brief"
          ? [
            { metricKey: "fully_matching_candidates", label: "Fully matching candidates", value: formatNumber(gap.fullyMatchingCandidates) },
            { metricKey: "partially_matching_candidates", label: "Partially matching candidates", value: formatNumber(gap.partiallyMatchingCandidates) },
          ]
          : [{ metricKey: "top_job_family", label: "Top job family", value: topFamily }],
      },
    ],
    recommendations: [
      "Review the Overview tab to validate family and seniority mix.",
      reportType === "gap_brief" ? "Explore partial matches in Search to identify upskilling candidates." : "Generate a gap brief when a live role needs supply evidence.",
      "Re-run this brief after the next ingestion batch.",
    ],
    risks: [
      totalCvs <= 0 ? "Corpus volume is too low for reliable supply conclusions." : "Insights remain read-only; validate critical hiring decisions in dossier review.",
    ],
    assistantPrompts: reportType === "gap_brief"
      ? [
        `Which partial profiles are closest to ${focusLabel}?`,
        "Show fully matching candidates in Search.",
        "What training cohort could close the top missing skill fastest?",
      ]
      : [
        "Which job families show the thinnest senior bench?",
        "Where is geo coverage weakest?",
        "Generate a gap brief for a live role.",
      ],
  };
}

export function formatReportTypeLabel(reportType: InsightReportType) {
  return INSIGHT_REPORT_TYPES.find((item) => item.id === reportType)?.label ?? reportType;
}

function slugifyReportFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "insight-report";
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildInsightReportMarkdown(
  report: InsightReportResult,
  run?: Pick<InsightReportRun, "reportType" | "createdAt" | "llmProvider" | "llmModel">,
) {
  const lines = [
    `# ${report.title}`,
    "",
    run ? `- Report type: ${formatReportTypeLabel(run.reportType)}` : null,
    run?.createdAt ? `- Generated: ${new Date(run.createdAt).toLocaleString()}` : null,
    run?.llmProvider ? `- Provider: ${run.llmProvider}${run.llmModel ? ` (${run.llmModel})` : ""}` : null,
    "",
    "## Executive summary",
    "",
    report.executiveSummary,
    "",
  ].filter((line): line is string => line !== null);

  for (const section of report.sections) {
    lines.push(`## ${section.title}`, "", section.body, "");
    if (section.citations.length) {
      lines.push("### Citations", "");
      for (const citation of section.citations) {
        lines.push(`- ${citation.label}: ${citation.value}`);
      }
      lines.push("");
    }
  }

  if (report.recommendations.length) {
    lines.push("## Recommendations", "");
    for (const item of report.recommendations) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (report.risks.length) {
    lines.push("## Risks", "");
    for (const item of report.risks) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (report.assistantPrompts.length) {
    lines.push("## Assistant prompts", "");
    for (const item of report.assistantPrompts) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function buildInsightReportExportPayload(
  report: InsightReportResult,
  run: InsightReportRun,
) {
  return {
    exportedAt: new Date().toISOString(),
    run: {
      id: run.id,
      reportType: run.reportType,
      status: run.status,
      createdAt: run.createdAt,
      completedAt: run.completedAt,
      llmProvider: run.llmProvider,
      llmModel: run.llmModel,
      inputConfig: run.inputConfig,
    },
    report,
  };
}

export function exportInsightReportMarkdown(
  report: InsightReportResult,
  run?: Pick<InsightReportRun, "reportType" | "createdAt" | "llmProvider" | "llmModel">,
) {
  const stamp = (run?.createdAt ?? new Date().toISOString()).slice(0, 10);
  const filename = `${slugifyReportFilename(report.title)}-${stamp}.md`;
  downloadTextFile(filename, buildInsightReportMarkdown(report, run), "text/markdown;charset=utf-8");
}

export function exportInsightReportJson(report: InsightReportResult, run: InsightReportRun) {
  const stamp = run.createdAt.slice(0, 10);
  const filename = `${slugifyReportFilename(report.title)}-${stamp}.json`;
  downloadTextFile(
    filename,
    JSON.stringify(buildInsightReportExportPayload(report, run), null, 2),
    "application/json;charset=utf-8",
  );
}
