import { chromium, Page, Browser, BrowserContext } from 'playwright';

type AnalyzedElement = {
    tag: string;
    text: string;
    selector: string;
};

// The function signature now accepts an optional page
export async function analyzePage(url: string, existingPage?: Page, highlight: boolean = false): Promise<{ url: string, elements: AnalyzedElement[] }> {
    let pageToAnalyze: Page;
    let browser: Browser | null = null; // To handle closing if we create a new one
    let context: BrowserContext | null = null; // To handle closing if we create a new one
    let shouldCloseBrowser = false;

    if (existingPage) {
        pageToAnalyze = existingPage;
        // Ensure we are on the correct URL (the crawler should have already navigated)
        // Compare URLs ignoring the fragment (#)
        if (pageToAnalyze.url().split('#')[0] !== url.split('#')[0]) {
             console.log(`(analyzer) Navigating to ${url} on existing page...`);
             try {
                 // Use a more robust waitUntil like 'networkidle' or 'load' if 'domcontentloaded' is not sufficient
                 await pageToAnalyze.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
             } catch (navError) {
                  console.warn(`(analyzer) Error navigating to ${url}: ${navError instanceof Error ? navError.message : navError}`);
                  // Return empty or throw an error as preferred
                  return { url: pageToAnalyze.url(), elements: [] };
             }
        }
    } else {
        // If no page is passed, create one temporarily (for individual use)
        console.log(`(analyzer) Creating temporary browser and page for ${url}...`);
        browser = await chromium.launch({ headless: !highlight }); // Use headless if highlight is not requested
        context = await browser.newContext();
        pageToAnalyze = await context.newPage();
        try {
             await pageToAnalyze.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); // Use 'networkidle' or 'load'
             shouldCloseBrowser = true; // Mark for closing at the end
        } catch (navError) {
             console.error(`(analyzer) Fatal error navigating to ${url}: ${navError}`);
             if (browser) await browser.close(); // Clean up
             throw navError; // Re-throw the error
        }
    }

    // *** GENERIC WAIT FOR INITIAL CONTENT ***
    try {
        // Wait for the first child element of div#root to be visible
        // This indicates that React (or similar) has rendered something.
        // Use a shorter timeout since this should happen relatively quickly.
        const rootContentSelector = '#root > *';
        console.log(`(analyzer) Waiting for initial content inside ${rootContentSelector}...`);
        await pageToAnalyze.waitForSelector(rootContentSelector, { state: 'visible', timeout: 7000 }); // Wait up to 7 seconds
        console.log(`(analyzer) Initial content found. Proceeding with analysis.`);
        // Optional: Small additional delay just in case
        // await pageToAnalyze.waitForTimeout(200);
    } catch (waitError) {
         // If #root does not exist or is empty after the timeout, the page likely did not load correctly or has a different structure.
         console.warn(`(analyzer) Initial content not found inside '#root > *' after waiting. The page might be empty, have errors, or use a different structure. ${waitError}`);
         // Continue anyway, but the analysis might fail or be incomplete.
    }
    // *** END GENERIC WAIT ***

    // Extract elements using page.evaluate
    const elements: AnalyzedElement[] = await pageToAnalyze.evaluate(() => {
        const results: AnalyzedElement[] = [];

        // --- Function getBestSelector ---
        function getBestSelector(el: HTMLElement): string {
            // Prioritize data-testid
            if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;

            const role = el.getAttribute('role');
            const tagName = el.tagName.toLowerCase();
            const type = el.getAttribute('type')?.toLowerCase();
            // Escape quotes and limit text length
            const textContent = el.textContent?.trim()
                .replace(/\\/g, '\\\\') // Escape backslashes first
                .replace(/'/g, "\\'")  // Escape single quotes
                .replace(/"/g, '\\"')  // Escape double quotes
                .substring(0, 100); // Limit length
            const ariaLabel = el.getAttribute('aria-label')?.trim()
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .substring(0, 100);

            // Buttons and links by role/text (with limited and escaped text)
             if ((tagName === 'button' || role === 'button' || (tagName === 'input' && (type === 'button' || type === 'submit' || type === 'reset'))) && textContent) {
                 // Using a regex for name if it contains escaped quotes might be more robust
                 // but for now, we keep the simple escaped version
                 return `getByRole('${role || 'button'}', { name: '${textContent}' })`;
             }
              if (tagName === 'a' && textContent) {
                 return `getByRole('link', { name: '${textContent}' })`;
             }

             // Inputs by label (with limited and escaped text)
            if (el.id) {
                const label = document.querySelector(`label[for="${el.id}"]`);
                if (label && label.textContent?.trim()) {
                     const labelText = label.textContent.trim()
                         .replace(/\\/g, '\\\\')
                         .replace(/'/g, "\\'")
                         .replace(/"/g, '\\"')
                         .substring(0, 100);
                     return `getByLabel('${labelText}')`;
                }
            }

            // Inputs by placeholder (with limited and escaped text)
            if (el.getAttribute('placeholder')) {
                 const placeholderText = el.getAttribute('placeholder')!.trim()
                     .replace(/\\/g, '\\\\')
                     .replace(/'/g, "\\'")
                     .replace(/"/g, '\\"')
                     .substring(0, 100);
                 return `getByPlaceholder('${placeholderText}')`;
             }

            // By aria-label (with limited and escaped text)
             if (ariaLabel) {
                 // getByLabel searches by label text OR aria-label
                 return `getByLabel('${ariaLabel}')`;
             }

             // Generic text match (less specific, with limited and escaped text)
              if (textContent && (tagName === 'p' || tagName === 'span' || tagName === 'div' || tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6')) {
                  // Avoid very long or generic texts if possible
                 if (textContent.length > 2 && textContent.length < 80 && !textContent.match(/^\d+$/)) { // Avoid only numbers or very short/long texts
                      return `getByText('${textContent}')`;
                  }
             }

            // Fallback to CSS selectors (less robust)
            if (el.id) return `#${el.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')}`; // Escape special characters in ID
            if (el.getAttribute('name')) return `${tagName}[name="${el.getAttribute('name')!.replace(/"/g, '\\"')}"]`; // Escape quotes in name

            return ''; // No useful selector found
        }
        // --- End getBestSelector ---

        const seenSelectors = new Set<string>();
        // Broader selector to capture more interactive elements and key text
        // Add generic [role] to capture more elements with defined roles
        document.querySelectorAll('button, a, input, textarea, select, [role], [data-testid]').forEach((el) => {
            const element = el as HTMLElement;

             // Ignore hidden elements or those inside <head>, <script>, <style>
             // Also ignore if it has no visible size
             if (!element.offsetParent || element.closest('head, script, style') || element.offsetWidth === 0 || element.offsetHeight === 0) {
                 return;
             }

            const selector = getBestSelector(element);

             // Validate that the selector is not empty and has not been seen before
            if (!selector || seenSelectors.has(selector)) return;

            // Simplify validation: Accept any `getBy*` selector or basic CSS we prioritize
            const isValidSelectorFormat =
                 selector.startsWith('getBy') ||   // Accept all getBy*
                 selector.startsWith('[data-testid=') ||
                 selector.startsWith('#') ||
                 selector.match(/^[a-z]+\[name=/); // Allow tag[name=...]

            if (!isValidSelectorFormat) {
                 // console.log(`Invalid or non-prioritized selector discarded: ${selector}`);
                return; // Skip less specific CSS selectors if they don't match
            }

            seenSelectors.add(selector);

            results.push({
                tag: element.tagName.toLowerCase(),
                 // Use textContent or aria-label as descriptive text
                text: element.textContent?.trim() || element.getAttribute('aria-label')?.trim() || '',
                selector: selector
            });
        });

        return results;
    }); // End of page.evaluate


    // Highlight logic (unchanged)
    if (highlight && elements.length > 0) {
        console.log(`(analyzer) Highlighting ${elements.length} elements found...`);
        await pageToAnalyze.evaluate((elementsToHighlight: AnalyzedElement[]) => {
            elementsToHighlight.forEach(({ selector }) => {
                try {
                    let foundElement: Element | null = null;
                    if (selector.startsWith('getBy')) {
                        console.warn(`Highlighting for 'getBy*' selectors not implemented in evaluate (browser limitation). Selector: ${selector}`);
                    } else {
                         foundElement = document.querySelector(selector);
                    }

                    const el = foundElement as HTMLElement;
                    if (!el) {
                         console.warn(`(highlight) Element not found for CSS selector: ${selector}`);
                         return;
                    }
                    el.style.outline = '2px solid lime';
                    el.setAttribute('title', `Selector: ${selector}`);
                } catch (e) {
                     console.error(`Error highlighting selector: ${selector}`, e);
                 }
            });
        }, elements);
        console.log("(analyzer) Keeping the page open for 60 seconds for review...");
        await pageToAnalyze.waitForTimeout(60000);
    }

    // Close the browser ONLY if we created it within this function
    if (shouldCloseBrowser && browser) {
        console.log("(analyzer) Closing temporary browser...");
        await browser.close();
    }

    // Return the final real URL and the elements
    console.log(`(analyzer) Analysis completed for ${pageToAnalyze.url()}. Elements found: ${elements.length}`);
    return { url: pageToAnalyze.url(), elements };
}