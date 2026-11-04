import React from 'react';
import CustomSectionMultiSelectField from './CustomSectionMultiSelectField';
import CustomSectionRadioField from './CustomSectionRadioField';
import CustomSectionSelectField from './CustomSectionSelectField';
import CustomSectionField, {
CustomSectionMultiSelect,
} from '../types/CustomSectionField';
import * as utils from '../utils';
import CustomSectionInputField from './CustomSectionInputField';
import CustomSectionCheckboxField from './CustomSectionCheckboxField';
import CustomSectionSwitchField from './CustomSectionSwitchField';
import SwitchableInputField from './CustomSectionSwitchableInputField';
import useFieldOnChange from '../hooks/useFieldDispatch';

interface Props {
























secondaryField?.id,
tableIndex,
).onChange;
const { onChange: onCustomFieldChange } = useFieldOnChange(
sectionSetIndex,
(field as CustomSectionMultiSelect).customFieldId ?? '',
tableIndex,
  };

  switch (field.type) {
case 'select':
return (
<CustomSectionSelectField
key={htmlId}
htmlId={htmlId}
sectionSetIndex={sectionSetIndex}
tableIndex={tableIndex}
field={field}
value={value}
onChange={onChange}
errorMsg={errorMsg}
        [>
      };
    case 'radio':
      return(
        <CustomSectionRadioField
          onChange={onChange}
          key={htmlId}
          htmlId={htmlId}
          sectionSetIndex={sectionSetIndex}
          tableIndex={tableIndex}
          field={field}
          value={value}
          errorMsg={errorMsg}
        [>
      };
    case 'checkbox':
      return(
        <CustomSectionCheckboxField
          key={htmlId}
          htmlId={htmlId}
          sectionSetIndex={sectionSetIndex}
          tableIndex={tableIndex}
          field={field}
          value={value}
        [>
      };
    case 'multiselect':
      return(
        <CustomSectionMultiSelectField
          key={htmlId}
          htmlId={htmlId}
          onChange={onChange}
          onCustomFieldChange={onCustomFieldChange}
          sectionSetIndex={sectionSetIndex}
          tableIndex={tableIndex}













field={field}
value={value}
        [>
      };
case 'switchableInput':
return (
<SwitchableInputField
key={htmlId}
htmlId={htmlId}
sectionSetIndex={sectionSetIndex}
tableIndex={tableIndex}
field={field}
value={value}
switchValue={secondaryValue}
errorMsg={errorMsg}
        [>
      };
case 'text':
case 'textarea':
case 'textarea-markdown':
case 'integer':
return (
<CustomSectionInputField


















