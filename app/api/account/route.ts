import { NextResponse } from "next/server";
import { z } from "zod";

import { guardOrigin, jsonError, requireUser } from "@/lib/api-helpers";
import { clearSessionCookie, isSecureRequest, listSessions, verifyPassword } from "@/lib/auth";
import { isAuthEnabled, prisma } from "@/lib/db";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().max(80).nullable(),
});

const deleteSchema = z.object({
  password: z.string().min(1).max(200),
  /** The learner types the word DELETE to confirm. */
  confirmation: z.literal("DELETE"),
});

/** The signed-in account, its sessions and a summary of its stored data. */
export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ user: null, sessions: [], counts: null, accountsEnabled: false });
  }

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const [sessions, details] = await Promise.all([
    listSessions(auth.user.id),
    prisma.user.findUnique({
      where: { id: auth.user.id },
      select: {
        createdAt: true,
        _count: { select: { attempts: true, plans: true, messages: true, cards: true } },
      },
    }),
  ]);

  return NextResponse.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      createdAt: details?.createdAt ?? null,
    },
    sessions,
    counts: details?._count ?? null,
    accountsEnabled: true,
  });
}

/** Update the display name. */
export async function PATCH(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const parsed = patchSchema.safeParse(payload);
  if (!parsed.success) return jsonError("That name is not valid.", 400);

  const name = parsed.data.name?.trim() || null;
  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { name },
    select: { id: true, email: true, name: true },
  });

  return NextResponse.json({ ok: true, user });
}

/**
 * Delete the account and everything attached to it.
 *
 * The password is required so a borrowed session cannot destroy someone's
 * history. Every related row — attempts, reviews, plans, chat, custom cards,
 * bookmarks and sessions — is removed by the cascade on the user relation.
 */
export async function DELETE(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid request body.", 400);
  }

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("Type DELETE to confirm, and enter your password.", 400);
  }

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user) return jsonError("Not signed in.", 401);

  const passwordOk = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!passwordOk) return jsonError("Your password is incorrect.", 403);

  await prisma.user.delete({ where: { id: user.id } });
  clearSessionCookie(isSecureRequest(request));

  return NextResponse.json({ ok: true });
}
