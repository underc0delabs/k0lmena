import { Page, type Locator } from "@playwright/test";

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
  const input = page.getByPlaceholder(placeholder);
  await input.waitFor({ state: "visible", timeout });
  if (clear) await input.fill(""); // aseguro limpiar
  await input.fill(value, { timeout });
  return input; // devuelvo el Locator por si lo necesitan
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
  const btn = page.getByRole(role, { name, exact });
  await btn.waitFor({ state: "visible", timeout });
  if (clickDelayMs) await page.waitForTimeout(clickDelayMs);
  await btn.click({ timeout, force });
  return btn;
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
  const el = toLocator(page, input);
  if (waitForVisible) await el.waitFor({ state: "visible", timeout });
  if (delayMs) await page.waitForTimeout(delayMs);
  await el.click({ timeout, force });
  return el;
};

export const fill = async (
  page: Page,
  input: LocatorInput,
  value: string,
  opts?: { timeout?: number; clear?: boolean; delayMs?: number }
) => {
  const { timeout = 8000, clear = true, delayMs } = opts ?? {};
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible", timeout });
  if (clear) await el.fill("");
  if (delayMs) await page.waitForTimeout(delayMs);
  await el.fill(value, { timeout });
  return el;
};

export const selectByLabel = async (
  page: Page,
  label: string | RegExp,
  option: string | RegExp
) => {
  const el = page.getByLabel(label);
  await el.waitFor({ state: "visible" });
  await el.selectOption({ label: String(option) });
  return el;
};

export const selectOption = async (
  page: Page,
  input: LocatorInput,
  option: string | RegExp | { label?: string; value?: string; index?: number }
) => {
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible" });
  if (typeof option === "string" || option instanceof RegExp) {
    await el.selectOption({ label: String(option) });
  } else {
    await el.selectOption(option as any);
  }
  return el;
};

export const press = async (
  page: Page,
  input: LocatorInput,
  key: string,
  opts?: { timeout?: number; delayMs?: number }
) => {
  const { timeout = 8000, delayMs } = opts ?? {};
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible", timeout });
  if (delayMs) await page.waitForTimeout(delayMs);
  await el.press(key, { timeout });
  return el;
};

export const typeSlow = async (
  page: Page,
  input: LocatorInput,
  text: string,
  delayPerCharMs = 50
) => {
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible" });
  await el.type(text, { delay: delayPerCharMs });
  return el;
};

export const check = async (page: Page, input: LocatorInput) => {
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible" });
  await el.check();
  return el;
};

export const uncheck = async (page: Page, input: LocatorInput) => {
  const el = toLocator(page, input);
  await el.waitFor({ state: "visible" });
  await el.uncheck();
  return el;
};

export const hover = async (page: Page, input: LocatorInput) => {
  const el = toLocator(page, input);
  await el.hover();
  return el;
};

export const scrollIntoView = async (page: Page, input: LocatorInput) => {
  const el = toLocator(page, input);
  await el.scrollIntoViewIfNeeded();
  return el;
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
