import React, { useState } from "react";
import { FiX, FiCheckCircle, FiAlertTriangle, FiArrowRight, FiShield, FiFileText } from "react-icons/fi";

/**
 * Proposal Preview & Execution Modal
 * Enforces explicit user review and confirmation of each mutation before real database updates.
 */
const ProposalPreview = ({
  proposal,
  onClose,
  onConfirmExecution,
  isExecuting = false,
  error = null
}) => {
  if (!proposal) return null;

  const [acknowledged, setAcknowledged] = useState(false);
  const isStale = proposal.status === "STALE";

  const handleApply = () => {
    if (onConfirmExecution) {
      onConfirmExecution(proposal.proposalId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg">
              <FiShield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Review & Confirm Project Plan
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verify each proposed change prior to applying live database updates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Stale Alert */}
          {isStale && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
              <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Proposal Outdated:</strong> Project tasks or dependencies changed after this plan was generated. To prevent overwriting newer changes, please refresh and generate a fresh replanning proposal.
              </div>
            </div>
          )}

          {/* Execution Error */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-700 dark:text-red-300">
              <strong>Execution Error:</strong> {error}
            </div>
          )}

          {/* Proposal Summary */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
              {proposal.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {proposal.rationale}
            </p>
          </div>

          {/* Impact Overview */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl text-xs">
            <div>
              <span className="text-slate-500">Projected Health:</span>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {proposal.projectedImpact?.health?.before || 0} → {proposal.projectedImpact?.health?.after || 0}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Critical Path Tasks:</span>
              <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                {proposal.projectedImpact?.criticalTasks?.before || 0} → {proposal.projectedImpact?.criticalTasks?.after || 0}
              </div>
            </div>
          </div>

          {/* Proposed Mutations Checklist */}
          <div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block mb-2">
              Mutations to Apply ({proposal.proposedChanges?.length || 0})
            </span>
            <div className="space-y-2">
              {(proposal.proposedChanges || []).map((ch, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FiFileText className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ch.taskTitle || `Task ${ch.taskId}`}
                      </span>
                      <span className="block text-slate-500">
                        {ch.details || `${ch.type}`}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {ch.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Mandatory User Confirmation Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={isStale}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
              />
              <span>
                I have reviewed all {proposal.proposedChanges?.length || 0} proposed mutation(s) and explicitly approve applying these changes to live project data.
              </span>
            </label>
          </div>
        </div>

        {/* Action Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!acknowledged || isStale || isExecuting}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg shadow-sm transition-colors"
          >
            <FiCheckCircle className="w-4 h-4" />
            {isExecuting ? "Applying Plan..." : "Confirm & Apply Plan"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProposalPreview;
