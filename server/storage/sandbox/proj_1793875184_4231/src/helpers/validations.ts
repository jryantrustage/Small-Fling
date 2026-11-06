import { DateTime } from 'luxon';
import * as yup from 'yup';

export const isEmptyString = yup.string().length(0);
export const isNumericOnly = yup.string().matches(/^(0|[1-9][0-9]*)$/);
export const isYearNumericOnly = yup.string().matches(/^\d{4}$/);
export const isTwoDecmialNumber = yup.string().matches(/^\d+(?:\.\d{2})$/);
export const isInteger = yup.number().integer();
export const isArrayEmpty = yup.array().min(1);
export const maxLengthChecker: (
maxLength: number,
) => yup.StringSchema<string | undefined> = (maxLength: number) =>
yup.string().max(maxLength);

export const isValidTwoDecimalNumber: (
input: string,
) => Promise<boolean> = async (input: string) => {
const result = await isTwoDecmialNumber.isValid(input);
// if input is an empty string, return valid
return !input ? true : result;
};

export const isValidDate: (input: string) => Promise<boolean> = async (
input: string,
) =>
(await isEmptyString.isValid(input))
? true
: DateTime.fromFormat(input, 'MM/dd/yyyy').isValid;

export const isValidYear: (input: string) => Promise<boolean> = async (
input: string,
) =>
(await isEmptyString.isValid(input))
? true
: await isYearNumericOnly.isValid(input);

export const isEndDateInPast: (input: string) => Promise<boolean> = async (
input: string,
) => {
const date = DateTime.fromFormat(input, 'M/d/yyyy');

  return DateTime.now().startOf('day') <= date.startOf('day');
};

export const zipNumericOnlyNonEmpty: (
input: string,
) => Promise<boolean> = async (input: string) =>
(await isEmptyString.isValid(input))
? true
: await isNumericOnly.isValid(input);

export const isEmptyStringCheck: (input: string) => Promise<boolean> = async (
input: string,
) => await isEmptyString.isValid(input);

export const maxLengthCheck: (
input: string,
maxLength: number,
) => Promise<boolean> = async (input: string, maxLength: number) =>
await maxLengthChecker(maxLength).isValid(input);

export const emptyArrayCheck: (
input: string,
optionalMultiValuesArg: string[],
) => Promise<boolean> = async (
input: string,
optionalMultiValuesArg: string[],
) => {
const result = await isArrayEmpty.isValid(optionalMultiValuesArg);
return result;
};

[>>
* Copied from https://urlregex.com/
>[
const URL_REGEX =
/((([A-Za-z]3,9}:(?:\/\/)?)(?:[1-; :&=\+\$, Iw]+@)?[A-Za-z0-9\.1-]+I(?:www\.I[\-;:&=\+\$, Iw]+@)[A-Za-z0-9\.1-]+)((?:\/[\+~%\/\.Iw\-_]*)?\??(?:[\-\+=&;%@1. Iw_]*)#?(?:[1.1!\/\1lw]*))?)/;

export const isValidURL = (value: any) => {
if (typeof value !== 'string') return false;
return URL_REGEX.test(value);
};
