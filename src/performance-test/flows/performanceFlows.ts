import { loginLocators as L } from '../locators/performanceLocators';

export async function goToLogin(page) {
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);
  await page.goto(L.url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(L.form, { state: 'attached' });
  await page.waitForSelector(L.username, { state: 'visible' });
  await page.waitForSelector(L.password, { state: 'visible' });
}

export async function loginAs(page, user = 'admin', pass = '123456') {
  await page.fill(L.username, user);
  await page.fill(L.password, pass);

  await Promise.all([
    page.waitForNavigation({ url: L.success.url, waitUntil: 'domcontentloaded', timeout: 15000 }),
    page.click(L.submit),
  ]);
}

export async function assertLoggedIn(page) {
  await page.waitForURL(L.success.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.getByRole('heading', { name: L.success.headingText })
    .waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('link', { name: L.success.logoutText })
    .waitFor({ state: 'visible', timeout: 5000 });
}