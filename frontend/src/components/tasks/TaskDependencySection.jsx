import React, { useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiLink,
  FiPlus,
  FiTrash2,
  FiUser
} from "react-icons/fi";
import Button from "../ui/Button";
import {
  getTaskDependencies,
  addTaskDependency,
  removeTaskDependency
} from "../../services/api/taskApi";

export default function TaskDependencySection({
  taskId,
  projectId,
  availableTasks = [],
  formatDate = (d) => d
}) {
  const [loading, setLoading] = useState(true);
  const [dependencyData, setDependencyData] = useState(null);
  const [error, setError] = useState("");
  const [cycleError, setCycleError] = useState(null);
  const [selectedPrereqId, setSelectedPrereqId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const fetchDependencies = async () => {
    if (!taskId) return;
    try {
      setLoading(true);
      setError("");
      setCycleError(null);
      const data = await getTaskDependencies(taskId);
      setDependencyData(data);
    } catch (err) {
      console.error("Failed to load task dependencies:", err);
      setError(err?.response?.data?.error || "Failed to load dependencies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, [taskId]);

  const handleAddDependency = async (e) => {
    e?.preventDefault();
    if (!selectedPrereqId || !taskId) return;

    try {
      setSubmitting(true);
      setError("");
      setCycleError(null);

      await addTaskDependency(taskId, selectedPrereqId);
      setSelectedPrereqId("");
      await fetchDependencies();
    } catch (err) {
      const resp = err?.response?.data;
      if (resp?.code === "DEPENDENCY_CYCLE" || resp?.cycle) {
        setCycleError({
          message: resp?.error || "Circular dependency detected. This link would create a loop in the project graph.",
          cycle: resp?.cycle || []
        });
      } else {
        setError(resp?.error || err.message || "Failed to add dependency");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveDependency = async (prereqId) => {
    try {
      setRemovingId(prereqId);
      setError("");
      setCycleError(null);

      await removeTaskDependency(taskId, prereqId);
      await fetchDependencies();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to remove dependency");
    } finally {
      setRemovingId(null);
    }
  };

  if (!taskId) return null;

  const blockedBy = dependencyData?.blockedBy || [];
  const blocks = dependencyData?.blocks || [];
  const isBlocked = dependencyData?.isBlocked || false;
  const activeBlockers = dependencyData?.blockingCount || 0;

  // Filter available candidate tasks that aren't already prerequisites or current task
  const existingPrereqIds = new Set(blockedBy.map((b) => b.id));
  const candidateTasks = (availableTasks || []).filter(
    (t) => t.id !== taskId && !existingPrereqIds.has(t.id) && !t.is_archived
  );

  const selectedPrereqTask = candidateTasks.find((t) => t.id === selectedPrereqId);

  return (
    <section className="mt-6 border-t border-[var(--color-border)] pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FiLink className="text-[var(--color-brand)]" size={18} />
          <h3 className="font-[var(--font-display)] text-base font-semibold text-[var(--color-text)]">
            Task Dependencies
          </h3>
        </div>

        {dependencyData && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isBlocked
                ? "bg-amber-100 text-amber-800 border border-amber-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            {isBlocked ? (
              <>
                <FiAlertTriangle size={12} />
                {activeBlockers} Active Blocker{activeBlockers > 1 ? "s" : ""}
              </>
            ) : (
              <>
                <FiCheckCircle size={12} />
                Ready to Start
              </>
            )}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
        Control sequence of work. Prerequisites must be completed before this task can start.
      </p>

      {/* Cycle Error Banner */}
      {cycleError && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold text-red-900">
            <FiAlertTriangle className="text-red-600" size={15} />
            Circular Dependency Rejected
          </div>
          <p className="mt-1">{cycleError.message}</p>
          {cycleError.cycle && cycleError.cycle.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[11px] text-red-700 bg-red-100/60 p-1.5 rounded">
              <span>Cycle path:</span>
              {cycleError.cycle.map((nodeId, idx) => (
                <React.Fragment key={idx}>
                  <span className="font-semibold">{nodeId.slice(0, 8)}...</span>
                  {idx < cycleError.cycle.length - 1 && <FiArrowRight size={10} />}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {/* General Error Banner */}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center justify-center py-6 text-xs text-[var(--color-text-muted)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-brand)] border-t-transparent mr-2" />
          Loading dependencies...
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* SECTION 1: BLOCKED BY (Prerequisites) */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Blocked By (Prerequisites)
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {blockedBy.length} prerequisite{blockedBy.length === 1 ? "" : "s"}
              </span>
            </div>

            {blockedBy.length === 0 ? (
              <p className="mt-2 text-xs italic text-[var(--color-text-muted)]">
                No prerequisite tasks. This task is not blocked by any other work.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)]">
                {blockedBy.map((prereq) => (
                  <li
                    key={prereq.id}
                    className="flex items-center justify-between py-2.5 text-xs gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {prereq.isCompleted ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                            <FiCheckCircle size={10} /> Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                            <FiClock size={10} /> Blocking
                          </span>
                        )}
                        <span className="font-medium text-[var(--color-text)] truncate">
                          {prereq.title}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-subtle)] px-1 rounded bg-[var(--color-surface-hover)]">
                          {prereq.priority}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                        {prereq.assignedTo && (
                          <span className="inline-flex items-center gap-1">
                            <FiUser size={10} /> {prereq.assignedTo.name}
                          </span>
                        )}
                        {prereq.dueDate && (
                          <span>Due {formatDate(prereq.dueDate)}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveDependency(prereq.id)}
                      disabled={removingId === prereq.id}
                      className="text-red-500 hover:text-red-700 p-1.5 rounded hover:bg-red-50 transition"
                      title="Remove prerequisite dependency"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Add Dependency Control */}
            <form onSubmit={handleAddDependency} className="mt-3 pt-3 border-t border-[var(--color-border)]">
              <label className="block text-[11px] font-medium text-[var(--color-text-subtle)] mb-1">
                Add Prerequisite (Task this work depends on)
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedPrereqId}
                  onChange={(e) => setSelectedPrereqId(e.target.value)}
                  disabled={submitting || candidateTasks.length === 0}
                  className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text)] focus:border-[var(--color-brand)] focus:outline-none"
                >
                  <option value="">
                    {candidateTasks.length === 0
                      ? "No other eligible tasks in project"
                      : "Select a prerequisite task..."}
                  </option>
                  {candidateTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.status || "Backlog"})
                    </option>
                  ))}
                </select>

                <Button
                  type="submit"
                  size="sm"
                  disabled={!selectedPrereqId || submitting}
                  className="shrink-0"
                >
                  <FiPlus size={13} />
                  Add
                </Button>
              </div>

              {selectedPrereqTask && (
                <p className="mt-1.5 text-[11px] text-[var(--color-brand)]">
                  ℹ️ This task will be blocked until <strong>{selectedPrereqTask.title}</strong> is marked Complete.
                </p>
              )}
            </form>
          </div>

          {/* SECTION 2: BLOCKS (Dependents) */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-subtle)]">
                Blocks (Downstream Dependents)
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {blocks.length} dependent{blocks.length === 1 ? "" : "s"}
              </span>
            </div>

            {blocks.length === 0 ? (
              <p className="mt-2 text-xs italic text-[var(--color-text-muted)]">
                No downstream tasks depend on this work.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--color-border)]">
                {blocks.map((dep) => (
                  <li
                    key={dep.id}
                    className="flex items-center justify-between py-2 text-xs gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FiArrowRight className="text-[var(--color-brand)]" size={11} />
                        <span className="font-medium text-[var(--color-text)] truncate">
                          {dep.title}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-subtle)] px-1 rounded bg-[var(--color-surface-hover)]">
                          {dep.status}
                        </span>
                      </div>
                      <div className="mt-0.5 ml-4 flex items-center gap-3 text-[11px] text-[var(--color-text-muted)]">
                        {dep.assignedTo && (
                          <span className="inline-flex items-center gap-1">
                            <FiUser size={10} /> {dep.assignedTo.name}
                          </span>
                        )}
                        {dep.dueDate && (
                          <span>Due {formatDate(dep.dueDate)}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
