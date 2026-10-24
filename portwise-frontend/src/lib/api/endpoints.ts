import { http } from "./client";
import {
  CalcResponse,
  CategoriesResponse,
  FxResponse,
  HsCodesResponse,
  PresetsResponse,
  type CalcRequest,
  type Currency,
} from "./schemas";

export const calculate = (req: CalcRequest, signal?: AbortSignal) =>
  http("/calculate", CalcResponse, { method: "POST", body: JSON.stringify(req), signal });

export const getCategories = () => http("/categories", CategoriesResponse);

export const getHsCodes = () => http("/hs-codes?limit=500", HsCodesResponse);

export const getFx = (from: Exclude<Currency, "NGN">) =>
  http(`/fx?from=${encodeURIComponent(from)}`, FxResponse);

export const getPresets = () => http("/presets", PresetsResponse);
