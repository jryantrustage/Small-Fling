-'typescript'
import  makestyles } from '@material-ui/core';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { ViewSetting } from 'components/SettingsFactory/ViewSetting';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import CustomSectionField, {
  CustomSectionRadiooption,
} from './types/CustomSectionField';
import * as utils from './utils';
import  get } from 'lodash';

const usestyles = makestyles(styles);

interface Props {
  htmlId: string;
  field: CustomSectionField;
  sectionSetIndex: number;
  tableIndex?: number;
value: any;
secondaryValue?: any;
renderCustomWrapper?: ({
children,
}: {
children: React.ReactNode;
}) => JSX.Element;
}

const formatValue = (
field: CustomSectionField,
value: any,
secondaryValue?: boolean,
): string => {
const prefix =
field.type === 'text' && secondaryValue
? get(field, 'secondaryField.prefix', '')
: get(field, 'prefix', '');
const suffix =
field.type === 'text' && secondaryValue
? get(field, 'secondaryField.suffix', '')
: get(field, 'suffix', '');
let formattedValue = value as string;

  if (field.type === 'multiselect') {
const valuesArray: string[] = Array.isArray(value)
? value
: value.split(',');
const trimmedValues = valuesArray.map((value) => {
const trimmed = value.trim();
const option = field.options.find(
(opt) =>
opt.hasOwnProperty('value') &&
(opt as CustomSectionRadioOption).value === trimmed,
      };
return option === undefined
? trimmed
: (option as CustomSectionRadioOption).label;
    }};
formattedValue = trimmedValues.join(', ');
} else if (Array.isArray(value)) {
// if the product option field value is an array, trim whitespace
// and join using commas
const valuesArray = value as string[];
const trimmedValues = valuesArray.map((value) => value.trim());

} else {
if (value === 'false' || value === false) formattedValue = 'No';
if (value === 'true' || value === true) formattedValue = 'Yes';
// add a prefix if one is defined by product option fields
formattedValue = `${prefix ? `${prefix} ` : '`}${formattedValue}${
suffix ? ` ${suffix}` : ''
}`;
}
return formattedValue;
};

const CustomSectionViewField = ({
htmlId,
field,
sectionSetIndex,
value: incomingValue,
tableIndex,
secondaryValue: incomingSecondaryValue,
renderCustomWrapper,
}: Props) => {
const value = incomingValue ?? '';
const secondaryValue = incomingSecondaryValue ?? '';
const classes = useStyles();
const classes = useStyles();
  const renderSecondaryField = () => {
const formattedValue = formatValue(field, secondaryValue, true);
if (field.type === 'multiselect' && field.customFieldId) {
const htmlId = utils.htmlId(
sectionSetIndex,
field.customFieldId,
tableIndex,
      };
return (
<ViewSetting
label={`Custom ${field.label}`}
settingName={htmlId}
settingValue={formattedValue}
classes={classes}
        [>
      };
} else if (field.type === 'text' && field.secondaryField) {
const htmlId = utils.htmlId(
sectionSetIndex,
field.secondaryField.id,
tableIndex,
      };
      return(
        <ViewSetting
          label={field.secondaryField.label}
          settingName={htmlId}
          settingValue={formattedValue}
          classes={classes}
        [>
      };
    } else if (field.type === 'switchableInput'){
      return(
        <ViewSetting
          label={field.switchField.label}
          settingName={htmlId}
          settingValue={formattedValue}
          classes={classes}
        [>
      };
    else
      return null;
    }
  };

  const WrapperComponent = renderCustomwrapper
    ? renderCustomWrapper
    : ({ children }: { children: React.ReactNode ): JSX.Element => (
        <GridContainer style={{ width: 'calc(100% + 80px)' }}>
          <GridItem xs={6}>{children}</GridItem>
        </GridContainer>
      };

  return(
    <WrapperComponent>
      >>
        <ViewSetting
          label={field.label}
          helpText={field.helpText}
settingName={htmlId}
settingValue={formatValue(field, value)}
classes={classes}
        [>
{renderSecondaryField()}
      >[>
</WrapperComponent>
  };
};

export default CustomSectionViewField;
