import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, userResponse } from "@/lib/auth";
import { getCurrencyForRegion } from "@/lib/currency";
import { db, DbUser } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  regionCode: z.enum(["NZ", "AU", "US", "GB", "EU", "SG", "JP"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const preferredCurrency = getCurrencyForRegion(input.regionCode);

    db()
      .prepare(
        `UPDATE users
         SET region_code = ?, preferred_currency = ?
         WHERE id = ?`,
      )
      .run(input.regionCode, preferredCurrency, user.id);

    const updatedUser = db()
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(user.id) as DbUser;

    return NextResponse.json(userResponse(updatedUser));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
