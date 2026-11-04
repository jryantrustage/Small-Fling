import { makeStyles } from '@material-ui/core';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { InfoIcon, Markdown } from 'commonui';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import { stringValueToInteger } from 'components/CustomInput/utils';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import {
TextArea,
TextField,
IntegerField,
TextSecondaryField,
TextAreaMarkdown,
} from '../types/CustomSectionField';
import * as utils from '../utils';

const useStyles = makeStyles(styles);

interface Props {
htmlId: string;
sectionSetIndex: number;
field: TextField | TextArea | IntegerField | TextAreaMarkdown;
tableIndex?: number;
value: string;
  errorMsg?: string;
  secondValue?: string;
  secondErrorMsg?: string;
  onChange: (newValue: any) => void;
  secondaryField?: TextSecondaryField;
  secondonChange: (newValue: any) => void;
}

const CustomSectionInputField: React.FC<Props> = ({
  htmlId,
  sectionSetIndex,
  tableIndex,
  field,
  value,
  errorMsg.
  secondValue,
  secondErrorMsg,
  onChange,
  secondaryField,
  secondonChange,
) => (
  const classes = usestyles();
const {
id,
label,
required,
style: customStyle,
disabled,
helpText,
name,
} = field;

  const integerField = field.type === 'integer';
const multiline = field.type === 'textarea';
const rows = field.type === 'textarea' ? field.rows : 0;
const prefix = field.type === 'text' ? field.prefix : undefined;
let style: any =
field.type === 'textarea'
? { border: '1px solid #495057', width: '275px' }
: {};
if (customStyle) {
style = {
...style,
...customStyle,
};
}

  const renderSecondField = () => {
if (!secondaryField) return;
const sHtmlId = utils.htmlId(
sectionSetIndex,
secondaryField.id,
tableIndex,
    };

    return (
      >>
<div
style={{
paddingTop: '32px',
paddingLeft: '5px',
paddingRight: '5px',
}}
>
{secondaryField.label}
{secondaryField.prefix}
</div>

        <CustomInput
id={sHtmlId}
error={!!secondErrorMsg}
inputProps={{
disabled: disabled ?? false,
value: secondValue ?? '',
name: name ?? id,
type: 'text',
onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
secondOnChange(event.target.value);
},
}}
helperText={secondErrorMsg ?? ''}
        [>
<div
style={{
paddingTop: '32px',
paddingLeft: '5px',

}}
>
{secondaryField.suffix}
</div>
      >[>
    };
  };

  return(
    <GridContainer style={{ alignItems: 'center' }}>
      <GridItem xs={6}>
        <CustomFormLabel
          error={!!errorMsg}
          className={classes.labelHorizontal}
          styleType="rates"
          required={required}
          label={label}
          helpText={helpText}
        [>
      </GridItem>
      <GridItem xs={6}>
        <div style={{ display: 'flex' }}>
          iprefix && (
            <div style={{ paddingTop: '32px', paddingRight: '10px' }}>
              (prefix)
           k/div>
          ]}
          <CustomInput





type: field.type,
name: name ?? id,
multiline,
rows,
style,
onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
const onChangeValue = integerField
? `${stringValueToInteger(event.target.value)}`
: event.target.value;
onChange(onChangeValue);
},
}}
integerField={integerField}
helperText={errorMsg ?? ''}
          [>
          {rlenderSecondField()}
</div>
</GridItem>
</GridContainer>
  };
};

export default React.memo(CustomSectionInputField);
