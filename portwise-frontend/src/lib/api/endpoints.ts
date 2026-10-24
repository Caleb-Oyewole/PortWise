import { http } from "./client";
import {
  CalcResponse,
  FxListResponse,
  HsCodesResponse,
  PresetsResponse,
  RegimeConfig,
  type CalcRequest,
} from "./schemas";

export const calculate = (req: CalcRequest, signal?: AbortSignal) =>
  http("/api/v1/calculate/multi", CalcResponse, { method: "POST", body: JSON.stringify(req), signal });

export const getHsCodes = () => http("/api/v1/hs-codes", HsCodesResponse);

export const getFxRates = () => http("/api/v1/fx", FxListResponse);

export const getPresets = () => http("/api/v1/presets", PresetsResponse);

export const getRegimeConfig = () => http("/api/v1/config/regime", RegimeConfig);
