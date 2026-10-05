import React, { useState, useEffect } from "react";
import {
  FiRotateCcw,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiActivity,
  FiClock,
  FiAlertTriangle,
  FiZap,
  FiShield,
  FiCheckCircle,
  FiLayers,
  FiRefreshCw
} from "react-icons/fi";
import { getProjectReplay, getHealthHistory } from "../../services/api/intelligenceApi";

export default function ProjectReplay({ projectId, className = "" }) {
  const [snapshots, setSnapshots] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [targetDate, setTargetDate] = useState("");
  const [replayData, setReplayData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Initial load: fetch snapshots to calibrate timeline slider
  const loadSnapshots = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getHealthHistory(projectId, { limit: 100, order: "asc" });
      if (res.success && res.data && res.data.snapshots?.length > 0) {
        setSnapshots(res.data.snapshots);
        const lastIdx = res.data.snapshots.length - 1;
        setSelectedIndex(lastIdx);
        const snap = res.data.snapshots[lastIdx];
        setTargetDate(new Date(snap.captured_at).toISOString().split("T")[0]);
        await loadReplayForDate(snap.captured_at);
      } else {
        setSnapshots([]);
        setReplayData(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to load project snapshots");
    } finally {
      setLoading(false);
    }
  };

  const loadReplayForDate = async (timestamp) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProjectReplay(projectId, { timestamp });
      if (res.success && res.data) {
        setReplayData(res.data);
      } else {
        setReplayData(null);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || "Failed to replay project state");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshots();
  }, [projectId]);

  const handleSliderChange = (e) => {
    const idx = Number(e.target.value);
    setSelectedIndex(idx);
    if (snapshots[idx]) {
      const snap = snapshots[idx];
      setTargetDate(new Date(snap.captured_at).toISOString().split("T")[0]);
      loadReplayForDate(snap.captured_at);
    }
  };

  const handleDatePick = (e) => {
    const picked = e.target.value;
    setTargetDate(picked);
    if (picked) {
      loadReplayForDate(new Date(picked).toISOString());
    }
  };

  const navigateSnapshot = (delta) => {
    const nextIdx = selectedIndex + delta;
    if (nextIdx >= 0 && nextIdx < snapshots.length) {
      setSelectedIndex(nextIdx);
      const snap = snapshots[nextIdx];
      setTargetDate(new Date(snap.captured_at).toISOString().split("T")[0]);
      loadReplayForDate(snap.captured_at);
    }
  };

  if (loading && !replayData) {
    return (
      <div className={`p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center space-x-3 text-slate-500 ${className}`}>
        <FiRefreshCw className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm font-medium">Reconstructing historical project state...</span>
      </div>
    );
  }

  if (snapshots.length === 0 && !loading) {
    return (
      <div className={`p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 ${className}`}>
        <FiRotateCcw className="w-10 h-10 mx-auto text-slate-400 mb-3" />
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No Historical Snapshots Available</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
          No recorded project state exists for this project yet. Snapshots will be recorded automatically during project execution and replanning.
        </p>
      </div>
    );
  }

  const currentSnap = snapshots[selectedIndex];

  return (
    <div className={`space-y-5 ${className}`}>
      {/* Replay Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FiRotateCcw className="text-primary" />
                Project Time-Travel Replay
              </h3>
              <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                Historical Replay (Read-Only)
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Inspect verified past intelligence states recorded at exact historical milestones.
            </p>
          </div>

          {/* Date Picker & Step Controls */}
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={targetDate}
              onChange={handleDatePick}
              className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-700 dark:text-slate-200"
            />
            <button
              onClick={() => navigateSnapshot(-1)}
              disabled={selectedIndex <= 0}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Previous Snapshot"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-slate-500 font-mono">
              {selectedIndex + 1} / {snapshots.length}
            </span>
            <button
              onClick={() => navigateSnapshot(1)}
              disabled={selectedIndex >= snapshots.length - 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Next Snapshot"
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline Slider */}
        {snapshots.length > 1 && (
          <div className="pt-2">
            <input
              type="range"
              min="0"
              max={snapshots.length - 1}
              value={selectedIndex}
              onChange={handleSliderChange}
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>{new Date(snapshots[0]?.captured_at).toLocaleDateString()}</span>
              <span className="font-semibold text-primary">
                {currentSnap ? new Date(currentSnap.captured_at).toLocaleString() : ""}
              </span>
              <span>{new Date(snapshots.slice(-1)[0]?.captured_at).toLocaleDateString()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Replay State Viewer */}
      {error ? (
        <div className="p-6 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-rose-700 dark:text-rose-400">
          <FiAlertTriangle className="w-5 h-5 mb-1" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : !replayData || !replayData.isAvailable ? (
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <FiClock className="w-8 h-8 mx-auto text-slate-400 mb-2" />
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Recorded State For This Timestamp</h4>
          <p className="text-xs text-slate-500 mt-1">
            Historical state is unavailable for this timestamp because no snapshot was recorded.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Snapshot Banner & Label */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FiClock className="text-amber-600 dark:text-amber-400 w-5 h-5" />
              <div>
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                  {replayData.label}
                </span>
                <span className="text-[11px] text-amber-700 dark:text-amber-400">
                  Recorded at {new Date(replayData.snapshotTimestamp).toLocaleString()}
                </span>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-amber-200 dark:border-amber-800">
              Snapshot ID: {replayData.snapshotId?.slice(0, 10)}...
            </span>
          </div>

          {/* Historical KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <span className="text-xs text-slate-400 font-semibold block uppercase">Health Score</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {replayData.health?.score}
                <span className="text-xs font-normal text-slate-400 ml-1">/ 100</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary mt-1 inline-block uppercase">
                {replayData.health?.status}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <span className="text-xs text-slate-400 font-semibold block uppercase">Schedule Drift</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {replayData.schedule?.scheduleDriftDays}d
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">
                Projected: {replayData.schedule?.projectedEndDate ? new Date(replayData.schedule.projectedEndDate).toLocaleDateString() : "Unscheduled"}
              </span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <span className="text-xs text-slate-400 font-semibold block uppercase">Critical Tasks</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {replayData.criticalPath?.criticalTaskCount}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Tasks on Critical Path</span>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-center">
              <span className="text-xs text-slate-400 font-semibold block uppercase">Bottlenecks</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                {replayData.bottlenecks?.bottleneckCount}
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">Active Flow Constraints</span>
            </div>
          </div>

          {/* Recorded Facts */}
          {replayData.recordedFacts?.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                <FiCheckCircle className="text-emerald-500" />
                Recorded Facts at this Snapshot
              </h4>
              <ul className="space-y-1 text-slate-600 dark:text-slate-300">
                {replayData.recordedFacts.map((fact, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Surrounding Events */}
          {replayData.eventsAround?.length > 0 && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm text-xs">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                <FiClock className="text-primary" />
                Events Recorded Around this Snapshot
              </h4>
              <div className="space-y-2">
                {replayData.eventsAround.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="p-2 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{ev.title}</span>
                    <span className="text-slate-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
