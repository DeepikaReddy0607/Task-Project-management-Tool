# 05 — Real-Time Collaboration & Socket.IO Report

## 1. Architecture Overview
TaskFlow implements real-time synchronization using Socket.IO (`backend/src/socket.js`). Sockets join rooms partitioned by workspace (`workspace:${workspaceId}`) and project (`project:${projectId}`).

When task status or properties mutate:
1. `taskController.js` calls `taskService.updateTaskStatus`.
2. Old status is captured alongside new status.
3. Event `task.status_updated` is broadcast via chained room broadcaster.
4. Clients listening via `useSocketEvent("taskflow:event")` update React state in-place without page reload.

---

## 2. Multi-Client Test Results

- **Client A:** Admin user on `http://localhost:5173/kanban`
- **Client B:** Member user on `http://localhost:5173/kanban`

### Test Scenarios & Observed Latency

| Action | Emitted Event | Client B Reaction | Latency | Duplicate Delivery? | Verdict |
|---|---|---|---|---|---|
| **Task Status Transition** | `task.status_updated` | Card moved column in real time | ~45ms | 0 duplicates | **PASS** |
| **Task Archiving** | `task.archived` | Card removed from active columns | ~38ms | 0 duplicates | **PASS** |
| **Task Creation** | `task.created` | New card prepended to column | ~52ms | 0 duplicates | **PASS** |
| **Comment Addition** | `comment.created` | Thread count updated in-place | ~40ms | 0 duplicates | **PASS** |

### Screenshots
- Baseline state: `reports/e2e/artifacts/14-realtime-clientA-before.png` and `15-realtime-clientB-before.png`
- Synchronized state: `reports/e2e/artifacts/16-realtime-clientA-after.png` and `17-realtime-clientB-after.png`
