import { nextCookies } from "better-auth/next-js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { genericOAuth } from "better-auth/plugins";
import { betterAuth } from "better-auth";

import { prisma } from "../db";
import { env } from "../env";

type LinuxDoProfile = Record<string, unknown>;

function readProfileString(profile: LinuxDoProfile, key: string) {
  const value = profile[key];
  return typeof value === "string" ? value.trim() : "";
}

function readProfileId(profile: LinuxDoProfile) {
  const value = profile.id;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function resolveLinuxDoImage(profile: LinuxDoProfile) {
  const avatarUrl = readProfileString(profile, "avatar_url");
  const avatarTemplate = readProfileString(profile, "avatar_template");
  const candidate = avatarUrl || avatarTemplate;

  if (!candidate) {
    return undefined;
  }

  const normalized = candidate.replace("{size}", "256");
  return normalized.startsWith("http")
    ? normalized
    : `https://linux.do${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
}

function resolveLinuxDoUser(profile: LinuxDoProfile) {
  const id = readProfileId(profile);
  const email = readProfileString(profile, "email");
  const username = readProfileString(profile, "username");
  const name = readProfileString(profile, "name") || username || "Linux DO 用户";

  return {
    id: id || username,
    email: email || (id ? `linuxdo-${id}@connect.linux.do.invalid` : ""),
    name,
    image: resolveLinuxDoImage(profile),
    emailVerified: true,
  };
}

const linuxDoClientId = env.LINUX_DO_CLIENT_ID?.trim();
const linuxDoClientSecret = env.LINUX_DO_CLIENT_SECRET?.trim();
const trustedOrigins = [...new Set([env.APP_BASE_URL, env.BETTER_AUTH_URL].map((value) => value.trim()).filter(Boolean))];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  plugins: [
    nextCookies(),
    ...(linuxDoClientId && linuxDoClientSecret
      ? [
          genericOAuth({
            config: [
              {
                providerId: "linux-do",
                clientId: linuxDoClientId,
                clientSecret: linuxDoClientSecret,
                authorizationUrl: "https://connect.linux.do/oauth2/authorize",
                tokenUrl: "https://connect.linux.do/oauth2/token",
                userInfoUrl: "https://connect.linux.do/api/user",
                mapProfileToUser(profile) {
                  return resolveLinuxDoUser(profile as LinuxDoProfile);
                },
              },
            ],
          }),
        ]
      : []),
  ],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins,
});
