import { ApiError } from "@/lib/api/client";

export interface UiError {
  title: string;
  body?: string;
  retry: boolean;
  requestId?: string;
}

/** Plain-language copy per error code (Frontend guide §7.3, Appendix A). */
export function describeError(e: unknown): UiError {
  if (!(e instanceof ApiError)) {
    return { title: "Something went wrong on our side.", body: "Your details are saved. Try again.", retry: true };
  }
  const base = { requestId: e.requestId };
  switch (e.code) {
    case "VALIDATION_ERROR":
      return { ...base, title: "Some details need another look.", body: "Check the highlighted fields and calculate again.", retry: false };
    case "HS_CODE_NOT_FOUND":
      return { ...base, title: "That product is no longer available.", body: "Choose it again from the list; the product list has been refreshed.", retry: false };
    case "NO_DUTY_RATE":
      return { ...base, title: "There is no duty rate on file for this product yet.", body: "Choose a similar product, or try again later.", retry: false };
    case "FX_UNAVAILABLE":
      return { ...base, title: "Live rates are unavailable right now.", body: "Please try again shortly.", retry: true };
    case "RATE_LIMITED":
      return { ...base, title: "Too many calculations in a short time.", body: "Wait a few seconds, then try again.", retry: false };
    case "NETWORK":
      return { title: "Can't reach PortWise right now.", body: "Check your connection and try again.", retry: true };
    case "TIMEOUT":
      return { title: "The calculation took too long.", body: "Your details are saved. Try again.", retry: true };
    default:
      return { ...base, title: "Something went wrong on our side.", body: "Your details are saved. Try again.", retry: true };
  }
}
