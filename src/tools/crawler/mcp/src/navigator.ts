import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { analyzePage } from './analyzer';       // Import your analyzer
import { generatePOM } from './pomGenerator';   // Import your POM generator
import path from 'path';
import fs from 'fs';
import readline from 'readline'; // <--- Necessary for manual login fallback

// Define the path to the storage state file directly here
const storageStatePath = 'storageState.json';
const outputDir = path.join('src', 'output'); // Output folder for POMs

// --- Helper Functions ---

// Function to pause and wait for Enter in the console (for manual login)
function waitForEnter(query: string): Promise<void> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve();
    }))
}

// Function to convert URLs/text into valid file/class names
function slugify(text: string): string {
    const urlPath = text.startsWith('http') ? new URL(text).pathname : text;
    if (!urlPath || urlPath === '/') return 'home';
    return urlPath
        .toLowerCase()
        .replace(/^\/|\/$/g, '') // Remove slashes at the beginning/end
        .replace(/[^a-z0-9\/]+/g, '-') // Replace non-alphanumeric characters (except /) with -
        .replace(/\//g, '--') // Replace / with -- (to indicate hierarchy in the name)
        .replace(/^-+|-+$/g, '') // Remove dashes at the beginning/end
        || 'page'; // Fallback if empty
}

// Function to detect if a URL seems to be a login page (for manual fallback)
function isLoginPage(url: string): boolean {
    try {
        const pathName = new URL(url).pathname.toLowerCase();
        return pathName.includes('/login') || pathName.includes('/signin') || pathName.includes('/auth');
    } catch (e) {
        const lowerUrl = url.toLowerCase();
        return lowerUrl.includes('/login') || lowerUrl.includes('/signin') || lowerUrl.includes('/auth');
    }
}
// --- End of Helper Functions ---


// --- Main Crawling Function (with Manual Fallback) ---
export async function crawlAndGeneratePOMs(startUrl: string, browserInstance?: Browser) {
    let browser: Browser | null = browserInstance || null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    const visitedPages = new Set<string>();
    let ownBrowser = false;

    try {
        console.log('🚀 Starting MCP POM Generator Crawl...');
        if (!browser) {
            console.log('   Creating a new browser instance...');
            // Launch visible in case manual login is needed
            browser = await chromium.launch({ headless: false });
            ownBrowser = true;
        } else {
            console.log('   Reusing existing browser instance...');
        }

        // *** Session Logic: Try to load or fallback to manual ***
        try {
            // 1. Try to load session (preferred, assumes globalSetup)
            console.log(`   Attempting to load session from ${storageStatePath}...`);
            context = await browser.newContext({ storageState: storageStatePath });
            console.log(`✅ Session loaded from ${storageStatePath}.`);
            // Create page and navigate to startUrl WITH session
            page = await context.newPage();
            console.log(`   Navigating to the initial URL: ${startUrl} (with loaded session)`);
            await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });

        } catch (error) {
            // 2. If loading fails -> Activate Manual Fallback
            console.warn(`⚠️ Failed to load session from ${storageStatePath}. Starting manual flow if necessary... (${error instanceof Error ? error.message.split('\n')[0] : error})`); // Show only the first line of the error
            // Create EMPTY context first
            context = await browser.newContext();
            page = await context.newPage();
            // Go to startUrl WITHOUT session to look for links
            console.log(`   Navigating to the initial URL: ${startUrl} (without session)`);
            await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });
            const initialUrl = page.url();
            console.log(`   Current page (without session): ${initialUrl}`);

            // Look for login links on the initial page
            console.log("   🔎 Searching for login links on the initial page...");
            const baseUrl = new URL(initialUrl).origin;
            const initialHrefs = await page.$$eval(
                'a[href]',
                 (anchors, base) => {
                     const uniqueHrefs = new Set<string>();
                     anchors.forEach(a => {
                         const href = a.getAttribute('href');
                         if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                             try {
                                 const absoluteUrl = new URL(href, base).toString().split('#')[0];
                                 if (absoluteUrl.startsWith(base) && !href.startsWith('javascript:')) {
                                     uniqueHrefs.add(absoluteUrl);
                                 }
                             } catch (e) { }
                         }
                     });
                     return Array.from(uniqueHrefs);
                 },
                 baseUrl
             );
            const loginUrlToVisit = initialHrefs.find(href => isLoginPage(href)) || null;

            if (loginUrlToVisit) {
                // **Manual Login Flow** (If a login link is found)
                console.warn(`   ⚠️ Detected login link (${loginUrlToVisit}). Starting manual login flow...`);
                console.log(`   🚗 Navigating to the detected login page: ${loginUrlToVisit}`);
                await page.goto(loginUrlToVisit, { waitUntil: 'networkidle', timeout: 60000 });
                console.log('\n   --- MANUAL LOGIN REQUIRED ---');
                console.log('   🧑‍💻 Please log in manually in the browser window.');
                await waitForEnter('   👉 Press ENTER here in the console once you have logged in...');

                // Save session NOW after manual login
                console.log('   💾 Saving session state...');
                await context.storageState({ path: storageStatePath });
                console.log(`   ✅ Session state saved to ${storageStatePath}`);

                // Reload context WITH session
                console.log('   🔄 Restarting context with the saved session...');
                await context.close(); // Close the context without session
                context = await browser.newContext({ storageState: storageStatePath }); // Open a new one WITH session
                page = await context.newPage(); // Create the page WITHIN the new context

                // Return to startUrl, NOW with session
                console.log(`   🔄 Returning to ${startUrl} with active session...`);
                await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 60000 });
                console.log(`   ✅ Landed on: ${page.url()} (after manual login)`);
            } else {
                // If no login link is found, continue without session
                console.log("   ℹ️ No login links found on the initial page. Continuing without session.");
                // We are already at startUrl with the empty context and the page created
            }
        }
        // *** End of Session and Login Logic ***

        // From here, 'page' and 'context' are defined, with or without session
        console.log(`\n✅ Context ready. Current page: ${page.url()}`);

        // Ensure the output folder exists
        if (!fs.existsSync(outputDir)) {
            console.log(`📂 Creating output directory: ${outputDir}`);
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // --- Crawling Logic (Core) ---

        // Analyze the current page where we started (with or without session)
        const currentPageUrl = page.url().split('#')[0];
        if (!visitedPages.has(currentPageUrl)) {
            console.log(`\n🔎 Analyzing current page: ${currentPageUrl}`);
            try {
                const result = await analyzePage(currentPageUrl, page);
                const pageName = slugify(currentPageUrl);
                const fileName = path.join(outputDir, `${pageName}.ts`);
                generatePOM(result.elements, fileName, pageName);
                visitedPages.add(currentPageUrl);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`⚠️ Failed to analyze the current page ${currentPageUrl}: ${msg}`);
            }
        }

        // Extract links to follow
        console.log('\n🔗 Extracting internal links from the current page...');
        const currentBaseUrl = new URL(page.url()).origin;
        let linksToCrawl: string[] = [];
        try {
             linksToCrawl = await page.$$eval(
                'a[href]',
                 (anchors, base) => {
                     const uniqueHrefs = new Set<string>();
                     anchors.forEach(a => {
                         const href = a.getAttribute('href');
                         if (href && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                             try {
                                 const absoluteUrl = new URL(href, base).toString().split('#')[0];
                                 if (absoluteUrl.startsWith(base) && !href.startsWith('javascript:')) {
                                     uniqueHrefs.add(absoluteUrl);
                                 }
                             } catch (e) { }
                         }
                     });
                     return Array.from(uniqueHrefs);
                 },
                 currentBaseUrl
             );
             console.log(`🔍 Found ${linksToCrawl.length} unique links from the same domain to crawl.`);
        } catch(evalError) {
            console.error("Error extracting links:", evalError);
        }

        // Sort links (simple alphabetical order)
        linksToCrawl.sort((a, b) => a.localeCompare(b));

        // Traverse and analyze the found links
        console.log('\n🔄 Starting analysis of linked pages...');
        for (const fullUrl of linksToCrawl) {
            if (visitedPages.has(fullUrl)) { continue; } // Skip already visited

            console.log(`\n\t➡ Visiting link: ${fullUrl}`);
            try {
                await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 60000 });
                const currentUrlAfterNav = page.url().split('#')[0];

                if (visitedPages.has(currentUrlAfterNav)) { // Check again in case of redirect
                    console.log(`\t⏭️ Skipping ${currentUrlAfterNav} (already visited post-redirect)`);
                    continue;
                }

                console.log(`\t🔎 Analyzing: ${currentUrlAfterNav}`);
                const result = await analyzePage(currentUrlAfterNav, page);

                const pageName = slugify(currentUrlAfterNav);
                const fileName = path.join(outputDir, `${pageName}.ts`);
                generatePOM(result.elements, fileName, pageName);
                visitedPages.add(currentUrlAfterNav); // Mark this URL as visited

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`\t⚠️ Failed to analyze ${fullUrl} (or its redirect ${page?.url()}): ${msg.split('\n')[0]}`);
                 // Mark both URLs as visited to avoid retries
                 visitedPages.add(fullUrl);
                 if (page?.url() && page.url() !== fullUrl) {
                    visitedPages.add(page.url().split('#')[0]);
                 }
            }
        } // End of for loop
         // --- End of Crawling Logic ---

    } catch (error) {
        console.error('\n❌ Fatal error during the crawling process:', error);
    } finally {
        // Ensure the browser is closed if this script created it
        if (browser && ownBrowser) {
            console.log('\n🚪 Closing the browser created by the script...');
            await browser.close();
        } else if (browser && !ownBrowser) {
             console.log('\n🚪 Not closing the browser (reused instance).');
        }
        console.log('\n🏁 Crawling process completed.');
        console.log(`✨ Pages analyzed and POMs generated (or attempted): ${visitedPages.size}`);
    }

    return Array.from(visitedPages);
} // End of crawlAndGeneratePOMs