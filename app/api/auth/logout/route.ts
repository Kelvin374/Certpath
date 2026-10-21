import { NextResponse } from "next/server";

import { guardOrigin, jsonError } from "@/lib/api-helpers";
import {
  clearSessionCookie,
  destroySession,
  isSecureRequest,
  readSessionToken,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const originError = guardOrigin(request);
  if (originError) return originError;

  const token = readSessionToken();
  if (!token) return jsonError("Not signed in.", 401);

  await destroySession(token);
  clearSessionCookie(isSecureRequest(request));

  return NextResponse.json({ ok: true });
}
