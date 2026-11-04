import dotenv from "dotenv";
dotenv.config({ path: "backend/.env" });

async function verifyPrismaModels() {
    const { default: prisma } = await import("../config/prisma.js");

    console.log("Checking Prisma Client access to chat models:");
    const counts = {
        conversations: await prisma.conversations.count(),
        conversation_members: await prisma.conversation_members.count(),
        channels: await prisma.channels.count(),
        channel_members: await prisma.channel_members.count(),
        messages: await prisma.messages.count(),
        message_reactions: await prisma.message_reactions.count(),
        message_read_receipts: await prisma.message_read_receipts.count(),
        message_pins: await prisma.message_pins.count()
    };

    console.table(counts);
    console.log("✔ All 8 models are accessible through Prisma Client!");
    await prisma.$disconnect();
}

verifyPrismaModels().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
});
