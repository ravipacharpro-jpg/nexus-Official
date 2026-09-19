import { defineConfig } from "drizzle-kit"
import path from "node:path"
import os from "node:os"

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/**/*.sql.ts", "./src/**/sql.ts"],
  out: "./migration",
  dbCredentials: {
    url: process.env.NEXUS_DB_PATH ?? path.join(os.homedir(), ".nexus", "nexus.db"),
  },
})
