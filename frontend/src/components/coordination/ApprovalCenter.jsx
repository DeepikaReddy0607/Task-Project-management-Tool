import { useState, useEffect, useCallback } from "react";
import {
  FiShield,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiRefreshCw,
  FiLayers,
  FiFileText,
  FiLock,
  FiArrowRight,
  FiEye
} from "react-icons/fi";
import {
  getWorkspaceApprovals,
  getReplanningProposals,
  approveProposal,
  rejectProposal,
  executeProposal
} from "../../services/api/intelligenceApi";

export default function ApprovalCenter({ workspaceId, projectId, onPreviewProposal, className = "" }) {
  const [activeQueue, setActiveQueue] = useState("all");
  const [approvalsData, setApprovalsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [confirmationDialog, setConfirmationDialog] = useState(null); // { action: 'approve'|'execute'|'reject', proposalId, title }

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let data = null;
      if (workspaceId) {
        const res = await getWorkspaceApprovals(workspaceId);
        data = res?.data || null;
      } else if (projectId) {
        const res = await getReplanningProposals(projectId);
        data = {
          replanningProposals: res?.data || [],
          decisionReviews: [],
          escalatedBlockers: [],
          riskReviews: []
        };
      }
      setApprovalsData(data);
    } catch (err) {
      console.error("Failed to load approval queues:", err);
      setError(err?.response?.data?.error?.message || err.message || "Failed to load approval center data");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleApprove = async (proposalId) => {
    try {
      setActionInProgress(proposalId);
      await approveProposal(proposalId);
      setConfirmationDialog(null);
      await fetchApprovals();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || "Failed to approve proposal");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (proposalId) => {
    try {
      setActionInProgress(proposalId);
      await rejectProposal(proposalId, { reason: "Rejected via Approval Center" });
      setConfirmationDialog(null);
      await fetchApprovals();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || "Failed to reject proposal");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleExecute = async (proposalId) => {
    try {
      setActionInProgress(proposalId);
      await executeProposal(proposalId);
      setConfirmationDialog(null);
      await fetchApprovals();
    } catch (err) {
      setError(err?.response?.data?.error?.message || err.message || "Failed to execute replanning proposal");
    } finally {
      setActionInProgress(null);
    }
  };

  const replanningList = approvalsData?.replanningProposals || approvalsData?.replanningQueue || [];
  const decisionsList = approvalsData?.decisionReviews || approvalsData?.decisionQueue || [];
  const blockersList = approvalsData?.escalatedBlockers || approvalsData?.blockerQueue || [];
  const risksList = approvalsData?.riskReviews || approvalsData?.riskQueue || [];

  const totalPending = replanningList.length + decisionsList.length + blockersList.length + risksList.length;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <FiShield size={22} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              Unified Approval Center
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Controlled Execution
              </span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Zero silent mutations. All project state changes require explicit human authorization.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchApprovals}
            disabled={loading}
            className="p-2 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            title="Refresh queues"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={16} />
          </button>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-3">
        <FiLock className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" size={16} />
        <div>
          <span className="font-bold">Governance & Safety Invariant:</span> TaskFlow Phase 6 coordinates and recommends next actions, but will never silently modify task dates, reassign team members, or change deadlines. Approval and execution strictly preserve Phase 3 transactional safety and audit records.
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
          <FiAlertTriangle size={18} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Queue Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveQueue("all")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition ${
            activeQueue === "all"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          All Items ({totalPending})
        </button>
        <button
          type="button"
          onClick={() => setActiveQueue("replanning")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 ${
            activeQueue === "replanning"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          Replanning Proposals
          {replanningList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
              {replanningList.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveQueue("decisions")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 ${
            activeQueue === "decisions"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          Decisions
          {decisionsList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-700 dark:text-purple-300">
              {decisionsList.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveQueue("blockers")}
          className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 ${
            activeQueue === "blockers"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          Escalated Blockers
          {blockersList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-700 dark:text-rose-300">
              {blockersList.length}
            </span>
          )}
        </button>
      </div>

      {loading && !approvalsData ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
          <FiRefreshCw className="animate-spin text-emerald-500" size={28} />
          <p className="text-sm font-medium">Aggregating governance queues...</p>
        </div>
      ) : totalPending === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-3">
          <div className="h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <FiCheckCircle size={26} />
          </div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">All Queues Clear</h4>
          <p className="text-xs text-zinc-500 max-w-sm">
            No proposals, decisions, or escalated blockers currently require approval.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Replanning Proposals Queue */}
          {(activeQueue === "all" || activeQueue === "replanning") && replanningList.map((proposal) => (
            <div
              key={proposal.id}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    REPLANNING PROPOSAL
                  </span>
                  <span className="text-xs font-semibold text-zinc-400">
                    ID: {proposal.id?.slice?.(0, 8) || proposal.id}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    proposal.status === "APPROVED" ? "bg-emerald-500/10 text-emerald-600" :
                    proposal.status === "EXECUTED" ? "bg-purple-500/10 text-purple-600" :
                    proposal.status === "REJECTED" ? "bg-rose-500/10 text-rose-600" :
                    "bg-amber-500/10 text-amber-600"
                  }`}>
                    {proposal.status || "DRAFT"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onPreviewProposal && (
                    <button
                      type="button"
                      onClick={() => onPreviewProposal(proposal)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 transition"
                    >
                      <FiEye size={12} /> Preview
                    </button>
                  )}

                  {proposal.status !== "APPROVED" && proposal.status !== "EXECUTED" && (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirmationDialog({ action: "approve", proposalId: proposal.id, title: proposal.title })}
                        disabled={actionInProgress === proposal.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-xs"
                      >
                        <FiCheckCircle size={13} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmationDialog({ action: "reject", proposalId: proposal.id, title: proposal.title })}
                        disabled={actionInProgress === proposal.id}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition"
                      >
                        <FiXCircle size={13} /> Reject
                      </button>
                    </>
                  )}

                  {proposal.status === "APPROVED" && (
                    <button
                      type="button"
                      onClick={() => setConfirmationDialog({ action: "execute", proposalId: proposal.id, title: proposal.title })}
                      disabled={actionInProgress === proposal.id}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-xs"
                    >
                      <FiArrowRight size={13} /> Execute Replanning
                    </button>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {proposal.title || "Intelligent Replanning Recommendation"}
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
                  {proposal.rationale || proposal.description || "Proposal addresses critical path bottlenecks and projected deadline drift."}
                </p>
              </div>

              {/* Action List Preview */}
              {proposal.actions && proposal.actions.length > 0 && (
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    Proposed Mutations ({proposal.actions.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {proposal.actions.map((act, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium"
                      >
                        {act.type}: {act.taskTitle || act.taskId?.slice?.(0, 8) || "Task mutation"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Decisions Queue */}
          {(activeQueue === "all" || activeQueue === "decisions") && decisionsList.map((dec) => (
            <div
              key={dec.id}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20">
                  DECISION REVIEW
                </span>
                <span className="text-xs text-zinc-400">
                  {dec.createdAt ? new Date(dec.createdAt).toLocaleDateString() : ""}
                </span>
              </div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {dec.title}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {dec.description || dec.context}
              </p>
            </div>
          ))}

          {/* Blockers Queue */}
          {(activeQueue === "all" || activeQueue === "blockers") && blockersList.map((blk, idx) => (
            <div
              key={blk.id || idx}
              className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-rose-200/80 dark:border-rose-900/50 shadow-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 border border-rose-500/20">
                  ESCALATED BLOCKER
                </span>
                {blk.blockedDays != null && (
                  <span className="text-xs font-bold text-rose-600">
                    Blocked for {blk.blockedDays}d
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {blk.title || blk.taskTitle}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {blk.reason || blk.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Dialog Modal */}
      {confirmationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <FiLock size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Confirm {confirmationDialog.action.toUpperCase()}
                </h3>
                <p className="text-xs text-zinc-500">
                  {confirmationDialog.title || "Replanning Proposal"}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {confirmationDialog.action === "execute"
                ? "Executing this proposal will apply mutations to the project database within an isolated transaction and record an immutable audit trail. This cannot be undone automatically."
                : confirmationDialog.action === "approve"
                ? "Approving marks this proposal as authorized by human decision makers, allowing subsequent execution."
                : "Rejecting marks this proposal as rejected without applying any project mutations."}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmationDialog(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmationDialog.action === "approve") handleApprove(confirmationDialog.proposalId);
                  else if (confirmationDialog.action === "reject") handleReject(confirmationDialog.proposalId);
                  else if (confirmationDialog.action === "execute") handleExecute(confirmationDialog.proposalId);
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white transition shadow-xs ${
                  confirmationDialog.action === "reject"
                    ? "bg-rose-600 hover:bg-rose-500"
                    : "bg-emerald-600 hover:bg-emerald-500"
                }`}
              >
                Yes, {confirmationDialog.action.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
