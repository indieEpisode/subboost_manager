import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("./prisma", () => ({
  prisma: {
    localAdmin: { findUnique: mocks.findUnique },
  },
}));

import { getAllowUnsafeSubscriptionSources } from "./source-import-settings";

describe("local source import settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to disabled when no local administrator exists", async () => {
    await expect(getAllowUnsafeSubscriptionSources()).resolves.toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(getAllowUnsafeSubscriptionSources("missing")).resolves.toBe(false);
  });

  it("reads the persisted local administrator setting", async () => {
    mocks.findUnique.mockResolvedValueOnce({ allowUnsafeSubscriptionSources: true, role: "admin", disabledAt: null });

    await expect(getAllowUnsafeSubscriptionSources("admin-1")).resolves.toBe(true);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { allowUnsafeSubscriptionSources: true, role: true, disabledAt: true },
    });
  });

  it("never grants another account's private-network access to ordinary or disabled accounts", async () => {
    mocks.findUnique.mockResolvedValueOnce({ allowUnsafeSubscriptionSources: true, role: "user", disabledAt: null });
    await expect(getAllowUnsafeSubscriptionSources("user-1")).resolves.toBe(false);
    mocks.findUnique.mockResolvedValueOnce({ allowUnsafeSubscriptionSources: true, role: "admin", disabledAt: new Date() });
    await expect(getAllowUnsafeSubscriptionSources("disabled-admin")).resolves.toBe(false);
  });
});
