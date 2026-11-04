import fs from "node:fs";

console.log("Patching Project Controller & Routes...");

// 1. projectController.js
let pc = fs.readFileSync("backend/src/controllers/projectController.js", "utf8");
if (!pc.includes("restoreProject,")) {
    pc = pc.replace(
        "archiveProject,",
        "archiveProject,\r\n    restoreProject,"
    );
}

if (!pc.includes("req.query.archived")) {
    pc = pc.replace(
        "        const projects = await getWorkspaceProjects(\r\n            workspaceId,\r\n            req.user.userId\r\n        );",
        "        const archived = req.query.archived === \"true\" || req.query.isArchived === \"true\";\r\n        const projects = await getWorkspaceProjects(\r\n            workspaceId,\r\n            req.user.userId,\r\n            { archived }\r\n        );"
    );
}

if (!pc.includes("const restore = async")) {
    const restoreFunc = `
const restore = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({
                message: "Project ID is required"
            });
        }

        const project = await restoreProject(
            id,
            req.user.userId
        );

        try {
            await createActivity({
                workspaceId: project.workspace_id,
                userId: req.user.userId,
                actionType: "PROJECT_RESTORED",
                entityType: "PROJECT",
                entityId: project.id,
                description: \`Restored project "\${project.title}"\`
            });
        } catch (actErr) {
            console.error("Activity logging failed for project restore:", actErr);
        }

        emitRealtimeEvent({
            type: "project.restored",
            workspaceId: project.workspace_id,
            projectId: project.id,
            userId: req.user.userId,
            data: project
        });

        return res.status(200).json({
            message: "Project restored successfully",
            project
        });
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({
                message: error.message
            });
        }
        if (error.message === "Project not found") {
            return res.status(404).json({
                message: error.message
            });
        }
        if (error.message === "Project access denied" || error.message === "Workspace access denied") {
            return res.status(403).json({
                message: error.message
            });
        }
        if (error.message === "Project is not archived") {
            return res.status(400).json({
                message: error.message
            });
        }
        next(error);
    }
};
`.replace(/\n/g, "\r\n");

    pc = pc.replace(
        "        next(error);\r\n    }\r\n};\r\n\r\nconst addMember = async (req, res, next) => {",
        "        next(error);\r\n    }\r\n};\r\n" + restoreFunc + "\r\nconst addMember = async (req, res, next) => {"
    );
}

if (!pc.includes("    restore,")) {
    pc = pc.replace(
        "    archive,\r\n    addMember,",
        "    archive,\r\n    restore,\r\n    addMember,"
    );
}
fs.writeFileSync("backend/src/controllers/projectController.js", pc, "utf8");
console.log("Updated backend/src/controllers/projectController.js");

// 2. projectRoutes.js
let pr = fs.readFileSync("backend/src/routes/projectRoutes.js", "utf8");
if (!pr.includes("    restore,")) {
    pr = pr.replace(
        "    archive, \r\n    addMember,",
        "    archive,\r\n    restore,\r\n    addMember,"
    );
}
if (!pr.includes("/projects/:id/restore")) {
    pr = pr.replace(
        "router.delete(\r\n    \"/projects/:id\",\r\n    authMiddleware,\r\n    archive\r\n);",
        "router.delete(\r\n    \"/projects/:id\",\r\n    authMiddleware,\r\n    archive\r\n);\r\n\r\nrouter.patch(\r\n    \"/projects/:id/restore\",\r\n    authMiddleware,\r\n    restore\r\n);\r\n\r\nrouter.post(\r\n    \"/projects/:id/restore\",\r\n    authMiddleware,\r\n    restore\r\n);"
    );
}
fs.writeFileSync("backend/src/routes/projectRoutes.js", pr, "utf8");
console.log("Updated backend/src/routes/projectRoutes.js");
