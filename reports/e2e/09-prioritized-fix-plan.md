# 09 — Prioritized Fix & Optimization Plan

## Summary
All critical (P0) and high (P1) defects discovered during this E2E cycle were corrected and verified. The following recommendations are prioritized for future releases:

---

### Priority 1 (Short-Term Optimizations — Non-Blocking)
1. **Frontend Chunk Size Optimization:**
   - As noted in Vite build warnings, vendor chunks exceed 500 kB (primarily Chart.js and Dayjs).
   - **Recommendation:** Implement `build.rollupOptions.output.manualChunks` in `vite.config.js` to code-split Chart.js and heavy visual assets.

2. **Project Priority UI/Constraint Harmonization:**
   - In PostgreSQL, `chk_project_priority` enforces `ARRAY['Low', 'Medium', 'High']`, while some frontend select options historically showed "Critical".
   - **Recommendation:** Align project select dropdowns strictly with `['Low', 'Medium', 'High']` to prevent user submission errors.

### Priority 2 (Medium-Term Enhancements)
1. **Automated E2E CI Pipeline:**
   - Integrate Playwright Chrome headless execution directly into pre-push or CI pull request checks.
2. **Weekly Progress Helper Tooltip:**
   - Add an informational tooltip next to the Weekly Progress percentage on the Dashboard clarifying that the denominator includes only tasks with due dates in the current calendar week.
