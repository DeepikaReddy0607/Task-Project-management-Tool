import React, { useState, useEffect } from "react";
import { getProjectForecast, getProbabilisticCriticalPath } from "../../services/api/intelligenceApi";

export default function ProjectForecastPanel({ projectId }) {
  const [loading, setLoading] = useState(true);
  const [forecast, setForecast] = useState(null);
  const [probCP, setProbCP] = useState(null);
  const [error, setError] = useState(null);
  const [iterations, setIterations] = useState(10000);
  const [seed, setSeed] = useState("");

  const fetchForecast = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { iterations: Number(iterations) || 10000 };
      if (seed.trim()) {
        params.seed = Number(seed) || seed.trim();
      }

      const [fcRes, cpRes] = await Promise.all([
        getProjectForecast(projectId, params),
        getProbabilisticCriticalPath(projectId, params).catch(() => null)
      ]);

      if (fcRes?.success) {
        setForecast(fcRes.data);
      } else {
        setForecast(fcRes);
      }

      if (cpRes?.success) {
        setProbCP(cpRes.data);
      } else if (cpRes) {
        setProbCP(cpRes);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load project forecast");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchForecast();
    }
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mr-3" />
        <span>Running Monte Carlo Schedule Simulation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
        <h4 className="font-semibold text-rose-800 mb-1">Forecast Unavailable</h4>
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!forecast || forecast.hasCycle) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
        <h4 className="font-semibold text-amber-900 mb-1">
          {forecast?.hasCycle ? "Circular Dependency Detected" : "Insufficient Project Data"}
        </h4>
        <p className="text-sm">
          {forecast?.error || "Insufficient project tasks or schedule data for a meaningful Monte Carlo forecast."}
        </p>
      </div>
    );
  }

  const {
    baselineFinishDate,
    p50FinishDate,
    p80FinishDate,
    p90FinishDate,
    deadline,
    deadlineProbability,
    expectedDelayDays,
    uncertainty,
    confidence,
    probabilityDistribution = [],
    dominantPath = [],
    dominantPathProbability = 0,
    pathVolatility = 0,
    inputs = {},
    assumptions = [],
    limitations = []
  } = forecast;

  const uncertaintyColors = {
    "Narrow forecast": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Moderate uncertainty": "bg-amber-100 text-amber-800 border-amber-300",
    "High uncertainty": "bg-rose-100 text-rose-800 border-rose-300"
  };

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="p-3 bg-indigo-50/70 border border-indigo-200/80 rounded-xl flex items-center justify-between text-xs text-indigo-900">
        <div className="flex items-center space-x-2">
          <span className="text-indigo-600 font-bold">ℹ️ Probabilistic Forecast:</span>
          <span>Forecasts are probabilistic estimates based on current project data and uncertainty assumptions. They are not guarantees.</span>
        </div>
        <div className="flex items-center space-x-2 ml-4">
          <span className={`px-2.5 py-0.5 rounded-full font-semibold border ${uncertaintyColors[uncertainty] || "bg-slate-100 text-slate-800"}`}>
            {uncertainty}
          </span>
        </div>
      </div>

      {/* KPI Cards: P50, P80, P90 & Deadline Probability */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* P50 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">P50 Forecast (50% Prob)</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{p50FinishDate || "N/A"}</div>
          <div className="text-xs text-slate-500 mt-1">50% of runs finish on or before this date</div>
        </div>

        {/* P80 */}
        <div className="p-4 bg-white border border-indigo-200 rounded-xl shadow-sm bg-indigo-50/20">
          <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">P80 Forecast (80% Prob)</div>
          <div className="text-xl font-bold text-indigo-950 mt-1">{p80FinishDate || "N/A"}</div>
          <div className="text-xs text-indigo-600 mt-1">High-confidence planning milestone</div>
        </div>

        {/* P90 */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">P90 Forecast (90% Prob)</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{p90FinishDate || "N/A"}</div>
          <div className="text-xs text-slate-500 mt-1">90% of simulated runs finish on or before this date</div>
        </div>

        {/* Deadline Probability */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Deadline Probability</div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className={`text-2xl font-black ${
              deadlineProbability === null ? "text-slate-400" :
              deadlineProbability >= 75 ? "text-emerald-600" :
              deadlineProbability >= 45 ? "text-amber-600" : "text-rose-600"
            }`}>
              {deadlineProbability !== null ? `${deadlineProbability}%` : "No Deadline"}
            </span>
            {deadline && <span className="text-xs text-slate-500 font-medium">due {deadline}</span>}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {expectedDelayDays > 0 ? `Expected delay: ${expectedDelayDays} days` : "Expected on schedule"}
          </div>
        </div>
      </div>

      {/* Probability Distribution Histogram */}
      {probabilityDistribution.length > 0 && (
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Completion Date Probability Distribution</h3>
              <p className="text-xs text-slate-500">Frequency of simulated project completion across {forecast.iterations?.toLocaleString()} Monte Carlo runs</p>
            </div>
            <div className="text-xs text-slate-500">
              Baseline Finish: <span className="font-semibold text-slate-700">{baselineFinishDate}</span>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            {probabilityDistribution.map((bucket, idx) => (
              <div key={idx} className="flex items-center text-xs">
                <div className="w-24 text-slate-600 font-mono text-right pr-3">{bucket.date}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      deadline && bucket.date <= deadline ? "bg-emerald-500" : "bg-indigo-500"
                    }`}
                    style={{ width: `${Math.max(2, bucket.probability)}%` }}
                  />
                </div>
                <div className="w-20 pl-3 font-semibold text-slate-700 text-right">
                  {bucket.probability}%
                </div>
              </div>
            ))}
          </div>

          {deadline && (
            <div className="flex items-center space-x-4 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                <span>On or Before Deadline ({deadline})</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                <span>Past Deadline</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Probabilistic Critical Path & Volatility */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dominant Critical Path */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Critical Path Volatility</h3>
          <p className="text-xs text-slate-500 mb-3">Path stability across duration uncertainty variations</p>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500">Dominant Path Prob</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{dominantPathProbability}%</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg">
              <div className="text-xs text-slate-500">Unique Paths</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">{forecast.uniquePathsCount || 1}</div>
            </div>
          </div>

          {dominantPath.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-1">Dominant Sequence:</div>
              <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg font-mono text-xs text-slate-800 break-words">
                {dominantPath.join(" → ")}
              </div>
            </div>
          )}
        </div>

        {/* High-Impact Tasks */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-1">High-Impact Task Forecast</h3>
          <p className="text-xs text-slate-500 mb-3">Tasks most frequently controlling completion across iterations</p>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {probCP?.highImpactTasks?.length > 0 ? (
              probCP.highImpactTasks.slice(0, 5).map((task) => (
                <div key={task.taskId} className="p-2 border border-slate-100 rounded-lg flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="truncate pr-2">
                    <div className="font-semibold text-slate-800 truncate">{task.title}</div>
                    <div className="text-slate-500 text-[10px]">{task.evidence}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-bold text-indigo-600">{task.criticalPathProbability}%</span>
                    <span className="text-slate-400 text-[10px] block">critical</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-400 py-4 text-center">No high-impact bottlenecks identified.</div>
            )}
          </div>
        </div>
      </div>

      {/* Assumptions & Methodology Footer */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 text-slate-600">
        <div className="font-semibold text-slate-800">Forecast Assumptions & Limitations:</div>
        <ul className="list-disc pl-4 space-y-1">
          {assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
          {limitations.map((l, i) => (
            <li key={`lim-${i}`} className="text-amber-800">{l}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
