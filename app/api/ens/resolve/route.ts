import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveEnsAddress } from "@/lib/ens";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const address = await resolveEnsAddress(input.name);
    if (!address) {
      return NextResponse.json(
        { error: "Could not resolve that ENS name to an address." },
        { status: 404 },
      );
    }
    return NextResponse.json({ address });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve ENS";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
