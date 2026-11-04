import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });
import prisma from "../config/prisma.js";
import { archiveTask, restoreTask, duplicateTask, getProjectTasks } from "../services/taskService.js";
import { archiveProject, restoreProject, getWorkspaceProjects } from "../services/projectService.js";

async function run() {
    console.log("=== Testing Archive, Restore & Duplication ===");

    // Find test user and workspace
    const user = await prisma.users.findFirst();
    if (!user) {
        throw new Error("No user found in database");
    }

    const member = await prisma.workspace_members.findFirst({
        where: { user_id: user.id }
    });
    const workspaceId = member.workspace_id;

    // Create a temporary project for testing
    const testProject = await prisma.projects.create({
        data: {
            workspace_id: workspaceId,
            title: "Archive Restore Test Project",
            manager_id: user.id,
            status: "Planning",
            is_archived: false
        }
    });
    console.log("Created test project:", testProject.id);

    // Create a task with a subtask
    const testTask = await prisma.tasks.create({
        data: {
            project_id: testProject.id,
            title: "Original Test Task",
            description: "Original description",
            priority: "High",
            status: "In Progress",
            estimated_hours: 8,
            created_by: user.id,
            is_archived: false,
            subtasks: {
                create: [
                    { title: "Subtask 1", status: "To Do" },
                    { title: "Subtask 2", status: "Done" }
                ]
            }
        },
        include: { subtasks: true }
    });
    console.log("Created test task:", testTask.id, "with", testTask.subtasks.length, "subtasks");

    // 1. Test Task Duplication
    const dup = await duplicateTask(testTask.id, user.id);
    console.log("Duplicated task:", dup.id, "Title:", dup.title);
    if (dup.title !== "Original Test Task (Copy)") throw new Error("Duplicated title mismatch");
    if (dup.subtasks.length !== 2) throw new Error("Duplicated subtasks mismatch");
    if (dup.status !== "Backlog") throw new Error("Duplicated task should be Backlog");
    console.log("✓ Task duplication verified");

    // 2. Test Task Archiving
    await archiveTask(testTask.id, user.id);
    let activeTasks = await getProjectTasks(testProject.id, user.id, { archived: false });
    let archivedTasks = await getProjectTasks(testProject.id, user.id, { archived: true });
    if (activeTasks.tasks.some(t => t.id === testTask.id)) throw new Error("Archived task should not be in active tasks");
    if (!archivedTasks.tasks.some(t => t.id === testTask.id)) throw new Error("Archived task should be in archived tasks");
    console.log("✓ Task archiving and filtering verified");

    // 3. Test Task Restoring
    await restoreTask(testTask.id, user.id);
    activeTasks = await getProjectTasks(testProject.id, user.id, { archived: false });
    archivedTasks = await getProjectTasks(testProject.id, user.id, { archived: true });
    if (!activeTasks.tasks.some(t => t.id === testTask.id)) throw new Error("Restored task should be in active tasks");
    if (archivedTasks.tasks.some(t => t.id === testTask.id)) throw new Error("Restored task should not be in archived tasks");
    console.log("✓ Task restoring and filtering verified");

    // 4. Test Project Archiving
    await archiveProject(testProject.id, user.id);
    let activeProjects = await getWorkspaceProjects(workspaceId, user.id, { archived: false });
    let archivedProjects = await getWorkspaceProjects(workspaceId, user.id, { archived: true });
    if (activeProjects.some(p => p.id === testProject.id)) throw new Error("Archived project should not be in active projects");
    if (!archivedProjects.some(p => p.id === testProject.id)) throw new Error("Archived project should be in archived projects");
    console.log("✓ Project archiving and filtering verified");

    // 5. Test Restoring task when project is archived (should fail)
    await archiveTask(testTask.id, user.id);
    try {
        await restoreTask(testTask.id, user.id);
        throw new Error("Restoring task under archived project should have thrown");
    } catch (err) {
        if (!err.message.includes("Cannot restore task while its parent project is archived")) {
            throw err;
        }
        console.log("✓ Parent project archived restriction verified");
    }

    // 6. Test Project Restoring
    await restoreProject(testProject.id, user.id);
    activeProjects = await getWorkspaceProjects(workspaceId, user.id, { archived: false });
    archivedProjects = await getWorkspaceProjects(workspaceId, user.id, { archived: true });
    if (!activeProjects.some(p => p.id === testProject.id)) throw new Error("Restored project should be in active projects");
    if (archivedProjects.some(p => p.id === testProject.id)) throw new Error("Restored project should not be in archived projects");
    console.log("✓ Project restoring and filtering verified");

    // Now restore task succeeds
    await restoreTask(testTask.id, user.id);
    console.log("✓ Task restored after project restored");

    // Clean up test data
    await prisma.subtasks.deleteMany({ where: { task_id: { in: [testTask.id, dup.id] } } });
    await prisma.tasks.deleteMany({ where: { project_id: testProject.id } });
    await prisma.projects.delete({ where: { id: testProject.id } });
    console.log("✓ Cleanup successful");
    console.log("=== ALL ARCHIVE, RESTORE & DUPLICATION TESTS PASSED ===");
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Test failed:", err);
        process.exit(1);
    });
