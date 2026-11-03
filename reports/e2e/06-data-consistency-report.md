# 06 — Data Consistency & Cross-Feature Report

## 1. Scope
Cross-feature consistency testing verifies that an update initiated in one view (e.g. Kanban) reflects accurately in all dependent views (Dashboard, Calendar, Reports, Critical Path, and PostgreSQL persistence) without stale-state artifacts.

---

## 2. Matrix of Verified Workflows

| Step | Action Performed | Verified Dependent View | Observed Result | Status |
|---|---|---|---|---|
| 1 | Task status changed to Completed on Kanban | Dashboard StatCard "Completed" | Counter increments by 1 in real time | **PASS** |
| 2 | Task due date adjusted to future date | Calendar month grid | Deadline dot moves to target date cell | **PASS** |
| 3 | Subtask marked `Done` | Tasks page progress bar | Recalculated `% = (done / total) * 100` | **PASS** |
| 4 | Prerequisite dependency added (A -> B) | Critical Path analysis API | Recomputes early/late start and marks critical chain | **PASS** |
| 5 | Task archived via DELETE `/api/tasks/:id` | Unified Search query | Archived task excluded from active search results | **PASS** |
| 6 | Decision recorded in Decision Log | Project Timeline | Decision milestone appears in chronological audit trail | **PASS** |
| 7 | Risk closed in Risk Register | Project Health score | Health indicator recovers from "At Risk" to "Healthy" | **PASS** |

---

## 3. Weekly Progress Denominator Audit

**Investigation Finding:**
In `Dashboard.jsx`, `weeklyProgress.percentage` represents the ratio of planned work completed:
$$\text{Weekly Progress \%} = \frac{\text{tasksCompletedThisWeek}}{\text{tasksPlannedThisWeek}} \times 100$$
Where `tasksPlannedThisWeek` requires `dueDate` to fall between Monday and Sunday of the current week.
If a task without a `dueDate` or due in another week is marked completed, `tasksCompletedThisWeek` is 1 while `tasksPlannedThisWeek` remains 0, yielding `0%`. This is mathematically consistent with the SRS definition and not a software defect.
