Feature: Example API Testing
@API
  Scenario: Validate API response status
    Given I make a GET request to "/v2/pet/findByStatus?status=sold"
    Then the response status should be 200
