import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { PencilLine, Share2 } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { useCalculate, useCatalog, usePresets } from "@/lib/api/hooks";
import type { CalcRequest, CalcResponse, Preset } from "@/lib/api/schemas";
import { decodeItems, shareUrl, writeUrl } from "@/lib/url-state";
import { Alert, Button } from "@/components/ui/primitives";
import { Toast, useToast } from "@/components/ui/Toast";
import { usePageTitle } from "@/components/usePageTitle";
import { Docket, type DocketState } from "@/features/results/Docket";
import { copyText, summaryText } from "@/features/results/share";
import { CalculatorForm } from "./CalculatorForm";
import { describeError, type UiError } from "./errors";
import { apiFieldToFormPath, emptyItem, fromRequest, makeFormSchema, toRequest, type FormValues } from "./form-model";
import { PresetChips } from "./PresetChips";

type Source = "submit" | "preset" | "restore" | "live" | "retry";
const keyOf = (r: CalcRequest) => JSON.stringify(r);

export function CalculatorPage() {
  usePageTitle(null);
  const catalog = useCatalog();
  const presets = usePresets();
  const calc = useCalculate();
  const reduce = useReducedMotion();
  const toast = useToast();

  const hsRef = useRef(catalog.hsById);
  hsRef.current = catalog.hsById;

  const form = useForm<FormValues>({
    defaultValues: { items: [emptyItem()] },
    mode: "onTouched",
    resolver: ((values, ctx, opts) =>
      zodResolver(makeFormSchema(hsRef.current))(values, ctx, opts as never)) as Resolver<FormValues>,
  });

  const [result, setResult] = useState<{ res: CalcResponse; req: CalcRequest } | null>(null);
  const [pending, setPending] = useState<Source | null>(null);
  const [slow, setSlow] = useState(false);
  const [uiError, setUiError] = useState<UiError | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [revealKey, setRevealKey] = useState(0);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const lastKey = useRef<string | null>(null);
  const lastReq = useRef<CalcRequest | null>(null);
  const hasResult = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formWrap = useRef<HTMLDivElement>(null);

  const revealResult = useCallback(() => {
    requestAnimationFrame(() => {
      const h = headingRef.current;
      if (!h) return;
      h.focus({ preventScroll: true });
      const top = h.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) {
        h.closest("[data-docket]")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }
    });
  }, [reduce]);

  const run = useCallback(
    async (req: CalcRequest, source: Source) => {
      const id = ++seq.current;
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      lastKey.current = keyOf(req);
      lastReq.current = req;
      setPending(source);
      setSlow(false);
      if (source !== "live") setUiError(null);
      const slowTimer = setTimeout(() => id === seq.current && setSlow(true), 4000);

      try {
        const res = await calc.mutateAsync({ req, signal: ctrl.signal });
        if (id !== seq.current) return;
        setResult({ res, req });
        hasResult.current = true;
        setUiError(null);
        writeUrl(req);
        if (source !== "live") setRevealKey((k) => k + 1);
        if (source === "submit" || source === "preset" || source === "retry") revealResult();
      } catch (e) {
        if (id !== seq.current) return;
        if (e instanceof ApiError && e.code === "ABORTED") return;
        if (e instanceof ApiError) {
          if (e.code === "VALIDATION_ERROR" && e.fields) {
            let first = true;
            for (const [path, message] of Object.entries(e.fields)) {
              const formPath = apiFieldToFormPath(path);
              if (formPath) {
                form.setError(formPath, { type: "server", message }, { shouldFocus: first });
                first = false;
              }
            }
          }
          if (e.code === "HS_CODE_NOT_FOUND") catalog.refetch();
          if (e.code === "RATE_LIMITED") {
            setCooldown(true);
            setTimeout(() => setCooldown(false), 5000);
          }
        }
        setUiError(describeError(e));
      } finally {
        clearTimeout(slowTimer);
        if (id === seq.current) {
          setPending(null);
          setSlow(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revealResult],
  );

  const submit = form.handleSubmit((values) => {
    setActivePreset(null);
    void run(toRequest(values, hsRef.current), hasResult.current ? "retry" : "submit");
  });

  const pickPreset = (p: Preset) => {
    const req: CalcRequest = { items: p.items };
    form.reset(fromRequest(req));
    setActivePreset(p.id);
    void run(req, "preset");
  };

  // A shared link restores the exact goods and calculates on open.
  useEffect(() => {
    const req = decodeItems(location.search);
    if (req) {
      form.reset(fromRequest(req));
      void run(req, "restore");
    }
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live recalculation: after the first result, valid edits update the total (debounced).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = form.watch(() => {
      if (!hasResult.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const values = form.getValues();
        if (!makeFormSchema(hsRef.current).safeParse(values).success) return;
        const req = toRequest(values, hsRef.current);
        if (keyOf(req) === lastKey.current) return;
        setActivePreset(null);
        void run(req, "live");
      }, 400);
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [form, run]);

  const docketState: DocketState = result
    ? { kind: "result", ...result, updating: pending !== null, slow }
    : pending
      ? { kind: "loading", slow }
      : { kind: "idle", error: uiError ?? undefined };

  const alert = uiError ? (
    <Alert
      tone="error"
      title={uiError.title}
      action={
        uiError.retry ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 bg-white"
            onClick={() => lastReq.current && run(lastReq.current, "retry")}
          >
            Try again
          </Button>
        ) : undefined
      }
    >
      {uiError.body}
      {uiError.requestId && <span className="mt-1 block text-xs opacity-75">Reference: {uiError.requestId}</span>}
    </Alert>
  ) : undefined;

  const share = async () => {
    if (!result) return;
    const url = shareUrl(result.req);
    const text = summaryText(result.res, result.req, url);
    if (navigator.share) {
      try {
        await navigator.share({ title: "PortWise estimate", text });
        return;
      } catch (e) {
        if ((e as DOMException).name === "AbortError") return;
      }
    }
    toast.show((await copyText(text)) ? "Summary copied" : "Copy failed. Select the text and copy it manually.");
  };

  return (
    <>
      <div className="relative">
        <div data-hero-band aria-hidden="true" className="absolute inset-x-0 top-0 h-[430px] bg-pw-navy sm:h-[400px] lg:h-[500px]" />
        <div
          data-workspace
          className="relative mx-auto grid max-w-[1120px] grid-cols-1 gap-x-8 px-4 sm:px-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:px-8"
        >
          <div className="pb-8 pt-8 sm:pt-12 lg:col-span-5 lg:pb-10 lg:pt-14">
            <h1 className="max-w-[16ch] font-display text-display-sm font-bold tracking-[-0.02em] text-white sm:text-display">
              Know your true import cost before you ship.
            </h1>
            <p className="mt-4 max-w-[44ch] text-[17px] leading-7 text-pw-on-navy">
              Customs duty, levies and VAT on your goods, converted at today's rate and itemized in naira.
            </p>
            <div className="mt-7">
              <PresetChips
                presets={presets.data}
                loading={presets.isLoading}
                catalog={catalog}
                activeId={activePreset}
                onPick={pickPreset}
              />
            </div>
          </div>

          <div ref={formWrap} className="lg:col-span-5 lg:col-start-1 lg:row-start-2">
            <div className="lg:sticky lg:top-6">
              <CalculatorForm
                form={form}
                catalog={catalog}
                onSubmit={submit}
                pending={pending !== null && pending !== "live"}
                cooldown={cooldown}
                alert={alert}
                hasResult={!!result}
              />
            </div>
          </div>

          <div className="mt-6 scroll-mt-4 lg:col-span-7 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:mt-14">
            <Docket ref={headingRef} state={docketState} revealKey={revealKey} onCopied={toast.show} />
          </div>
        </div>
      </div>

      {result && (
        <div className="no-print h-20 lg:hidden" aria-hidden="true" />
      )}
      {result && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-pw-border bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[560px] gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                formWrap.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                formWrap.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
              }}
            >
              <PencilLine className="size-4" aria-hidden="true" /> Edit goods
            </Button>
            <Button className="flex-[1.4] bg-pw-green hover:bg-[#066b42] active:bg-[#055a37]" onClick={share}>
              <Share2 className="size-4" aria-hidden="true" /> Share estimate
            </Button>
          </div>
        </div>
      )}
      <Toast message={toast.message} />
    </>
  );
}
