import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { EmptyState, PageIntro, Panel, Tag } from "@/components/ui";
import { PickerDropdown } from "@/components/PickerDropdown";
import { useAuth } from "@/lib/auth";
import { rankingApi } from "@/features/ranking/api";
import type {
  RankingCriterion,
  RankingFormula,
  RankingRule,
  SignalDefinition,
} from "@/features/ranking/types";

let ruleCounter = 0;
function nextRuleId() {
  ruleCounter += 1;
  return `rule-${ruleCounter}-${Math.round(Math.random() * 1e6)}`;
}

function cloneFormula(formula: RankingFormula): RankingFormula {
  return JSON.parse(JSON.stringify(formula));
}

export function RankingFormulaPage() {
  const { currentTenant, isAdmin } = useAuth();
  const tenantId = currentTenant?.id ?? "";
  const canManage = Boolean(
    isAdmin || (currentTenant && ["owner", "admin"].includes(currentTenant.role)),
  );

  const [name, setName] = useState("Ranking formula");
  const [description, setDescription] = useState("");
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [criteria, setCriteria] = useState<RankingCriterion[]>([]);
  const [syrianCompanies, setSyrianCompanies] = useState("");
  const [signals, setSignals] = useState<SignalDefinition[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const formulaQuery = useQuery({
    queryKey: ["ranking-formula", tenantId],
    queryFn: () => rankingApi.getFormula(tenantId),
    enabled: Boolean(tenantId) && canManage,
  });

  useEffect(() => {
    const data = formulaQuery.data;
    if (!data) {
      return;
    }
    setSignals(data.signals);
    const source = data.active ?? null;
    const formula = source?.formula ?? data.default;
    setProfileId(source?.id);
    setName(source?.name ?? "Ranking formula");
    setDescription(source?.description ?? "");
    setCriteria(cloneFormula(formula).criteria);
    setSyrianCompanies((source?.syrianCompanies ?? []).join("\n"));
  }, [formulaQuery.data]);

  const maxTotal = useMemo(
    () => criteria.reduce((sum, criterion) => sum + (Number(criterion.cap) || 0), 0),
    [criteria],
  );

  function updateCriterion(index: number, patch: Partial<RankingCriterion>) {
    setCriteria((current) =>
      current.map((criterion, idx) => (idx === index ? { ...criterion, ...patch } : criterion)),
    );
  }

  function updateRule(cIndex: number, rIndex: number, patch: Partial<RankingRule>) {
    setCriteria((current) =>
      current.map((criterion, idx) => {
        if (idx !== cIndex) {
          return criterion;
        }
        return {
          ...criterion,
          rules: criterion.rules.map((rule, ridx) => (ridx === rIndex ? { ...rule, ...patch } : rule)),
        };
      }),
    );
  }

  function addRule(cIndex: number) {
    const fallbackSignal = signals[0]?.key ?? "has_any_experience";
    const newRule: RankingRule = {
      id: nextRuleId(),
      label: "New rule",
      signal: fallbackSignal,
      points: 1,
      aggregation: signals[0]?.kind === "count" ? "perUnit" : "flag",
    };
    setCriteria((current) =>
      current.map((criterion, idx) =>
        idx === cIndex ? { ...criterion, rules: [...criterion.rules, newRule] } : criterion,
      ),
    );
  }

  function removeRule(cIndex: number, rIndex: number) {
    setCriteria((current) =>
      current.map((criterion, idx) =>
        idx === cIndex
          ? { ...criterion, rules: criterion.rules.filter((_, ridx) => ridx !== rIndex) }
          : criterion,
      ),
    );
  }

  function addCriterion() {
    setCriteria((current) => [
      ...current,
      {
        key: `criterion-${current.length + 1}-${Math.round(Math.random() * 1e4)}`,
        label: "New criterion",
        description: "",
        base: 0,
        cap: 10,
        floor: 0,
        rules: [],
      },
    ]);
  }

  function removeCriterion(index: number) {
    setCriteria((current) => current.filter((_, idx) => idx !== index));
  }

  function resetToDefault() {
    const data = formulaQuery.data;
    if (!data) {
      return;
    }
    setCriteria(cloneFormula(data.default).criteria);
    setNotice("Loaded the default SCRUM rubric. Review and save to apply.");
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const formula: RankingFormula = {
        version: profileId ? "custom-v1" : "v1",
        criteria: criteria.map((criterion) => ({
          ...criterion,
          base: Number(criterion.base) || 0,
          cap: Number(criterion.cap) || 0,
          floor: Number(criterion.floor) || 0,
          rules: criterion.rules.map((rule) => ({ ...rule, points: Number(rule.points) || 0 })),
        })),
      };
      const syrianList = syrianCompanies
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean);

      const result = await rankingApi.saveFormula({
        tenantId,
        profile: { id: profileId, name, description, formula, syrianCompanies: syrianList },
        activate: true,
      });
      const active = result.active;
      if (active) {
        setProfileId(active.id);
      }
      setNotice("Ranking formula saved and activated. New rankings use it immediately.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the formula.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="page-stack">
        <EmptyState
          title="Admin access required"
          detail="Only workspace owners or admins can edit the ranking formula."
          action={
            <Link className="button button--secondary" to="/ranking">
              Back to ranking
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack ranking-formula-page">
      <PageIntro
        eyebrow="Admin"
        title="Ranking formula"
        description="Tune how profiles are scored. Edit each criterion's points and caps, add or remove rules, and pick which computed signal each rule reacts to. Changes apply to new rankings immediately."
        actions={
          <Link className="button button--secondary" to="/ranking">
            Back to ranking
          </Link>
        }
      />

      {error ? <div className="status-banner">{error}</div> : null}
      {notice ? <div className="status-banner">{notice}</div> : null}

      {formulaQuery.isLoading ? (
        <Panel className="table-card">
          <p>Loading formula…</p>
        </Panel>
      ) : (
        <>
          <Panel className="ranking-formula__meta">
            <div className="parser-form-grid">
              <label className="parser-field parser-field--full">
                <span>Formula name</span>
                <input className="form-input" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="parser-field parser-field--full">
                <span>Description</span>
                <input
                  className="form-input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="ranking-formula__totals">
              <Tag tone={maxTotal === 100 ? "success" : "warning"}>Max score: {maxTotal}</Tag>
              <span className="muted">
                {maxTotal === 100 ? "Caps sum to 100." : "Tip: caps usually sum to 100 for a clean percentage."}
              </span>
            </div>
          </Panel>

          {criteria.map((criterion, cIndex) => (
            <Panel key={criterion.key} className="ranking-formula__criterion">
              <div className="ranking-formula__criterion-head">
                <input
                  className="form-input ranking-formula__criterion-name"
                  value={criterion.label}
                  onChange={(event) => updateCriterion(cIndex, { label: event.target.value })}
                />
                <button
                  type="button"
                  className="button button--secondary button--icon"
                  onClick={() => removeCriterion(cIndex)}
                  title="Remove criterion"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="ranking-formula__caps">
                <label>
                  <span>Base</span>
                  <input
                    className="form-input"
                    type="number"
                    value={criterion.base}
                    onChange={(event) => updateCriterion(cIndex, { base: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Cap (max)</span>
                  <input
                    className="form-input"
                    type="number"
                    value={criterion.cap}
                    onChange={(event) => updateCriterion(cIndex, { cap: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Floor (min)</span>
                  <input
                    className="form-input"
                    type="number"
                    value={criterion.floor}
                    onChange={(event) => updateCriterion(cIndex, { floor: Number(event.target.value) })}
                  />
                </label>
              </div>

              <div className="ranking-formula__rules">
                {criterion.rules.map((rule, rIndex) => (
                  <div key={rule.id} className="ranking-formula__rule">
                    <input
                      className="form-input ranking-formula__rule-label"
                      value={rule.label}
                      placeholder="Rule label"
                      onChange={(event) => updateRule(cIndex, rIndex, { label: event.target.value })}
                    />
                    <PickerDropdown
                      value={rule.signal}
                      options={signals.map((signal) => ({ value: signal.key, label: signal.label }))}
                      onChange={(value) => updateRule(cIndex, rIndex, { signal: value })}
                      placeholder="Select a signal"
                      allowEmpty={false}
                    />
                    <div className="ranking-formula__rule-agg">
                      <PickerDropdown
                        value={rule.aggregation}
                        options={[
                          { value: "flag", label: "Once (flag)" },
                          { value: "perUnit", label: "Per unit (count)" },
                        ]}
                        onChange={(value) =>
                          updateRule(cIndex, rIndex, {
                            aggregation: value === "perUnit" ? "perUnit" : "flag",
                          })
                        }
                        placeholder="Aggregation"
                        allowEmpty={false}
                      />
                    </div>
                    <input
                      className="form-input ranking-formula__rule-points"
                      type="number"
                      value={rule.points}
                      onChange={(event) => updateRule(cIndex, rIndex, { points: Number(event.target.value) })}
                    />
                    <button
                      type="button"
                      className="button button--secondary button--icon"
                      onClick={() => removeRule(cIndex, rIndex)}
                      title="Remove rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--secondary" onClick={() => addRule(cIndex)}>
                  <Plus size={14} />
                  Add rule
                </button>
              </div>
            </Panel>
          ))}

          <Panel className="ranking-formula__criterion">
            <button type="button" className="button button--secondary" onClick={addCriterion}>
              <Plus size={14} />
              Add criterion
            </button>
          </Panel>

          <Panel className="ranking-formula__criterion">
            <div className="ranking-formula__criterion-head">
              <h3>Known Syrian companies</h3>
            </div>
            <p className="muted">
              One company per line (or comma-separated). Used by the international-companies criterion to treat these
              employers as Syrian when the work-history location is missing.
            </p>
            <textarea
              className="form-input ranking-formula__syrian"
              rows={4}
              value={syrianCompanies}
              placeholder={"e.g.\nMTN Syria\nSyriatel"}
              onChange={(event) => setSyrianCompanies(event.target.value)}
            />
          </Panel>

          <div className="ranking-formula__actions">
            <button className="button button--primary" type="button" disabled={saving} onClick={handleSave}>
              <Save size={14} />
              {saving ? "Saving…" : "Save & activate"}
            </button>
            <button className="button button--secondary" type="button" disabled={saving} onClick={resetToDefault}>
              <RotateCcw size={14} />
              Load default rubric
            </button>
          </div>
        </>
      )}
    </div>
  );
}
