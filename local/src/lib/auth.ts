import { prisma } from "./prisma";
import { readSession } from "./session";

export type CurrentAdmin = {
  id: string;
  username: string;
  role: string;
  disabledAt: Date | null;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await readSession();
  if (!session) return null;
  const admin = await prisma.localAdmin.findUnique({
    where: { id: session.adminId },
    select: { id: true, username: true, role: true, disabledAt: true },
  });
  // 禁用账户视为未登录：所有受保护 API 自动返回 401，无需逐个改。
  if (!admin || admin.disabledAt) return null;
  return admin;
}

export function isAdminAccount(admin: Pick<CurrentAdmin, "role">): boolean {
  return admin.role === "admin";
}

export async function isSetupRequired(): Promise<boolean> {
  const count = await prisma.localAdmin.count();
  return count === 0;
}
