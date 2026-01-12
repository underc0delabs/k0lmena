@Smoke
Feature: Completar el formulario de registro
  Como usuario
  Quiero completar el formulario de registro
  Para crear una cuenta en el sistema

  Background:
    Given El usuario esta en la pagina del formulario

  @Smoke
  Scenario: El usuario completa el formulario utilizando datos validos
    When El usuario completa con el nombre "Dinno"
    And El usuario completa con el apellido "Vezzoni"
    And El usuario selecciona el genero Masculino
    And El usuario completa con el mail "info@dvezzoni.com"
    And El usuario completa con el país "Argentina"
    And El usuario completa con el usuario "dvezzoni"
    And El usuario completa con la contraseña "Dvezzoni123!"
    And El usuario clickea el botón Registrar
    Then El usuario ve un mensaje de registro exitoso

  @Smoke
  Scenario: Validación de email inválido al ingresar un mail sin TLD
    When El usuario completa con el nombre "Dinno"
    And El usuario completa con el apellido "Vezzoni"
    And El usuario selecciona el genero Masculino
    And El usuario completa con el mail "admin@test"
    And El usuario completa con el país "Argentina"
    And El usuario completa con el usuario "dvezzoni"
    And El usuario completa con la contraseña "Dvezzoni123!"
    And El usuario clickea el botón Registrar
    Then El usuario ve el mensaje de validación de email