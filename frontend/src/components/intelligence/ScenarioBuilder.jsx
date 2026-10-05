import React, { useState } from "react";
import { FiPlus, FiTrash2, FiPlay, FiZap, FiAlertCircle } from "react-icons/fi";

/**
 * Scenario Builder Component
 * Allows users to construct hypothetical project mutations and simulate their
 * system-wide impact without modifying the live database.
 */
const ScenarioBuilder = ({
  tasks = [],
  members = [],
  onSimulate,
  isLoading = false
}) => {
  const [scenarioName, setScenarioName] = useState("Hypothetical Plan A");
  const [description, setDescription] = useState("");
  const [mutations, setMutations] = useState([
    {
      id: "m_1",
      type: "TASK_DELAY",
      taskId: tasks[0]?.id || "",
      days: 3,
      hours: 8,
      toUserId: members[0]?.userId || members[0]?.id || "",
      priority: "High"
    }
  ]);

  const activeTasks = tasks.filter((t) => !t.is_archived);

  const addMutation = () => {
    setMutations([
      ...mutations,
      {
        id: `m_${Date.now()}`,
        type: "TASK_DELAY",
        taskId: activeTasks[0]?.id || "",
        days: 3,
        hours: 8,
        toUserId: members[0]?.userId || members[0]?.id || "",
        priority: "High"
      }
    ]);
  };

  const removeMutation = (id) => {
    setMutations(mutations.filter((m) => m.id !== id));
  };

  const updateMutation = (id, field, value) => {
    setMutations(
      mutations.map((m) => {
        if (m.id !== id) return m;
        return { ...m, [field]: value };
      })
    );
  };

  const handleSimulate = (e) => {
    e.preventDefault();
    if (onSimulate) {
      onSimulate({
        name: scenarioName,
        description,
        mutations: mutations.map((m) => ({
          type: m.type,
          taskId: m.taskId,
          days: Number(m.days) || 0,
          hours: Number(m.hours) || 0,
          toUserId: m.toUserId,
          priority: m.priority
        }))
      });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FiZap className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            What-If Scenario Builder
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Simulate schedule shifts, reassignments, and effort changes entirely in memory.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
          Pure In-Memory Simulation
        </span>
      </div>

      <form onSubmit={handleSimulate} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Scenario Name
            </label>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g., Delay API Testing by 3 Days"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              placeholder="Hypothesis to test..."
            />
          </div>
        </div>

        {/* Mutation Rows */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Simulated Actions ({mutations.length})
            </span>
            <button
              type="button"
              onClick={addMutation}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
            >
              <FiPlus className="w-3.5 h-3.5" /> Add Mutation
            </button>
          </div>

          {mutations.map((m, idx) => (
            <div
              key={m.id}
              className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
            >
              <div className="md:col-span-1 text-xs font-bold text-slate-400">
                #{idx + 1}
              </div>

              {/* Action Type */}
              <div className="md:col-span-3">
                <select
                  value={m.type}
                  onChange={(e) => updateMutation(m.id, "type", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-slate-800 dark:text-slate-200"
                >
                  <option value="TASK_DELAY">Delay Task</option>
                  <option value="TASK_DURATION_INCREASE">Increase Hours</option>
                  <option value="TASK_DURATION_DECREASE">Decrease Hours</option>
                  <option value="TASK_REASSIGN">Reassign Member</option>
                  <option value="TASK_PRIORITY_CHANGE">Change Priority</option>
                  <option value="TASK_COMPLETE">Mark Completed</option>
                </select>
              </div>

              {/* Target Task */}
              <div className="md:col-span-4">
                <select
                  value={m.taskId}
                  onChange={(e) => updateMutation(m.id, "taskId", e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-slate-800 dark:text-slate-200"
                >
                  {activeTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.priority})
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Value Input */}
              <div className="md:col-span-3">
                {m.type === "TASK_DELAY" && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={m.days}
                      onChange={(e) => updateMutation(m.id, "days", e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md"
                    />
                    <span className="text-xs text-slate-500">days</span>
                  </div>
                )}

                {(m.type === "TASK_DURATION_INCREASE" || m.type === "TASK_DURATION_DECREASE") && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="160"
                      value={m.hours}
                      onChange={(e) => updateMutation(m.id, "hours", e.target.value)}
                      className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md"
                    />
                    <span className="text-xs text-slate-500">hours</span>
                  </div>
                )}

                {m.type === "TASK_REASSIGN" && (
                  <select
                    value={m.toUserId}
                    onChange={(e) => updateMutation(m.id, "toUserId", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md"
                  >
                    {members.map((mem) => (
                      <option key={mem.userId || mem.id} value={mem.userId || mem.id}>
                        {mem.name || mem.users?.first_name || "Member"}
                      </option>
                    ))}
                  </select>
                )}

                {m.type === "TASK_PRIORITY_CHANGE" && (
                  <select
                    value={m.priority}
                    onChange={(e) => updateMutation(m.id, "priority", e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                )}

                {m.type === "TASK_COMPLETE" && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    Unblocks downstream
                  </span>
                )}
              </div>

              {/* Delete Button */}
              <div className="md:col-span-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeMutation(m.id)}
                  disabled={mutations.length <= 1}
                  className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Informational Callout */}
        <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-lg flex items-start gap-2.5 text-xs text-indigo-700 dark:text-indigo-300">
          <FiAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Safe Simulation:</strong> Clicking "Run Simulation" will recalculate Critical Path, Bottlenecks, Health Score, and Schedule Drift without persisting any changes to the database.
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
          >
            <FiPlay className="w-4 h-4" />
            {isLoading ? "Simulating Pipeline..." : "Run Simulation"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ScenarioBuilder;
