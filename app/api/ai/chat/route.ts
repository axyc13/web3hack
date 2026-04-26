import { NextResponse } from "next/server";
import { z } from "zod";
import { findRecipientUserByUsername } from "@/lib/fiat";
import { findSavedRecipientByAlias, getAutomationOverview, reviewAutomationTransfer } from "@/lib/automation";
import { prepareAppTransfer } from "@/lib/app-transfers";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    }),
  ).min(1).max(16),
  activeWalletAddress: z.string().optional(),
});

type ResponsesOutputItem = {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
};

type TransferProposal = {
  recipientInput: string;
  amountNzd: string;
  fromWalletAddress: string;
  prepared: ReturnType<typeof prepareAppTransfer>;
  review: ReturnType<typeof reviewAutomationTransfer>;
};

type ChatMessageInput = z.infer<typeof schema>["messages"][number];

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 500 },
      );
    }

    const user = await requireUser();
    const input = schema.parse(await request.json());
    const automation = getAutomationOverview(user.id);
    if (!automation.settings.aiEnabled) {
      return NextResponse.json(
        { error: "AI access is turned off. Enable AI access in your profile before using the assistant." },
        { status: 403 },
      );
    }

    if (!automation.settings.allowedChannels.includes("dashboard")) {
      return NextResponse.json(
        { error: "Dashboard chat is not an approved AI channel for this account." },
        { status: 403 },
      );
    }

    const activeWalletAddress =
      input.activeWalletAddress || user.wallet_address || "";

    const tools = [
      {
        type: "function",
        name: "get_account_context",
        description: "Get PocketRail account context, wallet, automation policy, and saved recipients.",
        strict: true,
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        type: "function",
        name: "prepare_transfer",
        description: "Prepare a dNZD transfer proposal for review. Use this before suggesting the user confirm a payment.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "PocketRail username, @username, or saved-recipient nickname hint.",
            },
            amountNzd: {
              type: "string",
              description: "The dNZD amount as a decimal string, for example 25 or 25.50.",
            },
          },
          required: ["recipient", "amountNzd"],
          additionalProperties: false,
        },
      },
    ];

    const instructions = [
      "You are PocketRail AI, an in-app transfer assistant.",
      "Help the user prepare dNZD transfers, but never claim a transfer has been sent.",
      "A transfer is only ready for review until the user confirms it in the PocketRail confirmation UI.",
      "If the user asks to pay someone, use tools to inspect account context and prepare the transfer.",
      "If a recipient is ambiguous or missing, ask a short follow-up question.",
      "If the automation policy would restrict the action, explain the restriction clearly.",
      "Keep answers concise and practical.",
    ].join(" ");

    let conversationInput: unknown[] = input.messages.map(mapChatMessageToResponseInput);
    let transferProposal: TransferProposal | null = null;
    let preparedRecipientUsername = "";
    let finalText = "";

    for (let step = 0; step < 4; step += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          instructions,
          tools,
          input: conversationInput,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage =
          (data && typeof data === "object" && "error" in data && typeof data.error === "object" && data.error && "message" in data.error && typeof data.error.message === "string"
            ? data.error.message
            : "OpenAI request failed.");
        throw new Error(errorMessage);
      }

      finalText =
        typeof data.output_text === "string" && data.output_text.trim()
          ? data.output_text.trim()
          : finalText;

      const outputItems = Array.isArray(data.output) ? (data.output as ResponsesOutputItem[]) : [];
      const functionCalls = outputItems.filter((item) => item.type === "function_call" && item.call_id && item.name);
      if (functionCalls.length === 0) {
        break;
      }

      conversationInput = [...conversationInput, ...outputItems];

      const toolOutputs = functionCalls.map((call) => {
        const args = parseArguments(call.arguments);
        let output: unknown;

        if (call.name === "get_account_context") {
          output = {
            account: {
              name: user.name,
              username: user.username,
              regionCode: user.region_code,
              preferredCurrency: user.preferred_currency,
              walletAddress: user.wallet_address,
              activeWalletAddress,
            },
            automation: automation.settings,
            savedRecipients: automation.recipients.map((recipient) => ({
              id: recipient.id,
              name: recipient.name,
              nickname: recipient.nickname,
              username: recipient.username,
              walletAddress: recipient.walletAddress,
            })),
          };
        } else if (call.name === "prepare_transfer") {
          const recipientInput = typeof args.recipient === "string" ? args.recipient : "";
          const amountNzd = typeof args.amountNzd === "string" ? args.amountNzd : "";
          const savedRecipient = findSavedRecipientByAlias(user.id, recipientInput);
          const resolvedRecipientInput = savedRecipient ? `@${savedRecipient.username}` : recipientInput;
          const resolvedRecipient = findRecipientUserByUsername(resolvedRecipientInput);

          if (!resolvedRecipient) {
            transferProposal = null;
            output = {
              status: "needs_recipient_clarification",
              amountNzd,
              reasons: [
                "I couldn't match that recipient to a PocketRail account. Try a saved nickname or @username.",
              ],
              requiresConfirmation: true,
            };
            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(output),
            };
          }

          const review = reviewAutomationTransfer(user.id, {
            recipientUserId: resolvedRecipient.id,
            amountNzd,
            channel: "dashboard",
          });

          if (!review.allowed) {
            transferProposal = null;
            output = {
              status: "blocked",
              recipient: {
                name: resolvedRecipient.name,
                username: resolvedRecipient.username,
              },
              amountNzd,
              reasons: review.reasons,
              requiresConfirmation: true,
            };
            return {
              type: "function_call_output",
              call_id: call.call_id,
              output: JSON.stringify(output),
            };
          }

          const prepared = prepareAppTransfer(
            user,
            resolvedRecipientInput,
            amountNzd,
          );
          transferProposal = {
            recipientInput: resolvedRecipientInput,
            amountNzd,
            fromWalletAddress: activeWalletAddress || prepared.senderWalletAddress,
            prepared,
            review,
          };
          preparedRecipientUsername = prepared.recipient.username;
          output = {
            status: "ready_for_confirmation",
            recipient: prepared.recipient,
            amountNzd,
            fromWalletAddress: transferProposal.fromWalletAddress,
            recipientWalletAddress: prepared.recipientWalletAddress,
            chainId: prepared.chainId,
            token: prepared.token,
            requiresConfirmation: review.requiresConfirmation,
          };
        } else {
          output = { error: `Unsupported tool: ${call.name}` };
        }

        return {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        };
      });

      conversationInput = [...conversationInput, ...toolOutputs];
    }

    return NextResponse.json({
      message:
        finalText ||
        (preparedRecipientUsername
          ? `I prepared a transfer draft to @${preparedRecipientUsername}. Review it before sending.`
          : "How can I help with your PocketRail transfer?"),
      transferProposal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process AI chat";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseArguments(value?: string) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapChatMessageToResponseInput(message: ChatMessageInput) {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: [{ type: "output_text", text: message.content }],
    };
  }

  return {
    role: "user",
    content: [{ type: "input_text", text: message.content }],
  };
}
