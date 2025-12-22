"use strict";
import { chromium, firefox, webkit, Browser, Page } from 'playwright';
import { BeforeAll, AfterAll, AfterStep, Status } from '@cucumber/cucumber';
import * as fs from 'fs';
import * as path from 'path';
import { setDefaultTimeout } from '@cucumber/cucumber';
import { consumeHealingEvents, flushHealingHistory } from '../utils/autoHealing';

setDefaultTimeout(60 * 1000);

// Capturamos logs de consola en un array
const logs: string[] = [];
const originalConsoleLog = console.log;
console.log = function(...args: any[]) {
  logs.push(args.join(' '));
  originalConsoleLog.apply(console, args);
};

let browsers: Browser[] = [];
let pages: Page[] = [];

BeforeAll(async function () {
  const browserChoice = process.env.BROWSER;
  let browserTypes = [];

  if (browserChoice) {
    console.log(`Ejecutando solo en: ${browserChoice}`);
    if (browserChoice === 'chromium') browserTypes.push(chromium);
    if (browserChoice === 'firefox') browserTypes.push(firefox);
    if (browserChoice === 'webkit') browserTypes.push(webkit);
  } else {
    console.log('Ejecutando en Chromium, Firefox y WebKit...');
    browserTypes = [chromium, firefox, webkit];
  }

  for (const browserType of browserTypes) {
    console.log(`Iniciando pruebas en: ${browserType.name()}`);
    const browser = await browserType.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    browsers.push(browser);
    pages.push(page);
  }
});

AfterStep(async function ({ result }) {
  // If auto-healing happened during this step, include it in the report even if the step passes.
  const healEvents = consumeHealingEvents();
  if (healEvents.length > 0) {
    const lines = healEvents
      .map(e => {
        const note = e.note ? `\nNote: ${e.note}` : "";
        return `AUTO-HEALING\n- At: ${e.at}\n- Action: ${e.action}\n- Original: ${e.original}\n- Healed with: ${e.healedWith}${note}`;
      })
      .join('\n\n');
    await this.attach(lines, 'text/plain');
  }

  if (result && result.status === Status.FAILED) {
    // Usamos la primera página de la lista (ajustar si usás más de una)
    const page = pages[0];
    // Capturamos la pantalla (devuelve un Buffer)
    const screenshot = await page.screenshot();

    // Definimos la ruta para guardar la imagen: src/reports/front/screenshots
    const screenshotsDir = path.join(process.cwd(), 'src', 'reports', 'front', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Generamos un nombre único para la imagen usando la fecha actual
    const screenshotFileName = `screenshot-${Date.now()}.png`;
    const filePath = path.join(screenshotsDir, screenshotFileName);
    fs.writeFileSync(filePath, screenshot);

    // Adjuntamos la imagen al reporte para que el generador (multiple-cucumber-html-reporter) la incluya en el HTML
    await this.attach(screenshot, 'image/png');

    // Armamos un log de error completo: mensaje, stack trace (si existe) y logs de consola
    let errorDetails = "";
    if (result.exception) {
      if (result.exception instanceof Error) {
        errorDetails += "Error Exception: " + result.exception.toString() + "\n";
        if (result.exception.stack) {
          errorDetails += "Stack Trace: " + result.exception.stack + "\n";
        }
      } else {
        errorDetails += "Error Exception: " + result.exception.toString() + "\n";
      }
    }
    if (logs.length > 0) {
      errorDetails += "Logs de consola:\n" + logs.join('\n');
      // Limpiamos los logs para no repetirlos en próximos pasos
      logs.length = 0;
    }
    if (errorDetails) {
      await this.attach(errorDetails, 'text/plain');
    }
  }
});

AfterAll(async function () {
  console.log('Cerrando navegadores...');
  // Close browsers in parallel to reduce end-of-run waiting time.
  const closePromise = Promise.all(browsers.map(b => b.close().catch(() => undefined)));

  // Persist auto-healing history to disk (if enabled) in parallel.
  const flushPromise = flushHealingHistory().catch(() => undefined);

  await Promise.all([closePromise, flushPromise]);
});

export { browsers, pages };
