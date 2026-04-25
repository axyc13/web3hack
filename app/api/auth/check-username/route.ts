import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      error: "Use 3-24 letters, numbers, or underscores.",
    });
  }

  const username = parsed.data.username.toLowerCase();
  const existing = db()
    .prepare("SELECT id FROM users WHERE lower(username) = lower(?)")
    .get(username);

  return NextResponse.json({
    available: !existing,
    username,
    error: existing ? "That username is already taken." : null,
  });
}
