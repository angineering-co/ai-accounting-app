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

export function trackApplySubmit(path: ApplyFormPath) {
  sendGAEvent("event", "apply_submit", {
    apply_path: path,
    value: APPLY_CONVERSION_VALUE_TWD[path],
    currency: "TWD",
  });
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
