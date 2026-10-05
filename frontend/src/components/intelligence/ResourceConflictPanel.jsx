import React, { useState, useEffect } from "react";
import { getResourceConflicts } from "../../services/api/intelligenceApi";

export default function ResourceConflictPanel({ workspaceId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const res = await getResourceConflicts(workspaceId);
        if (res?.success) {
          setData(res.data);
        } else {
          setData(res);
        }
      } catch (err) {
        setError(err.response?.data?.message || err.message || "Failed to load resource conflicts");
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
        <span>Evaluating Workspace Resource Pressure...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h4 className="font-semibold text-rose-800 mb-1">Resource Evaluation Error</h4>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  const members = data?.members || [];

  const levelColors = {
    LOW: "bg-emerald-100 text-emerald-800 border-emerald-300",
    MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
    HIGH: "bg-orange-100 text-orange-800 border-orange-300",
    CRITICAL: "bg-rose-100 text-rose-800 border-rose-300"
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
        <span className="font-semibold text-slate-800">Resource Pressure Analysis:</span> Resource pressure metrics quantify structural scheduling constraints without assessing individual performance or capability.
      </div>

      {/* Resource Cards Grid */}
      {members.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {members.map((member) => (
            <div key={member.userId} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{member.name}</h4>
                  <div className="text-xs text-slate-500">{member.projectCount} active project(s) assigned</div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs border ${levelColors[member.pressureLevel] || "bg-slate-100 text-slate-800"}`}>
                  {member.pressureLevel} ({member.pressureScore}/100)
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    member.pressureScore >= 85 ? "bg-rose-500" :
                    member.pressureScore >= 65 ? "bg-orange-500" :
                    member.pressureScore >= 35 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(4, member.pressureScore)}%` }}
                />
              </div>

              {/* Task Breakdown Stats */}
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 text-[10px]">Active</div>
                  <div className="font-bold text-slate-800 mt-0.5">{member.activeTasks}</div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 text-[10px]">Critical</div>
                  <div className={`font-bold mt-0.5 ${member.criticalTasks > 0 ? "text-indigo-600" : "text-slate-800"}`}>
                    {member.criticalTasks}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 text-[10px]">Overdue</div>
                  <div className={`font-bold mt-0.5 ${member.overdueTasks > 0 ? "text-rose-600" : "text-slate-800"}`}>
                    {member.overdueTasks}
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <div className="text-slate-500 text-[10px]">Est. Hours</div>
                  <div className="font-bold text-slate-800 mt-0.5">{member.estimatedHours}h</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-sm">
          No significant resource conflicts detected across active workspace projects.
        </div>
      )}
    </div>
  );
}
