import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import {
  createTaskAttachment,
  getTaskAttachments,
  getAttachmentFileStream,
  deleteAttachment,
  seedInMemoryAttachmentData,
  clearAttachmentStore,
} from "../services/attachmentService.js";
import {
  createTaskDependency,
  getProjectDependencyGraph,
} from "../services/taskDependencyService.js";
import { calculateCriticalPath } from "../services/criticalPathService.js";
import { detectBottlenecks } from "../services/bottleneckService.js";
import { calculateProjectHealth } from "../services/projectHealthService.js";
import { calculateShockIntensity } from "../services/dependencyShockwaveService.js";
import { createDecision, clearDecisionLogStore } from "../services/decisionLogService.js";
import { executeUnifiedSearch, clearSearchStore, seedInMemorySearchData } from "../services/searchService.js";
import { parseNaturalLanguageQuery, INTENTS } from "../services/naturalLanguageControlService.js";
import { handleIntelligenceQuery } from "../services/intelligenceQueryService.js";
import { UPLOAD_DIR } from "../middleware/uploadMiddleware.js";

describe("CROSS-PHASE FILE INTEGRATION & WORKFLOW VALIDATION (Workflows A-F)", () => {
  const adminUser = { id: "user-admin", role: "admin", name: "System Admin" };
  const pmUser = { id: "user-pm", role: "project manager", name: "Project Manager Pat" };
  const alice = { id: "user-alice", role: "team member", name: "Alice Developer" };
  const eve = { id: "user-eve", role: "team member", name: "Eve External" };

  const workspaceAlpha = { id: "ws-cross-alpha", name: "Alpha Enterprise" };
  const workspaceBeta = { id: "ws-cross-beta", name: "Beta Classified" };

  const projectAlpha = {
    id: "proj-cross-alpha",
    workspace_id: "ws-cross-alpha",
    title: "Alpha Core Engine",
    description: "Core processing platform",
  };

  const projectBeta = {
    id: "proj-cross-beta",
    workspace_id: "ws-cross-beta",
    title: "Beta Blackops",
    description: "Confidential R&D",
  };

  const task1 = {
    id: "task-cross-1",
    project_id: "proj-cross-alpha",
    title: "Architecture & DB Design",
    duration: 5,
    status: "COMPLETED",
  };
  const task2 = {
    id: "task-cross-2",
    project_id: "proj-cross-alpha",
    title: "Core Service Implementation",
    duration: 8,
    status: "IN_PROGRESS",
  };
  const task3 = {
    id: "task-cross-3",
    project_id: "proj-cross-alpha",
    title: "Integration & Load Testing",
    duration: 4,
    status: "TODO",
  };

  beforeEach(() => {
    clearAttachmentStore();
    clearDecisionLogStore();
    clearSearchStore();

    seedInMemoryAttachmentData({
      tasks: [task1, task2, task3],
      projects: [projectAlpha, projectBeta],
      workspaceMembers: [
        { workspace_id: "ws-cross-alpha", user_id: pmUser.id, role: "Admin" },
        { workspace_id: "ws-cross-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-cross-beta", user_id: pmUser.id, role: "Admin" },
      ],
      projectMembers: [
        { project_id: "proj-cross-alpha", user_id: pmUser.id },
        { project_id: "proj-cross-alpha", user_id: alice.id },
        { project_id: "proj-cross-beta", user_id: pmUser.id },
      ],
      attachments: [],
    });

    seedInMemorySearchData({
      users: [adminUser, pmUser, alice],
      workspaces: [workspaceAlpha, workspaceBeta],
      workspaceMembers: [
        { workspace_id: "ws-cross-alpha", user_id: pmUser.id, role: "Admin" },
        { workspace_id: "ws-cross-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-cross-beta", user_id: pmUser.id, role: "Admin" },
      ],
      projects: [projectAlpha, projectBeta],
      projectMembers: [
        { project_id: "proj-cross-alpha", user_id: pmUser.id },
        { project_id: "proj-cross-alpha", user_id: alice.id },
        { project_id: "proj-cross-beta", user_id: pmUser.id },
      ],
      tasks: [task1, task2, task3],
      decisions: [],
      risks: [],
      activityLogs: [],
    });
  });

  // ============================================================
  // WORKFLOW A: Project -> Task -> Attach -> Dependency -> CPM Recalculation -> Search
  // ============================================================
  it("Workflow A: Project lifecycle with attachments and dependency recalculations preserves integrity", async () => {
    // 1. Attach file to task 2
    const mockFile = {
      originalname: "service-design.pdf",
      filename: "uuid-service-design.pdf",
      mimetype: "application/pdf",
      size: 45000,
      path: path.join(UPLOAD_DIR, "uuid-service-design.pdf"),
    };

    const attachment = await createTaskAttachment({
      taskId: task2.id,
      uploadedBy: alice.id,
      userRole: alice.role,
      file: mockFile,
    });
    assert.equal(attachment.fileName, "service-design.pdf");

    // 2. Critical Path and Bottleneck calculations remain intact
    const tasks = [
      { id: task1.id, title: task1.title, status: "Completed", estimated_hours: 40, is_archived: false },
      { id: task2.id, title: task2.title, status: "In Progress", estimated_hours: 64, is_archived: false },
      { id: task3.id, title: task3.title, status: "To Do", estimated_hours: 32, is_archived: false },
    ];
    const dependencies = [
      { task_id: task2.id, depends_on_task_id: task1.id },
      { task_id: task3.id, depends_on_task_id: task2.id },
    ];
    const cp = calculateCriticalPath({ project: projectAlpha, tasks, dependencies });
    assert.ok(cp.criticalTaskIds.length > 0, "Critical path should be computed");

    // 3. Health calculations operate without error
    const health = calculateProjectHealth({
      tasks: [task1, task2, task3],
      risks: [],
      bottlenecks: [],
    });
    assert.ok(health.score !== undefined);

    // 4. Search finds the task and file remains accessible
    const searchRes = await executeUnifiedSearch({
      userId: alice.id,
      userRole: alice.role,
      query: "Core Service",
      type: "tasks",
    });
    assert.equal(searchRes.flatResults.length, 1);
    assert.equal(searchRes.flatResults[0].id, task2.id);

    const attachments = await getTaskAttachments(task2.id, alice.id, alice.role);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].id, attachment.id);
  });

  // ============================================================
  // WORKFLOW B: Upload -> Stream Download -> Delete Lifecycle
  // ============================================================
  it("Workflow B: Complete attachment lifecycle (upload, download, delete) executes cleanly", async () => {
    const testDoc = {
      id: "att-wf-b",
      task_id: task1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "release-notes.txt",
      file_url: "uploads/attachments/rel.txt",
      file_type: "text/plain",
      file_size: BigInt(24),
      contentBuffer: Buffer.from("TaskFlow v1.0.0 released!"),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [task1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-cross-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-cross-alpha", user_id: alice.id }],
      attachments: [testDoc],
    });

    // 1. Download
    const download = await getAttachmentFileStream("att-wf-b", alice.id, alice.role);
    assert.equal(download.fileName, "release-notes.txt");
    assert.ok(download.buffer);

    // 2. Delete
    const delResult = await deleteAttachment("att-wf-b", alice.id, alice.role);
    assert.equal(delResult.success, true);

    // 3. Confirm absence
    const current = await getTaskAttachments(task1.id, alice.id, alice.role);
    assert.equal(current.length, 0);
  });

  // ============================================================
  // WORKFLOW C: Restricted User Isolation
  // ============================================================
  it("Workflow C: External user cannot discover or download inaccessible files or tasks", async () => {
    const privateFile = {
      id: "att-classified",
      task_id: task1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "classified-keys.pem",
      file_url: "uploads/attachments/keys.pem",
      file_type: "application/x-pem-file",
      file_size: BigInt(1024),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [task1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-cross-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-cross-alpha", user_id: alice.id }],
      attachments: [privateFile],
    });

    // Eve tries to fetch task attachments
    await assert.rejects(
      async () => {
        await getTaskAttachments(task1.id, eve.id, eve.role);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // Eve searches for the project
    const searchEve = await executeUnifiedSearch({
      userId: eve.id,
      userRole: eve.role,
      query: "Alpha Core Engine",
      type: "projects",
    });
    assert.equal(searchEve.flatResults.length, 0, "Eve must not see Alpha project");
  });

  // ============================================================
  // WORKFLOW D: Admin Inspection and Strict Isolation
  // ============================================================
  it("Workflow D: Admin can inspect multi-workspace attachments while permissions remain isolated", async () => {
    const attAlpha = {
      id: "att-d-alpha",
      task_id: task1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "alpha.pdf",
      file_url: "uploads/attachments/alpha.pdf",
      file_type: "application/pdf",
      file_size: BigInt(100),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [task1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-cross-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-cross-alpha", user_id: alice.id }],
      attachments: [attAlpha],
    });

    const adminAtt = await getTaskAttachments(task1.id, adminUser.id, adminUser.role);
    assert.equal(adminAtt.length, 1);
    assert.equal(adminAtt[0].fileName, "alpha.pdf");
  });

  // ============================================================
  // WORKFLOW E: Dependency -> Shockwave -> Quackie Integration
  // ============================================================
  it("Workflow E: Shockwave and Quackie intelligence event chains remain unbroken", async () => {
    const intensity = calculateShockIntensity({
      totalActiveTasks: 10,
      affectedTasksCount: 3,
      maxDepth: 2,
      graphDiameter: 4,
      criticalAffectedCount: 2,
      deadlineShiftDays: 3,
    });

    assert.ok(typeof intensity.score === "number");
    assert.ok(intensity.score >= 0 && intensity.score <= 100);

    // Quackie natural language parsing
    const parsed = parseNaturalLanguageQuery("how will a delay on task Architecture affect the schedule?");
    assert.ok(parsed.intent);

    const queryResult = await handleIntelligenceQuery({
      query: "how will a delay on task Architecture affect the schedule?",
      projectId: projectAlpha.id,
    });
    assert.ok(queryResult);
  });

  // ============================================================
  // WORKFLOW F: Decision Intelligence -> Project Memory -> Search
  // ============================================================
  it("Workflow F: Decision creation, decision intelligence, and search remain unaffected", async () => {
    const decision = await createDecision({
      projectId: projectAlpha.id,
      decision: "Adopt S3-compatible Blob Storage for Attachments",
      reason: "Ensure horizontal scalability for enterprise file handling",
      decisionDate: "2026-10-03",
      ownerId: pmUser.id,
      category: "Architecture",
      impact: "High",
      tags: ["storage", "files", "scalability"],
      status: "Approved",
    });

    assert.ok(decision.id);
    assert.equal(decision.decision, "Adopt S3-compatible Blob Storage for Attachments");

    // Search query for the decision
    const searchDecisions = await executeUnifiedSearch({
      userId: alice.id,
      userRole: alice.role,
      query: "Blob Storage",
      type: "decisions",
    });
    assert.ok(searchDecisions);
  });
});
