import { Given, When, Then } from '@cucumber/cucumber';
import { pages } from '../hooks/hook';
import * as formLocators from '../locators/formLocators';
import {
  getByLabelAndFillIt,
  getElementByRoleAndClickIt,
} from '../utils/interactions';
import { expect } from '@playwright/test';

Given('User navigates to the LetCode form page', async () => {
  for (const page of pages) {
    await page.goto('https://letcode.in/forms');
  }
});

When('User fills all the fields with valid data', async function () {
  for (const page of pages) {
    await page.locator(formLocators.firstName).fill('John');
    await page.locator(formLocators.lastName).fill('Doe');
    await page.locator(formLocators.email).fill('johndoe@example.com');
    await page.locator(formLocators.countryCode).selectOption({ label: 'USA (+1)' });
    await page.locator(formLocators.phoneNumber).fill('1234567890');
    await page.locator(formLocators.addressLine1).fill('123 Main St');
    await page.locator(formLocators.addressLine2).fill('Apt 4B');
    await page.locator(formLocators.state).fill('California');
    await page.locator(formLocators.postalCode).fill('90210');
    await page.locator(formLocators.country).selectOption({ label: 'United States' });
    await page.locator(formLocators.dob).fill('1990-01-01');
    await page.locator(formLocators.genderMale).check();
  }
});

When('User agrees to the terms and conditions', async function () {
  for (const page of pages) {
    await page.locator(formLocators.terms).check();
  }
});

When('User clicks the submit button', async function () {
  for (const page of pages) {
    await page.locator(formLocators.submitButton).click();
  }
});

Then('The form should be submitted successfully', async function () {
  for (const page of pages) {
    const currentUrl = page.url();
    expect(currentUrl).not.toBe('https://letcode.in/forms');
  }
});

When('User enters an invalid email address', async function () {
  for (const page of pages) {
    await page.locator(formLocators.email).fill('invalid-email');
  }
});

Then('An invalid email error message should be displayed', async function () {
  for (const page of pages) {
    const emailInput = page.locator(formLocators.email);
    const isInvalid = await emailInput.evaluate((element) => (element as HTMLInputElement).validity.typeMismatch);
    expect(isInvalid).toBe(true);
  }
});

When('User fills all the fields with valid data except for the first name', async function () {
  for (const page of pages) {
    await page.locator(formLocators.lastName).fill('Doe');
    await page.locator(formLocators.email).fill('johndoe@example.com');
    await page.locator(formLocators.countryCode).selectOption({ label: 'USA (+1)' });
    await page.locator(formLocators.phoneNumber).fill('1234567890');
    await page.locator(formLocators.addressLine1).fill('123 Main St');
    await page.locator(formLocators.addressLine2).fill('Apt 4B');
    await page.locator(formLocators.state).fill('California');
    await page.locator(formLocators.postalCode).fill('90210');
    await page.locator(formLocators.country).selectOption({ label: 'United States' });
    await page.locator(formLocators.dob).fill('1990-01-01');
    await page.locator(formLocators.genderMale).check();
  }
});

Then('A required field error message should be displayed', async function () {
  for (const page of pages) {
    const firstNameInput = page.locator(formLocators.firstName);
    const isInvalid = await firstNameInput.evaluate((element) => (element as HTMLInputElement).validity.valueMissing);
    expect(isInvalid).toBe(true);
  }
});

Then('A terms and conditions error message should be displayed', async function () {
    for (const page of pages) {
        const termsInput = page.locator(formLocators.terms);
        const isInvalid = await termsInput.evaluate((element) => (element as HTMLInputElement).validity.valueMissing);
        expect(isInvalid).toBe(true);
    }
});

When('User fills only the required fields with valid data', async function () {
    for (const page of pages) {
        await page.locator(formLocators.firstName).fill('John');
        await page.locator(formLocators.lastName).fill('Doe');
        await page.locator(formLocators.email).fill('johndoe@example.com');
        await page.locator(formLocators.countryCode).selectOption({ label: 'USA (+1)' });
        await page.locator(formLocators.phoneNumber).fill('1234567890');
        await page.locator(formLocators.addressLine1).fill('123 Main St');
        await page.locator(formLocators.addressLine2).fill('Apt 4B');
        await page.locator(formLocators.state).fill('California');
        await page.locator(formLocators.postalCode).fill('90210');
        await page.locator(formLocators.country).selectOption({ label: 'United States' });
        await page.locator(formLocators.dob).fill('1990-01-01');
        await page.locator(formLocators.genderMale).check();
    }
});
