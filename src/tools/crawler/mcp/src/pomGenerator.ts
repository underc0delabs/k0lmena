import fs from "fs";
import path from "path";

export type ElementData = {
  tag: string;
  text: string;
  selector: string;
};

function toCamelCase(text: string): string {
  let name = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s(.)/g, (_, group1) => group1.toUpperCase())
    .replace(/\s/g, '');
  if (!name || /^\d+$/.test(name)) return 'element';
  if (/^[0-9]/.test(name)) name = '_' + name;
  return name;
}

function generateLocatorName(el: ElementData, tag: string, usedNames: Set<string>): string {
  let baseName = "";

  if (el.text && el.text.length > 2 && el.text.length < 30) {
    baseName = toCamelCase(el.text);
  } else if (el.selector.startsWith('[data-testid=')) {
    const match = el.selector.match(/\[data-testid="?([^"\]]+)"?\]/);
    baseName = toCamelCase(match ? match[1] : `testid_${tag}`);
  } else if (el.selector.startsWith('#')) {
    baseName = toCamelCase(el.selector.substring(1));
  } else {
    baseName = tag;
  }

  let suffix = "";
  if (tag === "button") suffix = "Button";
  else if (tag === "a") suffix = "Link";
  else if (tag === "input") suffix = "Input";
  else if (tag === "select") suffix = "Select";
  else if (tag === "textarea") suffix = "Textarea";
  else suffix = "Element";

  let finalName = baseName.endsWith(suffix) ? baseName : baseName + suffix;
  let uniqueName = finalName;
  let counter = 1;
  while (usedNames.has(uniqueName)) {
    uniqueName = `${finalName}${counter++}`;
  }
  usedNames.add(uniqueName);
  return uniqueName;
}

export function generatePOM(elements: ElementData[], outputFile: string, pageName: string) {
  // Construir un mapa de frecuencias para los textos (considerando textos con longitud entre 3 y 29 caracteres)
  const frequencyMap: Record<string, number> = {};
  elements.forEach(el => {
    if (el.text && el.text.length > 2 && el.text.length < 30) {
      frequencyMap[el.text] = (frequencyMap[el.text] || 0) + 1;
    }
  });

  const usedNames = new Set<string>();
  const usedSelectors = new Set<string>();
  const lines: string[] = [];
  lines.push(`// Locators for page: ${pageName}`);
  lines.push("");

  elements.forEach(el => {
    if (!el.selector || usedSelectors.has(el.selector)) return;
    usedSelectors.add(el.selector);
    const locatorName = generateLocatorName(el, el.tag, usedNames);
    // Si el texto es único, se utiliza; en caso contrario se usa el selector.
    const locatorValue =
      el.text && el.text.length > 2 && el.text.length < 30 && frequencyMap[el.text] === 1
        ? el.text
        : el.selector;
    lines.push(`export const ${locatorName} = '${locatorValue}';`);
  });

  fs.writeFileSync(path.resolve(outputFile), lines.join("\n"), "utf-8");
  console.log(`Locators output generated in: ${outputFile}`);
}
