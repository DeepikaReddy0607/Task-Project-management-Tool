import React, { useState, useEffect } from "react";
import { getCrossProjectIntelligence } from "../../services/api/intelligenceApi";

export default function CrossProjectIntelligence({ workspaceId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const res = await getCrossProjectIntelligence(workspaceId);
        if (res?.success) {
          setData(res.data);
        } else {
          setData(res);
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || "Failed to load cross-project intelligence");
      } finally {
        setLoading(false);
      }
    }
    if (workspaceId) {
      loadData();
    }
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        <span>Analyzing Cross-Project Relationships...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h4 className="font-semibold text-rose-800 mb-1">Cross-Project Analysis Error</h4>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const {
    sharedMembers = [],
    resourceConflicts = [],
    deadlineConflicts = [],
    sharedDependencies = [],
    crossProjectBottlenecks = []
  } = data || {};

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Cross-Project Relationships:</span> These indicators highlight structural dependencies and concurrent scheduling pressures without evaluating individual performance.
      </div>

      {/* Cross-Project Deadline Conflicts */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Cross-Project Deadline Conflicts</h3>
            <p className="text-xs text-slate-500">Same member assigned to tasks in different projects due within 3 days</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full">
            {deadlineConflicts.length} Conflict(s) Detected
          </span>
        </div>

        {deadlineConflicts.length > 0 ? (
          <div className="space-y-2 mt-3">
            {deadlineConflicts.map((dc, idx) => (
              <div key={idx} className="p-3 border border-slate-100 rounded-lg bg-slate-50 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-800">{dc.userName}</div>
                  <div className="text-slate-600 mt-0.5">{dc.explanation}</div>
                  <div className="text-slate-400 text-[10px] mt-1">
                    • {dc.taskA.title} ({dc.taskA.projectTitle}) due {dc.taskA.dueDate}
                    <br />
                    • {dc.taskB.title} ({dc.taskB.projectTitle}) due {dc.taskB.dueDate}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    dc.severity === "HIGH" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {dc.gapDays === 0 ? "Same Day" : `${dc.gapDays}d apart`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-4 text-center">
            No concurrent cross-project deadline pressures detected.
          </div>
        )}
      </div>

      {/* Shared Members Across Projects */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Shared Project Assignees</h3>
        <p className="text-xs text-slate-500 mb-3">Members actively assigned to tasks across multiple projects</p>

        {sharedMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sharedMembers.map((sm) => (
              <div key={sm.userId} className="p-3 border border-slate-100 rounded-lg bg-slate-50 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-800 mb-1">
                  <span>{sm.name}</span>
                  <span className="text-slate-500 font-normal">{sm.projectCount} Projects</span>
                </div>
                <div className="text-slate-600 text-[11px] mb-2">
                  {sm.projects.map((p) => `${p.title} (${p.taskCount} tasks)`).join(" · ")}
                </div>
                <div className="flex items-center space-x-3 text-[10px] text-slate-500 pt-2 border-t border-slate-200/60">
                  <span>Active: <b>{sm.activeTaskCount}</b></span>
                  <span>Critical: <b>{sm.criticalTaskCount}</b></span>
                  <span>Overdue: <b>{sm.overdueTaskCount}</b></span>
                  <span>Hours: <b>{sm.totalEstimatedHours}h</b></span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-4 text-center">
            No cross-project member sharing identified.
          </div>
        )}
      </div>

      {/* Shared Dependencies */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-1">Cross-Project Task Dependencies</h3>
        <p className="text-xs text-slate-500 mb-3">Tasks in one project that block or prerequisite tasks in another project</p>

        {sharedDependencies.length > 0 ? (
          <div className="space-y-2">
            {sharedDependencies.map((dep, idx) => (
              <div key={idx} className="p-3 border border-slate-100 rounded-lg bg-slate-50 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-indigo-700">{dep.sourceProjectTitle}</span>: {dep.sourceTaskTitle}
                  <span className="mx-2 text-slate-400">→ blocks →</span>
                  <span className="font-semibold text-emerald-700">{dep.targetProjectTitle}</span>: {dep.targetTaskTitle}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 py-4 text-center">
            No cross-project dependencies detected. Projects execute with isolated dependency graphs.
          </div>
        )}
      </div>
    </div>
  );
}
