import { sendGAEvent } from "@next/third-parties/google";

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

export function trackApplySubmit(path: "registration" | "bookkeeping") {
  sendGAEvent("event", "apply_submit", {
    apply_path: path,
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
