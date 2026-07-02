import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';

// Configuración de directorio de salida
const OUTPUT_DIR = path.resolve(__dirname);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'output.txt');
const ERROR_LOG_FILE = path.join(OUTPUT_DIR, 'error_log.txt');

// Asegurar existencia del directorio de salida
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let outputLines: string[] = [];
function logLine(line: string) {
  console.log(line);
  outputLines.push(line);
}

// Concurrencia
const PAGE_CONCURRENCY = 5;
const RESOURCE_CONCURRENCY = 20;
const limitResource = pLimit(RESOURCE_CONCURRENCY);

type ResourceType = 'link' | 'image';
interface Resource { url: string; type: ResourceType; }

// Helper para formatear duración en hh:mm:ss
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Obtiene HTML de una URL
async function fetchHTML(pageUrl: string): Promise<string> {
  try {
    const resp = await axios.get<string>(pageUrl, {
      responseType: 'text',
      headers: { 'User-Agent': 'k0lmena-link-tester/1.0' }
    });
    return resp.data;
  } catch (error: any) {
    // Registrar error de fetch con contexto
    const msg = `Error al obtener HTML de ${pageUrl}\n` +
                `Status: ${error.response?.status || 'sin respuesta'}\n` +
                `Mensaje: ${error.message}`;
    throw new Error(msg);
  }
}

// Extrae enlaces e imágenes válidas para testear
function extractResources(html: string, baseUrl: string): Resource[] {
  const $ = cheerio.load(html);
  const items: Resource[] = [];

  // Links
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')!.trim();
    if (/^(data:|#|mailto:|tel:)/.test(href)) return;
    if (href.includes('[') || href.includes(']')) return;  // ignorar URLs con corchetes
    try {
      const u = new URL(href, baseUrl);
      if (u.hash) return;
      if (u.href.includes('PHPSESSID') || u.href.includes('/cdn-cgi/l/email-protection')) return;
      items.push({ url: u.href, type: 'link' });
    } catch {}
  });

  // Extensiones de imagen comunes
  const isImageExt = (p: string) => /\.(jpe?g|png|gif|svg)$/i.test(p);

  // Imágenes en src y srcset
  $('img').each((_, el) => {
    const src = $(el).attr('src')?.trim();
    if (src && !src.startsWith('data:') && !src.includes('[') && !src.includes(']')) {
      try {
        const u = new URL(src, baseUrl);
        if (!u.hash && !u.href.includes('PHPSESSID') && isImageExt(u.pathname)) {
          items.push({ url: u.href, type: 'image' });
        }
      } catch {}
    }
    const srcset = $(el).attr('srcset');
    if (srcset) {
      srcset.split(',').forEach(part => {
        const urlPart = part.trim().split(/\s+/)[0];
        if (urlPart && !urlPart.startsWith('data:') && !urlPart.includes('[') && !urlPart.includes(']')) {
          try {
            const u = new URL(urlPart, baseUrl);
            if (!u.hash && !u.href.includes('PHPSESSID') && isImageExt(u.pathname)) {
              items.push({ url: u.href, type: 'image' });
            }
          } catch {}
        }
      });
    }
  });

  // Imágenes en <source srcset>
  $('source[srcset]').each((_, el) => {
    $(el).attr('srcset')!.split(',').forEach(part => {
      const urlPart = part.trim().split(/\s+/)[0];
      if (urlPart && !urlPart.startsWith('data:') && !urlPart.includes('[') && !urlPart.includes(']')) {
        try {
          const u = new URL(urlPart, baseUrl);
          if (!u.hash && !u.href.includes('PHPSESSID') && isImageExt(u.pathname)) {
            items.push({ url: u.href, type: 'image' });
          }
        } catch {}
      }
    });
  });

  return items;
}

// Obtiene código de estado
async function getStatusCode(url: string): Promise<number | null> {
  try {
    const head = await axios.head(url, { timeout: 5000, maxRedirects: 5, headers: { 'User-Agent': 'k0lmena-link-tester/1.0' } });
    return head.status;
  } catch (e: any) {
    const st = e.response?.status;
    if (st && st !== 405) return st;
  }
  try {
    const get = await axios.get(url, { timeout: 5000, maxRedirects: 5, responseType: 'stream', headers: { 'User-Agent': 'k0lmena-link-tester/1.0' } });
    return get.status;
  } catch (e: any) {
    return e.response?.status ?? null;
  }
}

// Verifica que recurso image tenga content-type imagen
async function isImageValid(url: string): Promise<boolean> {
  const cleanUrl = url.split('?')[0];
  try {
    const head = await axios.head(cleanUrl, { timeout: 5000, headers: { 'User-Agent': 'k0lmena-link-tester/1.0' } });
    return String(head.headers['content-type'] || '').startsWith('image/');
  } catch {
    return false;
  }
}

// Testea lista de recursos
async function testResources(resources: Resource[]): Promise<{ brokenLinks: Resource[]; brokenImages: Resource[]; }> {
  const brokenLinks: Resource[] = [];
  const brokenImages: Resource[] = [];
  await Promise.all(resources.map(r => limitResource(async () => {
    const testUrl = r.type === 'image' ? r.url.split('?')[0] : r.url;
    const status = await getStatusCode(testUrl);
    const code = status ?? 0;
    let broken = false;
    if ([400, 404].includes(code) || (code >= 500 && code < 600)) broken = true;
    else if (r.type === 'image' && !(await isImageValid(r.url))) broken = true;
    if (broken) {
      if (r.type === 'link') brokenLinks.push(r);
      else brokenImages.push(r);
    }
  })));
  return { brokenLinks, brokenImages };
}

// Obtiene URLs del sitemap
async function getSitemapUrls(baseUrl: string): Promise<string[]> {
  try {
    const xml = await fetchHTML(baseUrl.replace(/\/$/, '') + '/sitemap.xml');
    const urls: string[] = [];
    const re = /<loc>(.*?)<\/loc>/g;
    let m;
    while ((m = re.exec(xml))) urls.push(m[1].trim());
    return urls;
  } catch {
    return [];
  }
}

// Escaneo completo (crawler)
export async function crawlAndTest(baseUrl: string): Promise<void> {
  logLine('🚀 Iniciando escaneo completo...');
  const baseHost = new URL(baseUrl).hostname;
  const visited = new Set<string>();
  const brokenLinksAll: Resource[] = [];
  const brokenImagesAll: Resource[] = [];
  let totalLinks = 0;
  let totalImages = 0;
  let currentPage = '';

  const sitemap = await getSitemapUrls(baseUrl);
  const queue = [baseUrl, ...sitemap.filter(u => new URL(u).hostname.endsWith(baseHost))];

  const limitPage = pLimit(PAGE_CONCURRENCY);
  const startTime = Date.now();

  try {
    while (queue.length) {
      const batch = queue.splice(0, PAGE_CONCURRENCY);
      await Promise.all(batch.map(page => limitPage(async () => {
        if (visited.has(page)) return;
        visited.add(page);
        currentPage = page;
        logLine(`🔍 Escaneando: ${page}`);
        const html = await fetchHTML(page);
        const resources = extractResources(html, page);
        totalLinks += resources.filter(r => r.type === 'link').length;
        totalImages += resources.filter(r => r.type === 'image').length;
        const { brokenLinks, brokenImages } = await testResources(resources);
        brokenLinksAll.push(...brokenLinks);
        brokenImagesAll.push(...brokenImages);
        brokenLinks.forEach(r => logLine(`- 🚫 Enlace roto: ${r.url}`));
        brokenImages.forEach(r => logLine(`- 🚫 Imagen rota: ${r.url}`));
        resources.filter(r => r.type === 'link').forEach(r => {
          try {
            const u = new URL(r.url);
            if ((u.hostname === baseHost || u.hostname.endsWith(`.${baseHost}`)) && !visited.has(u.href) && !queue.includes(u.href)) {
              queue.push(u.href);
            }
          } catch {}
        });
      })));
    }
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    const errContent = `=== Error en página: ${currentPage} ===\n` +
                       `Time: ${timestamp}\n` +
                       `Mensaje: ${error.message}\n` +
                       `Stack:\n${error.stack}\n`;
    fs.writeFileSync(ERROR_LOG_FILE, errContent, 'utf-8');
    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
    throw error;
  }

  const endTime = Date.now();
  logLine('');
  logLine('✅ Escaneo completo finalizado.');
  logLine(`Páginas escaneadas: ${visited.size}`);
  logLine(`🔗 Total enlaces: ${totalLinks} | 🚫 Enlaces rotos: ${brokenLinksAll.length}`);
  logLine(`🖼️ Total imágenes: ${totalImages} | 🚫 Imágenes rotas: ${brokenImagesAll.length}`);
  logLine(`⏱️ Duración: ${formatDuration(endTime - startTime)}`);

  // Guardar resultados completos
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
  logLine(`📄 Resultados guardados en: ${OUTPUT_FILE}`);
}

// Escaneo de página única
async function testSinglePage(baseUrl: string): Promise<void> {
  logLine('🚀 Iniciando escaneo de página única...');
  const startTime = Date.now();
  let currentPage = baseUrl;
  try {
    const html = await fetchHTML(baseUrl);
    const resources = extractResources(html, baseUrl);
    const { brokenLinks, brokenImages } = await testResources(resources);
    brokenLinks.forEach(r => logLine(`- 🚫 Enlace roto: ${r.url}`));
    brokenImages.forEach(r => logLine(`- 🚫 Imagen rota: ${r.url}`));

    const endTime = Date.now();
    logLine('');
    logLine('🔚 Resultados para página única:');
    logLine(`🔗 Enlaces escaneados: ${resources.filter(r => r.type === 'link').length} | 🚫 Enlaces rotos: ${brokenLinks.length}`);
    logLine(`🖼️ Imágenes escaneadas: ${resources.filter(r => r.type === 'image').length} | 🚫 Imágenes rotas: ${brokenImages.length}`);
    logLine(`⏱️ Duración: ${formatDuration(endTime - startTime)}`);
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    const errContent = `=== Error en página única: ${currentPage} ===\n` +
                       `Time: ${timestamp}\n` +
                       `Mensaje: ${error.message}\n` +
                       `Stack:\n${error.stack}\n`;
    fs.writeFileSync(ERROR_LOG_FILE, errContent, 'utf-8');
    fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
    throw error;
  }

  // Guardar resultados
  fs.writeFileSync(OUTPUT_FILE, outputLines.join('\n'), 'utf-8');
  logLine(`📄 Resultados guardados en: ${OUTPUT_FILE}`);
}

// CLI con opciones
async function main() {
  const baseUrl = process.env.BASEURL;
  if (!baseUrl) { console.error('❌ Error: BASEURL no definido'); process.exit(1); }
  const args = process.argv.slice(2);
  const full = args.includes('-full');

  // Limpiar líneas previas
  outputLines = [];

  try {
    if (full) await crawlAndTest(baseUrl);
    else await testSinglePage(baseUrl);
  } catch (error) {
    console.error('❌ Error durante el escaneo. Consulta error_log.txt para más detalles.');
  }
}

if (require.main === module) main();
