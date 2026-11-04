import { RateTypeField } from '../types/FieldTypes';
import { SourceSelectInput } from './CardRateCustomFields';
import {
DiscountedAprDescInput,
DiscountedAprSwitch,
} from './PersonalLoanAndCreditCustomFields';

export const PERSONAL_RATE_FIELDS_COLUMN_ONE: RateTypeField[] = [
{
label: 'Start Date',
id: 'startDate',
value: 'startDate',
required: true,
},
{
label: 'End Date',
id: 'endDate',
value: 'endDate',
required: false,
},
{
label: 'Discounted APR',
id: 'discountedApr',
value: 'discountedApr',
isValuesJSON: true,
required: false,
component: DiscountedAprSwitch,
},
{
label: 'Discount Description',
id: 'discountDescription',
value: 'discountDescription',
isValuesJSON: true,
required: true,
component: DiscountedAprDescInput,
},
];

export const PERSONAL_RATE_FIELDS_COLUMN_TWO: RateTypeField[] = [
{

id: 'source',
value: 'source',
required: true,
component: SourceSelectInput,
},
];

export const PERSONAL_RATE_FIELDS = PERSONAL_RATE_FIELDS_COLUMN_ONE.concat(
  PERSONAL_RATE_FIELDS_COLUMN_TWO,
};
