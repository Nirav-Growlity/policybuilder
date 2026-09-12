import { createPool, type Pool } from "mysql2/promise";

type PoolConfig = {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
};

const globalForPolicyCraft = globalThis as unknown as {
  policyCraftPool?: Pool;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function getPoolConfig(): PoolConfig {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      port: Number(parsed.port || 3306),
    };
  }

  return {
    host: getRequiredEnv("HOST"),
    user: getRequiredEnv("USER_NAME"),
    password: getRequiredEnv("PASSWORD"),
    database: getRequiredEnv("DATABASE"),
    port: Number(process.env.DB_PORT || 3306),
  };
}

export const policyCraftPool =
  globalForPolicyCraft.policyCraftPool ??
  createPool({
    ...getPoolConfig(),
    connectionLimit: 10,
    waitForConnections: true,
    timezone: "Z",
    charset: "utf8mb4",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPolicyCraft.policyCraftPool = policyCraftPool;
}

