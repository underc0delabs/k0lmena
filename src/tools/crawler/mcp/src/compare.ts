import { analyzePage } from './analyzer';
// Import BrowserContext and Page types from playwright
import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs'; // Import fs to check if session file exists
// Use process.argv directly instead of importing argv
// import { argv } from 'process';

// Define path to the session state file (consistent with other files)
const storageStatePath = 'storageState.json';

async function main() {
    // Parse arguments from process.argv
    const args = process.argv.slice(2); // Get arguments after node and script name
    const urlArg = args.find(arg => arg.startsWith('--url='));
    const pomArg = args.find(arg => arg.startsWith('--pom='));
    // Check if the optional --use-session flag is present
    const useSession = args.includes('--use-session');

    if (!urlArg || !pomArg) {
        console.error('Usage: npx ts-node src/compare.ts --url=<URL> --pom=<POM_PATH> [--use-session]');
        process.exit(1);
    }

    const url = urlArg.replace('--url=', '');
    const pomPath = pomArg.replace('--pom=', '');
    const fullPomPath = path.resolve(pomPath);

    console.log(`🚀 Starting comparison for URL: ${url}`);
    console.log(`   Using POM file: ${pomPath}`);
    if (useSession) {
        console.log(`   Attempting to use saved session from: ${storageStatePath}`);
    }

    const browser = await chromium.launch({ headless: false }); // Keep visible for comparison
    let context: BrowserContext;
    let page: Page;

    // --- Create Browser Context (with or without session) ---
    if (useSession) {
        if (fs.existsSync(storageStatePath)) {
            try {
                context = await browser.newContext({ storageState: storageStatePath });
                console.log(`✅ Session loaded successfully from ${storageStatePath}.`);
            } catch (err) {
                 console.error(`❌ Error loading session state from ${storageStatePath}:`, err);
                 console.error('   Proceeding without session.');
                 context = await browser.newContext(); // Fallback to default context
            }
        } else {
            console.error(`❌ Error: --use-session flag was provided, but session file not found at ${storageStatePath}`);
            console.error('   Please run the login setup process first or remove the --use-session flag.');
            await browser.close();
            process.exit(1); // Exit if session was requested but not found
        }
    } else {
        // If --use-session is not specified, create a default context
        console.log('   Proceeding without a saved session.');
        context = await browser.newContext();
    }
    // --- End Context Creation ---

    // Create page from the (potentially authenticated) context
    page = await context.newPage();

    try {
         // Navigate to the target URL
         console.log(`   Navigating to ${url}...`);
         await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }); // Wait for network idle
         console.log(`✅ Navigation successful.`);

         // --- Inject Highlighter Script ---
         await injectHighlighter(page); // Inject the JS for highlighting elements

         // --- Analyze Page (using the potentially authenticated page) ---
         // analyzePage now also benefits from the session state!
         console.log(`   Analyzing live page elements...`);
         const scanResult = await analyzePage(url, page); // Pass the created page object
         console.log(`   Analysis found ${scanResult.elements.length} potential elements.`);
         const livePageSelectors = new Set(scanResult.elements.map((el: { selector: string }) => el.selector));


         // --- Load and Compare POM ---
         console.log(`   Loading POM class from ${fullPomPath}...`);
         const pomModule = await import(fullPomPath);
         // Attempt to find the exported class (assuming it's the main export)
         const PomClass = Object.values(pomModule).find(exp => typeof exp === 'function') as { new(page: Page): any };
         if (!PomClass) {
            throw new Error(`Could not find an exported class in POM file: ${fullPomPath}`);
         }
         const pomInstance = new PomClass(page);
         console.log(`   POM Class "${PomClass.name}" loaded successfully.`);

         const pomLocatorsNotFound: string[] = [];
         const pomLocatorsFound: string[] = [];
         const pomSelectorsInPOM = new Set<string>(); // Store selector strings from POM locators

         console.log(`   Comparing POM locators with live page...`);
         for (const key of Object.keys(pomInstance)) {
             // Skip the 'page' property itself or constructor
             if (key === 'page' || key === 'constructor') continue;

             try {
                 const locator = (pomInstance as any)[key];
                 // Basic check if it looks like a Playwright Locator
                 if (locator && typeof locator.count === 'function') {
                    // Attempt to get the selector string representation if possible (might vary)
                    // This part is best-effort for matching against scanResult
                    try {
                        // Playwright locators don't have a standard public way to get the exact selector string back
                        // We can try evaluating it, but it's complex. Let's focus on presence check.
                        // For now, we just check if the locator finds elements.
                    } catch (e) { /* ignore errors getting selector string */ }


                     let count = 0;
                     try {
                         // Check if the locator finds at least one element
                         await locator.first().waitFor({ state: 'attached', timeout: 3000 }); // Short wait for element
                         count = await locator.count(); // Check count after ensuring it's attached
                     } catch (err) {
                         count = 0; // Element not found or error during count
                     }

                     if (count === 0) {
                         pomLocatorsNotFound.push(key);
                     } else {
                         pomLocatorsFound.push(key);
                         // Highlight found elements in Green
                         await highlightElement(page, locator, `${key} (POM)`, 'lime'); // Green
                     }
                 } else {
                      console.warn(`   ⚠️ Property '${key}' in POM does not appear to be a Playwright Locator. Skipping.`);
                 }
             } catch (err) {
                  console.warn(`   ⚠️ Error processing POM property '${key}':`, err);
                 pomLocatorsNotFound.push(key); // Assume not found if error occurs
             }
         }

         // --- Highlight Unmapped Elements (Blue) ---
         console.log(`   Checking for elements found on page but not in POM...`);
         for (const el of scanResult.elements) {
             // This check is difficult because we don't easily get the selector string back from the POM's locators.
             // We'll highlight based on whether analyzePage found it.
             // A more robust check would require changes in how POMs are generated/parsed.
             // For now, we assume if analyzePage found it, and it wasn't explicitly matched above, it's potentially unmapped.
             // Let's only highlight if its selector wasn't among those matched by POM locators (crude check).

              // Crude check: If a locator with a similar target was found, maybe don't highlight blue? Difficult.
              // Let's just highlight all elements found by analyzePage that weren't green.
              const wasFoundByPom = pomLocatorsFound.some(pomKey => {
                 // This comparison is weak - needs better logic if required
                 return pomInstance[pomKey] && typeof pomInstance[pomKey].locator === 'function'; // Placeholder
              });

              // Instead of complex check, let's just highlight all found by analyzePage initially in blue,
              // they will be overwritten by green if matched by POM. This simplifies.
              try {
                   let locator;
                   // Re-create locator based on analyzePage selector string
                   if (el.selector.startsWith('getBy')) {
                        // Cannot easily evaluate getBy* from string here
                        // console.warn(`   Skipping blue highlight for getBy selector: ${el.selector}`);
                        continue;
                   } else {
                        locator = page.locator(el.selector);
                   }
                   const count = await safeCount(locator);
                   if (count > 0) {
                       // Highlight initially in blue
                       await highlightElement(page, locator, `${el.selector} (Scan)`, 'rgba(0, 0, 255, 0.5)'); // Blue with transparency
                   }
              } catch (highlightErr) {
                   console.warn(`   ⚠️ Error trying to highlight scanned element ${el.selector}:`, highlightErr);
               }
         }
         // Re-highlight matched POM elements in solid green to ensure they overwrite blue
         for (const key of pomLocatorsFound) {
             await highlightElement(page, (pomInstance as any)[key], `${key} (POM)`, 'lime'); // Green
         }


         // --- Report Results ---
         console.log('\n--- Comparison Report ---');
         if (pomLocatorsFound.length > 0) {
             console.log(`✅ POM Locators Found (${pomLocatorsFound.length}):`);
             pomLocatorsFound.forEach(key => console.log(`   - ${key}`));
         }
         if (pomLocatorsNotFound.length > 0) {
             console.warn(`❌ POM Locators NOT Found (${pomLocatorsNotFound.length}):`);
             pomLocatorsNotFound.forEach(key => {
                 // Attempt to get locator string representation (best effort)
                 let locatorString = `N/A`;
                 try {
                    // This might not work reliably or as expected for all locator types
                    locatorString = (pomInstance as any)[key]?.toString() || 'Locator object found, but toString failed';
                 } catch {
                     locatorString = 'Error getting locator string';
                 }
                 console.warn(`   - ${key} (Attempted Selector: ${locatorString})`);
             });
         }
         console.log('---');
         console.log('\nVisual Output Legend:');
         console.log('🟩 Green Outline: Locator defined in POM and FOUND on the page.');
         console.log('🟦 Blue Outline: Element found by initial scan, potentially NOT in POM (or POM locator doesn\'t match scan).');
         console.log('🟥 Red (Console Log): Locator defined in POM but NOT FOUND on the page.');
         console.log('\n👀 Browser window will remain open for 60 seconds for inspection.');
         await page.waitForTimeout(60000); // Keep browser open

    } catch (error) {
        console.error('❌ An error occurred during the comparison process:', error);
    } finally {
        // Ensure browser is closed even if errors occurred
        console.log('🚪 Closing browser...');
        await browser.close();
    }
}

// Helper function to safely count locators
async function safeCount(locator: any): Promise<number> {
    try {
        // Short explicit wait before count might help with timing
        await locator.first().waitFor({ state: 'attached', timeout: 1000 });
        return await locator.count();
    } catch {
        return 0; // Return 0 if element not found or error during count
    }
}

// Helper function to highlight elements
async function highlightElement(page: Page, locator: any, label: string, color: string) {
    try {
        // Highlight all matching elements, not just the first
        const elements = await locator.elementHandles();
        if (elements.length === 0) {
             console.warn(`   ⚠️ highlightElement: No elements found for locator associated with label: ${label}`);
             return;
        }

        for (const handle of elements) {
            await page.evaluate(
                ({ el, label, color }) => {
                    // Simple check if it's an HTMLElement
                    if (el && el instanceof HTMLElement) {
                         // Append title info if already exists
                         const currentTitle = el.getAttribute('title') || '';
                         const newTitle = currentTitle ? `${currentTitle} | ${label}` : label;
                         el.style.outline = `2px solid ${color}`;
                         el.setAttribute('data-mcp-highlight', 'true'); // Add attribute for potential cleanup
                         el.setAttribute('title', newTitle); // Set or update title
                    }
                },
                { el: handle, label, color }
            );
             // Dispose handle after use
             await handle.dispose();
        }

    } catch (e) {
        // Log more specific error if possible
         console.error(`❌ Error highlighting element for label "${label}":`, e);
    }
}

// Helper function to inject the highlighter JS into the page
async function injectHighlighter(page: Page) {
    try {
        // Check if already injected
        const alreadyInjected = await page.evaluate(() => !!(window as any).__highlightElement);
        if (alreadyInjected) {
            // console.log('   Highlighter script already injected.');
            return;
        }

        await page.addScriptTag({
            content: `
          // Function to apply highlight styles
          window.__highlightElement = (element, label, color) => {
            if (!element || !(element instanceof HTMLElement)) return;
            const currentTitle = element.getAttribute('title') || '';
            const newTitle = currentTitle.includes(label) ? currentTitle : (currentTitle ? \`\${currentTitle} | \${label}\` : label);
            element.style.outline = '3px solid ' + color; // Thicker outline
            element.style.outlineOffset = '2px'; // Offset slightly
            element.style.boxShadow = '0 0 5px 2px ' + color; // Add shadow for visibility
            element.setAttribute('data-mcp-highlight', 'true');
            element.setAttribute('title', newTitle);
          };
          console.log('MCP Highlighter script injected.');
        ` });
    } catch(scriptError) {
         console.error('❌ Failed to inject highlighter script:', scriptError);
    }
}

// Run the main function
main().catch(err => {
     console.error("Unhandled error in main function:", err);
     process.exit(1);
});