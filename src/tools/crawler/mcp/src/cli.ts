// src/cli.ts
import { analyzePage } from "./analyzer";
import { generatePOM } from "./pomGenerator";
import { Command } from "commander";
import path from 'path'; // Necessary for path.join

const program = new Command();

// --- Auxiliary Function Slugify (copied from navigator.ts) ---
// (Ideally move to a utils.ts file and import)
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

program
  .name("mcp-cli")
  .description("Analyze a single page and generate its POM.")
  .requiredOption("-u, --url <url>", "URL to analyze")
  .option("-o, --output <output>", "Output file name (relative to src/output/)", "") // Default empty to construct later
  .option("--highlight", "Keep browser open and highlight found elements") // Option to highlight
  .parse(process.argv);

const options = program.opts();

(async () => {
  try {
  console.log(`Analyzing URL: ${options.url}`);
  // Calls analyzePage without an existing page and with the highlight option
  const analysis = await analyzePage(options.url, undefined, options.highlight);

  // console.log("Page analysis result:\n", JSON.stringify(analysis, null, 2));

  const pageName = slugify(options.url); // Generate pageName from the URL
  // Construct default output path if not provided
  const outputFileName = options.output || `${pageName}.ts`;
  const outputPath = path.join('src', 'output', outputFileName); // Ensure it is in src/output

  console.log(`Generating POM for page: ${pageName}`);
  // *** FIX HERE: Add pageName as the third argument ***
  generatePOM(analysis.elements, outputPath, pageName);

  } catch (error) {
    console.error("CLI Error:", error);
    process.exit(1); // Exit with error code
  }
})();