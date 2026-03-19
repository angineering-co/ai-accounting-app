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
