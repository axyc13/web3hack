import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, userResponse } from "@/lib/auth";
import { getCurrencyForRegion } from "@/lib/currency";
import { db, DbUser } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(2).max(60),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  regionCode: z.enum(["NZ", "AU", "US", "GB", "EU", "SG", "JP"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const username = input.username.toLowerCase();
    const email = input.email.toLowerCase();
    const preferredCurrency = getCurrencyForRegion(input.regionCode);

    const existingUsername = db()
      .prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?")
      .get(username, user.id);
    if (existingUsername) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    const existingEmail = db()
      .prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND id != ?")
      .get(email, user.id);
    if (existingEmail) {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }

    db()
      .prepare(
        `UPDATE users
         SET name = ?, username = ?, email = ?, region_code = ?, preferred_currency = ?
         WHERE id = ?`,
      )
      .run(input.name, username, email, input.regionCode, preferredCurrency, user.id);

    const updatedUser = db()
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(user.id) as DbUser;

    return NextResponse.json(userResponse(updatedUser));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
