import express from 'express'; // Only import express by default
import { analyzePage } from './analyzer';
import { generatePOM } from './pomGenerator';
// Ensure the path is correct and that navigator.ts is the SIMPLIFIED version
import { crawlAndGeneratePOMs } from './navigator';

const app = express();
app.use(express.json());

// --- Auxiliary Function Slugify (unchanged) ---
function slugify(text: string): string {
    const urlPath = text.startsWith('http') ? new URL(text).pathname : text;
    if (!urlPath || urlPath === '/') return 'home';
    return urlPath
        .toLowerCase()
        .replace(/^\/|\/$/g, '')
        .replace(/[^a-z0-9\/]+/g, '-')
        .replace(/\//g, '--')
        .replace(/^-+|-+$/g, '')
        || 'page';
}
// --- End Auxiliary Function ---

// Endpoint to analyze a SINGLE page (unchanged)
app.post('/analyze', async (req, res) => {
    const { url, output }: { url?: string, output?: string } = req.body;
    if (!url) { return res.status(400).json({ error: 'Missing URL' }); }

    try {
        console.log(`(Server) Analyzing single URL: ${url}`);
        // analyzePage does not require a session for simple analysis
        const result = await analyzePage(url);
        const pageName = slugify(url);
        const fileName = output || `${pageName}.ts`;
        // Consider placing output in src/output for consistency
        const fullOutputPath = path.join('src', 'output', fileName);
        // Ensure generatePOM is imported correctly
        const { generatePOM } = await import('./pomGenerator');
        generatePOM(result.elements, fullOutputPath, pageName);
        res.json({ success: true, message: `POM generated at ${fullOutputPath}`, pageName: pageName, elementsCount: result.elements.length });
    } catch (err) { /* ... (error handling unchanged) ... */ }
});

// Endpoint to CRAWL multiple pages
app.post('/crawl', async (req, res) => {
    const { url }: { url?: string } = req.body;
    if (!url) { return res.status(400).json({ error: 'Missing start URL' }); }

    try {
        // *** IMPORTANT NOTE ***
        // This implementation assumes that the Playwright Global Setup process
        // (defined in playwright.config.ts and global.setup.ts)
        // has already been executed and created 'storageState.json' if authentication was required.
        // The imported crawlAndGeneratePOMs function must be the simplified version
        // that attempts to load 'storageState.json' but DOES NOT handle manual login.
        console.log(`(Server) Starting crawl from: ${url}`);
        console.warn(`(Server) -> Assuming Global Setup (login) has already been executed if necessary.`);

        // Directly call the simplified crawl function
        const result = await crawlAndGeneratePOMs(url);

        // Return the result (list of visited pages)
        res.json({ success: true, message: 'Crawl process finished (used existing session if available)', pagesAnalyzed: result });

    } catch (err) {
        console.error('(Server) Error during crawl request:', err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Error during the crawl process', details: errorMsg });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`✅ MCP Server running at http://localhost:${PORT}`);
    console.log(`   Endpoints:`);
    console.log(`     POST /analyze { "url": "...", "output": "optional_filename.ts" }`);
    console.log(`     POST /crawl   { "url": "..." }`);
});

// Re-import path if it was not already imported (necessary for fullOutputPath in /analyze)
import path from 'path';
