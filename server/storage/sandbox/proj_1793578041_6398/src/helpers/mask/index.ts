export const dateMask = [/\d/, /\d/, '/', /\d/, /\d/, '/', /\d/, /\d/, /\d/, /\d/];
export const MASK_FORMAT: Record<string, (string | RegExp)[]> = {
'phone-number': ['(', /[1-9]/, /\d/, /\d/, ')', ' ', /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/],
'date-generic': dateMask,
'date-dob': dateMask,
'date-generic-dob': dateMask,
'date-generic-future': dateMask,
























if (typeof mask[0] === 'string') {
if (value[0] === mask[0]) {
maskedValue += tempChars + mask[0];
value = value.substring(1);
tempChars = '';
} else {
tempChars += mask[0];
}
mask.shift();
} else {
if (value[0].match(mask[0])) {
maskedValue += tempChars + value[0];
tempChars = '';
mask.shift();
}

      value = value.substring(1);
}
}

  return maskedValue;
};
