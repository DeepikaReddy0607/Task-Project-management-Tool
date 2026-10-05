import React from "react";

export default function PortfolioScenarioResults({ result, onReset }) {
  if (!result) return null;

  const {
    scenarioType,
    baseline = {},
    simulated = {},
    delta = {},
    affectedProjects = [],
    unaffectedProjects = [],
    disclaimer
  } = result;

  const healthDelta = delta.portfolioHealthDelta || 0;

  return (
    <div className="p-5 bg-white border border-indigo-200 rounded-xl shadow-sm space-y-5">
      {/* Header & Reset */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
            Simulation Results · {scenarioType}
          </span>
          <h3 className="text-base font-bold text-slate-900 mt-1">Portfolio Impact Comparison</h3>
        </div>
        {onReset && (
          <button
            onClick={onReset}
            className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 px-3 py-1 rounded-lg"
          >
            ← Modify Scenario
          </button>
        )}
      </div>

      {/* Mandatory Disclaimer */}
      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
        ⚠️ {disclaimer || "This is a simulated scenario. No live project data has been modified."}
      </div>

      {/* High-Level Comparison KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500 font-semibold uppercase">Baseline Portfolio Health</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">
            {baseline.portfolioHealthScore} / 100
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{baseline.portfolioStatus}</div>
        </div>

        <div className="p-4 bg-indigo-50/40 border border-indigo-200 rounded-xl">
          <div className="text-xs text-indigo-600 font-semibold uppercase">Simulated Portfolio Health</div>
          <div className="text-2xl font-bold text-indigo-950 mt-1">
            {simulated.portfolioHealthScore} / 100
          </div>
          <div className="text-[11px] text-indigo-700 mt-0.5">{simulated.portfolioStatus}</div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-xs text-slate-500 font-semibold uppercase">Net Health Shift</div>
          <div className={`text-2xl font-bold mt-1 ${healthDelta < 0 ? "text-rose-600" : healthDelta > 0 ? "text-emerald-600" : "text-slate-700"}`}>
            {healthDelta > 0 ? `+${healthDelta}` : healthDelta} pts
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {delta.affectedProjectsCount} affected · {delta.unaffectedProjectsCount} unaffected
          </div>
        </div>
      </div>

      {/* Affected Projects Breakdown */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Affected Projects ({affectedProjects.length})
        </h4>
        {affectedProjects.length > 0 ? (
          <div className="space-y-2">
            {affectedProjects.map((p) => (
              <div key={p.projectId} className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">{p.title}</div>
                  <div className="text-slate-500 text-[11px]">
                    Status: {p.baselineStatus} → {p.simulatedStatus}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-700">
                    Health: {p.baselineHealthScore} → <b>{p.simulatedHealthScore}</b>
                  </div>
                  <span className={`text-[11px] font-bold ${
                    p.healthScoreDelta < 0 ? "text-rose-600" : p.healthScoreDelta > 0 ? "text-emerald-600" : "text-slate-500"
                  }`}>
                    {p.healthScoreDelta > 0 ? `+${p.healthScoreDelta}` : p.healthScoreDelta} pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-400 text-center">
            No projects experienced adverse or positive health deviations under this scenario.
          </div>
        )}
      </div>

      {/* Unaffected Projects List */}
      {unaffectedProjects.length > 0 && (
        <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
          <span className="font-semibold">Unaffected Projects ({unaffectedProjects.length}):</span>{" "}
          {unaffectedProjects.map((p) => p.title).join(", ")}
        </div>
      )}
    </div>
  );
}
