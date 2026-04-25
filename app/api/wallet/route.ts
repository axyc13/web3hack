import { NextResponse } from "next/server";
import { requireUser, userResponse } from "@/lib/auth";
import { refreshEnsForUser } from "@/lib/ens";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const refreshedUser = await refreshEnsForUser(user);
    return NextResponse.json(userResponse(refreshedUser));
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
