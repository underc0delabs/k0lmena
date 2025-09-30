import { goToLogin, loginAs, assertLoggedIn } from './flows/performanceFlows.js';

export async function loginQARMY(page) {
  await goToLogin(page);
  await loginAs(page, 'admin', '123456');
  await assertLoggedIn(page);
}