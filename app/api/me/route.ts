import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/db";
import { loadState, saveState } from "@/lib/state-io";
import { stateSchema } from "@/lib/state-schema";

export const runtime = "nodejs";

/**
 * The user's stored study state.
 *
 * GET  → the account's saved state (used to restore progress on sign-in).
 * PUT  → replace the account's saved state (used by the sync engine).
 */

export async function GET() {
  if (!isAuthEnabled()) {
    return NextResponse.json({ user: null, state: null, accountsEnabled: false });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, state: null, accountsEnabled: true }, { status: 401 });
  }

  const state = await loadState(user.id);
  return NextResponse.json({ user, state, accountsEnabled: true });
}

export async function PUT(request: Request) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: "Accounts are disabled." }, { status: 503 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = stateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid state payload." },
      { status: 400 },
    );
  }

  await saveState(user.id, parsed.data);
  return NextResponse.json({ ok: true, savedAt: Date.now() });
}
