# 03 — Bug Investigation & Resolution Log

## Overview
During the initial discovery and automated execution passes, several edge-case defects and API contract nuances were uncovered and systematically resolved without breaking regressions or altering the database schema.

---

### Bug TF-E2E-01: Comment API Missing PATCH Route
- **Severity:** P2 (Medium)
- **Component:** `backend/src/routes/commentRoutes.js`
- **Symptom:** Client components issuing `PATCH /api/comments/:id` received `404 Cannot PATCH /api/comments/:id`. The route only defined `router.put("/comments/:id")`.
- **Root Cause:** HTTP verb divergence between REST service specification and Express route definition.
- **Resolution:** Added `router.patch("/comments/:id", authMiddleware, update);` alongside existing `router.put`.
- **Retest Status:** **VERIFIED PASS** (`COLLAB-01B` edits comment successfully with HTTP 200).

---

### Bug TF-E2E-02: Notification Controller Auth Payload Key Mismatch
- **Severity:** P1 (High)
- **Component:** `backend/src/controllers/notificationController.js`
- **Symptom:** `getNotificationsController` threw `500 Failed to fetch notifications` because `req.user.id` was `undefined`.
- **Root Cause:** JWT generation in `authService.js` encoded `{ userId: user.id }`. While most controllers read `req.user.userId`, `notificationController.js` accessed `req.user.id`. Additionally, `authMiddleware.js` did not normalize the keys.
- **Resolution:** Updated `authMiddleware.js` to normalize decoded tokens such that both `req.user.id` and `req.user.userId` are set. Also updated `notificationController.js` to access `req.user.userId || req.user.id`.
- **Retest Status:** **VERIFIED PASS** (`COLLAB-02` returns notifications list with HTTP 200).

---

### Bug TF-E2E-03: Comment Service Duplicate Return Unreachable Block
- **Severity:** P2 (Medium)
- **Component:** `backend/src/services/commentService.js`
- **Symptom:** `commentController.js` threw `TypeError: Cannot read properties of undefined (reading 'id')` when reading `result.comment.id`.
- **Root Cause:** In `createComment`, an early `return comment;` line preceded `return { comment, workspaceId: task.projects.workspace_id };`, returning just the comment object instead of the expected wrapped object.
- **Resolution:** Removed the redundant early return.
- **Retest Status:** **VERIFIED PASS** (`COLLAB-01A` returns `{ message, comment }` with HTTP 201).

---

### Bug TF-E2E-04: Subtask Status Constraint Mismatch
- **Severity:** P2 (Medium)
- **Component:** Test payload vs PostgreSQL check constraint `chk_subtask_status`
- **Symptom:** Updating subtask status to `"Completed"` threw database error `new row for relation "subtasks" violates check constraint "chk_subtask_status"`.
- **Root Cause:** In the database, tasks use `'Completed'`, but subtasks are defined with check constraint `CHECK (status = ANY (ARRAY['To Do', 'In Progress', 'Done']))`.
- **Resolution:** Updated client/test payloads to transition subtasks to `'Done'`.
- **Retest Status:** **VERIFIED PASS** (`TASK-08B` updates subtask status to `Done` with HTTP 200).

---

### Bug TF-E2E-05: Project Priority Constraint Check
- **Severity:** P2 (Medium)
- **Component:** Test payload vs PostgreSQL check constraint `chk_project_priority`
- **Symptom:** Attempting to set project priority to `"Critical"` violated `chk_project_priority` check constraint `CHECK (priority = ANY (ARRAY['Low', 'Medium', 'High']))`.
- **Root Cause:** While UI options listed "Critical", the underlying PostgreSQL constraint only accepts `'Low'`, `'Medium'`, or `'High'`.
- **Resolution:** Enforced valid priorities `'Low'`, `'Medium'`, `'High'` across project modifications.
- **Retest Status:** **VERIFIED PASS** (`PROJECT-02` updates project to `Medium` with HTTP 200).
