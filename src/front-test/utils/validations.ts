import { Page, expect, type Locator } from "@playwright/test";

/* ================================
   Tipos y adaptador de selectores
   ================================ */

// Inferimos el tipo de rol desde la firma real de Playwright (compatible con cualquier versión)
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

/* =========================
   Checks (devuelven boolean)
   ========================= */

export const isDisabled = (page: Page, el: LocatorInput) => toLocator(page, el).isDisabled();
export const isEnabled  = (page: Page, el: LocatorInput) => toLocator(page, el).isEnabled();
export const isEditable = (page: Page, el: LocatorInput) => toLocator(page, el).isEditable();
export const isChecked  = (page: Page, el: LocatorInput) => toLocator(page, el).isChecked();
export const isVisible  = (page: Page, el: LocatorInput) => toLocator(page, el).isVisible();
export const isHidden   = (page: Page, el: LocatorInput) => toLocator(page, el).isHidden();

export const hasText = async (page: Page, el: LocatorInput, text: string | RegExp) => {
  const count = await toLocator(page, el).filter({ hasText: text }).count();
  return count > 0;
};

export const hasAttribute = async (page: Page, el: LocatorInput, name: string, value?: string | RegExp) => {
  const attr = await toLocator(page, el).getAttribute(name);
  if (attr == null) return false;
  return value instanceof RegExp ? value.test(attr) : value ? attr === value : true;
};

export const getTextContent = async (page: Page, el: LocatorInput) =>
  (await toLocator(page, el).textContent()) ?? "";

/* =========================
   Waiters (esperan estado)
   ========================= */

export const waitVisible  = (page: Page, el: LocatorInput, timeout = 5000) =>
  toLocator(page, el).waitFor({ state: "visible",  timeout });

export const waitHidden   = (page: Page, el: LocatorInput, timeout = 5000) =>
  toLocator(page, el).waitFor({ state: "hidden",   timeout });

export const waitAttached = (page: Page, el: LocatorInput, timeout = 5000) =>
  toLocator(page, el).waitFor({ state: "attached", timeout });

/* ==================================
   Asserts (usan expect de Playwright)
   ================================== */

export const expectVisible  = (page: Page, el: LocatorInput, timeout = 5000) =>
  expect(toLocator(page, el)).toBeVisible({ timeout });

export const expectHidden   = (page: Page, el: LocatorInput, timeout = 5000) =>
  expect(toLocator(page, el)).toBeHidden({ timeout });

export const expectEnabled  = (page: Page, el: LocatorInput, timeout = 5000) =>
  expect(toLocator(page, el)).toBeEnabled({ timeout });

export const expectDisabled = (page: Page, el: LocatorInput, timeout = 5000) =>
  expect(toLocator(page, el)).toBeDisabled({ timeout });

export const expectChecked  = (page: Page, el: LocatorInput, checked = true, timeout = 5000) =>
  expect(toLocator(page, el)).toBeChecked({ checked, timeout });

export const expectText = (page: Page, el: LocatorInput, text: string | RegExp, timeout = 5000) =>
  expect(toLocator(page, el)).toHaveText(text, { timeout });

export const expectAttribute = (
  page: Page,
  el: LocatorInput,
  name: string,
  value: string | RegExp,
  timeout = 5000
) => expect(toLocator(page, el)).toHaveAttribute(name, value, { timeout });

export const expectCount = (page: Page, el: LocatorInput, count: number, timeout = 5000) =>
  expect(toLocator(page, el)).toHaveCount(count, { timeout });

/* =========================
   Page-level helpers útiles
   ========================= */

export const expectUrlContains = (page: Page, fragment: string | RegExp, timeout = 5000) =>
  expect(page).toHaveURL(fragment, { timeout });

export const expectTitleIs = (page: Page, title: string | RegExp, timeout = 5000) =>
  expect(page).toHaveTitle(title, { timeout });

export const waitForNoNetwork = (page: Page, timeout = 5000) =>
  page.waitForLoadState("networkidle", { timeout });

export const expectResponseOk = async (
  page: Page,
  urlOrRe: string | RegExp,
  status = 200,
  timeout = 10000
) => {
  const res = await page.waitForResponse(
    r => (typeof urlOrRe === "string" ? r.url().includes(urlOrRe) : urlOrRe.test(r.url())) && r.status() === status,
    { timeout }
  );
  await expect(res.ok()).toBeTruthy();
};

/* =========================================
   🚧 Adaptadores con NOMBRES ORIGINALES
   (para no romper imports ya existentes)
   ========================================= */

export const validateElementIsDisabled = (page: Page, element: LocatorInput) => isDisabled(page, element);

// Mantengo el typo viejo como alias, y también exporto el correcto:
export const validateElementIsEditable = (page: Page, element: LocatorInput) => isEditable(page, element);
export const valiteElementIsEditable   = (page: Page, element: LocatorInput) => isEditable(page, element);

export const validateItemIsHidden   = (page: Page, element: LocatorInput) => isHidden(page, element);
export const validateItemIsVisible  = (page: Page, element: LocatorInput) => isVisible(page, element);

// Antes no devolvía nada; ahora retorna boolean para que sea útil
export const validateLocatorIsVisible = (page: Page, element: LocatorInput) => isVisible(page, element);

// Antes creaba el locator y no lo devolvía; ahora SÍ devuelve el primero que matchea
export const validateFirstLocator = (page: Page, elementCss: string, textValue: string) =>
  page.locator(elementCss).filter({ hasText: textValue }).first();
