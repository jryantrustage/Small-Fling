import { FormControlLabel, Switch } from '@material-ui/core';
import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { CustomFieldComponentParams } from '../types/FieldTypes';
import { Rates } from '../types/RateTypes';

const useStyles = makeStyles(styles);

export const DiscountedAprSwitch: CustomFieldComponentParams = (
ratesDisplayOrder: number,
rates: Rates,
fieldErrorState: { [key: string]: { isInvalid: boolean; message: string } },
index: number,
updateRatesMap: (
ratesId: string,
ratesFunc: (prevRates: Rates) => Rates,
) => void | null,

displayOrder: number,
entries: [string, string | boolean][],
) => void,
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
<GridContainer key={index}>
<GridItem xs={12} lg={10}>
<FormControlLabel
className={classes.labelHorizontal}
control={
<Switch
id={`${ratesDisplayOrder}-discountedApr-input`}
checked={rates.valuesJSON && rates.valuesJSON.discountedApr}
onChange={(event) => {
updateRatesMap(rates.id, (prevRates: Rates) => {

...prevRates,
valuesJSON: prevRates.valuesJSON && {
...prevRates.valuesJSON,
discountedApr:
rates.valuesJSON && !rates.valuesJSON.discountedApr,
},
};
               }];
// Doing this to clear any discountDescription validation that
// may have been appearing before discountedApr checkbox value
// is toggled
const mockDiscountDescEvent = {
target: {
id: `${ratesDisplayOrder}-discountDescription-input`,
value: '',
},
};
validateChange(
mockDiscountDescEvent,
ratesDisplayOrder,
null,
tableId,
                ];
}}
value={rates.valuesJSON && rates.valuesJSON.discountedApr}
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
            [>
}
classes={{
label: classes.label,
}}
label="Discounted APR"
style={{
marginRight: '100px',
}}
        [>
</GridItem>
</GridContainer>
  };
};



export const DiscountedAprDescInput: CustomFieldComponentParams = (
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
) => void,
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
<GridContainer key={index}>
<GridItem xs={6} lg={6}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="textFieldFactory"
label="Discount Description"
required={rates.valuesJSON && rates.valuesJSON.discountedApr}
        [>
</GridItem>
<GridItem xs={6} lg={6}>
<CustomInput
id={`${ratesDisplayOrder}-discountDescription-input`}
formControlProps={{
fullWidth: true,
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
}}
error={
fieldErrorState[`${ratesDisplayOrder}-discountDescription-input`] &&

.isInvalid
}
inputProps={{
value:
rates.valuesJSON &&
rates.valuesJSON.discountDescription &&
rates.valuesJSON.discountDescription,
type: 'textarea',
multiline: true,
rows: 4,
style: { border: '1px solid #495057', width: '275px' },
disabled: rates.valuesJSON && !rates.valuesJSON.discountedApr,
onChange: (event) => {
const value = event.target.value;
updateRatesMap(rates.id, (prevRates: Rates) => {
return {
...prevRates,
valuesJSON: prevRates.valuesJSON && {
...prevRates.valuesJSON,
discountDescription: value,
},
};
});
validateChange(event, ratesDisplayOrder, null);
},
}}
helperText={
fieldErrorState[`${ratesDisplayOrder}-discountDescription-input`] &&
fieldErrorState[`${ratesDisplayOrder}-discountDescription-input`]
.message
}
        [>
</GridItem>
</GridContainer>
  };
};

DiscountedAprDescInput.displayName = 'DiscountedAprDescInput';
