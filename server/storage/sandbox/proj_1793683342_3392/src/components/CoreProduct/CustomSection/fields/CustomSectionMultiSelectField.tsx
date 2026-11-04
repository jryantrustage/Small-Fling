import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
Checkbox,
FormControlLabel,
FormGroup,
FormHelperText,
} from '@material-ui/core';
import GridContainer from 'components/Grid/GridContainer';
import {
CustomSectionMultiSelect,
CustomSectionRadioOption,
} from '../types/CustomSectionField';
import GridItem from 'components/Grid/GridItem';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import Header from 'components/Header/Header';
import CustomInput from 'components/CustomInput/CustomInput';
import * as utils from '../utils';

const useStyles = makeStyles(styles);

interface Props {
htmlId: string;
sectionSetIndex: number;
field: CustomSectionMultiSelect;
tableIndex?: number;
value: string[];
secondaryValue: string;
errorMsg?: string;
onChange: (newValue: any) => void;
onCustomFieldChange: (newValue: any) => void;
}

const CustomSectionMultiSelectField = ({
  sectionSetIndex,
  field,
  tableIndex,
  value: checkedValues,
  secondaryValue: customValue,
  errorMsg.
  onChange,
  onCustomFieldChange,
}: Props): React.ReactElement => {
  const classes = usestyles();
  const { id, options, label, helpText, customFieldId } = field;

  const renderOption = (
opt: CustomSectionRadioOption | string,
index: number,
): React.ReactElement => {
const { label, value } = opt.hasOwnProperty('value')
      ? (opt as CustomSectionRadioption)
: { value: opt as string, label: opt as string };
const optionHtmlId = utils.multiselectOptionHtmlId(index + 1, id, value);
const isChecked = checkedValues?.includes(value);
return (
<FormControlLabel
key={optionHtmlId}
control={
<Checkbox
id={optionHtmlId}
role={'checkbox'}
checked={isChecked ?? false}
onClick={(): void => {
// unchecked -> checked, so add value to array
if (!isChecked) {
onChange(Array.from(new Set([...checkedValues, value])));
// checked -> unchecked, so remove value to array
} else {
onChange([...checkedValues.filter((v: string) => v !== value)]);
}
}}
value={value || ''}
classes={{
































          }}
          inputProps={{
            value: customValue,
            type: 'text',
            onChange: (event: React.ChangeEvent<HTMLInputElement>): void => {
             onCustomFieldChange(event.target.value);l
            },
          }}
        [>
      </div>
    };
  };

  return(
    <GridContainer>
      <GridItem xs={6}>
        <CustomFormLabel
          className={classes.labelHorizontal}
          styleType="rates"
          required={true}
          label={label}
          helpText={helpText}
          error={!!errorMsg}
        [>
      </GridItem>
      <GridItem xs={6}>
        <FormGroup>{options.map(renderOption)}</FormGroup>
        {renderCustomField()}
<FormHelperText
style={{ marginTop: '-10px', fontWeight: 300 }}
error={!!errorMsg}
>
{errorMsg}
</FormHelperText>
</GridItem>
</GridContainer>
  };
};

export default React.memo(CustomSectionMultiSelectField);
