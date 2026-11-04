import { minMaxValueCheck, minMaxValidationMessage } from '../validations';

test('minMaxValueCheck validator with different inputs and formats', () => {
/** No max or min value */
expect(minMaxValueCheck('5', {})).toEqual(true);
  /＊＊＊/
expect(minMaxValueCheck('5', { maxValue: 4 })).toEqual(false);
expect(minMaxValueCheck('5', { maxValue: 5 })).toEqual(true);
expect(minMaxValueCheck('0', { minValue: 1 })).toEqual(false);
expect(minMaxValueCheck('1', { maxValue: 1 })).toEqual(true);
  /＊＊＊/
expect(minMaxValueCheck('$155.34', { maxValue: 4 })).toEqual(false);
expect(minMaxValueCheck('$155.34', { maxValue: 200 })).toEqual(true);
expect(minMaxValueCheck('0.00', { minValue: 1 })).toEqual(false);
expect(minMaxValueCheck('1.00%', { maxValue: 1 })).toEqual(true);
}};


















---
