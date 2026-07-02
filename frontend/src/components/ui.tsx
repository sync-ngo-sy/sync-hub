// frontend/src/components/ui.tsx
import type { ReactNode } from "react";
import { ArrowRight, Building2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import syncLogo from "@/assets/logo-white2-scaled.png";

type PanelProps = {
  children: ReactNode;
  className?: string;
};

export function Panel({ children, className }: PanelProps) {
  return <section className={cn("panel", className)}>{children}</section>;
}

type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageIntro({ eyebrow, title, description, actions }: PageIntroProps) {
  return (
    <header className="page-intro">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-intro__actions">{actions}</div> : null}
    </header>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  delta?: string;
  tone?: "primary" | "secondary" | "tertiary";
  icon?: ReactNode;
};

export function StatCard({ label, value, delta, tone = "primary", icon }: StatCardProps) {
  return (
    <Panel className={cn("stat-card", `stat-card--${tone}`)}>
      <div className="stat-card__header">
        <span className="stat-card__label">{label}</span>
        {icon ? <span className="stat-card__icon">{icon}</span> : null}
      </div>
      <div className="stat-card__value-row">
        <strong>{value}</strong>
        {delta ? <span className="stat-card__delta">{delta}</span> : null}
      </div>
    </Panel>
  );
}

type TagProps = {
  children: ReactNode;
  tone?: "primary" | "neutral" | "success" | "warning";
};

export function Tag({ children, tone = "neutral" }: TagProps) {
  return <span className={cn("tag", `tag--${tone}`)}>{children}</span>;
}

type ProgressBarProps = {
  value: number;
  tone?: "primary" | "secondary" | "tertiary";
};

export function ProgressBar({ value, tone = "primary" }: ProgressBarProps) {
  return (
    <div className="progress-bar">
      <span
        className={cn("progress-bar__value", `progress-bar__value--${tone}`)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

type ScorePillProps = {
  score: number;
  label?: string;
};

export function ScorePill({ score, label = "Match" }: ScorePillProps) {
  return (
    <div className="score-pill">
      <strong>{Math.round(score)}%</strong>
      <span>{label}</span>
    </div>
  );
}

type AvatarProps = {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg";
};

export function Avatar({ name, hue, size = "md" }: AvatarProps) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn("avatar", `avatar--${size}`)}
      style={{
        background: `linear-gradient(135deg, hsla(${hue}, 75%, 68%, 0.94), hsla(${(hue + 42) % 360}, 72%, 58%, 0.84))`,
      }}
    >
      {initials}
    </div>
  );
}

type TenantBadgeProps = {
  name: string;
  iconUrl?: string | null;
  size?: "sm" | "md";
};

export function TenantBadge({ name, iconUrl, size = "md" }: TenantBadgeProps) {
  if (iconUrl) {
    return (
      <div className={cn("tenant-badge", `tenant-badge--${size}`)}>
        <img src={iconUrl} alt={`${name} logo`} />
      </div>
    );
  }

  return (
    <div className={cn("tenant-badge", "tenant-badge--fallback", `tenant-badge--${size}`)}>
      <Building2 size={size === "sm" ? 14 : 18} />
    </div>
  );
}

type SyncBrandProps = {
  subtitle?: string;
  className?: string;
};

export function SyncBrand({ subtitle = "Talent Intelligence Platform", className }: SyncBrandProps) {
  return (
    <div className={cn("brand-mark", className)}>
      <img className="brand-mark__logo" src={syncLogo} alt="Sync" />
      {subtitle && <span className="brand-mark__subtitle">{subtitle}</span>}
    </div>
  );
}

type MetricBarsProps = {
  values: number[];
};

export function MetricBars({ values }: MetricBarsProps) {
  return (
    <div className="metric-bars">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className={cn("metric-bars__bar", index === values.length - 1 && "metric-bars__bar--active")}
          style={{ height: `${value}%` }}
        />
      ))}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  detail: string;
  action?: ReactNode;
};

export function EmptyState({ title, detail, action }: EmptyStateProps) {
  return (
    <Panel className="empty-state">
      <Sparkles size={18} />
      <strong>{title}</strong>
      <p>{detail}</p>
      {action ? action : null}
    </Panel>
  );
}

type CTAProps = {
  title: string;
  detail: string;
};

export function InlineCta({ title, detail }: CTAProps) {
  return (
    <div className="inline-cta">
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <ArrowRight size={16} />
    </div>
  );
}
