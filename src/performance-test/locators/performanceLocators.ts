export const loginLocators = {
  url: 'https://qarmy.ar/practica/login/',
  form: 'form[action="login.php"]',
  username: '#username',
  password: '#password',
  submit: 'button.btn[type="submit"]',
  success: {
    url: '**/practica/login/success.php',
    headingText: 'Ingreso exitoso',
    logoutText: 'Cerrar sesión',
  },
};