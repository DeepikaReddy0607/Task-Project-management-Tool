import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.ts";

const workersCount = parseInt(process.env.CLUSTER_WORKERS, 10) || 3;
const defaultPoolSize = process.env.CLUSTER_MODE === "true"
    ? Math.max(5, Math.floor(75 / workersCount))
    : 50;

const maxConnections = parseInt(process.env.DB_POOL_SIZE, 10) || defaultPoolSize;
const connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT, 10) || 20000;

let connectionString = process.env.DATABASE_URL;
if (connectionString) {
    try {
        const parsed = new URL(connectionString);
        if (!parsed.searchParams.has("schema")) {
            parsed.searchParams.set("schema", "taskflow");
            connectionString = parsed.toString();
        }
    } catch {
        // Keep raw connection string
    }
}

const adapter = new PrismaPg(
    {
        connectionString,
        max: maxConnections,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis,
    },
    {
        schema: "taskflow",
    }
);

const prisma = new PrismaClient({
    adapter,
});

export default prisma;
