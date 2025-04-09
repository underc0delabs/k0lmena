// src/global.setup.ts
import { test as setup, expect } from '@playwright/test';
import { chromium, Browser } from 'playwright'; // Remove unused types if preferred

// Define the path locally instead of importing it
const storageStatePath = 'storageState.json'; // <- PATH DEFINED HERE

// ---- Specific Login Configuration (COMPLETE THIS!) ----
const username = process.env.BIO_USERNAME || 'YOUR_DEFAULT_USERNAME';
const password = process.env.BIO_PASSWORD || 'YOUR_DEFAULT_PASSWORD';
const loginUrl = 'https://qa.biosafeapp.com/login';
const usernameSelector = '[data-testid="email-input"]';
const passwordSelector = '[data-testid="password-input"]';
const submitButtonSelector = '[data-testid="login-button"]';
const welcomeMessage = '[data-testid="welcome-message"]';
// ---- End of Specific Configuration ----

async function globalSetup() {
  console.log('🚀 Running Global Setup: Logging in...');
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: false, slowMo: 100 });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log(`   Navigating to ${loginUrl}...`);
    await page.goto(loginUrl);
    console.log(`   Filling username...`);
    await page.locator(usernameSelector).fill(username);
    console.log(`   Filling password...`);
    await page.locator(passwordSelector).fill(password);
    console.log(`   Clicking submit button...`);
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
        page.locator(submitButtonSelector).click(),
    ]);

    console.log(`   Verifying login by waiting for: ${welcomeMessage}`);
    await expect(page.locator(welcomeMessage)).toBeVisible({ timeout: 10000 });
    console.log('   Login successfully verified.');

    // Use the local constant storageStatePath
    console.log(`   Saving session state to ${storageStatePath}...`);
    await page.context().storageState({ path: storageStatePath });
    console.log('✅ Global Setup completed: Session saved.');

  } catch (error) {
    console.error('❌ Error during Global Setup:', error);
    // If the setup fails, it is important to throw an error to stop the process
    throw error;
  } finally {
    // Ensure the setup browser is closed
    if (browser) {
      await browser.close();
      console.log('   Global Setup browser closed.');
    }
  }
}

// Export the function so Playwright can find it
export default globalSetup;