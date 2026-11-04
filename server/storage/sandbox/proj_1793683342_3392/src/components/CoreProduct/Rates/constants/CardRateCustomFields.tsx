import {
Checkbox,
FormControl,
FormControlLabel,
FormHelperText,
MenuItem,
Select,
} from '@material-ui/core';
import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Header from 'components/Header/Header';
import React from 'react';

import { Rates } from '../types/RateTypes';

export const DLX_PURPOSE_ARRAY = [
{ displayName: 'Everyday Expenses', idName: 'everyday-expenses' },
{ displayName: 'Large Purchases', idName: 'large-purchases' },
{ displayName: 'Balance Transfer', idName: 'balance-transfer' },
{ displayName: 'Emergency Expenses', idName: 'emergency-expenses' },
{ displayName: 'Earning Rewards', idName: 'earning-rewards' },
{ displayName: 'Building Credit', idName: 'building-credit' },
];

const CARD_NETWORK_ARRAY = [
{ displayName: 'Mastercard' },
{ displayName: 'Visa' },
{ displayName: 'Discover' },
{ displayName: 'American Express' },
];

const useStyles = makeStyles(styles);

export const MinimumMonthlyPaymentInput: CustomFieldComponentParams = (
ratesDisplayOrder: number,
rates: Rates,
fieldErrorState: { [key: string]: { isInvalid: boolean; message: string } },
index: number,
updateRatesMap: (
ratesId: string,
ratesFunc: (prevRates: Rates) => Rates,
) => void | null,
updateTableFields: (
displayOrder: number,
entries: [string, string | boolean][],
) => void | null,
validateChange: (
event: any,
ratesDisplayOrder: number,
optionalMultiValues: string[] | null,
tableId?: number | undefined,
) => Promise<null | undefined>,
tableId?: number,
) => {
const classes = useStyles();
return (
<GridContainer key={index} style={{ alignItems: 'center' }}>
<GridItem xs={6}>

className={classes.labelHorizontal}
styleType="rates"
required={true}
label="Minimum Monthly Payment"
error={
(fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
            &&
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
].isInvalid) ||
(fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentPercent-input`
] &&
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentPercent-input`
].isInvalid)
}
        [>
</GridItem>
<GridItem xs={3} style={{ paddingRight: '5px !important' }}>
<div style={{ display: 'flex', width: '250px' }}>
{/* min monthly payment dollars */}
<div style={{ paddingTop: '32px', paddingRight: '10px' }}>$</div>
<CustomInput
id={`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`}
error={
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
              &&
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
].isInvalid
}
inputProps={{
disabled: false,
value: rates['minMonthlyPaymentDollarsString'],
type: 'text',
onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
const value = event.target.value;

                updateRatesMap(rates.id, (prevRates: Rates) => {
return {
...prevRates,
minMonthlyPaymentDollarsString: value,

                }];
validateChange(event, ratesDisplayOrder, null);
},
}}
          [>
<div
style={{
paddingTop: '32px',
paddingLeft: '5px',
paddingRight: '5px',
}}
>
and/or
</div>
{/* min monthly payment percent */}
<CustomInput
id={`${ratesDisplayOrder}-minMonthlyPaymentPercent-input`}
error={
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentPercent-input`
]&&
              fieldErrorState[
                ' ${ratesDisplayOrder}-minMonthlyPaymentPercent-input'
              J.isInvalid
            }
            inputProps={{
              disabled: false,
              value: rates['minMonthlyPaymentPercentString'],
              type: 'text',
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                const value = event.target.value;

                updateRatesMap(rates.id, (prevRates: Rates) => {
                  return {
                    ...prevRates,
                   minMonthlyPaymentPercentString: value,
                  };
                }];
                validateChange(event, ratesDisplayOrder, null);
              },
            }}
          [>
          <div style={{ paddingTop: '32px', paddingRight: '10px' }}>%</div>
</div>
<FormHelperText
style={{ marginTop: '-10px', width: '200px', fontWeight: 300 }}
error={
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
] &&
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
].isInvalid
}
>
{fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
          &&
fieldErrorState[
`${ratesDisplayOrder}-minMonthlyPaymentDollars-input`
].message}
</FormHelperText>
<FormHelperText
style={{ width: '200px', fontWeight: 300 }}











































) => {
const classes = useStyles();
return (
<GridContainer key={index}>
<GridItem xs={6}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="rates"
required={true}
label="Card Network"
error={
fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`] &&
fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`].isInvalid
}
        [>
</GridItem>
<GridItem xs={6}>
<FormControl fullWidth={true} style={{ paddingBottom: '30px' }}>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={rates['cardNetwork']}
onChange={(event: any) => {
updateRatesMap(rates.id, (prevRates: Rates) => {
return {
...prevRates,
cardNetwork: event.target.value,
};
              }];
validateChange(event, ratesDisplayOrder, null);
}}
inputProps={{
name: `${ratesDisplayOrder}-cardNetwork-input`,
id: `${ratesDisplayOrder}-cardNetwork-input`,
}}
>
{CARD_NETWORK_ARRAY.map((card, index) => (
<MenuItem
key={index}
classes={{
root: classes.selectMenuItem,
}}
value={card.displayName}
>
{card.displayName}
</MenuItem>
            ]]}
</Select>
</FormControl>
<FormHelperText
style={{ marginTop: '-20px', fontWeight: 300 }}
error={
fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`] &&
fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`].isInvalid
}
>
{fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`] &&
fieldErrorState[`${ratesDisplayOrder}-cardNetwork-input`].message}
</FormHelperText>
</GridItem>
</GridContainer>
  };
};

CardNetworkSelectInput.displayName = 'CardNetworkSelectInput';

export const SourceSelectInput: CustomFieldComponentParams = (
ratesDisplayOrder: number,
rates: Rates,
fieldErrorState: { [key: string]: { isInvalid: boolean; message: string } },
index: number,
updateRatesMap: (
ratesId: string,
ratesFunc: (prevRates: Rates) => Rates,
) => void | null,
updateTableFields: (
displayOrder: number,
entries: [string, string | boolean][],
) => void | null,
validateChange: (
event: any,
ratesDisplayOrder: number,
optionalMultiValues: string[] | null,
tableId?: number | undefined,
) => Promise<null | undefined>,

) => {
const classes = useStyles();
return (
<GridContainer key={index}>
<GridItem xs={6}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="rates"
required={true}
label="Source"
error={
fieldErrorState[`${ratesDisplayOrder}-source-input`] &&
fieldErrorState[`${ratesDisplayOrder}-source-input`].isInvalid
}
        [>
</GridItem>
<GridItem xs={6}>
<FormControl fullWidth={true} style={{ paddingBottom: '30px' }}>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={rates.source}
onChange={(event: any) => {
updateRatesMap(rates.id, (prevRates: Rates) => {
return {
...prevRates,
source: event.target.value,
};
              }];
validateChange(event, ratesDisplayOrder, null);
}}
inputProps={{
name: 'rates-source-input',
id: `${ratesDisplayOrder}-source-input`,
}}
>
<MenuItem
classes={{
root: classes.selectMenuItem,
}}
value="Manually Entered"

Manually Entered
</MenuItem>
</Select>
</FormControl>
<FormHelperText
style={{ marginTop: '-20px', fontWeight: 300 }}
error={
fieldErrorState[`${ratesDisplayOrder}-source-input`] &&
fieldErrorState[`${ratesDisplayOrder}-source-input`].isInvalid
}
>
{fieldErrorState[`${ratesDisplayOrder}-source-input`] &&
fieldErrorState[`${ratesDisplayOrder}-source-input`].message}
</FormHelperText>
</GridItem>
</GridContainer>
  };
};

SourceSelectInput.displayName = 'SourceSelectInput';

export const DLXPurposeSelectInput: CustomFieldComponentParams = (
  ratesDisplayorder: number,l
  rates: Rates,
  fieldErrorstate:  [key: string]: { isInvalid: boolean; message: string } },
  index: number,
  updateRatesMap:(
    ratesId: string,
    ratesFunc: (prevRates: Rates) => Rates,
  )=> void 「 null,
  updateTableFields:(
    displayorder: number,
    entries: [string, string | boolean][],
  ) => void 」 null,
  validateChange:(
    event: any,.
    ratesDisplayOrder: number,
    optionalMultiValues: string[] | null,
    tableId?: number | undefined,
  ) => Promise<null 「 undefined>,
  tableId?: number,
} => {
  const classes = usestyles();
  return(
    <GridContainer key={index}>
<GridItem xs={6}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="rates"
required={true}
label="DLX Purpose"
error={
fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`] &&
fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`].isInvalid
}
        [>
</GridItem>
<GridItem xs={6}>
{DLX_PURPOSE_ARRAY.map((purpose, index) => (
<FormControlLabel
key={`${ratesDisplayOrder}-index-${index}-dlx-purpose-control`}
control={
<Checkbox
id={`${ratesDisplayOrder}-dlxPurpose-input`}
role={`${ratesDisplayOrder}-dlx-purpose-${purpose.idName}`}
checked={rates.dlxPurpose.includes(purpose.displayName)}











































},
}}
inputProps={{
value: rates.dlxCustomPurpose,
type: 'text',
onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
const value = event.target.value;

                updateRatesMap(rates.id, (prevRates: Rates) => {
return {
...prevRates,
dlxCustomPurpose: value,
};
               }];
// validate the change for this text field input using the same id
// as the Select input, since their combined values are validated together
// if one value is wrong the other is by default as well
event.target.id = `${ratesDisplayOrder}-dlxPurpose-input`;
const dlxCustomPurposeArray = rates.dlxCustomPurpose.split(',');
validateChange(event, ratesDisplayOrder, dlxCustomPurposeArray);
},
}}
          [>
</div>
<FormHelperText
style={{ marginTop: '-10px', fontWeight: 300 }}
error={
fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`] &&
fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`].isInvalid
}
>
{fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`] &&
fieldErrorState[`${ratesDisplayOrder}-dlxPurpose-input`].message}
</FormHelperText>
</GridItem>
</GridContainer>
  };
};

DLXPurposeSelectInput.displayName = 'DLXPurposeSelectInput';
