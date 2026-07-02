<p align="center">
<img src="https://i.imgur.com/jrStTTp.png" width="400px">
</p>

<h1 align="center">k0lmena Automation Framework</h1>

<p align="center">
Framework de automatización de pruebas <b>todo en uno</b>: End-to-End (UI), API, Mobile y Performance,
con reportes, auto-healing de locators y herramientas de apoyo. Open Source.
</p>

---

## 📑 Tabla de contenidos

- [¿Qué es y qué incluye?](#-qué-es-y-qué-incluye)
- [Tecnologías](#️-tecnologías)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Requisitos previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Configuración (variables de entorno)](#️-configuración-variables-de-entorno)
- [Uso del framework](#-uso-del-framework)
  - [Front / E2E (UI)](#front--e2e-ui)
  - [API](#api)
  - [Mobile](#mobile)
  - [Performance](#performance)
- [Reportes](#-reportes)
- [Auto-healing de locators](#-auto-healing-de-locators)
- [Herramientas](#️-herramientas)
- [Integración continua (CI)](#-integración-continua-ci)
- [Cómo agregar un test nuevo](#-cómo-agregar-un-test-nuevo)
- [Referencia de scripts npm](#-referencia-de-scripts-npm)
- [Contribuidores](#-contribuidores)
- [Licencia](#-licencia)

---

## 🧭 ¿Qué es y qué incluye?

**k0lmena** es un framework de automatización de QA que reúne, en un mismo repositorio y con una
misma sintaxis (Gherkin/BDD + TypeScript), cuatro tipos de pruebas:

| Tipo | Motor | Descripción |
|------|-------|-------------|
| **Front / E2E** | Playwright + Cucumber | Pruebas de interfaz sobre Chromium, Firefox y WebKit. |
| **API** | Axios + Cucumber | Pruebas de endpoints HTTP con validación de respuestas. |
| **Mobile** | WebdriverIO + Appium | Pruebas sobre apps móviles (local/Appium o BrowserStack). |
| **Performance** | Artillery + k6 | Pruebas de carga, estrés, soak y spike (HTTP y browser). |

Además incorpora:

- 🔧 **Auto-healing de locators** — recupera automáticamente selectores que se "rompen" usando el historial de ejecución.
- 📊 **Reportes** HTML por cada tipo de prueba (front, API, mobile, performance).
- 🛠️ **Herramientas** de apoyo: generador de locators (crawler), tester de enlaces rotos, grabador de tests (codegen) y modo debug.
- 📸 Captura automática de **screenshots**, **traces** y **logs** ante fallos (front).

---

## ⚙️ Tecnologías

- **TypeScript**
- **Playwright** (E2E + tracing + codegen)
- **Cucumber** (`@cucumber/cucumber`, BDD/Gherkin)
- **Axios** (API)
- **WebdriverIO + Appium** (mobile)
- **Artillery** y **k6** (performance)
- **Cheerio** (parsing HTML en herramientas)

---

## 📁 Estructura del proyecto

```
src/
├── front-test/               # Pruebas E2E (UI) con Playwright + Cucumber
│   ├── features/             # Escenarios en Gherkin (.feature)
│   ├── steps/                # Definiciones de steps (unen features con acciones)
│   ├── locators/             # Selectores de los elementos del sitio
│   ├── config/               # Configuración (ej. BASEURL desde .env)
│   ├── hooks/                # Hooks de Cucumber (setup de browser, screenshots, traces)
│   ├── utils/                # Funciones reutilizables (interactions, validations, keys, types)
│   └── auto-healing/         # Historial de locators para auto-healing
│
├── api-test/                 # Pruebas de API
│   ├── features/             # Escenarios Gherkin de API
│   └── tests/                # Steps de API (requests con axios)
│
├── mobile-test/              # Pruebas mobile con WebdriverIO + Appium
│   ├── apps/                 # APK/IPA bajo prueba
│   ├── features/ · steps/ · locators/
│   └── support/              # wdio.conf.ts y hooks
│
├── performance-test/         # Pruebas de performance
│   ├── artillery/            # Flujos y escenarios de Artillery
│   └── k6/                   # Escenarios k6 (http: smoke/stress/soak/spike + browser)
│
├── reports/                  # Generadores y salidas de reportes por área
│   ├── front/ · api/ · mobile/ · performance/
│
└── tools/                    # Herramientas de apoyo
    ├── crawler/              # Generador automático de locators (POM)
    ├── link-tester/          # Detector de enlaces e imágenes rotas
    ├── generator/            # Grabador de tests (Playwright codegen)
    └── debug/                # Hook de depuración
```

Archivos raíz relevantes: [`package.json`](package.json), [`cucumber.json`](cucumber.json) (perfiles), [`playwright.config.ts`](playwright.config.ts), [`tsconfig.json`](tsconfig.json), [`.example.env`](.example.env).

---

## 📋 Requisitos previos

- **Node.js** (LTS recomendado) — https://nodejs.org/en/download/
- **Visual Studio Code** (opcional) — https://code.visualstudio.com/download
- Para **mobile**: Appium y un emulador/dispositivo (o cuenta de BrowserStack).
- Para **performance con k6**: se instala el binario con el script de bootstrap (ver abajo).

---

## 🚀 Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar los navegadores de Playwright
npx playwright install

# 3. Crear tu archivo de entorno a partir del ejemplo
cp .example.env .env
```

Luego editá el `.env` con tus valores (ver la sección siguiente).

---

## ⚙️ Configuración (variables de entorno)

La configuración se hace por variables de entorno. Copiá [`.example.env`](.example.env) a `.env` y ajustá.

### General / Front

| Variable | Default | Descripción |
|----------|---------|-------------|
| `BASEURL` | — | URL del sitio bajo prueba (front, crawler, link-tester, codegen). |
| `BROWSER` | *(vacío)* | `chromium`, `firefox` o `webkit`. Vacío = ejecuta los **tres**. |
| `HEADLESS` | `true` | Ejecutar sin ventana (`true`/`false`). |
| `SLOWMO` | `0` | Milisegundos de retardo entre acciones (útil para depurar). |
| `VIEWPORT_WIDTH` | `1366` | Ancho del viewport. |
| `VIEWPORT_HEIGHT` | `768` | Alto del viewport. |
| `LOCALE` | `es-AR` | Locale del navegador. |
| `TIMEZONE` | `America/Argentina/Mendoza` | Zona horaria del navegador. |
| `TRACE` | `off` | Traces de Playwright: `off`, `on` o `on-failure`. |
| `REPORT_DIR` | `src/reports/front` | Carpeta donde se guardan screenshots/traces. |

### API

| Variable | Default | Descripción |
|----------|---------|-------------|
| `API_BASEURL` | `https://petstore.swagger.io` | URL base de la API bajo prueba. Se carga desde `.env.api`. |

### Auto-healing (front)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `K0LMENA_AUTO_HEALING` | `off` | Modo: `off`, `learn`, `heal` u `on` (learn + heal). |
| `K0LMENA_AUTO_HEALING_FLUSH` | `debounced` | Estrategia de escritura: `debounced`, `immediate` u `onEnd`. |
| `K0LMENA_AUTO_HEALING_WRITE_PRETTY` | `0` | `1` = JSON legible; `0` = compacto. |
| `K0LMENA_AUTO_HEALING_LOG` | `0` | `1` = logs verbosos del módulo. |
| `K0LMENA_AUTO_HEALING_CONSOLE` | `1` | `1` = imprime una línea cuando un locator se cura. |
| `K0LMENA_AUTO_HEALING_HISTORY_PATH` | `.k0lmena/auto-healing/front-history.json` | Ruta del archivo de historial. |
| `K0LMENA_AUTO_HEALING_MAX_CANDIDATES` | `12` | Máximo de candidatos guardados por locator. |
| `K0LMENA_AUTO_HEALING_SNAPSHOT_TIMEOUT_MS` | `250` | Timeout del snapshot del DOM durante el aprendizaje. |
| `K0LMENA_AUTO_HEALING_CANDIDATE_TIMEOUT_MS` | `1500` | Timeout al validar cada candidato durante el healing. |

---

## 🧪 Uso del framework

### Front / E2E (UI)

```bash
# Ejecutar solo los escenarios etiquetados @Smoke (con 1 reintento)
npm run test

# Ejecutar todos los tests
npm run allTests
```

Los perfiles de Cucumber están definidos en [`cucumber.json`](cucumber.json). Podés controlar el
navegador y el modo headless por variables de entorno, por ejemplo:

```bash
# Solo Chromium, con ventana visible y en cámara lenta
BROWSER=chromium HEADLESS=false SLOWMO=300 npm run test

# Habilitar traces solo cuando falla
TRACE=on-failure npm run test
```

### API

```bash
# Ejecuta los escenarios etiquetados @API
npm run apiTest
```

Definí `API_BASEURL` en un archivo `.env.api`. Los steps de API viven en [`src/api-test/tests/`](src/api-test/tests/).

### Mobile

```bash
# Ejecuta la suite mobile con WebdriverIO + Appium
npm run mobile
```

La configuración está en [`src/mobile-test/support/wdio.conf.ts`](src/mobile-test/support/wdio.conf.ts).
Por defecto corre en local contra Appium (`localhost:4723`); el archivo incluye un bloque comentado
para ejecutar en **BrowserStack** (definí `BROWSERSTACK_USER` y `BROWSERSTACK_KEY`).

### Performance

**Artillery:**

```bash
# Test de carga (genera report.json)
npm run load
```

**k6** (requiere instalar el binario la primera vez):

```bash
# 1. Instalar k6 (Windows)
npm run bootstrap:k6

# 2. Compilar los escenarios TypeScript a JS
npm run k6:build

# 3. Ejecutar un escenario
npm run k6::smoke     # smoke test
npm run k6:stress     # stress test
npm run k6:soak       # soak test
npm run k6:spike      # spike test
npm run k6:run:browser  # escenario de browser
```

Los escenarios k6 están en [`src/performance-test/k6/http/`](src/performance-test/k6/http/) y se
compilan con esbuild a `dist/`.

---

## 📊 Reportes

Después de cada ejecución podés generar el reporte correspondiente:

| Área | Comando | Descripción |
|------|---------|-------------|
| Front | `npm run report` | Reporte HTML completo. |
| Front | `npm run report-default` | Reporte por defecto de Cucumber. |
| API | `npm run api-report` | Reporte de la suite de API. |
| Mobile | `npm run mobile-report` | Reporte de la suite mobile. |
| Performance (local) | `npm run load-report` | Reporte HTML de Artillery. |
| Performance (cloud) | `npm run load-report-cloud` | Sube el reporte a Artillery Cloud. |

> **Nota:** para los reportes en la nube de Artillery necesitás registrarte en https://artillery.io
> y generar una KEY. Pasala como secret / variable, **no** la dejes hardcodeada en `package.json`.

Ante un fallo en front, el framework adjunta automáticamente **screenshot**, **logs de consola del navegador**
y, si `TRACE` está activo, el **trace** de Playwright.

---

## 🔧 Auto-healing de locators

k0lmena puede **recuperar automáticamente** locators que dejan de funcionar (por ejemplo, cuando la
app cambia y un selector deja de matchear). Funciona en dos fases:

1. **Learn** — cada vez que una acción tiene éxito, toma un snapshot del elemento real y guarda
   locators alternativos (por `data-testid`, `id`, `name`, `aria-label`, rol, texto, clases, etc.)
   en un archivo de historial.
2. **Heal** — si el locator original falla, prueba los candidatos guardados (rankeados por éxito
   histórico y página) hasta encontrar uno que funcione, y reporta el heal.

### Modos (`K0LMENA_AUTO_HEALING`)

| Modo | Comportamiento |
|------|----------------|
| `off` | Desactivado (por defecto). |
| `learn` | Solo aprende candidatos; no cura. |
| `heal` | Solo cura usando el historial existente. |
| `on` | Aprende **y** cura (recomendado). |

> El modo `heal` por sí solo necesita un historial previo generado con `learn`/`on`.
> El modo útil en la práctica es **`on`**.

```bash
# Ejecutar el front con auto-healing activo
K0LMENA_AUTO_HEALING=on npm run test
```

El historial se guarda por defecto en `.k0lmena/auto-healing/front-history.json` (configurable con
`K0LMENA_AUTO_HEALING_HISTORY_PATH`). Cuando un locator se cura, verás en consola una línea
`HEALED: <original> -> <candidato>` y el evento queda adjunto en el reporte.

---

## 🛠️ Herramientas

Todas las herramientas usan `BASEURL` del `.env` (salvo que se indique lo contrario).

### Crawler (generador de locators)

Recorre una página y genera un archivo POM con los locators encontrados.

```bash
npm run crawler                 # usa BASEURL
# o pasando la URL como argumento:
npx ts-node src/tools/crawler/locators-generator.ts https://mi-sitio.com
```

Salida: `src/tools/crawler/output/locators-output.ts`.

### Link tester (enlaces/imágenes rotas)

Verifica enlaces e imágenes de una página (o de todo el sitio con `-full`).

```bash
npm run link-tester         # página base
npm run link-tester:full    # crawl completo del sitio
```

Salida: `src/tools/link-tester/output.txt` (y `error_log.txt` para errores).

### Record (Playwright codegen)

Abre el grabador de Playwright apuntando a `BASEURL` para generar código de test interactivamente.

```bash
npm run record            # genera src/tools/generator/gen.ts
npm run record:generator  # variante del grabador
```

### Debug

Corre el front con un hook de depuración adicional (perfil `debug` de Cucumber).

```bash
npm run debug
```

---

## 🔄 Integración continua (CI)

El workflow [`.github/workflows/Tests.yaml`](.github/workflows/Tests.yaml) corre en GitHub Actions
(disparo manual: **workflow_dispatch**) dentro del contenedor oficial de Playwright y ejecuta, en orden:

1. Instalación de dependencias y navegadores.
2. **Front tests** + reporte.
3. **API tests** + reporte.
4. **Performance tests** (Artillery) + reporte.
5. Publicación de los reportes como **artifacts** (front, API y performance).

---

## ➕ Cómo agregar un test nuevo

Ejemplo para una prueba **front**:

1. **Feature** — creá/editá un `.feature` en [`src/front-test/features/`](src/front-test/features/) con el escenario en Gherkin.
2. **Locators** — agregá los selectores en [`src/front-test/locators/`](src/front-test/locators/).
3. **Steps** — implementá los steps en [`src/front-test/steps/`](src/front-test/steps/), usando las
   funciones reutilizables de [`src/front-test/utils/interactions.ts`](src/front-test/utils/interactions.ts)
   (`getByPlaceholderAndFillIt`, `getElementByRoleAndClickIt`, `selectByLabel`, `click`, `fill`, etc.).
4. Ejecutá con `npm run test` (o etiquetá el escenario con `@Smoke`).

Las utilidades de interacción ya integran el auto-healing, así que tus steps se benefician de él sin código extra.

---

## 📦 Referencia de scripts npm

| Script | Qué hace |
|--------|----------|
| `test` | Front: escenarios `@Smoke` (perfil `front`, 1 reintento). |
| `allTests` | Ejecuta todos los tests. |
| `report` / `report-default` | Reporte front completo / reporte por defecto de Cucumber. |
| `apiTest` / `api-report` | Ejecuta / reporta la suite de API. |
| `mobile` / `mobile-report` | Ejecuta / reporta la suite mobile. |
| `load` / `load-report` / `load-report-cloud` | Performance con Artillery (run / reporte local / reporte cloud). |
| `bootstrap:k6` / `k6:build` | Instala el binario de k6 / compila los escenarios. |
| `k6::smoke` · `k6:stress` · `k6:soak` · `k6:spike` · `k6:run:browser` | Escenarios de k6. |
| `crawler` | Generador de locators (POM). |
| `link-tester` / `link-tester:full` | Tester de enlaces/imágenes rotas. |
| `record` / `record:generator` | Grabador de tests (Playwright codegen). |
| `debug` | Front en modo debug. |

---

## 📖 Documentación en video

[![Watch the video](https://img.youtube.com/vi/n7plezXinZ8/maxresdefault.jpg)](https://youtu.be/n7plezXinZ8)

---

## 👥 Contribuidores

- Danilo Vezzoni
- Gianella Vezzoni
- Maximiliano Pintos
- Yanko Leta

## ⭐ Licencia

Este framework es Open Source. Licencia ISC.
