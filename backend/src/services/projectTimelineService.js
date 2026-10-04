import prisma from "../config/prisma.js";

// In-memory store for timeline events (used in tests and fallback)
const inMemoryTimelineEvents = new Map(); // projectId -> Array<normalizedEvent>

export const clearTimelineStore = () => {
    inMemoryTimelineEvents.clear();
};

export const addTimelineEvent = (event) => {
    const projectId = event.projectId || event.project_id;
    if (!projectId) return null;

    if (!inMemoryTimelineEvents.has(projectId)) {
        inMemoryTimelineEvents.set(projectId, []);
    }

    const normalized = normalizeTimelineEvent(event);
    inMemoryTimelineEvents.get(projectId).push(normalized);
    return normalized;
};

/**
 * Normalizes an arbitrary raw event (activity log, decision, risk, health snapshot, replanning action)
 * into a standard Project Intelligence Timeline record.
 */
export const normalizeTimelineEvent = (raw, defaultSource = "system") => {
    const id = raw.id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const projectId = raw.projectId || raw.project_id || null;
    const timestamp = raw.timestamp || raw.created_at || raw.decision_date || raw.captured_at || new Date();

    // Actor resolution
    let actor = { id: null, name: "System", role: "Automated Intelligence" };
    if (raw.actor && typeof raw.actor === "object") {
        actor = {
            id: raw.actor.id || null,
            name: raw.actor.name || `${raw.actor.first_name || ""} ${raw.actor.last_name || ""}`.trim() || "User",
            role: raw.actor.role || raw.actor.workspace_role || "Member"
        };
    } else if (raw.users) {
        actor = {
            id: raw.users.id,
            name: `${raw.users.first_name || ""} ${raw.users.last_name || ""}`.trim() || raw.users.email || "User",
            role: raw.users.roles?.role_name || "Member"
        };
    } else if (raw.user_id || raw.user_name) {
        actor = { id: raw.user_id || null, name: raw.user_name || "Member", role: "Member" };
    }

    // Determine type, entityType, severity, title, description, source
    let type = raw.type || raw.action_type || "ACTIVITY_RECORDED";
    let entityType = raw.entityType || raw.entity_type || "Project";
    let entityId = raw.entityId || raw.entity_id || null;
    let severity = raw.severity ? String(raw.severity).toUpperCase() : "INFO";
    let title = raw.title || "";
    let description = raw.description || raw.message || raw.reason || "";
    let source = raw.source || defaultSource;

    // Map common activity log action types
    if (raw.action_type) {
        source = "activity_log";
        const act = raw.action_type.toUpperCase();
        if (act.includes("TASK_CREATE") || act === "CREATE_TASK") {
            type = "TASK_CREATED";
            entityType = "Task";
            severity = severity === "INFO" ? "LOW" : severity;
            title = title || "Task Created";
        } else if (act.includes("TASK_UPDATE") || act === "UPDATE_TASK") {
            type = "TASK_UPDATED";
            entityType = "Task";
            title = title || "Task Updated";
        } else if (act.includes("TASK_COMPLETE") || act === "COMPLETE_TASK") {
            type = "TASK_COMPLETED";
            entityType = "Task";
            severity = "LOW";
            title = title || "Task Completed";
        } else if (act.includes("DEPENDENCY_CREATE") || act === "ADD_DEPENDENCY") {
            type = "DEPENDENCY_CREATED";
            entityType = "Dependency";
            severity = severity === "INFO" ? "MEDIUM" : severity;
            title = title || "Task Dependency Created";
        } else if (act.includes("DEPENDENCY_DELETE") || act === "REMOVE_DEPENDENCY") {
            type = "DEPENDENCY_DELETED";
            entityType = "Dependency";
            title = title || "Task Dependency Removed";
        } else if (act.includes("RISK")) {
            type = act.includes("CREATE") ? "RISK_CREATED" : "RISK_UPDATED";
            entityType = "Risk";
            title = title || "Risk Logged";
        } else if (act.includes("PROJECT")) {
            type = act.includes("CREATE") ? "PROJECT_CREATED" : "PROJECT_UPDATED";
            entityType = "Project";
            title = title || "Project Updated";
        }
    }

    // Map decisions
    if (raw.decision !== undefined) {
        source = "decision";
        type = "DECISION_RECORDED";
        entityType = "Decision";
        title = title || `Decision: ${raw.decision.slice(0, 60)}`;
        description = description || raw.reason || raw.decision;
        severity = severity === "INFO" ? "MEDIUM" : severity;
    }

    // Map risks
    if (raw.mitigation_plan !== undefined || (raw.probability && raw.severity)) {
        source = "risk";
        type = raw.status === "Closed" ? "RISK_CLOSED" : "RISK_LOGGED";
        entityType = "Risk";
        title = title || raw.title || "Project Risk";
        severity = String(raw.severity).toUpperCase();
    }

    // Map health transitions
    if (raw.health_score !== undefined || raw.healthScore !== undefined) {
        source = "health_snapshot";
        const score = raw.health_score ?? raw.healthScore;
        type = score < 60 ? "HEALTH_DEGRADED" : "HEALTH_RECORDED";
        entityType = "Health";
        severity = score < 50 ? "CRITICAL" : score < 70 ? "HIGH" : "LOW";
        title = title || `Health Score: ${score}`;
        description = description || `Recorded project health at ${score} (${raw.health_status || "WATCH"})`;
    }

    // Ensure valid severity
    if (!["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) {
        severity = "INFO";
    }

    return {
        id: String(id),
        projectId: String(projectId),
        type,
        timestamp: new Date(timestamp),
        actor,
        title: title || `${type.replace(/_/g, " ")}`,
        description: description || "No detailed description provided.",
        severity,
        entityType,
        entityId: entityId ? String(entityId) : null,
        metadata: raw.metadata || {},
        source
    };
};

/**
 * Retrieve unified timeline events for a project with filtering, sorting, and pagination.
 */
export const getProjectTimeline = async (projectId, options = {}) => {
    if (!projectId) {
        throw new Error("Project ID is required to fetch timeline");
    }

    const {
        from,
        to,
        eventType,
        type,
        severity,
        actorId,
        taskId,
        entityType,
        entityId,
        order = "desc",
        page = 1,
        limit = 20
    } = options;

    let aggregated = [];

    // 1. In-memory events for this project
    const memEvents = inMemoryTimelineEvents.get(projectId) || [];
    aggregated.push(...memEvents);

    // 2. Fetch from DB if available
    try {
        if (prisma) {
            // Find task IDs for this project
            const projectTasks = await prisma.tasks.findMany({
                where: { project_id: projectId },
                select: { id: true, title: true }
            });
            const taskIds = projectTasks.map((t) => t.id);

            // A. Activity logs
            const activityLogs = await prisma.activity_logs.findMany({
                where: {
                    OR: [
                        { entity_type: "Project", entity_id: projectId },
                        { entity_type: "Task", entity_id: { in: taskIds } }
                    ]
                },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                            roles: { select: { role_name: true } }
                        }
                    }
                },
                orderBy: { created_at: "desc" },
                take: 100
            });

            for (const log of activityLogs) {
                aggregated.push(
                    normalizeTimelineEvent({
                        ...log,
                        projectId
                    }, "activity_log")
                );
            }

            // B. Decisions
            const decisions = await prisma.decisions.findMany({
                where: { project_id: projectId },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                            roles: { select: { role_name: true } }
                        }
                    }
                },
                orderBy: { created_at: "desc" },
                take: 50
            });

            for (const dec of decisions) {
                aggregated.push(
                    normalizeTimelineEvent({
                        ...dec,
                        projectId,
                        type: "DECISION_RECORDED",
                        entityType: "Decision",
                        entityId: dec.id,
                        title: `Decision: ${dec.decision.slice(0, 60)}`,
                        description: dec.reason || dec.decision,
                        severity: "MEDIUM"
                    }, "decision")
                );
            }

            // C. Risks
            const risks = await prisma.risks.findMany({
                where: { project_id: projectId },
                include: {
                    users: {
                        select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                            roles: { select: { role_name: true } }
                        }
                    }
                },
                orderBy: { created_at: "desc" },
                take: 50
            });

            for (const r of risks) {
                aggregated.push(
                    normalizeTimelineEvent({
                        ...r,
                        projectId,
                        type: r.status === "Closed" ? "RISK_CLOSED" : "RISK_CREATED",
                        entityType: "Risk",
                        entityId: r.id,
                        title: `Risk: ${r.title}`,
                        description: r.description || `Severity: ${r.severity}, Probability: ${r.probability}`,
                        severity: String(r.severity).toUpperCase()
                    }, "risk")
                );
            }
        }
    } catch {
        // Fall back to in-memory only
    }

    // Deduplicate by event id
    const seenIds = new Set();
    const unique = [];
    for (const ev of aggregated) {
        if (!seenIds.has(ev.id)) {
            seenIds.add(ev.id);
            unique.push(ev);
        }
    }

    // Strictly enforce project isolation
    let filtered = unique.filter((ev) => ev.projectId === projectId);

    // Apply filters
    if (from) {
        const fromTime = new Date(from).getTime();
        filtered = filtered.filter((ev) => new Date(ev.timestamp).getTime() >= fromTime);
    }
    if (to) {
        const toTime = new Date(to).getTime();
        filtered = filtered.filter((ev) => new Date(ev.timestamp).getTime() <= toTime);
    }

    const requestedType = eventType || type;
    if (requestedType) {
        const targetType = String(requestedType).toUpperCase();
        filtered = filtered.filter((ev) => ev.type.toUpperCase() === targetType);
    }

    if (severity) {
        const targetSev = String(severity).toUpperCase();
        filtered = filtered.filter((ev) => ev.severity.toUpperCase() === targetSev);
    }

    if (actorId) {
        filtered = filtered.filter((ev) => ev.actor?.id === actorId);
    }

    if (taskId) {
        filtered = filtered.filter(
            (ev) => ev.entityType === "Task" && (ev.entityId === taskId || ev.metadata?.taskId === taskId)
        );
    }

    if (entityType) {
        const targetEntType = String(entityType).toLowerCase();
        filtered = filtered.filter((ev) => ev.entityType?.toLowerCase() === targetEntType);
    }

    if (entityId) {
        filtered = filtered.filter((ev) => ev.entityId === entityId);
    }

    // Sorting
    filtered.sort((a, b) => {
        const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        return order === "asc" ? diff : -diff;
    });

    // Pagination
    const total = filtered.length;
    const pageNum = Math.max(1, Number(page));
    const pageSize = Math.max(1, Number(limit));
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (pageNum - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    return {
        projectId,
        total,
        page: pageNum,
        limit: pageSize,
        totalPages,
        events: paginated
    };
};
