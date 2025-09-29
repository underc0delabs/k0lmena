// ─────────────────────────────────────────────────────────────────────────────
// Configuración Artillery
// ─────────────────────────────────────────────────────────────────────────────
export const config = {
  target: 'https://qarmy.ar',           
  phases: [
    { duration: 5, arrivalRate: 1, rampTo: 3 },
  ],
  engines: {
    playwright: {
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Escenarios
// ─────────────────────────────────────────────────────────────────────────────

export const scenarios = [
  { name: 'Login QARMY', engine: 'playwright', testFunction: loginQARMY },
];

// ─────────────────────────────────────────────────────────────────────────────
// Implementación
// ─────────────────────────────────────────────────────────────────────────────

export async function loginQARMY(page: any) {
  // Timeouts razonables para CI/local
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(20000);

  // 1) Ir al login con URL ABSOLUTA (evita ambigüedades con baseURL)
  await page.goto('https://qarmy.ar/practica/login/', { waitUntil: 'domcontentloaded' });

  // 2) Esperar el formulario e inputs según tu HTML
  await page.waitForSelector('form[action="login.php"]', { state: 'attached' });
  await page.waitForSelector('#username', { state: 'visible' });
  await page.waitForSelector('#password', { state: 'visible' });

  // 3) Completar credenciales demo y enviar
  await page.fill('#username', 'admin');
  await page.fill('#password', '123456');
  await page.click('button.btn[type="submit"]');

  // 4) Esperar respuesta/redirect
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  }

  // 5) Pequeño check post-login: si tu app redirige o muestra algún texto
await page.getByRole('heading', { name: 'Ingreso exitoso' })
  .waitFor({ state: 'visible', timeout: 5000 });
}
