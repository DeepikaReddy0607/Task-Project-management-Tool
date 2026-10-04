import React, { useState } from "react";
import { simulatePortfolioScenario } from "../../services/api/intelligenceApi";

export default function PortfolioScenarioBuilder({ workspaceId, projects = [], members = [], onSimulationComplete }) {
  const [scenarioType, setScenarioType] = useState("RESOURCE_UNAVAILABLE");
  const [selectedUserId, setSelectedUserId] = useState(members[0]?.userId || "");
  const [unavailableDays, setUnavailableDays] = useState(5);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.projectId || "");
  const [deadlineShiftDays, setDeadlineShiftDays] = useState(7);
  const [scopeTaskCount, setScopeTaskCount] = useState(3);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState(null);

  const handleSimulate = async () => {
    try {
      setSimulating(true);
      setError(null);

      const params = {};
      if (scenarioType === "RESOURCE_UNAVAILABLE") {
        params.userId = selectedUserId || members[0]?.userId || "user-mock";
        params.days = Number(unavailableDays) || 5;
      } else if (scenarioType === "PROJECT_DEADLINE_CHANGE") {
        params.projectId = selectedProjectId || projects[0]?.projectId;
        params.days = Number(deadlineShiftDays) || 0;
      } else if (scenarioType === "SCOPE_GROWTH") {
        params.projectId = selectedProjectId || projects[0]?.projectId;
        params.taskCount = Number(scopeTaskCount) || 3;
      }

      const res = await simulatePortfolioScenario(workspaceId, {
        scenarioType,
        parameters: params
      });

      if (res?.success) {
        onSimulationComplete(res.data);
      } else {
        onSimulationComplete(res);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to simulate portfolio scenario");
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Portfolio What-If Simulator</h3>
          <p className="text-xs text-slate-500">Pure in-memory cross-project scenario evaluation without modifying live state</p>
        </div>
        <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
          Pure Simulation (Read-Only)
        </span>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
          {error}
        </div>
      )}

      {/* Scenario Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <label
          className={`p-3 border rounded-xl cursor-pointer transition-all ${
            scenarioType === "RESOURCE_UNAVAILABLE"
              ? "border-indigo-600 bg-indigo-50/40 text-indigo-950 font-semibold"
              : "border-slate-200 hover:border-slate-300 text-slate-700"
          }`}
        >
          <input
            type="radio"
            name="scenarioType"
            value="RESOURCE_UNAVAILABLE"
            checked={scenarioType === "RESOURCE_UNAVAILABLE"}
            onChange={(e) => setScenarioType(e.target.value)}
            className="sr-only"
          />
          <div>👤 Resource Unavailable</div>
          <div className="text-[10px] text-slate-500 font-normal mt-1">Simulate capacity loss across all assigned projects</div>
        </label>

        <label
          className={`p-3 border rounded-xl cursor-pointer transition-all ${
            scenarioType === "PROJECT_DEADLINE_CHANGE"
              ? "border-indigo-600 bg-indigo-50/40 text-indigo-950 font-semibold"
              : "border-slate-200 hover:border-slate-300 text-slate-700"
          }`}
        >
          <input
            type="radio"
            name="scenarioType"
            value="PROJECT_DEADLINE_CHANGE"
            checked={scenarioType === "PROJECT_DEADLINE_CHANGE"}
            onChange={(e) => setScenarioType(e.target.value)}
            className="sr-only"
          />
          <div>📅 Deadline Shift</div>
          <div className="text-[10px] text-slate-500 font-normal mt-1">Test moving a project deadline earlier or later</div>
        </label>

        <label
          className={`p-3 border rounded-xl cursor-pointer transition-all ${
            scenarioType === "SCOPE_GROWTH"
              ? "border-indigo-600 bg-indigo-50/40 text-indigo-950 font-semibold"
              : "border-slate-200 hover:border-slate-300 text-slate-700"
          }`}
        >
          <input
            type="radio"
            name="scenarioType"
            value="SCOPE_GROWTH"
            checked={scenarioType === "SCOPE_GROWTH"}
            onChange={(e) => setScenarioType(e.target.value)}
            className="sr-only"
          />
          <div>📈 Scope Growth</div>
          <div className="text-[10px] text-slate-500 font-normal mt-1">Evaluate adding synthetic deliverables</div>
        </label>
      </div>

      {/* Scenario Parameters */}
      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3 text-xs">
        {scenarioType === "RESOURCE_UNAVAILABLE" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Target Member</label>
              {members.length > 0 ? (
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name} ({m.projectCount || 1} project(s))
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="Enter User ID or identifier"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              )}
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Unavailable Duration (Days)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={unavailableDays}
                onChange={(e) => setUnavailableDays(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>
          </div>
        )}

        {scenarioType === "PROJECT_DEADLINE_CHANGE" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Target Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Deadline Shift (Days: positive = later, negative = earlier)</label>
              <input
                type="number"
                value={deadlineShiftDays}
                onChange={(e) => setDeadlineShiftDays(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>
          </div>
        )}

        {scenarioType === "SCOPE_GROWTH" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Target Project</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Synthetic Tasks Added</label>
              <input
                type="number"
                min="1"
                max="50"
                value={scopeTaskCount}
                onChange={(e) => setScopeTaskCount(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
              />
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center space-x-2"
          >
            {simulating && <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white mr-1.5" />}
            <span>{simulating ? "Simulating Scenario..." : "Run Portfolio Simulation"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
