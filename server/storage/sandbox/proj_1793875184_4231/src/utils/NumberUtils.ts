class NumberUtils {
public stripNumberString = (value: string): string =>
value.replace(/[^0-9.-]+/g, '');

  [>>
* numberToCurrencyOrPercentageString
* @summary
* @param value number or string
* @returns formatted string value with comma ("1,234.23")
   >[
public numberToCurrencyOrPercentageString = (
value: number | string,
): string =>
`${(typeof value === 'string'
? parseFloat(this.stripNumberString(value || '0'))
: value
).toLocaleString('en-US', {
minimumFractionDigits: 2,
maximumFractionDigits: 2,
})}``;

  [>>
* genericStringToNumber
* @summary
* Same as above function, but reversed. Returns number value from formatted string
* Will work on integers and formatted strings (e.g. $1.23, 5.38%) too
   >[
public genericStringToNumber = (value: string): number =>
Number(this.stripNumberString(value)) || 0;
}

export const numberUtils = new NumberUtils();
