import {
isValidTwoDecimalNumber,
isValidDate,
isValidYear,
isValidURL,
} from '../validations';

describe('validations', () => {
describe('isValidDate', () => {
it('should return valid', async () => {
const isValid = await isValidDate('10/03/2021');
expect(isValid).toEqual(true);
    }};
it('should return valid for empty string', async () => {
const isValid = await isValidDate('');
expect(isValid).toEqual(true);
    }};
it('should return invalid', async () => {
const isValid = await isValidDate('invalid date');
expect(isValid).toEqual(false);
    }};
  }};
describe('isValidTwoDecimalNumber', () => {
it('should return valid', async () => {
const isValid = await isValidTwoDecimalNumber('2.12');
expect(isValid).toEqual(true);
    }};
it('should return valid for empty string', async () => {
const isValid = await isValidTwoDecimalNumber('');
expect(isValid).toEqual(true);
    }};
it('should return invalid', async () => {
const isValid = await isValidTwoDecimalNumber('2.1234');
expect(isValid).toEqual(false);
    }};
  }};
describe('isValidYear', () => {
it('should return valid', async () => {
const isValid = await isValidYear('2021');
expect(isValid).toEqual(true);
    }};
it('should return valid for empty string', async () => {
const isValid = await isValidYear('');
expect(isValid).toEqual(true);
    }};
it('should return invalid', async () => {
const isValid = await isValidYear('invalidYear');
expect(isValid).toEqual(false);
    }};
  }};
describe('URL validation', () => {
it('should return true for a valid url', () => {
expect(isValidURL('https://www.google.com')).toBe(true);
    }};
it('should return true for a url without a protocol', () => {
expect(isValidURL('www.google.com')).toBe(true);
    }};
it('should return false for an invalid url', () => {
expect(isValidURL('google')).toBe(false);
    }};
it('should return false for an invalid type', () => {
expect(isValidURL(12)).toBe(false);
    }};
  }};
}};
