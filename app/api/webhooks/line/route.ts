import { NextRequest, NextResponse } from "next/server";
import { verifyLineSignature, handleLineEvent } from "@/lib/services/line";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");

  if (!signature || !(await verifyLineSignature(body, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed: { events?: unknown[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  for (const event of parsed.events ?? []) {
    await handleLineEvent(event as Parameters<typeof handleLineEvent>[0]);
  }

  return NextResponse.json({ ok: true });
}
