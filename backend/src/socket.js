import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import prisma from "./config/prisma.js";

let io = null;

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.FRONTEND_URL || "http://localhost:5173",
            methods: ["GET", "POST", "PATCH", "DELETE"],
            credentials: true
        }
    });

    // 1. Authenticate socket connection with existing JWT
    io.use(async (socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token ||
                socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");

            if (!token) {
                return next(new Error("Authentication required"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;

            // Fetch user's workspaces and projects to pre-join relevant rooms
            const memberships = await prisma.workspace_members.findMany({
                where: { user_id: decoded.userId },
                select: { workspace_id: true }
            });
            socket.workspaceIds = memberships.map((m) => m.workspace_id);

            const projects = await prisma.projects.findMany({
                where: {
                    workspace_id: { in: socket.workspaceIds },
                    is_archived: false
                },
                select: { id: true }
            });
            socket.projectIds = projects.map((p) => p.id);

            next();
        } catch (error) {
            console.warn("Socket authentication failed:", error.message);
            next(new Error("Invalid authentication token"));
        }
    });

    // 2. Connection handler & room joins
    io.on("connection", (socket) => {
        const userId = socket.user?.userId;

        // Join personal user room
        if (userId) {
            socket.join(`user:${userId}`);
        }

        // Join workspace rooms
        if (Array.isArray(socket.workspaceIds)) {
            socket.workspaceIds.forEach((wid) => {
                socket.join(`workspace:${wid}`);
            });
        }

        // Join project rooms
        if (Array.isArray(socket.projectIds)) {
            socket.projectIds.forEach((pid) => {
                socket.join(`project:${pid}`);
            });
        }

        // Dynamic room join/leave
        socket.on("join:project", (projectId) => {
            if (projectId) socket.join(`project:${projectId}`);
        });

        socket.on("leave:project", (projectId) => {
            if (projectId) socket.leave(`project:${projectId}`);
        });

        socket.on("join:workspace", (workspaceId) => {
            if (workspaceId) socket.join(`workspace:${workspaceId}`);
        });

        socket.on("leave:workspace", (workspaceId) => {
            if (workspaceId) socket.leave(`workspace:${workspaceId}`);
        });

        socket.on("disconnect", () => {
            // Clean up
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        console.warn("Socket.io has not been initialized yet!");
    }
    return io;
};

/**
 * Emit real-time event to scoped rooms.
 * Only call this after successful database persistence.
 */
export const emitRealtimeEvent = ({
    type,
    workspaceId = null,
    projectId = null,
    taskId = null,
    userId = null,
    data = null,
    changes = null
}) => {
    if (!io) return;

    // Dynamically manage room membership if a user is added or removed from a workspace/project
    if (userId && io.sockets?.sockets) {
        for (const [_, socket] of io.sockets.sockets) {
            if (socket.user?.userId === userId) {
                if (type === "workspace.member_added" && workspaceId) {
                    socket.join(`workspace:${workspaceId}`);
                } else if (type === "workspace.member_removed" && workspaceId) {
                    socket.leave(`workspace:${workspaceId}`);
                } else if (type === "project.member_added" && projectId) {
                    socket.join(`project:${projectId}`);
                } else if (type === "project.member_removed" && projectId) {
                    socket.leave(`project:${projectId}`);
                }
            }
        }
    }

    const payload = {
        type,
        workspaceId,
        projectId,
        taskId,
        userId,
        data,
        changes,
        timestamp: new Date().toISOString()
    };

    // Determine target rooms
    const targetRooms = new Set();

    if (projectId) {
        targetRooms.add(`project:${projectId}`);
    }
    if (workspaceId) {
        targetRooms.add(`workspace:${workspaceId}`);
    }
    if (userId) {
        targetRooms.add(`user:${userId}`);
    }

    // If no specific room is targeted, fallback to personal user room if available
    if (targetRooms.size === 0 && userId) {
        targetRooms.add(`user:${userId}`);
    }

    // Broadcast to targeted rooms
    targetRooms.forEach((room) => {
        io.to(room).emit(type, payload);
        io.to(room).emit("taskflow:event", payload);
    });

    // Asynchronously evaluate proactive alerts for business events (persistence-first)
    if (type !== "notification.created") {
        setImmediate(async () => {
            try {
                const { processEventForAlerts } = await import("./services/quackieAlertService.js");
                await processEventForAlerts(payload);
            } catch (alertErr) {
                // Non-fatal background alert processing
            }
        });
    }

    return payload;
};
