import { sendGAEvent } from "@next/third-parties/google";
import type { ApplyFormPath } from "@/lib/actions/apply";

export function trackCtaClick(location: string) {
  sendGAEvent("event", "cta_click", {
    cta_location: location,
    cta_type: "early_adopter_form",
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

// Full send_to string for the Google Ads "apply submit" conversion action,
// in the form "AW-XXXXXXXXXX/AbCdEfGhIj1234". Sourced from the conversion
// action page in Google Ads. When unset, the Ads conversion is skipped and
// only the GA4 event fires.
const GOOGLE_ADS_APPLY_SEND_TO =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_APPLY_SEND_TO;

export function trackApplySubmit(path: ApplyFormPath) {
  const value = APPLY_CONVERSION_VALUE_TWD[path];
  sendGAEvent("event", "apply_submit", {
    apply_path: path,
    value,
    currency: "TWD",
  });
  if (GOOGLE_ADS_APPLY_SEND_TO) {
    sendGAEvent("event", "conversion", {
      send_to: GOOGLE_ADS_APPLY_SEND_TO,
      value,
      currency: "TWD",
      transaction_id: `apply_${Date.now()}_${path}`,
    });
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
