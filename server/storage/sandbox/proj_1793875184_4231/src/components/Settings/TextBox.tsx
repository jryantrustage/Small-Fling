import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import CustomInput from '../CustomInput/CustomInput';
import { InputProps } from '@material-ui/core/Input';

export interface TextBoxSettings {
required: boolean;
label: string;
elementId: string;
inputProps: TextBoxInputProps;
helperText: string;
errorState: boolean;
gridWidths?: {
xs: number;
sm: number;
md: number;
};
}

export interface TextBoxInputProps extends InputProps {
value: any;
multiline?: boolean;
rows?: number;
rowsMax?: number;
onChange: (event: any) => void;
disabled?: boolean;
}

const useStyles = makeStyles(styles);

export const TextBox: React.FunctionComponent<TextBoxSettings> = (
props: TextBoxSettings,
) => {
const classes = useStyles();

  props.inputProps.multiline =
props.inputProps.multiline === false ? false : true;
props.inputProps.rows = props.inputProps.rows ? props.inputProps.rows : 2;
props.inputProps.rowsMax = props.inputProps.rowsMax
? props.inputProps.rowsMax
: 2;
props.inputProps.disabled = props.inputProps.disabled === true ? true : false;

  const gridWidths = props.gridWidths
? props.gridWidths
: { xs: 12, sm: 3, md: 2 };

  return (
<div style={{ paddingTop: '12px' }}>
<GridContainer>
<GridItem xs={gridWidths.xs} sm={gridWidths.sm} md={gridWidths.md}>
<CustomFormLabel
error={props.errorState}
className={classes.labelHorizontal}
styleType="textFieldFactory"
required={props.required}
label={props.label}
          [>
</GridItem>
<GridItem
xs={gridWidths.xs}
sm={gridWidths.sm * 2}
md={gridWidths.md * 2}
>
<CustomInput
id={props.elementId}
error={props.errorState}
formControlProps={{
fullWidth: true,
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
}}
inputProps={{
...props.inputProps,
type: 'textarea',
style: { border: '1px solid #495057' },
}}
helperText={props.helperText}
          [>
</GridItem>
</GridContainer>
</div>
  ];
};
