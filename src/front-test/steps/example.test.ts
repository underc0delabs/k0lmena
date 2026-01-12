import { expect } from '@playwright/test';
import { Given, When, Then } from '@cucumber/cucumber';
import { BASEURL } from '../config';
import { pages } from '../hooks/hook';
import {
  getByPlaceholderAndFillIt,
  getElementByRoleAndClickIt,
  selectByLabel,
} from '../utils/interactions';
import {
  phNombre,
  phApellido,
  phEmail,
  phUsuario,
  phPassword,
  radioMasculinoName,
  lblPais,
  btnRegistrarName,
  msgExito,
  msgValidacionMail,
} from '../locators/exampleLocators';

Given('El usuario esta en la pagina del formulario', async () => {
  for (const page of pages) {
    console.log(`Ejecutando prueba en navegador: ${page.context().browser()?.browserType().name()}`);
    await page.goto(BASEURL);
    await page.waitForLoadState('domcontentloaded');
  }
});

When('El usuario completa con el nombre {string}', async (nombre: string) => {
  for (const page of pages) {
    await getByPlaceholderAndFillIt(page, phNombre, nombre);
  }
});

When('El usuario completa con el apellido {string}', async (apellido: string) => {
  for (const page of pages) {
    await getByPlaceholderAndFillIt(page, phApellido, apellido);
  }
});

When('El usuario selecciona el genero Masculino', async () => {
  for (const page of pages) {
    // ahora realmente clickeamos el radio
    await getElementByRoleAndClickIt(page, 'radio', radioMasculinoName);
  }
});

When('El usuario completa con el mail {string}', async (email: string) => {
  for (const page of pages) {
    await getByPlaceholderAndFillIt(page, phEmail, email);
  }
});

When('El usuario completa con el país {string}', async (pais: string) => {
  for (const page of pages) {
    await selectByLabel(page, lblPais, pais);
  }
});

When('El usuario completa con el usuario {string}', async (usuario: string) => {
  for (const page of pages) {
    await getByPlaceholderAndFillIt(page, phUsuario, usuario);
  }
});

When('El usuario completa con la contraseña {string}', async (contrasenia: string) => {
  for (const page of pages) {
    await getByPlaceholderAndFillIt(page, phPassword, contrasenia);
  }
});

When('El usuario clickea el botón Registrar', async () => {
  for (const page of pages) {
    await getElementByRoleAndClickIt(page, 'button', btnRegistrarName);
    await page.waitForLoadState('networkidle').catch(() => {});
  }
});

Then('El usuario ve un mensaje de registro exitoso', async () => {
  for (const page of pages) {
    await expect(page.getByText(msgExito)).toBeVisible();
  }
});

Then('El usuario ve el mensaje de validación de email', async () => {
  for (const page of pages) {
    await expect(page.getByText(msgValidacionMail)).toBeVisible();
  }
});

