import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, userResponse, verifyPassword } from "@/lib/auth";
import { db, DbUser } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const input = schema.parse(await request.json());
  const user = db()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(input.email.toLowerCase()) as DbUser | undefined;

  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json(userResponse(user));
}
