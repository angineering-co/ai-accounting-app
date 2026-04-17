import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, handleLineEvent } from "@/lib/services/line";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!signature || !verifyLineSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(body);

  for (const event of parsed.events ?? []) {
    await handleLineEvent(event);
  }

  return NextResponse.json({ ok: true });
}
