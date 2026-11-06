import FormControl from '@material-ui/core/FormControl';
import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomInput from 'components/CustomInput/CustomInput';
// core components
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import { Address } from 'components/ManageTenant/base-tenant';
import React from 'react';
import CustomFormLabel from '../../components/CustomFormLabel/CustomFormLabel';
import * as validation from '../CreateTenant/validate-create-tenant';
import StateMenu from './StateMenu';

const useStyles = makeStyles(styles);

interface AddressCardProps {
addType: 'physical' | 'mailing';
data: Address;
errors: { [key: string]: string };
handleChange: (event: any, addressType: string) => void;
setErrorField: (k: string, v: Error) => void;
viewOnly: boolean;
}

export default function AddressCard(props: AddressCardProps): JSX.Element {
const classes = useStyles();
const { addType, data, errors, handleChange, setErrorField, viewOnly } =
props;

  return (
<div style={{ paddingTop: '30px' }}>
<GridContainer>
<GridItem xs={12} sm={2} md={3}>
<span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
{addType}
</span>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressLine1`].length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="addressCard"
label="Line1"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addLine1"
error={errors[`${addType}AddressLine1`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addLine1,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressLine1(
false,
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressLine1`].length !== 0
? errors[`${addType}AddressLine1`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressLine2`].length !== 0}
className={classes.labelHorizontal}
styleType="addressCard"
label="Line 2"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addLine2"
error={errors[`${addType}AddressLine2`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addLine2,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressLine2(
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressLine2`].length !== 0
? errors[`${addType}AddressLine2`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressLine3`].length !== 0}
className={classes.labelHorizontal}
styleType="addressCard"
label="Line 3"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addLine3"
error={errors[`${addType}AddressLine3`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addLine3,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressLine3(
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressLine3`].length !== 0
? errors[`${addType}AddressLine3`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressCity`].length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="addressCard"
label="City"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addCity"
error={errors[`${addType}AddressCity`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addCity,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressCity(
false,
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressCity`].length !== 0
? errors[`${addType}AddressCity`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressCounty`].length !== 0}
className={classes.labelHorizontal}
styleType="addressCard"
label="County"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addCounty"
error={errors[`${addType}AddressCounty`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addCounty,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressCounty(
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressCounty`].length !== 0
? errors[`${addType}AddressCounty`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressState`].length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="addressCard"
label="State"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<FormControl
disabled={!!viewOnly}
style={{ paddingTop: '24px' }}
error={errors[`${addType}AddressState`].length !== 0}
fullWidth={true}
className={classes.selectFormControl}
>
<StateMenu
data={data}
addType={addType}
setErrorField={setErrorField}
handleChange={handleChange}
/>
</FormControl>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressZip`].length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="addressCard"
label="Zip"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="addZip"
error={errors[`${addType}AddressZip`].length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
disabled: !!viewOnly,
value: data.addZip,
onChange: (
event: React.ChangeEvent<
HTMLTextAreaElement | HTMLInputElement
>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressZip(
false,
addType,
event.target.value,
setErrorField,
                };
},
}}
helperText={
errors[`${addType}AddressZip`].length !== 0
? errors[`${addType}AddressZip`]
: undefined
}
          [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors[`${addType}AddressCountry`].length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="addressCard"
label="Country"
          [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<FormControl
disabled={!!viewOnly}
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
error={errors[`${addType}AddressCountry`].length !== 0}
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={data.addCountry}
renderValue={(v) => data.addCountry}
onChange={(event) => {
handleChange(event, `${addType}Address`);
}}
inputProps={{
name: 'addCountry',
id: 'addCountry',
}}
>
{/* <MenuItem
disabled
classes={{
root: classes.selectMenuItem
}}
>
Choose Country
</MenuItem> */}
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value="US"
>
United States of America
</MenuItem>
</Select>
</FormControl>
</GridItem>
</GridContainer>
</div>
  ];
}
