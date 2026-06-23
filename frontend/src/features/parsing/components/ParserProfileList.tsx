import { Sparkles } from "lucide-react";
import { EmptyState, Panel, Tag } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ParserProfile } from "@/lib/contracts";
import { parserProfileStatusTone } from "@/features/parsing/utils/parserProfiles";

type ParserProfileListProps = {
  canEdit: boolean;
  onCreateDraft: () => void;
  onSelectProfile: (profile: ParserProfile) => void;
  profiles: ParserProfile[];
  selectedId: string | null;
  workspaceNameById: ReadonlyMap<string, string>;
};

export function ParserProfileList({
  canEdit,
  onCreateDraft,
  onSelectProfile,
  profiles,
  selectedId,
  workspaceNameById,
}: ParserProfileListProps) {
  return (
    <Panel className="table-card">
      <div className="stack">
        <div className="signal-row">
          <div>
            <h3>Versioned profiles</h3>
            <p>Use profiles to change prompts and parser settings safely. One active profile should represent the worker default for each workspace.</p>
          </div>
          <Tag tone="primary">{profiles.length} profiles</Tag>
        </div>

        {profiles.length ? (
          <div className="parser-profile-list">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                className={cn("parser-profile-card", selectedId === profile.id && "parser-profile-card--active")}
                onClick={() => onSelectProfile(profile)}
              >
                <div className="signal-row">
                  <strong>{profile.name}</strong>
                  <Tag tone={parserProfileStatusTone(profile.status)}>{profile.status}</Tag>
                </div>
                <p>{workspaceNameById.get(profile.tenantId) ?? "Unknown workspace"}</p>
                <p>{profile.description || "No description yet."}</p>
                <div className="skill-list">
                  <Tag>{profile.extractionProvider}</Tag>
                  <Tag>{profile.extractionModel}</Tag>
                  <Tag>{profile.chunkingProfile}</Tag>
                </div>
                <div className="parser-profile-card__meta">
                  <span>{profile.documentsEvaluated} docs evaluated</span>
                  <span>
                    {profile.avgParsePercentage ?? "\u2014"}% parse &middot; {profile.avgConfidence ?? "\u2014"}% confidence
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No parser profiles yet"
            detail="Create a draft profile before changing prompts or parser settings."
            action={
              canEdit ? (
                <button className="button button--primary" type="button" onClick={onCreateDraft}>
                  Create first profile
                </button>
              ) : undefined
            }
          />
        )}

        <div className="evidence-card">
          <div className="skill-list">
            <Sparkles size={16} />
            <strong>Fine-tuning is intentionally disabled</strong>
          </div>
          <p>Do prompt, parser, OCR, and chunking experiments first. Fine-tuning only becomes worth it after you have a labeled evaluation set and repeated failure patterns.</p>
        </div>
      </div>
    </Panel>
  );
}
