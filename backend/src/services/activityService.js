import fs from "node:fs";
import path from "node:path";
import prisma from "../config/prisma.js";

// Durable Activity Buffer configuration
let activityBuffer = [];
let flushTimer = null;
const BATCH_FLUSH_INTERVAL_MS = 50;
const BATCH_MAX_SIZE = 50;
const LOGS_DIR = path.resolve(process.cwd().endsWith("backend") ? "logs" : "backend/logs");
const FALLBACK_LOG_FILE = path.join(LOGS_DIR, "activity_fallback.log");

function writeToFallbackLog(activities, reason) {
    try {
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
        }
        const entries = activities.map(act => JSON.stringify({
            timestamp: new Date().toISOString(),
            reason,
            activity: act
        })).join("\n") + "\n";
        fs.appendFileSync(FALLBACK_LOG_FILE, entries, "utf8");
    } catch (fsErr) {
        console.error("Critical: Failed writing activities to fallback log:", fsErr);
    }
}

export const flushActivityQueue = async () => {
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (activityBuffer.length === 0) return { count: 0 };

    const batch = activityBuffer;
    activityBuffer = [];

    // Attempt database insertion with 1 retry
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            return await createBatchActivities(batch);
        } catch (dbErr) {
            if (attempt === 2) {
                console.error("Activity batch persistence failed; persisting to fallback disk log:", dbErr.message);
                writeToFallbackLog(batch, dbErr.message);
                return { count: 0, error: dbErr.message, persistedToFallback: true };
            }
            await new Promise(r => setTimeout(r, 50));
        }
    }
};

function scheduleBatchFlush() {
    if (!flushTimer) {
        flushTimer = setTimeout(() => {
            flushActivityQueue().catch(err => {
                console.error("Background activity flush error:", err);
            });
        }, BATCH_FLUSH_INTERVAL_MS);
        if (flushTimer.unref) flushTimer.unref();
    }
}

// Graceful process shutdown hooks
if (typeof process !== "undefined") {
    process.on("beforeExit", () => {
        if (activityBuffer.length > 0) {
            flushActivityQueue().catch(() => {});
        }
    });
}

const createActivity = async ({
    workspaceId,
    userId,
    actionType,
    entityType = null,
    entityId = null,
    description
}, { immediate = false } = {}) => {

    if (!workspaceId) {
        throw new Error("Workspace ID is required");
    }

    if (!userId) {
        throw new Error("User ID is required");
    }

    if (!actionType) {
        throw new Error("Action type is required");
    }

    if (!description) {
        throw new Error("Activity description is required");
    }

    // In test environment or when explicitly requested, execute immediately
    if (immediate || process.env.NODE_ENV === "test") {
        return await prisma.activity_logs.create({
            data: {
                workspace_id: workspaceId,
                user_id: userId,
                action_type: actionType,
                entity_type: entityType,
                entity_id: entityId,
                description
            }
        });
    }

    // Non-blocking durable micro-batching for high-throughput production workloads
    activityBuffer.push({
        workspaceId,
        userId,
        actionType,
        entityType,
        entityId,
        description
    });

    if (activityBuffer.length >= BATCH_MAX_SIZE) {
        flushActivityQueue().catch(err => console.error("Batch flush error:", err));
    } else {
        scheduleBatchFlush();
    }

    return { queued: true };
};

const createBatchActivities = async (activities) => {
    if (!activities || !Array.isArray(activities) || activities.length === 0) {
        return { count: 0 };
    }

    const validActivities = activities.filter(
        (a) => a.workspaceId && a.userId && a.actionType && a.description
    );

    if (validActivities.length === 0) {
        return { count: 0 };
    }

    return await prisma.activity_logs.createMany({
        data: validActivities.map((act) => ({
            workspace_id: act.workspaceId,
            user_id: act.userId,
            action_type: act.actionType,
            entity_type: act.entityType || null,
            entity_id: act.entityId || null,
            description: act.description
        }))
    });
};


const getWorkspaceActivities = async (
    workspaceId,
    {
        page = 1,
        limit = 20,
        actionType,
        entityType
    } = {}
) => {

    const skip = (page - 1) * limit;

    const where = {
        workspace_id: workspaceId
    };

    if (actionType) {
        where.action_type = actionType;
    }

    if (entityType) {
        where.entity_type = entityType;
    }

    const [activities, total] = await Promise.all([

        prisma.activity_logs.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
                created_at: "desc"
            },
            include: {
                users: {
                    select: {
                        id: true,
                        first_name: true,
                        last_name: true,
                        email: true
                    }
                }
            }
        }),

        prisma.activity_logs.count({
            where
        })

    ]);

    return {
        activities,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};


export {
    createActivity,
    createBatchActivities,
    getWorkspaceActivities
};