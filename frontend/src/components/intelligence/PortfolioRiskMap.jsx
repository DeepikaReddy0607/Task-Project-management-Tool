import React from "react";

export default function PortfolioRiskMap({ projects = [], riskConcentration = {} }) {
  if (!projects || projects.length === 0) {
    return (
      <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-sm">
        No active projects available for portfolio risk mapping.
      </div>
    );
  }

  const statusColors = {
    HEALTHY: "bg-emerald-100 text-emerald-800 border-emerald-300",
    WATCH: "bg-amber-100 text-amber-800 border-amber-300",
    AT_RISK: "bg-orange-100 text-orange-800 border-orange-300",
    CRITICAL: "bg-rose-100 text-rose-800 border-rose-300"
  };

  const pressureColors = {
    HIGH: "text-rose-700 font-bold",
    MEDIUM: "text-amber-700 font-medium",
    LOW: "text-slate-500"
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Observations Strip */}
      {riskConcentration?.observations?.length > 0 && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
          <div className="font-bold text-slate-800 uppercase tracking-wider mb-1">
            Portfolio Risk Observations
          </div>
          {riskConcentration.observations.map((obs, idx) => (
            <div key={idx} className="text-slate-600 flex items-start space-x-2">
              <span>•</span>
              <span>{obs}</span>
            </div>
          ))}
        </div>
      )}

      {/* Projects Risk Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Project Risk Vectors</h3>
          <p className="text-xs text-slate-500">Cross-dimensional pressure indicators for each active project</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Project</th>
                <th className="py-3 px-3">Health Score</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Deadline Pressure</th>
                <th className="py-3 px-3">Bottlenecks</th>
                <th className="py-3 px-3">Dependencies</th>
                <th className="py-3 px-3">Workload</th>
                <th className="py-3 px-3">Tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((proj) => (
                <tr key={proj.projectId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <div>{proj.title}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{proj.priority} Priority · {proj.status}</div>
                  </td>
                  <td className="py-3 px-3 font-bold text-slate-900">
                    {proj.healthScore} / 100
                  </td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full font-semibold border text-[10px] ${statusColors[proj.healthStatus] || "bg-slate-100 text-slate-700"}`}>
                      {proj.healthStatus}
                    </span>
                  </td>
                  <td className={`py-3 px-3 ${pressureColors[proj.deadlinePressure] || "text-slate-500"}`}>
                    {proj.deadlinePressure}
                  </td>
                  <td className={`py-3 px-3 ${pressureColors[proj.bottleneckPressure] || "text-slate-500"}`}>
                    {proj.bottleneckPressure}
                  </td>
                  <td className={`py-3 px-3 ${pressureColors[proj.dependencyPressure] || "text-slate-500"}`}>
                    {proj.dependencyPressure}
                  </td>
                  <td className={`py-3 px-3 ${pressureColors[proj.workloadPressure] || "text-slate-500"}`}>
                    {proj.workloadPressure}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    {proj.activeTasksCount} active ({proj.criticalTasksCount || 0} critical)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
