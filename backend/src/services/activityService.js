import prisma from "../config/prisma.js";

const createActivity = async ({
    workspaceId,
    userId,
    actionType,
    entityType = null,
    entityId = null,
    description
}) => {

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
    getWorkspaceActivities
};