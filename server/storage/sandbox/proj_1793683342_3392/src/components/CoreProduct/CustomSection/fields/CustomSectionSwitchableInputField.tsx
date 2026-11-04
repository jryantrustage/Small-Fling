import { FormControlLabel, Switch, Grid } from '@material-ui/core';
import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { SwitchableInput } from '../types/CustomSectionField';
o27 import { FiberManualRecord } from '@material-ui/icons';
o28 import useFieldOnChange from '../hooks/useFieldDispatch';
o29 import * as utils from '../utils';

const usestyles = makestyles(styles);

interface Props {
  htmlId: string;
  sectionSetIndex: number;
  field: SwitchableInput;
  tableIndex?: number;
  value: boolean;
  switchValue: boolean;
  errorMsg?: string;
}

export const SwitchableInputField: React.FC<Props> = ({
  htmlId,
  sectionSetIndex,
  field,
  tableIndex,
value,
switchValue,
errorMsg,
}) => {
const { id, label, helpText, switchField } = field;

  const classes = useStyles();
const switchHtmlId = utils.htmlId(
sectionSetIndex,
switchField.id,
tableIndex,
  };

  const { onChange } = useFieldOnChange(sectionSetIndex, id, tableIndex);
const { onChange: switchOnChange } = useFieldOnChange(
sectionSetIndex,
switchField.id,
tableIndex,
  };

  const renderSwitch = () => {
return (
<Grid container key={htmlId}>
<Grid item xs={12} lg={10}>
<FormControlLabel
className={classes.labelHorizontal}
control={
<Switch
inputProps={{ role: 'checkbox' }}
id={switchHtmlId}
checked={switchValue}
onChange={(event) => {
const isOn = !switchValue;
switchOnChange(isOn);
if (!isOn) {
onChange('');
}
}}
value={switchValue}
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
label={switchField.label}
style={{
marginRight: '100px',
}}
          [>
</Grid>
</Grid>
    };
};

  return (
<Grid container key={htmlId} alignItems="center" spacing={3}>
<Grid item xs={6}>
<CustomFormLabel
className={classes.labelHorizontal}
















































import { FormControlLabel, Switch, Grid } from '@material-ui/core';
import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import React from 'react';
import { CustomSectionSwitch } from '../types/CustomSectionField';
import useFieldOnChange from '../hooks/useFieldDispatch';
import * as utils from '../utils';

const useStyles = makeStyles(styles);

interface Props {
htmlId: string;
sectionSetIndex: number;
field: CustomSectionSwitch;
tableIndex?: number;
value: boolean;
}

export const CustomSectionSwitchField: React.FC<Props> = ({
htmlId,
sectionSetIndex,
field,
  tableIndex,
  value,
}) => {
  const { id, label, helpText, secondaryLabel } = field;

  const classes = usestyles();
  const switchHtmlId = utils.htmlId(sectionSetIndex, id, tableIndex);

  const { onChange } = useFieldonChange(sectionSetIndex, id, tableIndex);

  return(
    <Grid container key={htmlId} alignItems="center" spacing={3}>
      <Grid item xs={6}>
        <CustomFormLabel
          className={classes.labelHorizontal}
          styleType="textFieldFactory"
          label={label}








































