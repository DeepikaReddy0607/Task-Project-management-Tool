import prisma from "../config/prisma.js";
import { createNotification } from "./notificationService.js";
import sendEmail from "./emailService.js";

const checkApproachingDueDates = async () => {
    const now = new Date();

    // Tasks due within the next 24 hours
    const tomorrow = new Date(now);
    tomorrow.setHours(tomorrow.getHours() + 24);

    const tasks = await prisma.tasks.findMany({
        where: {
            is_archived: false,
            status: {
                not: "Completed"
            },
            assigned_to: {
                not: null
            },
            due_date: {
                gte: now,
                lte: tomorrow
            }
        },
        select: {
            id: true,
            title: true,
            due_date: true,
            assigned_to: true,
            users_tasks_assigned_toTousers: {
                select: {
                    email: true
                }
            }
        }
    });

    for (const task of tasks) {
        // Prevent duplicate notification for the same task
        const existingNotification =
            await prisma.notifications.findFirst({
                where: {
                    user_id: task.assigned_to,
                    type: "DUE_DATE_APPROACHING",
                    related_entity_type: "TASK",
                    related_entity_id: task.id,
                    created_at: {
                        gte: new Date(
                            now.getTime() - 24 * 60 * 60 * 1000
                        )
                    }
                }
            });

        if (existingNotification) {
            continue;
        }

        await createNotification({
            userId: task.assigned_to,
            type: "DUE_DATE_APPROACHING",
            message: `Task "${task.title}" is due within 24 hours.`,
            relatedEntityType: "TASK",
            relatedEntityId: task.id
        });

        if (task.users_tasks_assigned_toTousers?.email) {
            await sendEmail({
                to: task.users_tasks_assigned_toTousers.email,
                subject: `Task Due Soon: ${task.title}`,
                text: `Your task "${task.title}" is due within 24 hours.`,
                html: `
                    <h2>Task Due Soon</h2>
                    <p>Your task:</p>
                    <p><strong>${task.title}</strong></p>
                    <p>is due within the next 24 hours.</p>
                    <p>Please log in to TaskFlow to check the task.</p>
                `
            });
        }
    }

    console.log(
        `Due date notification check completed. ${tasks.length} task(s) found.`
    );
};

export default checkApproachingDueDates;