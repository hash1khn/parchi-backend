// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    adapter: "postgresql",
    url: env("DIRECT_URL"),       // Direct connection recommended for db pull
    schemas: ["public", "auth"],  // Add both schemas here
  },
});
