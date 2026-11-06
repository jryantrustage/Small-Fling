import {
emptyArrayCheck,
isEndDateInPast,
isValidDate,
isValidTwoDecimalNumber,
isValidYear,
maxLengthCheck,
} from 'helpers/validations';
import { DateTime } from 'luxon';
import FormValidator from 'utils/FormValidator';
import { regexUtils } from '../../utils/RegexUtils';
import {
RATES_TYPE_AUTO,
RATES_TYPE_CARD,
RATES_TYPE_NON_AUTO,
RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
RATES_TYPE_PERSONAL_LOANS,
RATES_TYPE_PERSONAL_UNSECURED,
} from '../../components/CoreProduct/constants/RateTypes';
import { AUTO_RATE_FIELDS } from '../../components/CoreProduct/Rates/constants/AutoRateFields';
import { CARD_RATE_FIELDS } from '../../components/CoreProduct/Rates/constants/CardRateFields';
import { Rates } from '../../components/CoreProduct/Rates/types/RateTypes';
import { indexOfCreditRangeGap } from '../../components/CoreProduct/Rates/utils/plocGapUtils';
import { decimalUtils } from '../../components/CoreProduct/util/DecimalUtils';

const categoryVariables = [
  'creditRangeRateo',
'creditRangeRate1',
'creditRangeRate2',
'creditRangeRate3',
'creditRangeRate4',
'creditRangeRate5',
'creditRangeRate6',
'creditRangeRate7',
'creditRangeRate8',
'creditRangeRate9',
];

export default function validateRates(
rates: Rates[],
ratesType: string,
requestedState: string,
fieldErrorState: any,
setErrors: any,
): void {
let errors = []; // accumulate errors

  if (
ratesType !== RATES_TYPE_CARD &&
rates &&
rates.some(
      [>} =>
        !r !
        !r.valuesJSON II
        !r.valuesJSON.rateTables Il
r.valuesJSON.rateTables.length === 0,
    ]
  ] {
errors.push('- Missing data for at least 1 rate set');
}

  if (ratesType === RATES_TYPE_PERSONAL_LINE_OF_CREDIT && rates) {
rates.some((r) => {
const tables = r?.valuesJSON?.rateTables || [];
if (tables.some((t) => t.creditRanges.length === 0)) {
errors.push('- Missing balance ranges for at least one rate set');
}
    }};

    rates.forEach((r) => {
const tables = r?.valuesJSON?.rateTables || [];
tables.forEach((t) => {
if (t.isSingleValue) return;
const ranges = t.creditRanges.map((cr) => ({
low: decimalUtils.toDec(cr.low),
high: decimalUtils.toDec(cr.high),
        }]});
if (indexOfCreditRangeGap(t.creditRanges) !== undefined) {
errors.push(
`${t.rateTableName}: Gaps are present between balance ranges`,
          };
}
      }];
    }};
}

  const hasInvalidData = checkForInvalidData(fieldErrorState);
if (hasInvalidData && ratesType !== RATES_TYPE_CARD) {
errors.push('- Fix the highlighted errors.');
}

  const missingDataErrors = checkForMissingData(ratesType, rates);
if (missingDataErrors.length > 0) {
errors = errors.concat(missingDataErrors);
}

  const hasGreaterMaxCreditThanMin = checkForMaxCreditGreaterThanMin(rates);
if (hasGreaterMaxCreditThanMin) {
errors.push(
'- Max Credit Limit(s) must be greater than the Min Credit Limit(s).',
    ];
}

  if (
ratesType === RATES_TYPE_AUTO ||
ratesType === RATES_TYPE_NON_AUTO ||
ratesType === RATES_TYPE_PERSONAL_UNSECURED
  ] {
checkRateTypeDefaultIsSet(rates, errors);
}

  const dateRanges = rates.map((rateSet) => {
return { startDate: rateSet.startDate, endDate: rateSet.endDate };
  }};

  const emptyEndDates = dateRanges.filter(
(range) => !range.endDate || range.endDate === '',
  ];

  if (ratesType !== RATES_TYPE_CARD && emptyEndDates.length > 1) {
// ... only one rates set can have an unspecified end date
errors.push('- Only 1 rate set can have an unspecified end date.');
}

  checkForRangeOverlaps(dateRanges, errors);

  if (requestedState === 'Active') {
checkForActiveDateRange(
dateRanges,
errors,
'- At least 1 rate set must include the current date in its range.',
    ];
} else {
checkForActiveOrPendingDateRange(dateRanges, errors);
}

  if (ratesType === RATES_TYPE_CARD) {
checkCCRateTableDateRanges(rates, errors);
}

  setErrors(errors);
}

const checkRateTypeDefaultIsSet = (rates: Rates[], errors: string[]) => {
rates.forEach((rate) => {
const tables = rate.valuesJSON?.rateTables ?? [];
tables.forEach((table) => {
const { terms } = table;
const defaults = terms.filter((t) => t.isDefault);
if (defaults.length < 1)
errors.push(
'Rate Set ${rate.displayOrder}, Table ${table.displayorder}: No default term length set',
        };
// if (defaults.length > 1) errors.push('Rate Set ${rate.id), Table${table.displayorder}: Can only choose one default term length');
    }};
  }};
};

const checkCCRateTableDateRanges = (rates: Rates[], errors: string[]) => {
rates.forEach((rate) => {
if (!rate.rateTables) {
return;
}
const rtRanges = rate.rateTables.map((rt) => {
return { startDate: rt.startDate || '', endDate: rt.endDate || '' };
    }};

    const emptyEndDates = rtRanges.filter(
(range) => !range.endDate || range.endDate === '',
    ];

    if (emptyEndDates.length > 1) {
// ... only one rates set can have an unspecified end date
errors.push('- Only 1 card type table can have an unspecified end date.');
}

    checkForActiveDateRange(
rtRanges,
errors,
'- At least 1 table for each card type must include the current date in its range.',
    ];

    checkForRangeOverlaps(rtRanges, errors, 'Card Type Table');
  }};
};

function checkForActiveDateRange(
dateRanges: {
startDate: string;
endDate: string;
}[],
errors: any,
errorText: string,
): void {
// ... if the product is being saved in the Active state, at least
// 1 set of rates must include the current date

  const currentTime = DateTime.now().toUnixInteger();

  const rateSetIsActive = dateRanges.some((range) => {
const sd1 = DateTime.fromFormat(
range.startDate,
'M/d/yyyy',
).toUnixInteger();

    const endDate1Valid = range.endDate && range.endDate !== '';
// end date runs through date specified - bump by (24 hrs in seconds)-1
const ed1 = endDate1Valid
? DateTime.fromFormat(range.endDate, 'M/d/yyyy').toUnixInteger() + 86399
: Number.MAX_VALUE;

    return currentTime >= sd1 && currentTime < ed1;
  }};

  if (!rateSetIsActive) {
errors.push(errorText);
}
}

function checkForActiveOrPendingDateRange(
dateRanges: {
startDate: string;
endDate: string;
}[],
errors?: any,
): void {
// at least 1 set of rates must be pending or active

  const currentTime = DateTime.now().toUnixInteger();

  const rateSetIsActiveOrPending = dateRanges.some((range) => {
const sd1 = DateTime.fromFormat(
range.startDate,
'M/d/yyyy',
).toUnixInteger();

    const endDate1Valid = range.endDate && range.endDate !== '';
const ed1 = endDate1Valid
? DateTime.fromFormat(range.endDate, 'M/d/yyyy').toUnixInteger() + 86399
: Number.MAX_VALUE;

    return currentTime <= sd1 || (currentTime >= sd1 && currentTime < ed1);
  }};

  if (!rateSetIsActiveOrPending) {
errors.push(
'- At least 1 rate set must be currently active or active in the future.',
    ];
}
}

function checkForRangeOverlaps(
dateRanges: {
startDate: string;
endDate: string;
}[],
errors: any,
errorTitle?: string,
): void {
const overlapsSet = new Set();
const currentDate = DateTime.now();
errorTitle = errorTitle ? errorTitle + ': ' : '';

  dateRanges.forEach((range1, idx1) => {
const sd1 = DateTime.fromFormat(
range1.startDate,
'M/d/yyyy',
).toUnixInteger();

    const endDate1Valid = range1.endDate && range1.endDate !== '';
const ed1 = endDate1Valid
? DateTime.fromFormat(range1.endDate, 'M/d/yyyy').toUnixInteger() + 86399
: Number.MAX_VALUE;

    if (
currentDate.startOf('day') >
DateTime.fromFormat(range1.endDate, 'M/d/yyyy').startOf('day')
    ] {
// ... end date is before the current day's date
errors.push(
`- ${
errorTitle + ': '
}End date cannot be in past => (current date: ${currentDate.toFormat(
'M/d/yyyy',
)}, end date: ${range1.endDate})``,
      ];
return;
}

    if (sd1 >= ed1) {
// ... start date is >= end date
errors.push(
'- ${errorTitle}start date is later than the end date => (start date: ${range1.startDate}, end date: ${range1.endDate})',
      ];
return;
}

    dateRanges.forEach((range2, idx2) => {
if (idx1 === idx2) return;
if (!range2.endDate || range2.endDate === '') return;

      if (overlapsSet.has(idx1 + ',' + idx2)) {
return;
}

      const sd2 = DateTime.fromFormat(
range2.startDate,
'M/d/yyyy',
).toUnixInteger();

      const endDate2Valid = range2.endDate && range2.endDate !== '';
const ed2 = endDate2Valid
? DateTime.fromFormat(range2.endDate, 'M/d/yyyy').toUnixInteger() +
86399
: Number.MAX_VALUE;

      if (Math.max(sd1, sd2) <= Math.min(ed1, ed2)) {
errors.push(
`- ${errorTitle}Date ranges overlap: (${range1.startDate), ${
endDate1Valid ? range1.endDate : 'Indefinite'
}) and (${range2.startDate}, ${
endDate2Valid ? range2.endDate : 'Indefinite'
})`,
        };
overlapsSet.add(idx1 + ',' + idx2);
overlapsSet.add(idx2 + ',' + idx1);
}
    }};
  }};
}

export function checkFieldsForMissingData(
ratesType: string,
rateSetsAsArray: Rates[],
): { [key: string]: { isInvalid: boolean; message: string } } {
const fieldsWithMissingData: {
[key: string]: { isInvalid: boolean; message: string };
} = {};

  [>>
* @todo make this a reuseable util so we have a SSOT
   >[
const rateTypeFields =
ratesType === RATES_TYPE_AUTO
? AUTO_RATE_FIELDS
: ratesType === RATES_TYPE_PERSONAL_LOANS
? CARD_RATE_FIELDS
: ratesType === RATES_TYPE_PERSONAL_LINE_OF_CREDIT
? CARD_RATE_FIELDS
: ratesType === RATES_TYPE_CARD
? CARD_RATE_FIELDS
: CARD_RATE_FIELDS;

  rateSetsAsArray.forEach((rates) => {
for (const [key, value] of Object.entries(rates)) {
// Determine if the value for each input is empty
if (
        !value Il
(Array.isArray(value) && value.length === 0 && key !== 'dlxPurpose')
      ] {
// Using the list of fields for configuring a product's rates,
// determine if any match the field values input
const field = rateTypeFields.find((field) => field.id === key);
// If a matching field is found and it is required, mark it's
// validation message as required
if (field && field.required) {
fieldsWithMissingData[`${rates.displayOrder}-${key}-input`] = {
isInvalid: true,
message: 'Required',
};
}
}
// For fields tracked in the valuesJSON, we must further iterate
if (rates.valuesJSON) {
for (const [key, value] of Object.entries(rates.valuesJSON)) {
if (!value) {
const field = rateTypeFields.find((field) => field.id === key);
// If a matching field is found and it is required, mark it's
// validation message as required
if (field && field.required && key !== 'discountDescription') {
fieldsWithMissingData[`${rates.displayOrder}-${key}-input`] = {
isInvalid: true,
message: 'Required',
};
}

            // Special comparisons (usually required for comparing across two fields)
// Personal Line of Credit/Personal Loan type
if (
key === 'discountDescription' &&
!value &&
rates.valuesJSON &&
rates.valuesJSON.discountedApr
            } {
fieldsWithMissingData[`${rates.displayOrder}-${key}-input`] = {
isInvalid: true,
message: 'Required',
};
}
}
}
}
// For fields tracked in the rateTable, we must further iterate
if (rates.valuesJSON && rates.valuesJSON.rateTables) {
rates.valuesJSON.rateTables.forEach((rateTable) => {
for (const [key, value] of Object.entries(rateTable)) {
if (!value) {
const field = rateTypeFields.find((field) => field.id === key);
// If a matching field is found and it is required, mark it's
// validation message as required
if (field && field.required && key !== 'modelYearEnd') {
fieldsWithMissingData[
`${rates.displayOrder}-${key}-${rateTable.displayOrder}-input`
] = {
isInvalid: true,
message: 'Required',
};
}

              // Special comparisons (usually required for comparing across two fields)
// Auto type
if (key === 'modelYearEnd' && !rateTable.andOlder && !value) {
fieldsWithMissingData[
`${rates.displayOrder}-${key}-${rateTable.displayOrder}-input`
] = {
isInvalid: true,
message: 'Required',
};
}
}
}
        }];
}

      // TODO Make this dynamic instead of hard coding the table
// start and end date checking
if (rates.rateTables) {
rates.rateTables.forEach((rt) => {
const startField = rateTypeFields.find(
(field) => field.id === 'rateTableStartDate',
          };
if (startField && startField.required && rt.startDate === '') {
fieldsWithMissingData[
`${rates.displayOrder}-${startField.id}-${rt.displayOrder}-input`
] = {
isInvalid: true,
message: 'Required',
};
}
        }];
}

      // Special comparisons (usually required for comparing across two fields)
// Card type
if (
key === 'dlxPurpose' &&
(!value || (Array.isArray(value) && value.length === 0)) &&
!rates.dlxCustomPurpose
      ] {
fieldsWithMissingData[`${rates.displayOrder}-${key}-input`] = {
isInvalid: true,
message: 'Required',
};
}
if (
key === 'minMonthlyPaymentDollarsString' &&
!value &&
!rates.minMonthlyPaymentPercentString
      ] {
fieldsWithMissingData[
`${rates.displayOrder}-minMonthlyPaymentDollars-input`
] = {
isInvalid: true,
message: 'Minimum monthly payment dollars and/or percent required',
};
}
}
  }};
return fieldsWithMissingData;
}

const checkForMissingDataCC = (rateSetsAsArray: Rates[]): string[] => {
const errors: string[] = [];
rateSetsAsArray.forEach((rateSet, i) => {
const cardName = !rateSet.dlxCardName
? `Unnamed Card, Position ${i + 1}`
: rateSet.dlxCardName;
const errorFields: string[] = [];
if (!rateSet.dlxCardName) {
errorFields.push('dlxCardName');
}
if (!rateSet.productDisplayName) {
errorFields.push('productDisplayName');
}
if (!rateSet.losCardName) {
errorFields.push('losCardName');
}
if (!rateSet.startDate) {
errorFields.push('startDate');
}
if (!rateSet.cardNetwork) {
errorFields.push('cardNetwork');
}
if (
!rateSet.minMonthlyPaymentDollarsString &&
!rateSet.minMonthlyPaymentPercentString
    ] {
errorFields.push('minMonthlyPaymentDollarsString');
}
if (!rateSet.minCreditLimitString) {
errorFields.push('minCreditLimit');
}
if (!rateSet.annualFeeString) {
errorFields.push('annualFee');
}
if (!rateSet.cardDescription) {
errorFields.push('cardDescription');
}
if (!rateSet.cardDetails) {
errorFields.push('cardDetails');
}
if (!rateSet.source) {
errorFields.push('source');
}
if (!rateSet.externalLinkKey) {
errorFields.push('externalLinkKey');
}
if (!rateSet.applicationDisclosure) {
errorFields.push('applicationDisclosure');
}
if (rateSet.dlxPurpose?.length < 1 && !rateSet.dlxCustomPurpose) {
errorFields.push('dlxPurpose');
}
if (!rateSet.losPurpose) {
errorFields.push('losPurpose');
}
if (rateSet.discounted === true && !rateSet.rateDisclaimerText) {
errorFields.push('rateDisclaimer');
}

    if (errorFields.length > 0) {
const errorFieldLabels = errorFields.map((ef) => {
const field = CARD_RATE_FIELDS.find((crf) => crf.value === ef);
return field?.label ?? ef;
      }];
errors.push(
`${cardName}: Required Fields Missing - ${errorFieldLabels.join(', ')}`,
      ];
}
  }};
return errors;
};

function checkForMissingData(
ratesType: string,
rateSetsAsArray: Rates[],
): string[] {
let result = false;
const defaultError = ['- Required field(s) highlighted missing.'];

  if (ratesType === RATES_TYPE_CARD) {
return checkForMissingDataCC(rateSetsAsArray);
}

  for (const rates of rateSetsAsArray) {
if (
ratesType === RATES_TYPE_AUTO &&
rates.valuesJSON &&
rates.valuesJSON.rateTables
    ] {
if (!rates.startDate) return defaultError;

      result = rates.valuesJSON.rateTables.some((rateTable) => {
if (!rateTable.modelYearStart) return defaultError;
if (!rateTable.modelYearEnd && !rateTable.andOlder) return defaultError;
return rateTable.terms.some((term) => {
return categoryVariables.some((category) => {
const value = term[category];
if (value === null || value === '') {
return defaultError;
}
          }];
        }];
      }];
if (result) return defaultError;
}

    if (
ratesType === RATES_TYPE_PERSONAL_LOANS &&
rates.valuesJSON &&
rates.valuesJSON.rateTables
    ] {
if (!rates.startDate) return defaultError;
if (
!rates.valuesJSON.discountDescription &&
rates.valuesJSON.discountedApr
      ]
return defaultError;
result = rates.valuesJSON.rateTables.some((rateTable) => {
return rateTable.terms.some((term) => {
return categoryVariables.some((category) => {
const value = term[category];
if (value === null || value === '') {
return defaultError;
}
          }];
        }];
      }];
if (result) return defaultError;
}

    if (ratesType === RATES_TYPE_PERSONAL_LINE_OF_CREDIT && rates.valuesJSON) {
if (!rates.startDate) return defaultError;
if (
!rates.valuesJSON.discountDescription &&
rates.valuesJSON.discountedApr
      ] {
return defaultError;
}
result = rates.valuesJSON.rateTables.some((rateTable) => {
return rateTable.creditRanges.some((creditRange) => {
return categoryVariables.some((category) => {
const value = creditRange[category];
if (value === null || value === '') {
return defaultError;
}
          }];
        }];
      }];
if (result) return defaultError;
}
}
return [];
}

function checkForInvalidData(fieldErrorState: {
[key: string]: { isInvalid: boolean; message: string };
}): boolean {
let foundInvalidData = false;
for (const [key, value] of Object.entries(fieldErrorState)) {
if (value.isInvalid && value.message !== 'Required')
foundInvalidData = true;
}

  return foundInvalidData;
}

function checkForMaxCreditGreaterThanMin(rateSetsAsArray: Rates[]): boolean {
return rateSetsAsArray.some((rates) => {
if (
!isNaN(rates.maxCreditLimit) &&
rates.maxCreditLimit <= rates.minCreditLimit
    ]
return true;
  }};
}

export const cardTypesValidator = (
ratesDisplayOrder: number,
optionalMultiValues: string[] | null,
tableId?: number,
) => {
return new FormValidator([
{
field: `${ratesDisplayOrder}-dlxCardName-input`,
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'DLX Card Name should be up to 50 characters',
},
{
field: `${ratesDisplayOrder}-productDisplayName-input`,
method: maxLengthCheck,
arg: 32,
validWhen: true,
message: 'Product Display Name should be up to 32 characters',
},
{
field: `${ratesDisplayOrder}-losCardName-input`,
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'LOS Card Name should be up to 50 characters',
},
{
field: `${ratesDisplayOrder}-startDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isEndDateInPast,
validWhen: true,
message: 'End date cannot be in past',
},
{
field: `${ratesDisplayOrder}-minMonthlyPaymentDollars-input`,
method: isValidTwoDecimalNumber,
validWhen: true,
message: 'Required format $x.xx',
},
{
field: `${ratesDisplayOrder}-minMonthlyPaymentPercent-input`,
method: isValidTwoDecimalNumber,
validWhen: true,
message: 'Required format x.xx%',
},
{
field: `${ratesDisplayOrder}-maxCreditLimitString-input`,
method: isValidTwoDecimalNumber,
validWhen: true,
message: 'Max Credit Limit should be in format $X.XX',
},
{
field: `${ratesDisplayOrder}-minCreditLimitString-input`,
method: isValidTwoDecimalNumber,
validWhen: true,
message: 'Min Credit Limit should be in format $X.XX',
},
{
field: `${ratesDisplayOrder}-annualFeeString-input`,
method: isValidTwoDecimalNumber,
validWhen: true,
message: 'Annual Fee should be in format $X.XX',
},
{
field: `${ratesDisplayOrder}-cardDescription-input`,
method: maxLengthCheck,
arg: 500,
validWhen: true,
message: 'Card Description should be up to 500 characters',
},
{
field: `${ratesDisplayOrder}-cardDetails-input`,
method: maxLengthCheck,
arg: 500,
validWhen: true,
message: 'Card Details should be up to 500 characters',
},
{
field: `${ratesDisplayOrder}-losPurpose-input`,
method: maxLengthCheck,
arg: 50,
validWhen: true,
message: 'LOS Purpose should be up to 50 characters',
},
{
field: `${ratesDisplayOrder}-dlxPurpose-input`,
method: emptyArrayCheck,
arg: optionalMultiValues,
validWhen: true,
message: 'DLX Purpose must have at least one purpose selected',
},
{
field: `${ratesDisplayOrder}-rateTableStartDate-${tableId}-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-rateTableEndDate-${tableId}-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-rateTableEndDate-${tableId}-input`,
method: isEndDateInPast,
validWhen: true,
message: 'End date cannot be in past',
},
  ]};
};

export const personalLoanAndCreditTypesValidator = (
ratesDisplayOrder: number,
tableId?: number,
) => {
return new FormValidator([
{
field: `${ratesDisplayOrder}-startDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isEndDateInPast,
validWhen: true,
message: 'End date cannot be in past',
},
{
field: `${ratesDisplayOrder}-discountDescription-input`,
method: maxLengthCheck,
arg: 500,
validWhen: true,
message: 'Discount Description should be up to 500 characters',
},
  ]};
};

export const autoRateTypesValidator = (
ratesDisplayOrder: number,
tableId?: number,
) => {
return new FormValidator([
{
field: `${ratesDisplayOrder}-startDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isValidDate,
validWhen: true,
message: 'Invalid date',
},
{
field: `${ratesDisplayOrder}-endDate-input`,
method: isEndDateInPast,
validWhen: true,
message: 'End date cannot be in past',
},
{
field: `${ratesDisplayOrder}-modelYearStart-${tableId}-input`,
method: isValidYear,
validWhen: true,
message: 'Invalid year',
},
    [>>
* @todo
* end cannot be in past?
* end date cannot be before start?
     >[
{
field: `${ratesDisplayOrder}-modelYearEnd-${tableId}-input`,
method: isValidYear,
validWhen: true,
message: 'Invalid year',
},
  ]};
};
