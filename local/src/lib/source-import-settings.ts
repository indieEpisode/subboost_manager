import { prisma } from "./prisma";

export async function getAllowUnsafeSubscriptionSources(ownerId?: string): Promise<boolean> {
  if (!ownerId) return false;
  const admin = await prisma.localAdmin.findUnique({
    where: { id: ownerId },
    select: { allowUnsafeSubscriptionSources: true, role: true, disabledAt: true },
  });

  return Boolean(admin?.role === "admin" && !admin.disabledAt && admin.allowUnsafeSubscriptionSources);
}
