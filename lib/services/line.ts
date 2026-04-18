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
  postback?: { data: string };
  timestamp: number;
};

type LineTextMessage = {
  type: "text";
  text: string;
};

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

type LineMessage = LineTextMessage | LineFlexMessage;

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

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
// Shared helpers
// ---------------------------------------------------------------------------

function getExpiryThreshold(): string {
  return new Date(
    Date.now() - BINDING_EXPIRY_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

async function checkAlreadyBound(
  supabase: SupabaseAdmin,
  lineUserId: string,
  replyToken?: string,
): Promise<boolean> {
  const { data: account } = await supabase
    .from("line_accounts")
    .select("client_id, binding_confirmed")
    .eq("line_user_id", lineUserId)
    .single();

  if (account?.client_id && account.binding_confirmed) {
    if (replyToken) {
      await replyToLine(replyToken, [
        {
          type: "text",
          text: "您已綁定帳號，如需變更請聯繫您的記帳事務所。",
        },
      ]);
    }
    return true;
  }

  return false;
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

  await supabase.from("line_accounts").upsert(
    { line_user_id: lineUserId, followed_at: new Date().toISOString() },
    { onConflict: "line_user_id", ignoreDuplicates: true },
  );

  switch (event.type) {
    case "follow":
      await handleFollow(supabase, lineUserId, event.replyToken);
      break;
    case "message":
      if (event.message?.type === "text" && event.message.text) {
        await handleTextMessage(
          supabase,
          lineUserId,
          event.message.text,
          event.replyToken,
        );
      }
      break;
    case "postback":
      if (event.postback?.data) {
        await handlePostback(
          supabase,
          lineUserId,
          event.postback.data,
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
  supabase: SupabaseAdmin,
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  const profile = await getLineProfile(lineUserId);
  if (profile?.displayName) {
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
  supabase: SupabaseAdmin,
  lineUserId: string,
  text: string,
  replyToken?: string,
): Promise<void> {
  const trimmed = text.trim();

  const leadCodeMatch = trimmed.match(LEAD_CODE_RE);
  if (leadCodeMatch) {
    await handleLeadCode(supabase, lineUserId, leadCodeMatch[0], replyToken);
    return;
  }

  const bindingCodeMatch = trimmed.match(BINDING_CODE_RE);
  if (bindingCodeMatch) {
    await handleBindingCode(
      supabase,
      lineUserId,
      bindingCodeMatch[0],
      replyToken,
    );
    return;
  }
}

// ---------------------------------------------------------------------------
// Lead code handling
// ---------------------------------------------------------------------------

async function handleLeadCode(
  supabase: SupabaseAdmin,
  lineUserId: string,
  leadCode: string,
  replyToken?: string,
): Promise<void> {
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
// Binding code handling (with expiry check + Flex confirmation)
// ---------------------------------------------------------------------------

async function handleBindingCode(
  supabase: SupabaseAdmin,
  lineUserId: string,
  bindingCode: string,
  replyToken?: string,
): Promise<void> {
  if (await checkAlreadyBound(supabase, lineUserId, replyToken)) return;

  const { data: pendingRow } = await supabase
    .from("line_accounts")
    .select("id, client_id, binding_code_created_at")
    .eq("binding_code", bindingCode)
    .gte("binding_code_created_at", getExpiryThreshold())
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

  const { data: client } = await supabase
    .from("clients")
    .select("name")
    .eq("id", pendingRow.client_id!)
    .single();

  const clientName = client?.name ?? "您的公司";
  const expiryTime = formatExpiryTime(pendingRow.binding_code_created_at!);

  if (replyToken) {
    await replyToLine(replyToken, [
      buildBindingConfirmationFlex(clientName, bindingCode, expiryTime),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Postback handler (Flex Message button taps)
// ---------------------------------------------------------------------------

async function handlePostback(
  supabase: SupabaseAdmin,
  lineUserId: string,
  data: string,
  replyToken?: string,
): Promise<void> {
  const params = new URLSearchParams(data);
  const action = params.get("action");

  switch (action) {
    case "confirm_binding":
      await handleConfirmBinding(
        supabase,
        lineUserId,
        params.get("code"),
        replyToken,
      );
      break;
    case "cancel_binding":
      if (replyToken) {
        await replyToLine(replyToken, [
          { type: "text", text: "已取消綁定。" },
        ]);
      }
      break;
  }
}

async function handleConfirmBinding(
  supabase: SupabaseAdmin,
  lineUserId: string,
  bindingCode: string | null,
  replyToken?: string,
): Promise<void> {
  if (!bindingCode) return;

  if (await checkAlreadyBound(supabase, lineUserId, replyToken)) return;

  const { data: pendingRow } = await supabase
    .from("line_accounts")
    .select("id, client_id")
    .eq("binding_code", bindingCode)
    .is("line_user_id", null)
    .gte("binding_code_created_at", getExpiryThreshold())
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
    return;
  }

  const { data: existingRow } = await supabase
    .from("line_accounts")
    .select("id")
    .eq("line_user_id", lineUserId)
    .single();

  if (existingRow) {
    await Promise.all([
      supabase
        .from("line_accounts")
        .update({
          client_id: pendingRow.client_id,
          binding_code: null,
          binding_confirmed: true,
          linked_at: new Date().toISOString(),
        })
        .eq("line_user_id", lineUserId),
      supabase.from("line_accounts").delete().eq("id", pendingRow.id),
    ]);
  } else {
    await supabase
      .from("line_accounts")
      .update({
        line_user_id: lineUserId,
        binding_code: null,
        binding_confirmed: true,
        linked_at: new Date().toISOString(),
      })
      .eq("id", pendingRow.id);
  }

  if (replyToken) {
    await replyToLine(replyToken, [
      {
        type: "text",
        text: "綁定成功！您將會收到記帳相關的通知訊息。",
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Flex Message builder
// ---------------------------------------------------------------------------

function formatExpiryTime(createdAt: string): string {
  const expiry = new Date(
    new Date(createdAt).getTime() + BINDING_EXPIRY_HOURS * 60 * 60 * 1000,
  );
  return expiry.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildBindingConfirmationFlex(
  clientName: string,
  bindingCode: string,
  expiryTime: string,
): LineFlexMessage {
  return {
    type: "flex",
    altText: `確認綁定【${clientName}】的 LINE 通知服務`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "LINE 綁定確認",
            weight: "bold",
            size: "lg",
            color: "#ffffff",
          },
        ],
        backgroundColor: "#10B981",
        paddingAll: "16px",
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "請確認要綁定以下公司的 LINE 通知服務：",
            size: "sm",
            color: "#888888",
            wrap: true,
          },
          {
            type: "text",
            text: clientName,
            weight: "bold",
            size: "xl",
            color: "#171717",
            wrap: true,
          },
          { type: "separator" },
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "綁定碼",
                size: "sm",
                color: "#888888",
                flex: 2,
              },
              {
                type: "text",
                text: bindingCode,
                size: "sm",
                color: "#171717",
                flex: 5,
              },
            ],
          },
          {
            type: "text",
            text: `有效期限至 ${expiryTime}`,
            size: "xs",
            color: "#aaaaaa",
            margin: "md",
          },
        ],
        paddingAll: "16px",
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#10B981",
            action: {
              type: "postback",
              label: "確認綁定",
              data: `action=confirm_binding&code=${bindingCode}`,
              displayText: "確認綁定",
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "取消",
              data: "action=cancel_binding",
              displayText: "取消綁定",
            },
          },
        ],
        paddingAll: "16px",
      },
    },
  };
}
