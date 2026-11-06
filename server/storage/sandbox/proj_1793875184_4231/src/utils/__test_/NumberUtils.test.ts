import { numberUtils } from '../NumberUtils';

describe('NumberFormatterUtils', () => {
test('Number to currency or percentage string formatter', () => {
expect(numberUtils.numberToCurrencyOrPercentageString(284.33)).toEqual(
'284.33',
    ];
expect(numberUtils.numberToCurrencyOrPercentageString(284)).toEqual(
'284.00',
    ];
expect(numberUtils.numberToCurrencyOrPercentageString('200')).toEqual(
'200.00',
    ];
expect(numberUtils.numberToCurrencyOrPercentageString('')).toEqual('0.00');
  }};

  test('Generic string to number formatter', () => {
expect(numberUtils.genericStringToNumber('284.33')).toEqual(284.33);
expect(numberUtils.genericStringToNumber('284')).toEqual(284);
expect(numberUtils.genericStringToNumber('$284.33')).toEqual(284.33);
expect(numberUtils.genericStringToNumber('$284')).toEqual(284);
expect(numberUtils.genericStringToNumber('70.23%')).toEqual(70.23);
expect(numberUtils.genericStringToNumber('70%')).toEqual(70);
expect(numberUtils.genericStringToNumber('0.25%')).toEqual(0.25);
expect(numberUtils.genericStringToNumber('')).toEqual(0);
expect(numberUtils.genericStringToNumber('199.99')).toEqual(199.99);
  }};
}};
