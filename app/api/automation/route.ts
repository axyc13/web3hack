import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAutomationOverview, updateAutomationSettings } from "@/lib/automation";

export const runtime = "nodejs";

const schema = z.object({
  aiEnabled: z.boolean(),
  autopayEnabled: z.boolean(),
  maxSingleAmountNzd: z.string().min(1),
  dailyLimitAmountNzd: z.string().min(1),
  autoApproveAmountNzd: z.string().min(1),
  recipientScope: z.enum(["saved_only", "any_registered"]),
  allowedChannels: z.array(z.string()).default(["dashboard"]),
});

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(getAutomationOverview(user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load automation settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    return NextResponse.json(updateAutomationSettings(user.id, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update automation settings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
