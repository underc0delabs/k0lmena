import * as pomGenerator from "./mcp/src/pomGenerator";
import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  const inputUrl = process.argv[2] || process.env.BASEURL;
  if (!inputUrl) {
    console.error("Proporcione una URL como parámetro o defina BASEURL en .env.");
    process.exit(1);
  }

  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, "locators-output.ts");

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(inputUrl);

  // Se consideran los elementos interactivos: enlaces con href, botones, inputs, selects, textareas, 
  // y elementos con role="link" (además de los a que tengan href)
  const elements = await page.evaluate(() => {
    const selectorList = "a[href], button, input, select, textarea, [role='link']";
    const nodeList = document.querySelectorAll(selectorList);

    function getUniqueSelector(el: Element): string {
      let baseSelector = "";
      if (el.id) {
        baseSelector = `#${CSS.escape(el.id)}`;
      } else if (el.hasAttribute("data-testid")) {
        baseSelector = `[data-testid="${CSS.escape(el.getAttribute("data-testid") || "")}"]`;
      } else if (el.hasAttribute("aria-label")) {
        baseSelector = `[aria-label="${CSS.escape(el.getAttribute("aria-label") || "")}"]`;
      } else if (el.hasAttribute("role")) {
        baseSelector = `[role="${CSS.escape(el.getAttribute("role") || "")}"]`;
      } else if (el.className && el.className.trim() !== "") {
        const candidate = "." + el.className.trim().split(/\s+/).map(cls => CSS.escape(cls)).join(".");
        // Usamos el selector basado en clases solo si es único
        if (document.querySelectorAll(candidate).length === 1) {
          baseSelector = candidate;
        } else {
          baseSelector = el.tagName.toLowerCase();
        }
      } else {
        baseSelector = el.tagName.toLowerCase();
      }
      // Si el selector obtenido coincide con más de un elemento, se añade :nth-of-type()
      const matchingNodes = document.querySelectorAll(baseSelector);
      if (matchingNodes.length > 1 && el.parentElement) {
        const siblings = el.parentElement.querySelectorAll(el.tagName.toLowerCase());
        const index = Array.from(siblings).indexOf(el) + 1;
        return baseSelector + `:nth-of-type(${index})`;
      }
      return baseSelector;
    }

    return Array.from(nodeList).map(el => {
      const text = el.textContent ? el.textContent.trim() : "";
      return {
        tag: el.tagName.toLowerCase(),
        text: text,
        selector: getUniqueSelector(el)
      };
    });
  });

  await browser.close();

  const pageName = new URL(inputUrl).hostname;
  pomGenerator.generatePOM(elements, outputFile, pageName);
  console.log("POM generado correctamente.");
}

run();
