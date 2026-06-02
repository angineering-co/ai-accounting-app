import { sendGAEvent } from "@next/third-parties/google";
import type { ApplyFormPath } from "@/lib/actions/apply";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackCtaClick(location: string) {
  sendGAEvent("event", "cta_click", {
    cta_location: location,
    cta_type: "early_adopter_form",
  });
}

// Entry points that link to our LINE OA. A closed union (rather than a free
// string) so a typo in a conversion-critical key fails the build instead of
// silently splitting the Google Ads signal.
export type LineJoinLocation =
  | "floating"
  | "apply_success"
  | "apply_faq"
  | "blog_cta"
  | "coupon";

// Fired whenever a visitor clicks through to join our LINE OA, from any entry
// point. This is the attributable, browser-side signal Google Ads optimizes
// toward: the click carries the gclid, whereas the downstream LINE
// follow/first-message does not.
export function trackLineJoinClick(location: LineJoinLocation) {
  sendGAEvent("event", "line_join_click", {
    line_location: location,
  });
}

export function trackPricingInteraction(action: string, detail?: string) {
  sendGAEvent("event", "pricing_interaction", {
    action,
    detail,
  });
}

export function trackAssessmentStart() {
  sendGAEvent("event", "assessment_start", {});
}

export function trackAssessmentStep(step: number) {
  sendGAEvent("event", "assessment_step", { step });
}

export function trackAssessmentComplete() {
  sendGAEvent("event", "assessment_complete", {});
}

// Estimated first-year revenue per lead path, used as the conversion value
// for Google Ads bidding. Tune as real conversion data accumulates.
//   registration: 商行 setup (NT$6,500) + first-year annual bookkeeping (NT$15,120)
//   bookkeeping:  first-year annual bookkeeping (NT$15,120)
const APPLY_CONVERSION_VALUE_TWD: Record<ApplyFormPath, number> = {
  registration: 21620,
  bookkeeping: 15120,
};

export function trackApplySubmit(path: ApplyFormPath, leadCode: string) {
  const value = APPLY_CONVERSION_VALUE_TWD[path];

  sendGAEvent("event", "apply_submit", {
    apply_path: path,
    value,
    currency: "TWD",
  });

  // Meta Pixel Lead event. eventID matches the lead code so a future
  // Conversions API server-side call can dedupe against this client event.
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq(
      "track",
      "Lead",
      { value, currency: "TWD", content_category: path },
      { eventID: leadCode },
    );
  }
}

export function trackCouponGeneration(location: string, code: string) {
  sendGAEvent("event", "coupon_generated", {
    coupon_location: location,
    coupon_code: code,
    coupon_type: "incorporation_discount",
  });
}

export function trackCouponCopy(location: string, code: string) {
  sendGAEvent("event", "coupon_code_copied", {
    coupon_code: code,
    coupon_location: location,
  });
}

export function trackCouponLineClick(location: string, code: string) {
  sendGAEvent("event", "coupon_line_clicked", {
    coupon_code: code,
    coupon_location: location,
  });
}
