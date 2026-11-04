import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import {
RATES_TYPE_NON_AUTO,
RATES_TYPE_AUTO,
RATES_TYPE_CARD,
RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
RATES_TYPE_PERSONAL_LOANS,
RATES_TYPE_PERSONAL_UNSECURED,
} from '../../constants/RateTypes';
import { Rates } from '../types/RateTypes';

export const DEFAULT_MIN_RATE = 1000;
export const DEFAULT_MAX_RATE = 80000;

export function createDefaultRates(
ratesType: string,
minMaxCreditLimit: { min: number; max: number },
): Map<string, Rates> {
const ratesId = uuid();

  let defaultRates;

  switch (ratesType) {
case RATES_TYPE_AUTO:
defaultRates = DEFAULT_AUTO_RATES;
break;
case RATES_TYPE_PERSONAL_LOANS:
defaultRates = DEFAULT_PERSONAL_LOANS_RATES;
break;
case RATES_TYPE_PERSONAL_LINE_OF_CREDIT:
if (!minMaxCreditLimit) {
minMaxCreditLimit = { min: DEFAULT_MIN_RATE, max: DEFAULT_MAX_RATE };
}
defaultRates = getDefaultPLOCRates(
minMaxCreditLimit.min,
minMaxCreditLimit.max,
      };
      break;
    case RATES_TYPE_CARD:
      defaultRates = getDefaultCCRates();
      break;
case RATES_TYPE_NON_AUTO:
defaultRates = DEFAULT_NON_AUTO_RATES;
break;
case RATES_TYPE_PERSONAL_UNSECURED:
defaultRates = DEFAULT_PERSONAL_UNSECURED;
break;
default:
defaultRates = DEFAULT_AUTO_RATES;
break;
}

  const rates: Rates = JSON.parse(JSON.stringify(defaultRates));
rates.id = ratesId;

  return new Map([[ratesId, rates]]);
}

export const getMinMaxCreditLimit = (context: any) => {
const minStr =
context.getSettingValue('MIN-CREDIT-LIMIT') || DEFAULT_MIN_RATE;
const maxStr =
context.getSettingValue('MAX-CREDIT-LIMIT') || DEFAULT_MAX_RATE;
return {
minStr,
maxStr,
min: parseInt(minStr, 10),
max: parseInt(maxStr, 10),
};
};

export const getDefaultCCRates = () => ({
type: 'Card',
id: uuid(),
source: 'Manually Entered',
dlxCardName: '',
productDisplayName: '',
losCardName: '',
externalLinkKey: '',
startDate: DateTime.now().toFormat('M/d/yyyy'),
applicationDisclosure: '',
endDate: '',

dlxPurpose: [],
dlxCustomPurpose: '',
cardNetwork: '',
minMonthlyPaymentDollars: 0,
minMonthlyPaymentDollarsString: '',
minMonthlyPaymentPercent: 0,
minMonthlyPaymentPercentString: '',
maxCreditLimit: 0,
maxCreditLimitString: '',
minCreditLimit: 0,
minCreditLimitString: '',
cardDescription: '',
cardDetails: '',
discounted: false,
displayOrder: 1,
metadataJSON: {},
specificationJSON: {},
riskBased: false,
productId: '',
recordState: '',
rateTables: [getDefaultCCRateTable()],
}};

export const getDefaultCCRateTable = () => ({
displayOrder: 1,
rateTableName: 'Table 1',
startDate: DateTime.now().toFormat('M/d/yyyy'),
endDate: null,
terms: [
{
title: 'Balance Transfer',
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: 2.25,
creditRangeRate1: 2.5,
creditRangeRate2: 2.75,
creditRangeRate3: 3,
creditRangeRate4: 3.5,
},
{
title: 'Cash Advance',
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: 2.25,
creditRangeRate1: 2.5,























},
],
}};

export const DEFAULT_AUTO_RATES = {
id: uuid(),
type: RATES_TYPE_AUTO,
source: 'Manually Entered',
startDate: DateTime.now().toFormat('M/d/yyyy'),
endDate: null,
displayOrder: 1,
metadataJSON: {},
specificationJSON: {},
valuesJSON: {
rateTables: [
{
displayOrder: 1,
rateTableName: 'Table 1',
modelYearStart: '2018',
modelYearEnd: '2019',
andOlder: false,
terms: [
{
            title: '36 months',
            termLength: 36,
            termUnits: 'months',
            valueUnits: 'percent',
            creditRangeRate0: 2,
            creditRangeRate1: 2.25,
            creditRangeRate2: 2.5,
            creditRangeRate3: 2.75,
            creditRangeRate4: 3,
            isDefault: true,
          },
          {
            title: '60 months',
            termLength: 60,
            termUnits: 'months',
            valueUnits: 'percent',
            creditRangeRate0: 2.25,
            creditRangeRate1: 2.5,
            creditRangeRate2: 2.75,
            creditRangeRate3: 3,
            creditRangeRate4: 3.5,l











































            creditRangeRate3: 3,
            creditRangeRate4: 3.5,
          },
        ],
      },
    ],
  },
};

export const getDefaultPLocRates = (low: number, high: number) => ({
  id: uuid(),
  source: 'Manually Entered',
  startDate: DateTime.now().toFormat('M/d/yyyy'),
  endDate: null,
  displayorder: 1,
  metadataJSON: {},
  specificationJsoN: {},
  valuesJSON: {
    discountedApr: true,
    discountDescription: -'',
    rateTables:[
      {
        displayorder: 1,l
rateTableName: 'Table 1',
creditRanges: [
{
title: 'Initial',
low,
high,
termUnits: 'dollars',
valueUnits: 'percent',
creditRangeRate0: 2,
creditRangeRate1: 2.0,
creditRangeRate2: 2.25,
creditRangeRate3: 2.5,
creditRangeRate4: 3.5,
},
],
},
],
},
}};

export const DEFAULT_NON_AUTO_RATES = {
id: uuid(),
  type: RATES_TYPE_NON_AUTO,
  source: 'Manually Entered',
  startDate: DateTime.now().toFormat('M/d/yyyy'),
  endDate: null,
  displayorder: 1,
  metadataJSON: {},
  specificationJsoN: {},
  valuesJSON: {
    rateTables:[
      {
        displayorder: 1.
terms:[
          {
            termLength: 36,
            isDefault: true,
          },
          {
            termLength: 60,
            isDefault: false,
          },
        ],
      },
    ],
  },
};

export const DEFAULT_PERSONAL_UNSECURED = {
id: uuid(),
type: RATES_TYPE_PERSONAL_UNSECURED,
source: 'Manually Entered',
startDate: DateTime.now().toFormat('M/d/yyyy'),
endDate: null,
displayOrder: 1,
metadataJSON: {},
specificationJSON: {},
valuesJSON: {
rateTables: [
{
displayOrder: 1,
terms: [
{
termLength: 36,
isDefault: true,
},
{









































const nonAutoFields2: RateTypeField[] = [
{
label: 'Source',
id: 'source',
value: 'source',
required: true,
component: SourceSelectInput,
},
];

const personalUnsecuredFields2: RateTypeField[] = [
{
label: 'Source',
id: 'source',
value: 'source',
required: true,
component: SourceSelectInput,
},
];

export const getRateFieldColumnOne = (ratesType: string) =>
ratesType === RATES_TYPE_AUTO
? AUTO_RATE_FIELDS_COLUMN_ONE
: ratesType === RATES_TYPE_PERSONAL_LOANS
? PERSONAL_RATE_FIELDS_COLUMN_ONE
: ratesType === RATES_TYPE_PERSONAL_LINE_OF_CREDIT
? PERSONAL_RATE_FIELDS_COLUMN_ONE
: ratesType === RATES_TYPE_CARD
? CARD_RATE_FIELDS_COLUMN_ONE
: ratesType === RATES_TYPE_NON_AUTO
? []
: ratesType === RATES_TYPE_PERSONAL_UNSECURED
? []
: CARD_RATE_FIELDS_COLUMN_ONE;

export const getRateFieldColumnTwo = (ratesType: string) =>
ratesType === RATES_TYPE_AUTO
? AUTO_RATE_FIELDS_COLUMN_TWO
: ratesType === RATES_TYPE_PERSONAL_LOANS
? PERSONAL_RATE_FIELDS_COLUMN_TWO
: ratesType === RATES_TYPE_PERSONAL_LINE_OF_CREDIT
? PERSONAL_RATE_FIELDS_COLUMN_TWO
: ratesType === RATES_TYPE_CARD
? CARD_RATE_FIELDS_COLUMN_TWO

? nonAutoFields2
: ratesType === RATES_TYPE_PERSONAL_UNSECURED
? personalUnsecuredFields2
: CARD_RATE_FIELDS_COLUMN_TWO;
