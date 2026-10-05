import { useState, useEffect, useCallback } from "react";
import {
  FiFileText,
  FiPrinter,
  FiCopy,
  FiRefreshCw,
  FiAlertTriangle,
  FiCheckCircle,
  FiCalendar,
  FiActivity,
  FiTrendingUp,
  FiShield,
  FiLayers
} from "react-icons/fi";
import { getProjectStakeholderBriefing } from "../../services/api/intelligenceApi";

export default function StakeholderBriefingPanel({ projectId, className = "" }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchBriefing = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getProjectStakeholderBriefing(projectId);
      setBriefing(res?.data || null);
    } catch (err) {
      console.error("Failed to load stakeholder briefing:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load stakeholder briefing");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  const copyBriefing = () => {
    if (!briefing) return;
    const text = [
      `# 📊 EXECUTIVE STAKEHOLDER REPORT — ${briefing.projectTitle || "Project"}`,
      `Date: ${new Date().toLocaleDateString()}`,
      `Health Status: ${briefing.healthStatus || "HEALTHY"} (Score: ${briefing.healthScore ?? "—"}/100)`,
      `Projected Completion: ${briefing.projectedCompletion || "On Track"}`,
      "",
      "## 1. EXECUTIVE SUMMARY",
      briefing.executiveSummary || briefing.summary || "Project progressing within operational parameters.",
      "",
      "## 2. SCHEDULE & FORECAST",
      `- Planned Deadline: ${briefing.plannedDeadline || "N/A"}`,
      `- P50 Forecast Date: ${briefing.p50Date || "Nominal"}`,
      `- P80 Forecast Date: ${briefing.p80Date || "Nominal"}`,
      `- Schedule Drift: ${briefing.driftDays != null ? briefing.driftDays + " days" : "0 days"}`,
      "",
      "## 3. KEY MILESTONES & ACCOMPLISHMENTS",
      ...(briefing.accomplishments || []).map((a) => `- ${a.title || a}`),
      "",
      "## 4. TOP RISKS & MITIGATIONS",
      ...(briefing.topRisks || []).map((r) => `- [${r.severity || "RISK"}] ${r.title || r.name}: ${r.mitigation || "Ongoing monitoring"}`),
      "",
      "## 5. GOVERNANCE & RECOMMENDATIONS",
      ...(briefing.recommendations || []).map((rec) => `- ${rec.title || rec}`)
    ].join("\n");

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <FiFileText size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Stakeholder Briefing Generator
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Executive Ready
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Concise deterministic status reports synthesized for leadership, steering committees, and stakeholders
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchBriefing}
            disabled={loading}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Refresh briefing"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>

          <button
            type="button"
            onClick={copyBriefing}
            disabled={!briefing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition"
          >
            <FiCopy size={13} />
            {copied ? "Copied!" : "Copy Report"}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!briefing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition shadow-xs"
          >
            <FiPrinter size={13} />
            Print / PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
          <FiAlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !briefing ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <FiRefreshCw className="animate-spin text-purple-500" size={28} />
          <p className="text-sm font-medium">Assembling executive stakeholder report...</p>
        </div>
      ) : briefing ? (
        <div className="p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-8 print:p-0 print:border-none print:shadow-none">
          {/* Executive Header */}
          <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-zinc-200 dark:border-zinc-800">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                OFFICIAL STAKEHOLDER MEMORANDUM
              </span>
              <h3 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100">
                {briefing.projectTitle || "Project Status Report"}
              </h3>
              <p className="text-xs text-zinc-500">
                As of {new Date().toLocaleDateString(undefined, { dateStyle: "long" })} • Deterministically generated by TaskFlow Phase 6
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Health Status</div>
                <div className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
                  {briefing.healthScore ?? briefing.health?.score ?? 85}/100
                </div>
              </div>
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${
                briefing.healthStatus === "HEALTHY" ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                briefing.healthStatus === "CRITICAL" ? "bg-rose-500/10 text-rose-600 border border-rose-500/20" :
                "bg-amber-500/10 text-amber-600 border border-amber-500/20"
              }`}>
                {briefing.healthStatus || "HEALTHY"}
              </span>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              1. Executive Summary
            </h4>
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              {briefing.executiveSummary || briefing.summary || "Project is advancing steadily against the baseline critical path. All high-severity bottlenecks have identified mitigation paths."}
            </div>
          </div>

          {/* Section 2: Key Metrics & Schedule Forecast */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              2. Schedule & Delivery Forecast
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Target Deadline</span>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {briefing.plannedDeadline || "Baseline Defined"}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">P50 Most Likely</span>
                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                  {briefing.p50Date || "On Track"}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">P80 Conservative</span>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1">
                  {briefing.p80Date || "Buffer Nominal"}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Schedule Drift</span>
                <div className={`text-sm font-bold mt-1 ${
                  (briefing.driftDays || 0) > 0 ? "text-rose-600" : "text-emerald-600"
                }`}>
                  {briefing.driftDays != null ? `${briefing.driftDays > 0 ? "+" : ""}${briefing.driftDays} Days` : "0 Days"}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Key Accomplishments */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              3. Recent Milestones & Accomplishments
            </h4>
            {(!briefing.accomplishments || briefing.accomplishments.length === 0) ? (
              <p className="text-xs text-zinc-400 italic">No milestone completions recorded in the recent window.</p>
            ) : (
              <div className="space-y-2">
                {briefing.accomplishments.map((acc, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                    <FiCheckCircle className="text-emerald-500 mt-0.5 shrink-0" size={14} />
                    <span>{acc.title || acc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Top Risks & Mitigations */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              4. Key Risks & Governance Mitigations
            </h4>
            {(!briefing.topRisks || briefing.topRisks.length === 0) ? (
              <p className="text-xs text-zinc-400 italic">No critical risks requiring steering-level visibility.</p>
            ) : (
              <div className="space-y-2.5">
                {briefing.topRisks.map((risk, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-900 dark:text-zinc-100">{risk.title || risk.name}</span>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700">
                        {risk.severity || "HIGH"}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">Mitigation:</span> {risk.mitigation || "Active monitoring and capacity rebalancing"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
