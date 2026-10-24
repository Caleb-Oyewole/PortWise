import { ApiError } from "@/lib/api/client";

export interface UiError {
  title: string;
  body?: string;
  retry: boolean;
}

/** Strips the API's "Item 2: " prefix; the form highlights the product instead. */
const clean = (detail: string) => detail.replace(/^Item \d+:\s*/, "");

/** Plain-language copy per error code. Business-rule details from the API are already plain English. */
export function describeError(e: unknown): UiError {
  if (!(e instanceof ApiError)) {
    return { title: "Something went wrong on our side.", body: "Your details are saved. Try again.", retry: true };
  }
  switch (e.code) {
    case "VALIDATION_ERROR":
      return { title: "Some details need another look.", body: "Check the highlighted fields and calculate again.", retry: false };
    case "prohibited_item":
      return { title: "This product can't be imported from there.", body: clean(e.message), retry: false };
    case "unsupported_goods":
      return { title: "PortWise can't estimate this product yet.", body: clean(e.message), retry: false };
    case "unknown_hs_code":
      return { title: "That product is not in the tariff data.", body: "Choose it again from the list; the list has been refreshed.", retry: false };
    case "no_tariff_in_force":
      return { title: "There is no duty rate in force for this product today.", body: clean(e.message), retry: false };
    case "unsupported_currency":
      return { title: "There is no exchange rate for that currency.", body: clean(e.message), retry: false };
    case "RATE_LIMITED":
      return { title: "Too many calculations in a short time.", body: "Wait a few seconds, then try again.", retry: false };
    case "WAKING":
      return { title: "The calculator server is still starting.", body: "Give it a few more seconds and try again.", retry: true };
    case "NETWORK":
      return { title: "Can't reach PortWise right now.", body: "Check your connection and try again.", retry: true };
    case "TIMEOUT":
      return { title: "The calculation took too long.", body: "Your details are saved. Try again.", retry: true };
    default:
      return { title: "Something went wrong on our side.", body: "Your details are saved. Try again.", retry: true };
  }
}
