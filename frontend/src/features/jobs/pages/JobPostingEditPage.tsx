import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageIntro } from "@/components/ui";
import { platformApi } from "@/lib/platformApi";
import { JobEditor } from "@/features/jobs/components/JobEditor";
import { emptyJobForm, formFromJob } from "@/features/jobs/jobForm";
import { formatDate } from "@/features/jobs/jobPresentation";

export function JobPostingEditPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const jobQuery = useQuery({
    queryKey: ["job-posting", jobId],
    queryFn: () => platformApi.getJobPosting(jobId ?? ""),
    enabled: Boolean(jobId),
  });
  const job = jobQuery.data;
  const initialForm = useMemo(() => (job ? formFromJob(job) : emptyJobForm("mock-tenant")), [job]);

  if (jobQuery.error) {
    return (
      <div className="page-stack">
        <PageIntro title="Unable to load job" description={String(jobQuery.error)} />
        <Link className="button button--secondary" to="/jobs">
          <ArrowLeft size={16} />
          Back
        </Link>
      </div>
    );
  }

  if (jobQuery.isLoading || !job) {
    return (
      <div className="page-stack">
        <PageIntro title="Loading job" description="Fetching posting for editing." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Edit Job Posting"
        title={job.title || "Untitled job"}
        description={`${job.employerName} · Updated ${formatDate(job.updatedAt)}`}
        actions={
          <div className="job-page-actions">
            <Link className="button button--secondary" to={`/jobs/${job.id}`}>
              <ArrowLeft size={16} />
              Back
            </Link>
          </div>
        }
      />

      <div className="job-form-page">
        <JobEditor initialForm={initialForm} onSaved={(savedJob) => navigate(`/jobs/${savedJob.id}`)} />
      </div>
    </div>
  );
}
