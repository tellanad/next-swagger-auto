import { z } from "zod";
import { defineRoute } from "@/lib/next-swagger-auto";
import { NextRequest, NextResponse } from "next/server";

const RequestSchema = z.object({
  message: z.string().describe("User message"),
  model: z.string().default("standard").describe("Model to use")
});

const ResponseSchema = z.object({
  reply: z.string(),
  tokens: z.number()
});

export const docs = defineRoute({
  method: "post",
  summary: "Send a message",
  description: "Accepts a user message and returns a mock response.",
  request: RequestSchema,
  response: ResponseSchema,
  tags: ["chat"]
});

export async function POST(request: NextRequest) {
  const body = RequestSchema.parse(await request.json());

  return NextResponse.json({
    reply: `You said: ${body.message}`,
    tokens: body.message.length
  });
}
