import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";
import { policyCraftPool } from "./db";
import { verifyPolicyCraftPasswordHash } from "./policycraft-password";

function authSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("Missing required server environment variable: BETTER_AUTH_SECRET");
  return "policycraft-local-development-secret-change-me";
}

function originFromEnv(value: string | undefined): string | undefined {
  const configured = value?.trim();
  if (!configured) return undefined;
  try {
    return new URL(configured.includes("://") ? configured : `https://${configured}`).origin;
  } catch {
    return undefined;
  }
}

const configuredBaseURL = process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim();
const policyCraftAppOrigin = originFromEnv(process.env.POLICYCRAFT_APP_URL);
const vercelOrigin = originFromEnv(process.env.VERCEL_URL);
const authBaseURL = configuredBaseURL || vercelOrigin || (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
export const policyCraftTrustedOrigins = [
  originFromEnv(authBaseURL),
  originFromEnv(configuredBaseURL),
  policyCraftAppOrigin,
  vercelOrigin,
  originFromEnv(process.env.VERCEL_BRANCH_URL),
  originFromEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL),
].filter((origin, index, origins): origin is string => Boolean(origin) && origins.indexOf(origin) === index);

export const auth = betterAuth({
  database: policyCraftPool,
  secret: authSecret(),
  baseURL: authBaseURL,
  basePath: "/api/auth",
  trustedOrigins: policyCraftTrustedOrigins,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: false,
    password: {
      hash: async (password: string) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }: { hash: string; password: string }) => verifyPolicyCraftPasswordHash(hash, password),
    },
  },
  user: {
    modelName: "users",
    fields: {
      id: "id",
      email: "email",
      name: "name",
      emailVerified: "active",
      image: "image",
      role: "role",
      password: "password",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      mobile: { type: "string", required: false },
      designation: { type: "string", required: false },
      org_id: { type: "string", required: false },
      org_code: { type: "string", required: false },
      active: { type: "boolean", required: false },
      is_super_admin: { type: "boolean", required: false },
      phone: { type: "string", required: false },
      site_ids: { type: "string", required: false },
    },
  },
  account: {
    modelName: "account",
    fields: {
      accountId: "accountId",
      providerId: "providerId",
      userId: "userId",
      refreshToken: "refreshToken",
      accessToken: "accessToken",
      accessTokenExpiresAt: "accessTokenExpiresAt",
      idToken: "idToken",
      password: "password",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
  },
  session: {
    modelName: "session",
    fields: {
      expiresAt: "expiresAt",
      token: "token",
      userId: "userId",
      ipAddress: "ipAddress",
      userAgent: "userAgent",
      impersonatedBy: "impersonatedBy",
      createdAt: "createdAt",
      updatedAt: "updatedAt",
    },
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 90,
      strategy: "compact",
    },
  },
  advanced: {
    cookiePrefix: "better-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
    database: {
      validateSchema: false,
    },
  },
  plugins: [nextCookies()],
});
