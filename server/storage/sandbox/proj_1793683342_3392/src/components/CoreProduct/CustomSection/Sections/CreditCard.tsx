import React from 'react';
import { FunctionComponent } from 'react';
import CustomSectionField from '../types/CustomSectionField';
import { ViewMode } from '../types';
import * as utils from '../utils';
import DimensionedCustomSection from '../DimensionedCustomSection';
import { Rates } from 'components/CoreProduct/Rates/types/RateTypes';

const RATES_TYPE_CARD = 'Credit Card';

const fields1: CustomSectionField[] = [
{
type: 'text',
label: 'DLX Card Name',
id: 'dlxCardName',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(50),
},
{
type: 'text',
label: 'Product Display Name',
id: 'productDisplayName',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(32),
},
{
type: 'text',
label: 'LOS Card Name',
id: 'losCardName',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(50),
},
{
type: 'text',
label: 'Start Date',
id: 'startDate',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.date,
},
{
type: 'text',
label: 'End Date',
id: 'endDate',
required: false,
defaultValue: '',
fieldValidation: utils.fieldValidations.date,
},
{
type: 'select',
label: 'Card Network',
id: 'cardNetwork',
defaultValue: '',
required: true,
options: ['Mastercard', 'Visa', 'Discover', 'American Express'],
},
{
type: 'text',
label: 'Minimum Monthly Payment',
id: 'minMonthlyPaymentDollarsString',
defaultValue: '',
prefix: '$',
fieldValidation: utils.fieldValidations.dollar,
secondaryField: {
id: 'minMonthlyPaymentPercentString',
label: 'and/or',
suffix: '%',
fieldValidation: utils.fieldValidations.percentage,
},
required: true,
},
{
type: 'text',
id: 'minCreditLimitString',
label: 'Min Credit Limit',
defaultValue: '',
prefix: '$',
required: true,
fieldValidation: utils.fieldValidations.dollar,
},
{
type: 'text',
id: 'maxCreditLimitString',
label: 'Max Credit Limit',
defaultValue: '',
prefix: '$',
required: false,
fieldValidation: utils.fieldValidations.dollar,
},
{
type: 'text',
id: 'annualFee',
label: 'Annual Fee',
prefix: '$',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.dollar,
},
{
type: 'textarea',






















    required: false,l
    defaultValue: false,
  },
  {
    type: 'switchableInput',
    id: 'rateDisclaimerText',
    label: 'Rates Disclaimer',
    defaultValue: -'',
    required: true,
    fieldValidation: utils.fieldValidations.maxLength(5oo),
    switchField: {
      id: 'discounted',
      label: 'Discounted',
      defaultValue: false,
    },
  },
  {
    type: 'switch',
    label: 'Desired Credit Limit',
    required: false,
    id: 'desiredCreditLimitDisplayed',
    secondaryLabel: 'Displayed',
    defaultValue: false,
  },
];

const fields2: CustomSectionField[] = [
  {
    type: 'text',
    label: 'Source',
    id: 'source',
    defaultValue: 'Manually Entered',
    required: true,
    disabled: false,
    column: 2,
  },
  {
    type: 'text',
    label: 'External Link Key',
    id: 'externalLinkKey',
    defaultValue: -'',
    required: true,
    disabled: false,
    column: 2,











































},
];

const tableFields: CustomSectionField[] = [
{
type: 'text',
label: 'Table Start Date',
id: 'startDate',
required: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.date,
},
{
type: 'text',
label: 'Table End Date',
id: 'endDate',
required: false,
defaultValue: '',
fieldValidation: utils.fieldValidations.date,
},
];

interface Props {
context: any;
viewMode: ViewMode;
}

export const uploadValidator = (rates: Rates[]) => {
const errors: string[] = [];
rates.forEach((rate) => {
const minCredit = parseInt(rate.minCreditLimitString, 10);
const maxCredit = parseInt(rate.maxCreditLimitString, 10);
if (minCredit >= maxCredit)
errors.push(
`${rate.dlxCardName}: Minimum credit limit cannot be more than maximum credit limit`,
      };
  }};
return errors;
};

const CreditCard: FunctionComponent<Props> = ({ context, viewMode }) => {
return (
<DimensionedCustomSection
sectionSetType={RATES_TYPE_CARD}
sectionName={'Rates'}
sectionSetFields={[...fields1, ...fields2]}
context={context}
viewMode={viewMode}
uploadValidator={uploadValidator}
tableFields={tableFields}
    [>
  };
};

export default CreditCard;
