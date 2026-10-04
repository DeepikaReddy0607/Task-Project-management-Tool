import React from "react";
import { FiColumns, FiClock, FiActivity, FiShield, FiUsers, FiAlertTriangle } from "react-icons/fi";

/**
 * Multi-Scenario Comparison Matrix
 * Presents a transparent side-by-side evaluation table without declaring an opaque "winner".
 */
const ScenarioComparison = ({ comparisonData }) => {
  if (!comparisonData) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
        No multi-scenario comparison data available. Generate or select scenarios to compare.
      </div>
    );
  }

  const { baseline, scenarios = [], tradeOffSummary } = comparisonData;

  const formatDate = (isoString) => {
    if (!isoString) return "Not set";
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? "Not set" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FiColumns className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Multi-Scenario Comparison Matrix
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Factual side-by-side trade-off matrix across baseline and simulated scenarios.
          </p>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
              <th className="py-3 px-3 font-semibold text-slate-600 dark:text-slate-400">Metric / Dimension</th>
              <th className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200 border-l border-slate-200 dark:border-slate-700">
                Baseline
              </th>
              {scenarios.map((scen, idx) => (
                <th key={scen.scenarioId || idx} className="py-3 px-3 font-bold text-indigo-600 dark:text-indigo-400 border-l border-slate-200 dark:border-slate-700">
                  {scen.name || `Scenario ${idx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Projected Completion */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiClock className="w-3.5 h-3.5 text-slate-400" /> Projected Completion
              </td>
              <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {formatDate(baseline?.projectedEnd)}
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                  {formatDate(s.metrics?.projectedEnd)}
                  {s.deltaAgainstBaseline?.scheduleVarianceDays !== 0 && (
                    <span className={`ml-1.5 text-[10px] font-bold ${
                      s.deltaAgainstBaseline.scheduleVarianceDays > 0 ? "text-red-500" : "text-emerald-500"
                    }`}>
                      ({s.deltaAgainstBaseline.scheduleVarianceDays > 0 ? `+${s.deltaAgainstBaseline.scheduleVarianceDays}d` : `${s.deltaAgainstBaseline.scheduleVarianceDays}d`})
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* Health Score */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiActivity className="w-3.5 h-3.5 text-slate-400" /> Health Scorecard
              </td>
              <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {baseline?.healthScore}/100 ({baseline?.healthStatus})
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                  {s.metrics?.healthScore}/100
                  {s.deltaAgainstBaseline?.healthScore !== 0 && (
                    <span className={`ml-1.5 text-[10px] font-bold ${
                      s.deltaAgainstBaseline.healthScore > 0 ? "text-emerald-500" : "text-red-500"
                    }`}>
                      ({s.deltaAgainstBaseline.healthScore > 0 ? `+${s.deltaAgainstBaseline.healthScore}` : s.deltaAgainstBaseline.healthScore})
                    </span>
                  )}
                </td>
              ))}
            </tr>

            {/* Critical Tasks Count */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiShield className="w-3.5 h-3.5 text-slate-400" /> Critical Tasks
              </td>
              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {baseline?.criticalTasksCount}
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-medium text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                  {s.metrics?.criticalTasksCount}
                </td>
              ))}
            </tr>

            {/* Bottlenecks Count */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                Major Bottlenecks
              </td>
              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {baseline?.majorBottlenecksCount || baseline?.bottlenecksCount}
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-medium text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                  {s.metrics?.majorBottlenecksCount}
                </td>
              ))}
            </tr>

            {/* Workload Concentration */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiUsers className="w-3.5 h-3.5 text-slate-400" /> Workload Concentration
              </td>
              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {baseline?.workloadConcentrationScore}/100
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-medium text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700">
                  {s.metrics?.workloadConcentrationScore}/100
                </td>
              ))}
            </tr>

            {/* Cycle Detected */}
            <tr>
              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FiAlertTriangle className="w-3.5 h-3.5 text-slate-400" /> Dependency Cycle
              </td>
              <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-slate-700">
                {baseline?.hasCycle ? "YES (Deadlock)" : "No"}
              </td>
              {scenarios.map((s, idx) => (
                <td key={idx} className="py-2.5 px-3 font-medium border-l border-slate-200 dark:border-slate-700">
                  {s.metrics?.hasCycle ? (
                    <span className="text-red-600 font-bold">YES (Deadlock)</span>
                  ) : (
                    <span className="text-emerald-600">No</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Trade-off Insights */}
      {tradeOffSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-lg text-xs">
            <span className="font-semibold text-indigo-900 dark:text-indigo-200">Least Delay:</span>
            <div className="font-bold text-indigo-700 dark:text-indigo-400 text-sm mt-0.5">{tradeOffSummary.leastDelay}</div>
          </div>
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg text-xs">
            <span className="font-semibold text-emerald-900 dark:text-emerald-200">Highest Health:</span>
            <div className="font-bold text-emerald-700 dark:text-emerald-400 text-sm mt-0.5">{tradeOffSummary.highestHealth}</div>
          </div>
          <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg text-xs">
            <span className="font-semibold text-amber-900 dark:text-amber-200">Fewest Bottlenecks:</span>
            <div className="font-bold text-amber-700 dark:text-amber-400 text-sm mt-0.5">{tradeOffSummary.fewestBottlenecks}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenarioComparison;
