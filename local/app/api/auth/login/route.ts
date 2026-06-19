import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { apiError, getStringField, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@local/lib/session";

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

  const username = getStringField(body, "username");
  const password = getStringField(body, "password");
  const admin = username
    ? await prisma.localAdmin.findUnique({
        where: { username },
        select: { id: true, username: true, passwordHash: true, disabledAt: true },
      })
    : null;
  const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
  if (!admin || !valid) {
    return apiError("Invalid username or password.", "UNAUTHORIZED", 401);
  }
  if (admin.disabledAt) {
    return apiError("账户已被禁用，请联系管理员。", "FORBIDDEN", 403);
  }

  await prisma.localAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  const response = NextResponse.json({ success: true, user: { id: admin.id, username: admin.username } });
  response.cookies.set(SESSION_COOKIE, await signSession({ adminId: admin.id, username: admin.username }), sessionCookieOptions());
  return response;
}
