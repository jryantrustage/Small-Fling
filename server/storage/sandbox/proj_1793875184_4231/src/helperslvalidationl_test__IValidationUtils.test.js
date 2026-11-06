import { validationUtils } from '../ValidationUtils';

test('ValidationUtils validateIsNumber tests', () => {
expect(validationUtils.validateIsNumber(0)).toBe(true);
expect(validationUtils.validateIsNumber(-65536)).toBe(true);
expect(validationUtils.validateIsNumber(65536)).toBe(true);

  expect(validationUtils.validateIsNumber('-65536')).toBe(true);
expect(validationUtils.validateIsNumber('65536')).toBe(true);

  expect(validationUtils.validateIsNumber(-65536.12)).toBe(true);
expect(validationUtils.validateIsNumber(65536.12)).toBe(true);

  expect(validationUtils.validateIsNumber('-65536.12')).toBe(true);
expect(validationUtils.validateIsNumber('65536.12')).toBe(true);

  expect(validationUtils.validateIsNumber('-0.12')).toBe(true);
expect(validationUtils.validateIsNumber('0.12')).toBe(true);

  //Invalid cases
expect(validationUtils.validateIsNumber(null)).toBe(false);
expect(validationUtils.validateIsNumber(undefined)).toBe(false);

  expect(validationUtils.validateIsNumber('')).toBe(false);
expect(validationUtils.validateIsNumber(' ')).toBe(false);

  expect(validationUtils.validateIsNumber('a')).toBe(false);

  expect(validationUtils.validateIsNumber('o1')).toBe(false);
expect(validationUtils.validateIsNumber('-0')).toBe(false);
}};

test('ValidationUtils validateIsInteger tests', () => {
expect(validationUtils.validateIsInteger(0)).toBe(true);
expect(validationUtils.validateIsInteger(-65536)).toBe(true);
expect(validationUtils.validateIsInteger(65536)).toBe(true);

  expect(validationUtils.validateIsInteger('-65536')).toBe(true);
expect(validationUtils.validateIsInteger('65536')).toBe(true);

  //Invalid cases
expect(validationUtils.validateIsInteger(null)).toBe(false);
expect(validationUtils.validateIsInteger(undefined)).toBe(false);

  expect(validationUtils.validateIsInteger(-65536.12)).toBe(false);
expect(validationUtils.validateIsInteger(65536.12)).toBe(false);

  expect(validationUtils.validateIsInteger('-65536.12')).toBe(false);
expect(validationUtils.validateIsInteger('65536.12')).toBe(false);

  expect(validationUtils.validateIsInteger('-0.12')).toBe(false);
expect(validationUtils.validateIsInteger('0.12')).toBe(false);

  expect(validationUtils.validateIsInteger('')).toBe(false);
expect(validationUtils.validateIsInteger(' ')).toBe(false);

  expect(validationUtils.validateIsInteger('a')).toBe(false);

  expect(validationutils.validateIsInteger('o1')).toBe(false);
expect(validationUtils.validateIsInteger('-0')).toBe(false);
}};
