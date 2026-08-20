import prisma from "../config/prisma.js";

// Allowed values
const ALLOWED_SEVERITIES = [
    "Low",
    "Medium",
    "High",
    "Critical"
];

const ALLOWED_PROBABILITIES = [
    "Low",
    "Medium",
    "High"
];

const ALLOWED_STATUSES = [
    "Open",
    "Closed"
];

// Check whether a user has access to the project
const verifyProjectAccess = async (projectId, userId) => {

    const project = await prisma.projects.findUnique({
        where: {
            id: projectId
        }
    });

    if (!project) {
        throw new Error("Project not found");
    }

    const membership = await prisma.project_members.findUnique({
        where: {
            project_id_user_id: {
                project_id: projectId,
                user_id: userId
            }
        }
    });

    // Project manager should also have access
    if (
        !membership &&
        project.manager_id !== userId
    ) {
        throw new Error("Project access denied");
    }

    return project;
};


// Create a risk
const createRisk = async (
    projectId,
    requesterId,
    title,
    description,
    severity,
    probability,
    ownerId,
    mitigationPlan,
    status
) => {

    // 1. Verify project access
    await verifyProjectAccess(projectId, requesterId);

    // 2. Validate title
    if (!title || !title.trim()) {
        throw new Error("Risk title is required");
    }

    // 3. Validate severity
    if (!ALLOWED_SEVERITIES.includes(severity)) {
        throw new Error("Invalid risk severity");
    }

    // 4. Validate probability
    if (!ALLOWED_PROBABILITIES.includes(probability)) {
        throw new Error("Invalid risk probability");
    }

    // 5. Validate status
    const riskStatus = status || "Open";

    if (!ALLOWED_STATUSES.includes(riskStatus)) {
        throw new Error("Invalid risk status");
    }

    // 6. Validate owner if supplied
    if (ownerId) {

        const owner = await prisma.users.findUnique({
            where: {
                id: ownerId
            }
        });

        if (!owner) {
            throw new Error("Risk owner not found");
        }
    }

    // 7. Create risk
    const risk = await prisma.risks.create({
        data: {
            project_id: projectId,
            title: title.trim(),
            description: description || null,
            severity,
            probability,
            owner_id: ownerId || null,
            mitigation_plan: mitigationPlan || null,
            status: riskStatus
        }
    });

    return risk;
};


// Get all risks for a project
const getProjectRisks = async (
    projectId,
    requesterId,
    sort = "severity",
    order = "desc"
) => {

    // 1. Verify project access
    await verifyProjectAccess(projectId, requesterId);

    // 2. Validate sorting
    const allowedSortFields = [
        "severity",
        "probability",
        "status",
        "created_at"
    ];

    if (!allowedSortFields.includes(sort)) {
        throw new Error("Invalid sort field");
    }

    const sortOrder = order === "asc" ? "asc" : "desc";

    // 3. Retrieve risks
    const risks = await prisma.risks.findMany({
        where: {
            project_id: projectId
        },
        orderBy: {
            [sort]: sortOrder
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
    });

    // 4. Return clean response
    return risks.map((risk) => ({
        id: risk.id,
        projectId: risk.project_id,
        title: risk.title,
        description: risk.description,
        severity: risk.severity,
        probability: risk.probability,
        owner: risk.users
            ? {
                id: risk.users.id,
                firstName: risk.users.first_name,
                lastName: risk.users.last_name,
                email: risk.users.email
            }
            : null,
        mitigationPlan: risk.mitigation_plan,
        status: risk.status,
        createdAt: risk.created_at
    }));
};


// Update a risk
const updateRisk = async (
    riskId,
    requesterId,
    data
) => {

    // 1. Find risk
    const risk = await prisma.risks.findUnique({
        where: {
            id: riskId
        }
    });

    if (!risk) {
        throw new Error("Risk not found");
    }

    // 2. Verify project access
    await verifyProjectAccess(
        risk.project_id,
        requesterId
    );

    // 3. Validate supplied fields
    if (
        data.title !== undefined &&
        !data.title.trim()
    ) {
        throw new Error("Risk title cannot be empty");
    }

    if (
        data.severity !== undefined &&
        !ALLOWED_SEVERITIES.includes(data.severity)
    ) {
        throw new Error("Invalid risk severity");
    }

    if (
        data.probability !== undefined &&
        !ALLOWED_PROBABILITIES.includes(data.probability)
    ) {
        throw new Error("Invalid risk probability");
    }

    if (
        data.status !== undefined &&
        !ALLOWED_STATUSES.includes(data.status)
    ) {
        throw new Error("Invalid risk status");
    }

    if (data.ownerId !== undefined && data.ownerId !== null) {

        const owner = await prisma.users.findUnique({
            where: {
                id: data.ownerId
            }
        });

        if (!owner) {
            throw new Error("Risk owner not found");
        }
    }

    // 4. Update risk
    const updatedRisk = await prisma.risks.update({
        where: {
            id: riskId
        },
        data: {
            ...(data.title !== undefined && {
                title: data.title.trim()
            }),

            ...(data.description !== undefined && {
                description: data.description
            }),

            ...(data.severity !== undefined && {
                severity: data.severity
            }),

            ...(data.probability !== undefined && {
                probability: data.probability
            }),

            ...(data.ownerId !== undefined && {
                owner_id: data.ownerId
            }),

            ...(data.mitigationPlan !== undefined && {
                mitigation_plan: data.mitigationPlan
            }),

            ...(data.status !== undefined && {
                status: data.status
            })
        }
    });

    return updatedRisk;
};


// Close a risk
const closeRisk = async (
    riskId,
    requesterId
) => {

    // 1. Find risk
    const risk = await prisma.risks.findUnique({
        where: {
            id: riskId
        }
    });

    if (!risk) {
        throw new Error("Risk not found");
    }

    // 2. Verify project access
    await verifyProjectAccess(
        risk.project_id,
        requesterId
    );

    // 3. Close risk
    const closedRisk = await prisma.risks.update({
        where: {
            id: riskId
        },
        data: {
            status: "Closed"
        }
    });

    return closedRisk;
};


export {
    createRisk,
    getProjectRisks,
    updateRisk,
    closeRisk
};