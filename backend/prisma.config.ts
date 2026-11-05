import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const rawDatabaseUrl = env("DATABASE_URL");
let datasourceUrl = rawDatabaseUrl;

if (rawDatabaseUrl) {
  try {
    const parsed = new URL(rawDatabaseUrl);
    if (!parsed.searchParams.has("schema")) {
      parsed.searchParams.set("schema", "taskflow");
      datasourceUrl = parsed.toString();
    }
  } catch {
    // If raw string cannot be parsed as a URL, keep original
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: datasourceUrl,
  },
});
