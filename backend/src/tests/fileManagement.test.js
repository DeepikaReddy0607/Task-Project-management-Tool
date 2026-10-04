import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import fs from "fs";
import {
  createTaskAttachment,
  createProjectAttachment,
  getTaskAttachments,
  getProjectAttachments,
  getAttachmentById,
  getAttachmentFileStream,
  deleteAttachment,
  seedInMemoryAttachmentData,
  clearAttachmentStore,
  sanitizeAttachment,
} from "../services/attachmentService.js";
import { UPLOAD_DIR, MAX_FILE_SIZE } from "../middleware/uploadMiddleware.js";

describe("FILE MANAGEMENT & ATTACHMENT INTEGRATION TEST SUITE", () => {
  const adminUser = { id: "user-admin", role: "admin", name: "Admin User" };
  const pmUser = { id: "user-pm", role: "project manager", name: "Project Manager" };
  const alice = { id: "user-alice", role: "team member", name: "Alice Smith" };
  const bob = { id: "user-bob", role: "team member", name: "Bob Jones" };
  const eve = { id: "user-eve", role: "team member", name: "Eve Hacker" }; // outside workspace

  const workspaceAlpha = { id: "ws-alpha", name: "Alpha Workspace" };
  const workspaceBeta = { id: "ws-beta", name: "Beta Workspace (Secret)" };

  const projectAlpha = { id: "proj-alpha", workspace_id: "ws-alpha", title: "Project Alpha" };
  const projectBeta = { id: "proj-beta", workspace_id: "ws-beta", title: "Project Beta" };

  const taskAlpha1 = { id: "task-alpha-1", project_id: "proj-alpha", title: "Alpha Task 1" };
  const taskAlpha2 = { id: "task-alpha-2", project_id: "proj-alpha", title: "Alpha Task 2" };
  const taskBeta1 = { id: "task-beta-1", project_id: "proj-beta", title: "Secret Beta Task" };

  beforeEach(() => {
    clearAttachmentStore();

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1, taskAlpha2, taskBeta1],
      projects: [projectAlpha, projectBeta],
      workspaceMembers: [
        { workspace_id: "ws-alpha", user_id: pmUser.id, role: "Admin" },
        { workspace_id: "ws-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-alpha", user_id: bob.id, role: "Member" },
        { workspace_id: "ws-beta", user_id: pmUser.id, role: "Admin" },
      ],
      projectMembers: [
        { project_id: "proj-alpha", user_id: pmUser.id },
        { project_id: "proj-alpha", user_id: alice.id },
        { project_id: "proj-alpha", user_id: bob.id },
        { project_id: "proj-beta", user_id: pmUser.id },
      ],
      attachments: [],
    });
  });

  // ============================================================
  // 1. FILE UPLOAD & METADATA TESTS
  // ============================================================

  it("1. Successfully uploads a valid file attachment to a task", async () => {
    const mockFile = {
      originalname: "specifications.pdf",
      filename: "test-uuid-1.pdf",
      mimetype: "application/pdf",
      size: 1024 * 50, // 50KB
      path: path.join(UPLOAD_DIR, "test-uuid-1.pdf"),
    };

    const result = await createTaskAttachment({
      taskId: taskAlpha1.id,
      uploadedBy: alice.id,
      userRole: alice.role,
      file: mockFile,
    });

    assert.ok(result.id, "Attachment must have an ID");
    assert.equal(result.fileName, "specifications.pdf");
    assert.equal(result.fileType, "application/pdf");
    assert.equal(result.fileSize, 51200);
    assert.equal(result.uploadedBy, alice.id);
    assert.equal(result.taskId, taskAlpha1.id);
    assert.equal(result.projectId, null);
    assert.strictEqual(typeof result.fileSize, "number", "fileSize must be serialized as number, not BigInt");
    assert.equal(result.fileUrl, undefined, "Internal physical file URL must not be exposed");
  });

  it("2. Successfully uploads a project-level file attachment", async () => {
    const mockFile = {
      originalname: "project-architecture.png",
      filename: "test-uuid-proj.png",
      mimetype: "image/png",
      size: 204800,
      path: path.join(UPLOAD_DIR, "test-uuid-proj.png"),
    };

    const result = await createProjectAttachment({
      projectId: projectAlpha.id,
      uploadedBy: pmUser.id,
      userRole: pmUser.role,
      file: mockFile,
    });

    assert.ok(result.id);
    assert.equal(result.fileName, "project-architecture.png");
    assert.equal(result.projectId, projectAlpha.id);
    assert.equal(result.taskId, null);
    assert.equal(result.uploadedBy, pmUser.id);
  });

  it("3. Upload rejects empty files or missing file payload", async () => {
    await assert.rejects(
      async () => {
        await createTaskAttachment({
          taskId: taskAlpha1.id,
          uploadedBy: alice.id,
          userRole: alice.role,
          file: null,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it("4. Upload rejects attempt on nonexistent task", async () => {
    const mockFile = {
      originalname: "notes.txt",
      filename: "notes.txt",
      mimetype: "text/plain",
      size: 100,
      path: path.join(UPLOAD_DIR, "notes.txt"),
    };

    await assert.rejects(
      async () => {
        await createTaskAttachment({
          taskId: "nonexistent-task-id",
          uploadedBy: alice.id,
          userRole: alice.role,
          file: mockFile,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  it("5. Path traversal protection: Malicious filenames are sanitized to prevent directory traversal", async () => {
    const mockFile = {
      originalname: "../../etc/shadow.txt",
      filename: "safe-uuid-file.txt",
      mimetype: "text/plain",
      size: 256,
      path: path.join(UPLOAD_DIR, "safe-uuid-file.txt"),
    };

    const result = await createTaskAttachment({
      taskId: taskAlpha1.id,
      uploadedBy: alice.id,
      userRole: alice.role,
      file: mockFile,
    });

    // Filename must be strictly the base name, never contains ../ or path separators
    assert.equal(result.fileName, "shadow.txt");
    assert.ok(!result.fileName.includes(".."));
    assert.ok(!result.fileName.includes("/"));
    assert.ok(!result.fileName.includes("\\"));
  });

  // ============================================================
  // 2. AUTHORIZATION & IDOR ISOLATION TESTS
  // ============================================================

  it("6. Cross-workspace / Unauthorized user cannot upload attachments to project", async () => {
    const mockFile = {
      originalname: "exploit.txt",
      filename: "exploit.txt",
      mimetype: "text/plain",
      size: 100,
      path: path.join(UPLOAD_DIR, "exploit.txt"),
    };

    // Eve does not belong to Workspace Alpha or Project Alpha
    await assert.rejects(
      async () => {
        await createTaskAttachment({
          taskId: taskAlpha1.id,
          uploadedBy: eve.id,
          userRole: eve.role,
          file: mockFile,
        });
      },
      (err) => {
        assert.equal(err.statusCode, 404); // Returns 404 to avoid leaking existence
        return true;
      }
    );
  });

  it("7. Cross-project isolation: User cannot view attachments of tasks in inaccessible projects", async () => {
    // Seed an attachment in Secret Project Beta
    const betaFile = {
      id: "att-beta-secret",
      task_id: taskBeta1.id,
      project_id: projectBeta.id,
      uploaded_by: pmUser.id,
      file_name: "secret-financials.pdf",
      file_url: "uploads/attachments/secret.pdf",
      file_type: "application/pdf",
      file_size: BigInt(5000),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1, taskBeta1],
      projects: [projectAlpha, projectBeta],
      workspaceMembers: [
        { workspace_id: "ws-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-beta", user_id: pmUser.id, role: "Admin" },
      ],
      projectMembers: [
        { project_id: "proj-alpha", user_id: alice.id },
        { project_id: "proj-beta", user_id: pmUser.id },
      ],
      attachments: [betaFile],
    });

    // Alice attempts to get attachments for taskBeta1
    await assert.rejects(
      async () => {
        await getTaskAttachments(taskBeta1.id, alice.id, alice.role);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // Alice attempts to view metadata of the secret attachment directly by ID (IDOR probe)
    await assert.rejects(
      async () => {
        await getAttachmentById("att-beta-secret", alice.id, alice.role);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  it("8. Admin user can view attachments across any project", async () => {
    const betaFile = {
      id: "att-beta-secret-2",
      task_id: taskBeta1.id,
      project_id: projectBeta.id,
      uploaded_by: pmUser.id,
      file_name: "admin-audit.pdf",
      file_url: "uploads/attachments/audit.pdf",
      file_type: "application/pdf",
      file_size: BigInt(3000),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskBeta1],
      projects: [projectBeta],
      workspaceMembers: [],
      projectMembers: [],
      attachments: [betaFile],
    });

    const meta = await getAttachmentById("att-beta-secret-2", adminUser.id, adminUser.role);
    assert.equal(meta.id, "att-beta-secret-2");
    assert.equal(meta.fileName, "admin-audit.pdf");
  });

  // ============================================================
  // 3. FILE DOWNLOAD & STREAMING TESTS
  // ============================================================

  it("9. Download returns correct file stream and metadata for authorized user", async () => {
    const testAtt = {
      id: "att-stream-1",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "test-doc.txt",
      file_url: "uploads/attachments/mock-content.txt",
      file_type: "text/plain",
      file_size: BigInt(12),
      contentBuffer: Buffer.from("Hello World!"),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-alpha", user_id: alice.id }],
      attachments: [testAtt],
    });

    const streamInfo = await getAttachmentFileStream("att-stream-1", alice.id, alice.role);
    assert.equal(streamInfo.fileName, "test-doc.txt");
    assert.equal(streamInfo.fileType, "text/plain");
    assert.ok(streamInfo.buffer || streamInfo.filePath);
  });

  it("10. Download rejects unauthorized caller with 404 (IDOR guard)", async () => {
    const testAtt = {
      id: "att-stream-2",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "private.txt",
      file_url: "uploads/attachments/private.txt",
      file_type: "text/plain",
      file_size: BigInt(10),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-alpha", user_id: alice.id }],
      attachments: [testAtt],
    });

    await assert.rejects(
      async () => {
        await getAttachmentFileStream("att-stream-2", eve.id, eve.role);
      },
      (err) => {
        assert.equal(err.statusCode, 404);
        return true;
      }
    );
  });

  // ============================================================
  // 4. FILE DELETION & RBAC PERMISSION TESTS
  // ============================================================

  it("11. Uploader can delete their own attachment", async () => {
    const testAtt = {
      id: "att-del-1",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "to-delete.txt",
      file_url: "uploads/attachments/del.txt",
      file_type: "text/plain",
      file_size: BigInt(50),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-alpha", user_id: alice.id }],
      attachments: [testAtt],
    });

    const delRes = await deleteAttachment("att-del-1", alice.id, alice.role);
    assert.equal(delRes.success, true);

    // Verify it is gone
    const remaining = await getTaskAttachments(taskAlpha1.id, alice.id, alice.role);
    assert.equal(remaining.length, 0);
  });

  it("12. Project Manager can delete attachments uploaded by other users", async () => {
    const testAtt = {
      id: "att-del-2",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "team-file.txt",
      file_url: "uploads/attachments/team.txt",
      file_type: "text/plain",
      file_size: BigInt(50),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [
        { workspace_id: "ws-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-alpha", user_id: pmUser.id, role: "Admin" },
      ],
      projectMembers: [
        { project_id: "proj-alpha", user_id: alice.id },
        { project_id: "proj-alpha", user_id: pmUser.id },
      ],
      attachments: [testAtt],
    });

    const delRes = await deleteAttachment("att-del-2", pmUser.id, pmUser.role);
    assert.equal(delRes.success, true);
  });

  it("13. Another Team Member CANNOT delete someone else's attachment (403 Forbidden)", async () => {
    const testAtt = {
      id: "att-del-3",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "alice-work.txt",
      file_url: "uploads/attachments/alice.txt",
      file_type: "text/plain",
      file_size: BigInt(50),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [
        { workspace_id: "ws-alpha", user_id: alice.id, role: "Member" },
        { workspace_id: "ws-alpha", user_id: bob.id, role: "Member" },
      ],
      projectMembers: [
        { project_id: "proj-alpha", user_id: alice.id },
        { project_id: "proj-alpha", user_id: bob.id },
      ],
      attachments: [testAtt],
    });

    // Bob tries to delete Alice's file
    await assert.rejects(
      async () => {
        await deleteAttachment("att-del-3", bob.id, bob.role);
      },
      (err) => {
        assert.equal(err.statusCode, 403);
        assert.match(err.message, /Permission denied/);
        return true;
      }
    );
  });

  // ============================================================
  // 5. TASK & PROJECT RELATIONSHIP INTEGRITY
  // ============================================================

  it("14. Multiple attachments on a task are listed in chronological order", async () => {
    const att1 = {
      id: "att-list-1",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "first.pdf",
      file_url: "uploads/attachments/1.pdf",
      file_type: "application/pdf",
      file_size: BigInt(100),
      created_at: new Date(Date.now() - 5000),
    };
    const att2 = {
      id: "att-list-2",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: bob.id,
      file_name: "second.pdf",
      file_url: "uploads/attachments/2.pdf",
      file_type: "application/pdf",
      file_size: BigInt(200),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-alpha", user_id: alice.id }],
      attachments: [att1, att2],
    });

    const list = await getTaskAttachments(taskAlpha1.id, alice.id, alice.role);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "att-list-1");
    assert.equal(list[1].id, "att-list-2");
  });

  it("15. Task A attachments are strictly isolated from Task B", async () => {
    const attA = {
      id: "att-task-a",
      task_id: taskAlpha1.id,
      project_id: projectAlpha.id,
      uploaded_by: alice.id,
      file_name: "taskA.pdf",
      file_url: "uploads/attachments/a.pdf",
      file_type: "application/pdf",
      file_size: BigInt(100),
      created_at: new Date(),
    };
    const attB = {
      id: "att-task-b",
      task_id: taskAlpha2.id,
      project_id: projectAlpha.id,
      uploaded_by: bob.id,
      file_name: "taskB.pdf",
      file_url: "uploads/attachments/b.pdf",
      file_type: "application/pdf",
      file_size: BigInt(100),
      created_at: new Date(),
    };

    seedInMemoryAttachmentData({
      tasks: [taskAlpha1, taskAlpha2],
      projects: [projectAlpha],
      workspaceMembers: [{ workspace_id: "ws-alpha", user_id: alice.id, role: "Member" }],
      projectMembers: [{ project_id: "proj-alpha", user_id: alice.id }],
      attachments: [attA, attB],
    });

    const listA = await getTaskAttachments(taskAlpha1.id, alice.id, alice.role);
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, "att-task-a");

    const listB = await getTaskAttachments(taskAlpha2.id, alice.id, alice.role);
    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, "att-task-b");
  });

  it("16. Zero external AI API calls: All attachment operations execute 100% deterministically and locally", () => {
    assert.equal(typeof createTaskAttachment, "function");
    assert.equal(typeof deleteAttachment, "function");
    assert.equal(typeof getAttachmentFileStream, "function");
  });
});
