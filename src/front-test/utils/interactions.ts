import { Page, type Locator } from "@playwright/test";
import {
  isSerializableLocatorInput,
  learnFromLocator,
  tryHeal,
  type LocatorInputForHealing,
} from "./autoHealing";

/* ================================
   Tipos y adaptador de selectores
   ================================ */

type AriaRole = Parameters<Page['getByRole']>[0];

type ByRole = { role: AriaRole; name?: string | RegExp; exact?: boolean };
type ByTestId = { testId: string };
type ByPlaceholder = { placeholder: string };
type ByLabel = { label: string | RegExp };
type ByText = { text: string | RegExp };
type ByCss = { css: string };
type ByXPath = { xpath: string };
type ByLocator = { locator: Locator };

export type LocatorInput =
  | ByRole
  | ByTestId
  | ByPlaceholder
  | ByLabel
  | ByText
  | ByCss
  | ByXPath
  | ByLocator;

const toLocator = (page: Page, sel: LocatorInput): Locator => {
  if ("locator" in sel) return sel.locator;
  if ("role" in sel) return page.getByRole(sel.role, { name: sel.name, exact: sel.exact });
  if ("testId" in sel) return page.getByTestId(sel.testId);
  if ("placeholder" in sel) return page.getByPlaceholder(sel.placeholder);
  if ("label" in sel) return page.getByLabel(sel.label);
  if ("text" in sel) return page.getByText(sel.text);
  if ("css" in sel) return page.locator(sel.css);
  if ("xpath" in sel) return page.locator(`xpath=${sel.xpath}`);
  throw new Error("Selector inválido");
};

/* ================================
   Auto-healing wrapper
   ================================ */

const asHealingInput = (input: LocatorInput): LocatorInputForHealing | null => {
  return isSerializableLocatorInput(input) ? (input as LocatorInputForHealing) : null;
};

const runWithHealing = async <T>(
  page: Page,
  input: LocatorInput,
  actionName: string,
  baseTimeoutMs: number,
  actionFn: (loc: Locator, timeoutMs: number) => Promise<T>
): Promise<{ value: T; locator: Locator; healed: boolean }> => {
  const loc = toLocator(page, input);
  const healingInput = asHealingInput(input);

  try {
    const value = await actionFn(loc, baseTimeoutMs);
    if (healingInput) await learnFromLocator(page, healingInput, loc);
    return { value, locator: loc, healed: false };
  } catch (err) {
    if (!healingInput) throw err;

    const healed = await tryHeal(page, healingInput, actionName, actionFn, baseTimeoutMs, err);
    if (healed.healed) {
      // Learn from the locator that worked (so we continuously refine candidates)
      await learnFromLocator(page, healingInput, healed.locator);
      return { value: healed.value, locator: healed.locator, healed: true };
    }
    throw err;
  }
};

/* ===================================================
   FUNCIONES CON NOMBRES ORIGINALES (no rompe nada)
   =================================================== */

/** Ej: getByPlaceholderAndFillIt(page, "Email", "user@test.com") */
export const getByPlaceholderAndFillIt = async (
  page: Page,
  placeholder: string,
  value: string,
  opts?: { timeout?: number; clear?: boolean }
) => {
  const { timeout = 5000, clear = true } = opts ?? {};
  const res = await runWithHealing(
    page,
    { placeholder },
    "fillByPlaceholder",
    timeout,
    async (loc, t) => {
      await loc.waitFor({ state: "visible", timeout: t });
      if (clear) await loc.fill("");
      await loc.fill(value, { timeout: t });
      return loc;
    }
  );
  return res.locator; // devuelvo el Locator por si lo necesitan
};

/** Ej: getElementByRole(page, "button", "Guardar") */
export const getElementByRole = (
  page: Page,
  role: AriaRole,
  name?: string | RegExp,
  exact?: boolean
) => page.getByRole(role, { name, exact });

/** Ej: getElementByRoleAndClickIt(page, "button", "Guardar") */
export const getElementByRoleAndClickIt = async (
  page: Page,
  role: AriaRole,
  name?: string | RegExp,
  opts?: { exact?: boolean; timeout?: number; force?: boolean; clickDelayMs?: number }
) => {
  const { exact, timeout = 8000, force = false, clickDelayMs } = opts ?? {};
  const res = await runWithHealing(
    page,
    { role, name, exact },
    "clickByRole",
    timeout,
    async (loc, t) => {
      await loc.waitFor({ state: "visible", timeout: t });
      if (clickDelayMs) await page.waitForTimeout(clickDelayMs);
      await loc.click({ timeout: t, force });
      return loc;
    }
  );
  return res.locator;
};

/** Ej: findLocator(page, { css: "#user" }) o findLocator(page, { role: "button", name: "Guardar" }) */
export const findLocator = (page: Page, input: LocatorInput) => toLocator(page, input);

/* =========================================
   Helpers extra (opcionales, nombres nuevos)
   ========================================= */

export const click = async (
  page: Page,
  input: LocatorInput,
  opts?: { timeout?: number; force?: boolean; delayMs?: number; waitForVisible?: boolean }
) => {
  const { timeout = 8000, force = false, delayMs, waitForVisible = true } = opts ?? {};
  const res = await runWithHealing(page, input, "click", timeout, async (loc, t) => {
    if (waitForVisible) await loc.waitFor({ state: "visible", timeout: t });
    if (delayMs) await page.waitForTimeout(delayMs);
    await loc.click({ timeout: t, force });
    return loc;
  });
  return res.locator;
};

export const fill = async (
  page: Page,
  input: LocatorInput,
  value: string,
  opts?: { timeout?: number; clear?: boolean; delayMs?: number }
) => {
  const { timeout = 8000, clear = true, delayMs } = opts ?? {};
  const res = await runWithHealing(page, input, "fill", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    if (clear) await loc.fill("");
    if (delayMs) await page.waitForTimeout(delayMs);
    await loc.fill(value, { timeout: t });
    return loc;
  });
  return res.locator;
};

export const selectByLabel = async (
  page: Page,
  label: string | RegExp,
  option: string | RegExp
) => {
  const timeout = 8000;
  const res = await runWithHealing(page, { label }, "selectByLabel", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    await loc.selectOption({ label: String(option) });
    return loc;
  });
  return res.locator;
};

export const selectOption = async (
  page: Page,
  input: LocatorInput,
  option: string | RegExp | { label?: string; value?: string; index?: number }
) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "selectOption", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    if (typeof option === "string" || option instanceof RegExp) {
      await loc.selectOption({ label: String(option) });
    } else {
      await loc.selectOption(option as any);
    }
    return loc;
  });
  return res.locator;
};

export const press = async (
  page: Page,
  input: LocatorInput,
  key: string,
  opts?: { timeout?: number; delayMs?: number }
) => {
  const { timeout = 8000, delayMs } = opts ?? {};
  const res = await runWithHealing(page, input, "press", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    if (delayMs) await page.waitForTimeout(delayMs);
    await loc.press(key, { timeout: t });
    return loc;
  });
  return res.locator;
};

export const typeSlow = async (
  page: Page,
  input: LocatorInput,
  text: string,
  delayPerCharMs = 50
) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "type", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    await loc.type(text, { delay: delayPerCharMs, timeout: t });
    return loc;
  });
  return res.locator;
};

export const check = async (page: Page, input: LocatorInput) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "check", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    await loc.check({ timeout: t });
    return loc;
  });
  return res.locator;
};

export const uncheck = async (page: Page, input: LocatorInput) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "uncheck", timeout, async (loc, t) => {
    await loc.waitFor({ state: "visible", timeout: t });
    await loc.uncheck({ timeout: t });
    return loc;
  });
  return res.locator;
};

export const hover = async (page: Page, input: LocatorInput) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "hover", timeout, async (loc, t) => {
    await loc.hover({ timeout: t });
    return loc;
  });
  return res.locator;
};

export const scrollIntoView = async (page: Page, input: LocatorInput) => {
  const timeout = 8000;
  const res = await runWithHealing(page, input, "scrollIntoView", timeout, async (loc, t) => {
    await loc.scrollIntoViewIfNeeded({ timeout: t });
    return loc;
  });
  return res.locator;
};

/** Espera una respuesta OK de una URL (útil para esperar APIs antes de validar UI) */
export const waitForApiOk = async (
  page: Page,
  urlOrRe: string | RegExp,
  status = 200,
  timeout = 10000
) => {
  return page.waitForResponse(
    r => (typeof urlOrRe === "string" ? r.url().includes(urlOrRe) : urlOrRe.test(r.url())) && r.status() === status,
    { timeout }
  );
};
