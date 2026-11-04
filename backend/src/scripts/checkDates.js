import prisma from "../config/prisma.js";

async function test() {
    const task = await prisma.tasks.findFirst({
        where: { due_date: { not: null } },
        select: { id: true, title: true, start_date: true, due_date: true }
    });
    console.log("Sample task from DB:", task);
    if (task && task.due_date) {
        console.log("due_date type:", typeof task.due_date, Object.prototype.toString.call(task.due_date));
        console.log("due_date.toISOString():", task.due_date.toISOString());
        console.log("due_date.toUTCString():", task.due_date.toUTCString());
        console.log("due_date.toString():", task.due_date.toString());
    }
    await prisma.$disconnect();
}
test();
