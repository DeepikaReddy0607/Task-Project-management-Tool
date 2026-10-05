import React, { useState, useEffect, useMemo } from "react";
import {
  FiCheckSquare,
  FiPlus,
  FiSearch,
  FiFilter,
  FiArrowRight,
  FiClock,
  FiAlertCircle,
  FiRefreshCw,
  FiTag,
  FiLayers,
  FiUser,
  FiCalendar,
  FiTrendingUp,
  FiTrendingDown,
  FiTrash2,
  FiEdit3,
  FiRepeat,
  FiHelpCircle,
  FiExternalLink,
  FiCheckCircle,
  FiX
} from "react-icons/fi";
import {
  getProjectDecisions,
  createDecision,
  updateDecision,
  deleteDecision,
  supersedeDecision,
  getDecisionIntelligence
} from "../../services/api/decisionApi";

const CATEGORIES = [
  "ALL",
  "SCOPE",
  "SCHEDULE",
  "RESOURCE",
  "TECHNICAL",
  "PROCESS",
  "RISK",
  "PRODUCT",
  "TEAM",
  "ARCHITECTURE",
  "OTHER"
];

const STATUSES = ["ALL", "ACTIVE", "SUPERSEDED", "REVERSED", "CLOSED", "PROPOSED"];

export default function DecisionLog({ projectId, onOpenCounterfactual, className = "" }) {
  const [decisions, setDecisions] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, superseded: 0, reversed: 0, recent: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // Modals & Panels
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDecision, setEditingDecision] = useState(null);
  const [supersedingDecision, setSupersedingDecision] = useState(null);
  const [selectedDecisionDetail, setSelectedDecisionDetail] = useState(null);
  const [detailIntelligence, setDetailIntelligence] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    rationale: "",
    category: "TECHNICAL",
    status: "ACTIVE",
    alternatives: [""],
    expectedConsequences: [""],
    tags: ""
  });

  const [supersedeFormData, setSupersedeFormData] = useState({
    title: "",
    rationale: "",
    category: "TECHNICAL",
    alternatives: [""],
    expectedConsequences: [""]
  });

  const fetchDecisions = async (page = 1) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        limit: 20,
        sortBy,
        sortOrder
      };
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedCategory !== "ALL") params.category = selectedCategory;
      if (selectedStatus !== "ALL") params.status = selectedStatus;

      const res = await getProjectDecisions(projectId, params);
      if (res.success) {
        setDecisions(res.decisions || []);
        setSummary(res.summary || { total: 0, active: 0, superseded: 0, reversed: 0, recent: 0 });
        setPagination(res.pagination || { total: 0, page: 1, limit: 20, totalPages: 1 });
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load decisions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecisions(1);
  }, [projectId, selectedCategory, selectedStatus, sortBy, sortOrder]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchDecisions(1);
  };

  const handleOpenDetail = async (decision) => {
    setSelectedDecisionDetail(decision);
    setDetailLoading(true);
    setDetailIntelligence(null);
    try {
      const res = await getDecisionIntelligence(projectId, decision.id);
      if (res.success && res.data) {
        setDetailIntelligence(res.data);
      }
    } catch (err) {
      console.warn("Could not load detail intelligence:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    try {
      const payload = {
        title: formData.title.trim(),
        rationale: formData.rationale.trim(),
        category: formData.category,
        status: formData.status,
        alternatives: formData.alternatives.filter((a) => a.trim().length > 0),
        expectedConsequences: formData.expectedConsequences.filter((c) => c.trim().length > 0),
        tags: formData.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      };

      if (editingDecision) {
        await updateDecision(projectId, editingDecision.id, payload);
      } else {
        await createDecision(projectId, payload);
      }

      setIsCreateOpen(false);
      setEditingDecision(null);
      resetForm();
      fetchDecisions(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || "Failed to save decision");
    }
  };

  const handleSupersedeSubmit = async (e) => {
    e.preventDefault();
    if (!supersedeFormData.title.trim() || !supersedingDecision) return;

    try {
      const payload = {
        title: supersedeFormData.title.trim(),
        rationale: supersedeFormData.rationale.trim(),
        category: supersedeFormData.category,
        alternatives: supersedeFormData.alternatives.filter((a) => a.trim().length > 0),
        expectedConsequences: supersedeFormData.expectedConsequences.filter((c) => c.trim().length > 0)
      };

      await supersedeDecision(projectId, supersedingDecision.id, payload);
      setSupersedingDecision(null);
      resetSupersedeForm();
      fetchDecisions(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || "Failed to supersede decision");
    }
  };

  const handleDelete = async (decisionId) => {
    if (!window.confirm("Are you sure you want to remove this decision record?")) return;
    try {
      await deleteDecision(projectId, decisionId);
      if (selectedDecisionDetail?.id === decisionId) setSelectedDecisionDetail(null);
      fetchDecisions(pagination.page);
    } catch (err) {
      alert(err.response?.data?.error?.message || err.message || "Failed to delete decision");
    }
  };

  const openEditModal = (decision) => {
    setEditingDecision(decision);
    setFormData({
      title: decision.title || decision.decision || "",
      rationale: decision.rationale || decision.reason || "",
      category: decision.category || "TECHNICAL",
      status: decision.status || "ACTIVE",
      alternatives: decision.alternatives?.length ? decision.alternatives : [""],
      expectedConsequences: decision.expectedConsequences?.length ? decision.expectedConsequences : [""],
      tags: Array.isArray(decision.tags) ? decision.tags.join(", ") : ""
    });
    setIsCreateOpen(true);
  };

  const openSupersedeModal = (decision) => {
    setSupersedingDecision(decision);
    setSupersedeFormData({
      title: "",
      rationale: `Supersedes previous decision: "${decision.title}"`,
      category: decision.category || "TECHNICAL",
      alternatives: [`Keep original: "${decision.title}"`, ""],
      expectedConsequences: [""]
    });
  };

  const resetForm = () => {
    setFormData({
      title: "",
      rationale: "",
      category: "TECHNICAL",
      status: "ACTIVE",
      alternatives: [""],
      expectedConsequences: [""],
      tags: ""
    });
  };

  const resetSupersedeForm = () => {
    setSupersedeFormData({
      title: "",
      rationale: "",
      category: "TECHNICAL",
      alternatives: [""],
      expectedConsequences: [""]
    });
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
      case "SUPERSEDED":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "REVERSED":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      case "PROPOSED":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";
    }
  };

  const getCategoryBadge = (category) => {
    switch (category) {
      case "TECHNICAL":
      case "ARCHITECTURE":
        return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30";
      case "SCHEDULE":
        return "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30";
      case "SCOPE":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30";
      case "RESOURCE":
      case "TEAM":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
      case "RISK":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
              <FiCheckSquare className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Project Decision Log
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Authoritative record of project decisions, rationale, alternatives, and verified outcomes.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingDecision(null);
              resetForm();
              setIsCreateOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl flex items-center gap-2 shadow-sm transition"
          >
            <FiPlus className="w-4 h-4" />
            <span>Record Decision</span>
          </button>
        </div>
      </div>

      {/* Summary Telemetry Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Decisions</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.total}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Active</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.active}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Superseded</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.superseded}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Reversed</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.reversed}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Last 7 Days</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{summary.recent}</div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search decisions by title, rationale, category, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl transition"
          >
            Search
          </button>
        </form>

        {/* Filter Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-semibold mr-1">Status:</span>
            {STATUSES.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  selectedStatus === st
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Decision Cards List */}
      {loading ? (
        <div className="p-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500">
          <FiRefreshCw className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-sm font-medium">Loading project decisions...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400">
          <div className="flex items-center space-x-2 font-semibold">
            <FiAlertCircle className="w-5 h-5" />
            <span>Error</span>
          </div>
          <p className="text-sm mt-1">{error}</p>
        </div>
      ) : decisions.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
          <FiCheckSquare className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Decisions Found</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            {searchTerm || selectedCategory !== "ALL" || selectedStatus !== "ALL"
              ? "No decisions match the current filter criteria."
              : "No project decisions have been recorded yet. Click 'Record Decision' above to create the first entry."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {decisions.map((decision) => (
            <div
              key={decision.id}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-400 dark:hover:border-blue-500 transition group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getCategoryBadge(decision.category)}`}>
                      {decision.category}
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getStatusBadge(decision.status)}`}>
                      {decision.status}
                    </span>
                    {decision.supersededBy && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                        <FiRepeat className="w-3 h-3" /> Superseded
                      </span>
                    )}
                    {decision.supersedesId && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                        <FiArrowRight className="w-3 h-3" /> Supersedes Prior
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {decision.title}
                  </h3>

                  {decision.rationale && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                      <span className="font-semibold text-slate-500">Rationale: </span>
                      {decision.rationale}
                    </p>
                  )}

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                    <span className="flex items-center gap-1">
                      <FiCalendar className="w-3.5 h-3.5" />
                      {new Date(decision.decisionDate).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <FiUser className="w-3.5 h-3.5" />
                      {decision.owner?.name || "Unassigned"}
                    </span>
                    {decision.alternatives?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <FiLayers className="w-3.5 h-3.5" />
                        {decision.alternatives.length} alternatives considered
                      </span>
                    )}
                    {decision.tags?.length > 0 && (
                      <div className="flex items-center gap-1">
                        <FiTag className="w-3.5 h-3.5" />
                        {decision.tags.slice(0, 3).map((t, idx) => (
                          <span key={idx} className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 sm:self-center shrink-0">
                  <button
                    onClick={() => handleOpenDetail(decision)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-semibold rounded-lg transition"
                  >
                    View Details
                  </button>

                  {decision.status === "ACTIVE" && (
                    <button
                      onClick={() => openSupersedeModal(decision)}
                      title="Supersede with new decision"
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition"
                    >
                      <FiRepeat className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => openEditModal(decision)}
                    title="Edit decision"
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                  >
                    <FiEdit3 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(decision.id)}
                    title="Delete decision"
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 px-2 text-sm text-slate-500">
              <div>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </div>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchDecisions(pagination.page - 1)}
                  className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchDecisions(pagination.page + 1)}
                  className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* DECISION DETAIL MODAL / DRAWER                               */}
      {/* ============================================================ */}
      {selectedDecisionDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getCategoryBadge(selectedDecisionDetail.category)}`}>
                    {selectedDecisionDetail.category}
                  </span>
                  <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getStatusBadge(selectedDecisionDetail.status)}`}>
                    {selectedDecisionDetail.status}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  {selectedDecisionDetail.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDecisionDetail(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Context & Rationale */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rationale & Motivation</h4>
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl text-sm text-slate-700 dark:text-slate-300 leading-relaxed border border-slate-100 dark:border-slate-700">
                  {selectedDecisionDetail.rationale || "No explicit rationale was recorded for this decision."}
                </div>
              </div>

              {/* Owner & Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
                  <span className="text-slate-400 block mb-0.5">Decided By</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedDecisionDetail.owner?.name || "Unassigned"}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
                  <span className="text-slate-400 block mb-0.5">Decision Date</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(selectedDecisionDetail.decisionDate).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Alternatives Considered */}
              {selectedDecisionDetail.alternatives?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alternatives Considered</h4>
                  <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {selectedDecisionDetail.alternatives.map((alt, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                        <span className="font-bold text-blue-600 text-xs mt-0.5">{idx + 1}.</span>
                        <span>{alt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Expected vs Observed Telemetry Comparison */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Expected vs. Observed Consequences</span>
                  </h4>
                  {detailIntelligence?.expectedVsObserved?.evidenceQuality && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/30">
                      {detailIntelligence.expectedVsObserved.evidenceQuality}
                    </span>
                  )}
                </div>

                {detailLoading ? (
                  <div className="p-4 text-center text-xs text-slate-400">Loading intelligence analysis...</div>
                ) : detailIntelligence?.expectedVsObserved?.comparisons?.length > 0 ? (
                  <div className="space-y-2">
                    {detailIntelligence.expectedVsObserved.comparisons.map((item, idx) => (
                      <div key={idx} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          🎯 Expected: {item.expected}
                        </div>
                        <div className="text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-blue-500">
                          📊 Observed: {item.observedObservation}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-500">
                    No explicit expected consequences were recorded for longitudinal comparison.
                  </div>
                )}

                {/* Non-causal disclaimer */}
                <div className="text-[11px] text-slate-400 bg-amber-500/5 p-2.5 rounded-lg border border-amber-500/20 flex items-start gap-2">
                  <FiAlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>
                    Temporal association reflects chronologically subsequent events and should not be construed as established causal proof.
                  </span>
                </div>
              </div>

              {/* Decision Chain */}
              {detailIntelligence?.decisionChain?.length > 1 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Decision Chain</h4>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700 text-xs space-y-2">
                    {detailIntelligence.decisionChain.map((chainItem, idx) => (
                      <div key={chainItem.id} className="flex items-center gap-2">
                        <span className="font-bold text-slate-400">#{idx + 1}</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{chainItem.title}</span>
                        <span className={`px-2 py-0.2 text-[10px] font-semibold rounded-full border ${getStatusBadge(chainItem.status)}`}>
                          {chainItem.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer & Counterfactual Handoff */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setSelectedDecisionDetail(null);
                  if (onOpenCounterfactual) {
                    onOpenCounterfactual(selectedDecisionDetail);
                  }
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
              >
                <FiHelpCircle className="w-4 h-4" />
                <span>Launch Counterfactual Simulation</span>
              </button>

              <button
                onClick={() => setSelectedDecisionDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* RECORD / EDIT DECISION MODAL                                  */}
      {/* ============================================================ */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col my-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingDecision ? "Edit Project Decision" : "Record New Project Decision"}
              </h3>
              <button
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingDecision(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Decision Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Move API testing before frontend integration"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none text-slate-900 dark:text-white"
                  >
                    {CATEGORIES.filter((c) => c !== "ALL").map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none text-slate-900 dark:text-white"
                  >
                    {STATUSES.filter((s) => s !== "ALL").map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Rationale</label>
                <textarea
                  rows={3}
                  placeholder="Why was this choice made? Detail the context and architectural or team trade-offs..."
                  value={formData.rationale}
                  onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              {/* Expected Consequences */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Expected Consequences
                </label>
                {formData.expectedConsequences.map((c, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="e.g. Reduce integration delay; shift frontend milestones"
                      value={c}
                      onChange={(e) => {
                        const next = [...formData.expectedConsequences];
                        next[i] = e.target.value;
                        setFormData({ ...formData, expectedConsequences: next });
                      }}
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, expectedConsequences: [...formData.expectedConsequences, ""] })}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium"
                >
                  + Add Expected Consequence
                </button>
              </div>

              {/* Alternatives Considered */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alternatives Considered
                </label>
                {formData.alternatives.map((alt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder={`Alternative ${i + 1}`}
                      value={alt}
                      onChange={(e) => {
                        const next = [...formData.alternatives];
                        next[i] = e.target.value;
                        setFormData({ ...formData, alternatives: next });
                      }}
                      className="flex-1 px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, alternatives: [...formData.alternatives, ""] })}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium"
                >
                  + Add Alternative
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. backend, database, sprint-3"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingDecision(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium"
                >
                  {editingDecision ? "Save Changes" : "Record Decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SUPERSEDE DECISION MODAL                                      */}
      {/* ============================================================ */}
      {supersedingDecision && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col my-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FiRepeat className="text-amber-500" /> Supersede Decision
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Replaces "{supersedingDecision.title}" while preserving historical context.
                </p>
              </div>
              <button
                onClick={() => setSupersedingDecision(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <FiX className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSupersedeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Decision Policy Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Adopt hybrid MongoDB + PostgreSQL architecture"
                  value={supersedeFormData.title}
                  onChange={(e) => setSupersedeFormData({ ...supersedeFormData, title: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Superseding Rationale
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain why the previous decision is being superseded and what new factors led to this change..."
                  value={supersedeFormData.rationale}
                  onChange={(e) => setSupersedeFormData({ ...supersedeFormData, rationale: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300">
                Notice: The previous decision will transition to status <strong>SUPERSEDED</strong> and maintain a permanent link to this new active decision.
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSupersedingDecision(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium"
                >
                  Confirm Supersede
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
