import { RateTypeField } from '../types/FieldTypes';
import {
CardNetworkSelectInput,
DLXPurposeSelectInput,
MinimumMonthlyPaymentInput,
SourceSelectInput,
} from './CardRateCustomFields';

export const CARD_RATE_FIELDS_COLUMN_ONE: RateTypeField[] = [
{
label: 'DLX Card Name',
id: 'dlxCardName',
value: 'dlxCardName',
required: true,
},
{
label: 'Product Display Name',
id: 'productDisplayName',
value: 'productDisplayName',
required: true,
},
{
label: 'LOS Card Name',
id: 'losCardName',
value: 'losCardName',
required: true,
},
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

},
{
label: 'Card Network',
id: 'cardNetwork',
value: 'cardNetwork',
required: true,
component: CardNetworkSelectInput,
},
{
label: 'Minimum Monthly Payment',
label2: 'and/or',
id: 'minMonthlyPaymentDollarsString',
value: 'minMonthlyPaymentDollarsString',
displayValue: 'minMonthlyPaymentDollarsString',
displayValue2: 'minMonthlyPaymentPercentString',
required: true,
prefix: '$',
suffix2: '%',
component: MinimumMonthlyPaymentInput,
},
{
label: 'Max Credit Limit',
id: 'maxCreditLimitString',

displayValue: 'maxCreditLimitString',
prefix: '$',
required: false,
},
{
label: 'Min Credit Limit',
id: 'minCreditLimitString',
value: 'minCreditLimit',
displayValue: 'minCreditLimitString',
prefix: '$',
required: true,
},
{
label: 'Annual Fee',
id: 'annualFeeString',
value: 'annualFee',
displayValue: 'annualFeeString',
prefix: '$',
required: true,
},
{
label: 'Card Description',
    id: 'cardDescription',
value: 'cardDescription',
required: true,
type: 'textarea',
multiline: true,
rows: 4,
style: { border: '1px solid #495057', width: '275px' },
},
{
label: 'Card Details',
id: 'cardDetails',
value: 'cardDetails',
required: true,
type: 'textarea',
multiline: true,
rows: 4,
style: { border: '1px solid #495057', width: '275px' },
},
{
label: 'Table Start Date',
id: 'rateTableStartDate',
value: 'startDate',
isRateTableValue: true,
required: true,

{
label: 'Table End Date',
id: 'rateTableEndDate',
value: 'endDate',
isRateTableValue: true,
required: false,
},
];

export const CARD_RATE_FIELDS_COLUMN_TWO: RateTypeField[] = [
{
label: 'Source',
id: 'source',
value: 'source',
required: true,
component: SourceSelectInput,
},
{
label: 'External Link Key',
id: 'externalLinkKey',
value: 'externalLinkKey',
required: true,
},
{
label: 'Application Disclosure URL',
id: 'applicationDisclosure',
value: 'applicationDisclosure',
required: true,
},
{
label: 'DLX Purpose',
label2: 'Custom DLX Purpose',
id: 'dlxPurpose',
value: 'dlxPurpose',
displayValue2: 'dlxCustomPurpose',
required: true,
component: DLXPurposeSelectInput,
},
{
label: 'LOS Purpose',
id: 'losPurpose',
value: 'losPurpose',
required: true,
},

label: 'Rate Disclaimer',
id: 'rateDisclaimer',
value: 'rateDisclaimer',
required: false,
},
];

export const CARD_RATE_FIELDS = CARD_RATE_FIELDS_COLUMN_ONE.concat(
CARD_RATE_FIELDS_COLUMN_TWO,
};
