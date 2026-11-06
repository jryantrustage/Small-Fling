import { DateTime } from 'luxon';
import { isValidURL } from 'helpers/validations';

class ValidationUtils {
validateIsNumber = (value: any) => {
return (
!isNaN(value) &&
!isNaN(parseFloat(value)) &&
parseFloat(value).toString() === value.toString()
    ];
};

  validateIsInteger = (value: any) => {
if (isNaN(value)) return false;

    if (typeof value === 'number') {
return Number.isInteger(value);
}

    if (typeof value !== 'string') return false;

    if (/^-?\d+$/.test(value) == false) return false;

    return Number(value).toString() === value.toString();
};

  validateIsDate = (value: any, dateFormat: string) => {
if (typeof value !== 'string') return false;
return DateTime.fromFormat(value, dateFormat, {
locale: 'en',
}).isValid;
};

  validateIsUrl = isValidURL;
}

export const validationUtils = new ValidationUtils();
