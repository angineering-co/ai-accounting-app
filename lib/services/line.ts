"use server";

import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// LINE API transport types (not domain models)
// ---------------------------------------------------------------------------

type LineEvent = {
  type: string;
  source: { type: string; userId?: string };
  replyToken?: string;
  message?: { type: string; text?: string };
  timestamp: number;
};

type LineMessage = {
  type: "text";
  text: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LINE_API_BASE = "https://api.line.me/v2/bot";
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LEAD_CODE_RE = /SB-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}/;
const BINDING_CODE_RE = /LB-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}/;
const BINDING_EXPIRY_HOURS = 48;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

export function verifyLineSignature(body: string, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("Missing LINE_CHANNEL_SECRET");
  const hash = createHmac("SHA256", secret).update(body).digest("base64");
  return hash === signature;
}

// ---------------------------------------------------------------------------
// LINE API helpers
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
  return token;
}

async function replyToLine(
  replyToken: string,
  messages: LineMessage[],
): Promise<void> {
  await fetch(`${LINE_API_BASE}/message/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

export async function sendLineMessage(
  clientId: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: accounts } = await supabase
    .from("line_accounts")
    .select("line_user_id")
    .eq("client_id", clientId)
    .eq("binding_confirmed", true)
    .not("line_user_id", "is", null);

  if (!accounts || accounts.length === 0) {
    return { success: false, error: "No LINE account linked to this client" };
  }

  const token = getAccessToken();
  const errors: string[] = [];

  for (const account of accounts) {
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: account.line_user_id,
        messages: [{ type: "text", text: message }],
      }),
    });
    if (!res.ok) {
      errors.push(`Failed to send to ${account.line_user_id}: ${res.status}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join("; ") };
  }
  return { success: true };
}

async function getLineProfile(
  lineUserId: string,
): Promise<{ displayName: string } | null> {
  const res = await fetch(`${LINE_API_BASE}/profile/${lineUserId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Binding code generation (Server Action called from admin UI)
// ---------------------------------------------------------------------------

function generateCode(prefix: string): string {
  const segment = () =>
    Array.from(
      { length: 4 },
      () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)],
    ).join("");
  return `${prefix}-${segment()}-${segment()}`;
}

export async function generateBindingCode(
  clientId: string,
): Promise<{ success: boolean; bindingCode?: string; error?: string }> {
  const supabase = createAdminClient();

  const bindingCode = generateCode("LB");

  const { error } = await supabase.from("line_accounts").insert({
    client_id: clientId,
    binding_code: bindingCode,
    binding_code_created_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === "23505") {
      const retryCode = generateCode("LB");
      const { error: retryError } = await supabase
        .from("line_accounts")
        .insert({
          client_id: clientId,
          binding_code: retryCode,
          binding_code_created_at: new Date().toISOString(),
        });
      if (retryError) {
        console.error("Binding code insert retry failed:", retryError);
        return { success: false, error: "產生綁定碼失敗，請稍後再試" };
      }
      return { success: true, bindingCode: retryCode };
    }
    console.error("Binding code insert failed:", error);
    return { success: false, error: "產生綁定碼失敗，請稍後再試" };
  }

  return { success: true, bindingCode };
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

export async function handleLineEvent(event: LineEvent): Promise<void> {
  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const supabase = createAdminClient();

  // Upsert line_user_id on every event for resilience.
  // If the row already exists (by line_user_id), this is a no-op.
  await supabase.from("line_accounts").upsert(
    { line_user_id: lineUserId, followed_at: new Date().toISOString() },
    { onConflict: "line_user_id", ignoreDuplicates: true },
  );

  switch (event.type) {
    case "follow":
      await handleFollow(lineUserId, event.replyToken);
      break;
    case "message":
      if (event.message?.type === "text" && event.message.text) {
        await handleTextMessage(
          lineUserId,
          event.message.text,
          event.replyToken,
        );
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Follow handler
// ---------------------------------------------------------------------------

async function handleFollow(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  const profile = await getLineProfile(lineUserId);
  if (profile?.displayName) {
    const supabase = createAdminClient();
    await supabase
      .from("line_accounts")
      .update({ display_name: profile.displayName })
      .eq("line_user_id", lineUserId);
  }

  if (replyToken) {
    await replyToLine(replyToken, [
      {
        type: "text",
        text: "歡迎加入 SnapBooks 記帳事務所！\n\n如果您有諮詢編號（SB-XXXX-XXXX），請直接傳送給我們。",
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Text message handler
// ---------------------------------------------------------------------------

async function handleTextMessage(
  lineUserId: string,
  text: string,
  replyToken?: string,
): Promise<void> {
  const trimmed = text.trim();

  // Check for "是" confirmation reply
  if (trimmed === "是") {
    await handleBindingConfirmation(lineUserId, replyToken);
    return;
  }

  // Check for lead code (SB-XXXX-XXXX)
  const leadCodeMatch = trimmed.match(LEAD_CODE_RE);
  if (leadCodeMatch) {
    await handleLeadCode(lineUserId, leadCodeMatch[0], replyToken);
    return;
  }

  // Check for binding code (LB-XXXX-XXXX)
  const bindingCodeMatch = trimmed.match(BINDING_CODE_RE);
  if (bindingCodeMatch) {
    await handleBindingCode(lineUserId, bindingCodeMatch[0], replyToken);
    return;
  }
}

// ---------------------------------------------------------------------------
// Lead code handling
// ---------------------------------------------------------------------------

async function handleLeadCode(
  lineUserId: string,
  leadCode: string,
  replyToken?: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("lead_code", leadCode)
    .single();

  if (!lead) {
    if (replyToken) {
      await replyToLine(replyToken, [
        { type: "text", text: "找不到此諮詢編號，請確認後再試。" },
      ]);
    }
    return;
  }

  await supabase
    .from("line_accounts")
    .update({ lead_id: lead.id, linked_at: new Date().toISOString() })
    .eq("line_user_id", lineUserId);

  if (replyToken) {
    await replyToLine(replyToken, [
      {
        type: "text",
        text: `已收到您的諮詢編號 ${leadCode}，我們的專員會盡快與您聯繫！`,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Binding code handling (with expiry check + confirmation)
// ---------------------------------------------------------------------------

async function handleBindingCode(
  lineUserId: string,
  bindingCode: string,
  replyToken?: string,
): Promise<void> {
  const supabase = createAdminClient();

  // Check if user already has a confirmed client binding
  const { data: existingAccount } = await supabase
    .from("line_accounts")
    .select("client_id, binding_confirmed")
    .eq("line_user_id", lineUserId)
    .single();

  if (existingAccount?.client_id && existingAccount.binding_confirmed) {
    if (replyToken) {
      await replyToLine(replyToken, [
        {
          type: "text",
          text: "您已綁定帳號，如需變更請聯繫您的記帳事務所。",
        },
      ]);
    }
    return;
  }

  // Look up the pending binding code row with expiry check
  const expiryThreshold = new Date(
    Date.now() - BINDING_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: pendingRow } = await supabase
    .from("line_accounts")
    .select("id, client_id")
    .eq("binding_code", bindingCode)
    .gte("binding_code_created_at", expiryThreshold)
    .single();

  if (!pendingRow) {
    if (replyToken) {
      await replyToLine(replyToken, [
        {
          type: "text",
          text: "此綁定碼無效或已過期，請聯繫您的記帳事務所取得新的綁定碼。",
        },
      ]);
    }
    return;
  }

  // Fetch client name for the confirmation message
  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", pendingRow.client_id!)
    .single();

  const clientName = client?.name ?? "您的公司";

  // Store the pending binding info on the user's row for confirmation
  await supabase
    .from("line_accounts")
    .update({
      binding_code: bindingCode,
      binding_confirmed: false,
    })
    .eq("line_user_id", lineUserId);

  if (replyToken) {
    await replyToLine(replyToken, [
      {
        type: "text",
        text: `確認綁定【${clientName}】的 LINE 通知服務？回覆「是」確認。`,
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Binding confirmation ("是" reply)
// ---------------------------------------------------------------------------

async function handleBindingConfirmation(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  const supabase = createAdminClient();

  // Find the user's row with a pending (unconfirmed) binding code
  const { data: userRow } = await supabase
    .from("line_accounts")
    .select("id, binding_code, binding_confirmed")
    .eq("line_user_id", lineUserId)
    .not("binding_code", "is", null)
    .eq("binding_confirmed", false)
    .single();

  if (!userRow || !userRow.binding_code) {
    // No pending binding — ignore the "是" as a regular message
    return;
  }

  // Look up the original pending row by binding code (with expiry check)
  const expiryThreshold = new Date(
    Date.now() - BINDING_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: pendingRow } = await supabase
    .from("line_accounts")
    .select("id, client_id")
    .eq("binding_code", userRow.binding_code)
    .is("line_user_id", null)
    .gte("binding_code_created_at", expiryThreshold)
    .single();

  if (!pendingRow) {
    if (replyToken) {
      await replyToLine(replyToken, [
        {
          type: "text",
          text: "綁定碼已過期，請聯繫您的記帳事務所取得新的綁定碼。",
        },
      ]);
    }
    // Clear the stale binding code from user's row
    await supabase
      .from("line_accounts")
      .update({ binding_code: null })
      .eq("id", userRow.id);
    return;
  }

  // Merge: set client_id on the user's existing row, delete the pending row
  await supabase
    .from("line_accounts")
    .update({
      client_id: pendingRow.client_id,
      binding_code: null,
      binding_confirmed: true,
      linked_at: new Date().toISOString(),
    })
    .eq("id", userRow.id);

  await supabase.from("line_accounts").delete().eq("id", pendingRow.id);

  if (replyToken) {
    await replyToLine(replyToken, [
      {
        type: "text",
        text: "綁定成功！您將會收到記帳相關的通知訊息。",
      },
    ]);
  }
}
