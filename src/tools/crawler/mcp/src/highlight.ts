import { chromium, Page } from 'playwright';
import path from 'path';
import { argv } from 'process';

async function main() {
    const urlArg = argv.find(arg => arg.startsWith('--url='));
    const pomArg = argv.find(arg => arg.startsWith('--pom='));

    if (!urlArg || !pomArg) {
        console.error('Usage: npx ts-node src/highlight.ts --url=https://... --pom=src/output/file.ts');
        process.exit(1);
    }

    const url = urlArg.replace('--url=', '');
    const pomPath = pomArg.replace('--pom=', '');
    const fullPomPath = path.resolve(pomPath);

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(url);

    try {
        const pomModule = await import(fullPomPath);
        const PomClass = Object.values(pomModule)[0] as { new(page: Page): any };
        const pomInstance = new PomClass(page);

        await injectHighlighter(page);

        const failed: string[] = [];
        const matched: string[] = [];

        for (const key of Object.keys(pomInstance)) {
            if (key === 'page') continue;
            try {
                const locator = (pomInstance as any)[key];
                const handle = await locator.first().elementHandle().catch(() => null);

                if (handle) {
                    matched.push(key);
                    await highlightElement(page, handle, key, 'lime');
                } else {
                    failed.push(key);
                    await highlightMissing(page, key, 'red'); // 🟥 red if not found
                }
            } catch (err) {
                failed.push(key);
                await highlightMissing(page, key, 'red');
            }
        }

        if (failed.length) {
            console.warn('\n❌ The following elements defined in the POM were not found:');
            failed.forEach(key => console.warn(' - ' + key));
        } else {
            console.log('\n✅ All elements in the POM were found.');
        }

        console.log('\n🟩 Green: found\n🟥 Red: not found');
        console.log('\nViewer active. Close the browser window when you are done.');
        await page.waitForTimeout(60000);
    } catch (error) {
        console.error('Error loading the POM:', error);
    }

    await browser.close();
}

async function injectHighlighter(page: Page) {
    await page.addScriptTag({
        content: `
            window.__highlightElement = (element, label, color) => {
                if (!element) return;
                element.style.outline = '2px solid ' + color;
                element.setAttribute('title', 'Element: ' + label);
            };
            window.__highlightMissing = (label, color) => {
                const tag = document.createElement('div');
                tag.innerText = '❌ ' + label;
                tag.style.position = 'fixed';
                tag.style.bottom = '10px';
                tag.style.right = '10px';
                tag.style.background = color;
                tag.style.color = 'white';
                tag.style.padding = '5px 10px';
                tag.style.borderRadius = '4px';
                tag.style.zIndex = 9999;
                tag.style.marginTop = '4px';
                document.body.appendChild(tag);
            };
        `
    });
}

async function highlightElement(page: Page, handle: any, label: string, color: string) {
    try {
        await page.evaluate(({ el, label, color }) => {
            // @ts-ignore
            window.__highlightElement(el, label, color);
        }, { el: handle, label, color });
    } catch (e) {
        console.error('Error highlighting element:', label, e);
    }
}

async function highlightMissing(page: Page, label: string, color: string) {
    try {
        await page.evaluate(({ label, color }) => {
            // @ts-ignore
            window.__highlightMissing(label, color);
        }, { label, color });
    } catch (e) {
        console.error('Error highlighting as missing:', label, e);
    }
}

main();