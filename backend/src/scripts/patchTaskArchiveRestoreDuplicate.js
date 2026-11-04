import fs from "node:fs";

console.log("Patching Task Service, Controller & Routes for Restore and Duplicate...");

// Helper to normalize to LF for replacement, then write
function patchFile(filePath, transforms) {
    let content = fs.readFileSync(filePath, "utf8");
    const isCrlf = content.includes("\r\n");
    // Normalize to \n for consistent regex / string operations
    let normalized = content.replace(/\r\n/g, "\n");

    for (const { name, pattern, replacement } of transforms) {
        if (typeof pattern === "string") {
            if (!normalized.includes(pattern)) {
                console.error(`[WARN] Pattern not found in ${filePath}: ${name}`);
            } else {
                normalized = normalized.replace(pattern, replacement);
                console.log(`[OK] Applied ${name} to ${filePath}`);
            }
        } else if (pattern instanceof RegExp) {
            if (!pattern.test(normalized)) {
                console.error(`[WARN] RegExp not found in ${filePath}: ${name}`);
            } else {
                normalized = normalized.replace(pattern, replacement);
                console.log(`[OK] Applied ${name} to ${filePath}`);
            }
        }
    }

    // Convert back to original line endings
    if (isCrlf) {
        normalized = normalized.replace(/\n/g, "\r\n");
    }
    fs.writeFileSync(filePath, normalized, "utf8");
}

// 1. taskService.js
const restoreAndDuplicateTaskServiceCode = `
const restoreTask = async (taskId, userId) => {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: {
                select: {
                    workspace_id: true,
                    is_archived: true
                }
            }
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    const workspaceMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: task.projects.workspace_id,
                user_id: userId
            }
        }
    });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    if (!task.is_archived) {
        const error = new Error("Task is not archived");
        error.statusCode = 400;
        throw error;
    }

    if (task.projects?.is_archived) {
        const error = new Error("Cannot restore task while its parent project is archived. Please restore the project first.");
        error.statusCode = 400;
        throw error;
    }

    const restoredTask = await prisma.tasks.update({
        where: { id: taskId },
        data: {
            is_archived: false,
            updated_at: new Date()
        },
        include: {
            projects: {
                select: {
                    id: true,
                    title: true,
                    workspace_id: true
                }
            }
        }
    });

    return restoredTask;
};

const duplicateTask = async (taskId, userId) => {
    const task = await prisma.tasks.findUnique({
        where: { id: taskId },
        include: {
            projects: {
                select: {
                    workspace_id: true,
                    is_archived: true
                }
            },
            subtasks: true
        }
    });

    if (!task) {
        const error = new Error("Task not found");
        error.statusCode = 404;
        throw error;
    }

    const workspaceMembership = await prisma.workspace_members.findUnique({
        where: {
            workspace_id_user_id: {
                workspace_id: task.projects.workspace_id,
                user_id: userId
            }
        }
    });

    if (!workspaceMembership) {
        const error = new Error("Workspace access denied");
        error.statusCode = 403;
        throw error;
    }

    return await prisma.$transaction(async (tx) => {
        const duplicated = await tx.tasks.create({
            data: {
                project_id: task.project_id,
                title: \`\${task.title} (Copy)\`,
                description: task.description,
                priority: task.priority,
                status: "Backlog",
                start_date: task.start_date,
                due_date: task.due_date,
                estimated_hours: task.estimated_hours,
                assigned_to: task.assigned_to,
                created_by: userId,
                is_archived: false
            },
            include: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        workspace_id: true
                    }
                }
            }
        });

        if (task.subtasks && task.subtasks.length > 0) {
            for (const sub of task.subtasks) {
                await tx.subtasks.create({
                    data: {
                        task_id: duplicated.id,
                        title: sub.title,
                        description: sub.description,
                        status: "To Do",
                        due_date: sub.due_date
                    }
                });
            }
        }

        return await tx.tasks.findUnique({
            where: { id: duplicated.id },
            include: {
                projects: {
                    select: {
                        id: true,
                        title: true,
                        workspace_id: true
                    }
                },
                subtasks: true
            }
        });
    });
};
`;

patchFile("backend/src/services/taskService.js", [
    {
        name: "getProjectTasks archived option",
        pattern: `    const where = {
        project_id: projectId,
        is_archived: false
    };`,
        replacement: `    const isArchived = options?.archived === "true" || options?.archived === true || options?.isArchived === true;
    const where = {
        project_id: projectId,
        is_archived: isArchived
    };`
    },
    {
        name: "restoreTask and duplicateTask function definitions",
        pattern: "    return archivedTask;\n};",
        replacement: `    return archivedTask;\n};\n${restoreAndDuplicateTaskServiceCode}`
    },
    {
        name: "export restoreTask and duplicateTask",
        pattern: `    archiveTask,
    getMyTasks,`,
        replacement: `    archiveTask,
    restoreTask,
    duplicateTask,
    getMyTasks,`
    }
]);

// 2. taskController.js
const restoreAndDuplicateControllerCode = `
const restore = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Task ID is required" });
        }

        const task = await restoreTask(id, req.user.userId);
        const workspaceId = task.projects?.workspace_id || task.workspace_id;

        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_RESTORED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: \`Restored task "\${task.title}"\`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task restore:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.restored",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: req.user.userId,
            data: task
        });

        return res.status(200).json({
            message: "Task restored successfully",
            task
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error.message === "Task not found") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === "Workspace access denied") {
            return res.status(403).json({ message: error.message });
        }
        if (error.message === "Task is not archived") {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes("Cannot restore task while its parent project is archived")) {
            return res.status(400).json({ message: error.message });
        }
        next(error);
    }
};

const duplicate = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ message: "Task ID is required" });
        }

        const task = await duplicateTask(id, req.user.userId);
        const workspaceId = task.projects?.workspace_id || task.workspace_id;

        if (workspaceId) {
            try {
                await createActivity({
                    workspaceId,
                    userId: req.user.userId,
                    actionType: "TASK_CREATED",
                    entityType: "TASK",
                    entityId: task.id,
                    description: \`Duplicated task "\${task.title}"\`
                });
            } catch (actErr) {
                console.error("Activity logging failed for task duplicate:", actErr);
            }
        }

        emitRealtimeEvent({
            type: "task.created",
            workspaceId,
            projectId: task.project_id,
            taskId: task.id,
            userId: req.user.userId,
            data: task
        });

        return res.status(201).json({
            message: "Task duplicated successfully",
            task
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        if (error.message === "Task not found") {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === "Workspace access denied") {
            return res.status(403).json({ message: error.message });
        }
        next(error);
    }
};
`;

patchFile("backend/src/controllers/taskController.js", [
    {
        name: "import restoreTask and duplicateTask",
        pattern: `    archiveTask,
    getMyTasks,`,
        replacement: `    archiveTask,
    restoreTask,
    duplicateTask,
    getMyTasks,`
    },
    {
        name: "pass archived option in getAll",
        pattern: `            { page: req.query.page, limit: req.query.limit }`,
        replacement: `            { page: req.query.page, limit: req.query.limit, archived: req.query.archived === "true" || req.query.isArchived === "true" }`
    },
    {
        name: "add restore and duplicate controller handlers",
        pattern: `        next(error);
    }
};

const getMine = async (req, res, next) => {`,
        replacement: `        next(error);
    }
};
${restoreAndDuplicateControllerCode}
const getMine = async (req, res, next) => {`
    },
    {
        name: "export restore and duplicate handlers",
        pattern: `    archive,
    getMine,`,
        replacement: `    archive,
    restore,
    duplicate,
    getMine,`
    }
]);

// 3. taskRoutes.js
patchFile("backend/src/routes/taskRoutes.js", [
    {
        name: "import restore and duplicate handlers",
        pattern: `    archive,
    getMine,`,
        replacement: `    archive,
    restore,
    duplicate,
    getMine,`
    },
    {
        name: "register restore and duplicate routes",
        pattern: `router.delete(
    "/tasks/:id",
    authMiddleware,
    archive
);`,
        replacement: `router.delete(
    "/tasks/:id",
    authMiddleware,
    archive
);

router.patch(
    "/tasks/:id/restore",
    authMiddleware,
    restore
);

router.post(
    "/tasks/:id/restore",
    authMiddleware,
    restore
);

router.post(
    "/tasks/:id/duplicate",
    authMiddleware,
    duplicate
);`
    }
]);

console.log("Patching complete.");
