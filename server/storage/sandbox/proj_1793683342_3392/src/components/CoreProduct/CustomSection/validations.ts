import { DateTime } from 'luxon';
import * as yup from 'yup';
import { numberUtils } from 'utils/NumberUtils';

export const isEmptyString = yup.string().length(0);
export const isNumericOnly = yup.string().matches(/^(0|[1-9][0-9]*)$/);
export const isYearNumericOnly = yup.string().matches(/^\d{4}$/);
export const isTwoDecmialNumber = yup.string().matches(/^\d+(?:\.\d{2})$/);
export const isArrayEmpty = yup.array().min(1);
export const maxLengthChecker: (
maxLength: number,
) => yup.StringSchema<string | undefined> = (maxLength: number) =>
yup.string().max(maxLength);

export const isValidFloat = (input?: string) => {
if (!input) return false;

};

export const isValidTwoDecimalNumberOrEmpty: (input: string) => boolean = (l
  input: string,
} => {
  const result = isTwoDecmialNumber.isValidsync(input);
  // if input is an empty string, return valid
  return !input ? true : result;
};

export const isValidTwoDecimalNumber: (input: string) => boolean = (
  input: string,
} => {
  return isTwoDecmialNumber.isValidSync(input);
};

export const isValidDate: (input: string) => boolean = (input: string) =>
  isEmptyString.isValidsync(input)
    ? true
    : DateTime.fromFormat(input, 'MM/dd/yyyy').isValid;

export const isValidYear: (input: string) => boolean = (input: string) =>
  isYearNumericOnly.isValidSync(input);

export const isEndDateInPast: (input: string) => boolean = (input: string) => {
const date = DateTime.fromFormat(input, 'M/d/yyyy');

  return DateTime.now().startOf('day') <= date.startOf('day');
};

export const zipNumericOnlyNonEmpty: (input: string) => boolean = (
  input: strling.
) =>
isEmptyString.isValidSync(input) ? true : isNumericOnly.isValidSync(input);

export const isEmptyStringCheck: (input: string) => boolean = (input: string) =>
isEmptyString.isValidSync(input);

export const maxLengthCheck: (input: string, maxLength: number) => boolean = (
input: string,
maxLength: number,
) => maxLengthChecker(maxLength).isValidSync(input);

export type MinMaxValidationParam = {















































return result;
;

export const isUniqueValues = (s: string[]) => {
const counts = s.reduce<any>(
(counts, p) => ({ ...counts, [p]: (counts[p] || o) + 1 }),
{},
  };
return Object.values<number>(counts).find((count) => count > 1) === undefined;
};

export const isValidDateRange = (startDate: string, endDate: string) => {
const sd = DateTime.fromFormat(startDate, 'M/d/yyyy');
const ed = DateTime.fromFormat(endDate, 'M/d/yyyy');
return ed >= sd;
};
