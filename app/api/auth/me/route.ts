import { NextResponse } from "next/server";
import { currentUser, userResponse } from "@/lib/auth";
import { refreshEnsForUser } from "@/lib/ens";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  const refreshedUser = user ? await refreshEnsForUser(user) : null;
  return NextResponse.json(refreshedUser ? userResponse(refreshedUser) : { user: null });
}
