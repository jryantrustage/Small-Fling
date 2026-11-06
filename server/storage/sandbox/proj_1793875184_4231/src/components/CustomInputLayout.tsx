import React, { ChangeEvent } from 'react';

import { makeStyles } from '@material-ui/core/styles';

import GridItem from 'components/Grid/GridItem';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { FormLabel } from '@material-ui/core';
import CustomInput from 'components/CustomInput/CustomInput';

const useStyles = makeStyles(styles);

interface CustomInputLayoutProps {
required?: boolean;
id?: string;
title?: string;
value?: string;
setValue?: React.Dispatch<React.SetStateAction<string>>;
maxLength?: number;
errorMessage?: string;
validateValue?: (val: any) => boolean;
multiline?: boolean;
rowsMax?: number;
disabled: boolean;
helperText?: string;
}

const CustomInputLayout = ({
required,
id,
title,
value,
setValue,
errorMessage,
validateValue,
multiline,
rowsMax,
helperText,
disabled,
}: CustomInputLayoutProps): React.ReactElement => {
const classes = useStyles();

  const isError = (errorMessage && errorMessage.length !== 0) || false;

  return (
    >>
<GridItem xs={12} sm={4}>
<FormLabel
style={{ paddingTop: '35px', fontWeight: 'bold' }}
error={isError}
className={classes.labelHorizontal}
required={required}
>
{title}
</FormLabel>
</GridItem>
<GridItem xs={12} sm={8}>
<CustomInput
id={id}
error={isError}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
multiline: multiline || false,
maxRows: rowsMax || 1,
disabled: disabled || false,
value: value || '',
onChange: (event: ChangeEvent<HTMLInputElement>): void => {
setValue && setValue(event.target.value);
if (validateValue) validateValue(event.target.value);
},
}}
helperText={isError ? errorMessage : helperText}
        [>
</GridItem>
</>
  ];
};

export default CustomInputLayout;
