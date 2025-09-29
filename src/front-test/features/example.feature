@Smoke
Feature: Completar el formulario de registro
    Scenario: El usuario completa el formulario utilizando datos validos
        Given El usuario esta en la pagina del formulario
        When El usuario completa con el nombre "Dinno"
        And El usuario completa con el apellido "Vezzoni"
        And El usuario selecciona el genero Masculino
        And El usuario completa con el mail "info@dvezzoni.com"
        And El usuario completa con el país "Argentina"
        And El usuario completa con el usuario "dvezzoni"
        And El usuario completa con la contraseña "Dvezzoni123!"
        And El usuario clickea el botón Registrar
        Then El usuario ve un mensaje de registro exitoso