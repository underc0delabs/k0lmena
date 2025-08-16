@FormValidation @Smoke
Feature: Form validation on LetCode

  Scenario: Successful submission with all valid data
    Given User navigates to the LetCode form page
    When User fills all the fields with valid data
    And User agrees to the terms and conditions
    And User clicks the submit button
    Then The form should be submitted successfully

  Scenario: Attempt submission with an invalid email address
    Given User navigates to the LetCode form page
    When User fills all the fields with valid data
    And User enters an invalid email address
    And User agrees to the terms and conditions
    And User clicks the submit button
    Then An invalid email error message should be displayed

  Scenario: Attempt submission with a required field left empty
    Given User navigates to the LetCode form page
    When User fills all the fields with valid data except for the first name
    And User agrees to the terms and conditions
    And User clicks the submit button
    Then A required field error message should be displayed

  Scenario: Attempt submission without agreeing to the terms and conditions
    Given User navigates to the LetCode form page
    When User fills all the fields with valid data
    And User clicks the submit button
    Then A terms and conditions error message should be displayed

  Scenario: Successful submission with only the required fields filled
    Given User navigates to the LetCode form page
    When User fills only the required fields with valid data
    And User agrees to the terms and conditions
    And User clicks the submit button
    Then The form should be submitted successfully
