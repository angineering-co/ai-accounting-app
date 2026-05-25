import crypto from "node:crypto";

import type { ApplyFormPath } from "@/lib/actions/apply";

const APPLY_CONVERSION_VALUE_TWD: Record<ApplyFormPath, number> = {
  registration: 21620,
  bookkeeping: 15120,
};

export interface ServerLeadInput {
  path: ApplyFormPath;
  leadCode: string;
  email: string;
  phone: string;
  clientIp?: string;
  userAgent?: string;
  gaClientId?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
}

/**
 * Fire Meta CAPI + GA4 Measurement Protocol Lead/apply_submit events from
 * the server. Recovers attribution for users whose browser-side Pixel or
 * gtag was blocked. Runs both in parallel; one failing does not block the
 * other. Never throws.
 */
export async function trackLeadServerSide(
  input: ServerLeadInput,
): Promise<void> {
  await Promise.allSettled([sendMetaCapi(input), sendGa4Mp(input)]);
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Taiwan phone (0912345678 / 02-2712-3456) → E.164-without-plus (886...).
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("886")) return digits;
  if (digits.startsWith("0")) return "886" + digits.slice(1);
  return digits;
}

async function sendMetaCapi(input: ServerLeadInput): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return;

  const value = APPLY_CONVERSION_VALUE_TWD[input.path];
  const userData: Record<string, unknown> = {
    em: [sha256(normalizeEmail(input.email))],
    ph: [sha256(normalizePhone(input.phone))],
  };
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;

  const body = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        // Mirrors the client-side fbq eventID; Meta dedupes Pixel+CAPI
        // events sharing the same event_id within a 7-day window.
        event_id: input.leadCode,
        action_source: "website",
        event_source_url: input.eventSourceUrl,
        user_data: userData,
        custom_data: {
          currency: "TWD",
          value,
          content_category: input.path,
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[meta-capi] non-OK", res.status, text);
    }
  } catch (err) {
    console.error("[meta-capi] error", err);
  }
}

async function sendGa4Mp(input: ServerLeadInput): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  const apiSecret = process.env.GA4_MP_API_SECRET;
  if (!measurementId || !apiSecret) return;

  const value = APPLY_CONVERSION_VALUE_TWD[input.path];
  // Reuse the browser GA4 client_id when available so the server event
  // stitches to the same session. When the _ga cookie is absent (blocker,
  // first server-only visit) we fall back to a stable per-lead id so the
  // same submission cannot be counted twice on retry.
  const clientId = input.gaClientId ?? `lead.${input.leadCode}`;

  const body = {
    client_id: clientId,
    user_data: {
      sha256_email_address: sha256(normalizeEmail(input.email)),
      sha256_phone_number: sha256(normalizePhone(input.phone)),
    },
    events: [
      {
        name: "apply_submit",
        params: {
          apply_path: input.path,
          value,
          currency: "TWD",
          engagement_time_msec: 1,
          event_id: input.leadCode,
        },
      },
    ],
  };

  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[ga4-mp] non-OK", res.status, text);
    }
  } catch (err) {
    console.error("[ga4-mp] error", err);
  }
}

/** Parse `_ga` cookie ("GA1.1.123.456") into the GA4 client_id ("123.456"). */
export function parseGaClientId(
  cookie: string | undefined,
): string | undefined {
  if (!cookie) return undefined;
  const parts = cookie.split(".");
  if (parts.length < 4) return undefined;
  return `${parts[2]}.${parts[3]}`;
}
