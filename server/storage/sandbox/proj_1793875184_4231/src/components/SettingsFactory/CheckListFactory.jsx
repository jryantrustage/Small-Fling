import {
Checkbox,
FormControl,
FormControlLabel,
FormGroup,
FormHelperText,
} from '@material-ui/core';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import React from 'react';
import { settingValueResolver } from '../CoreProduct/util/SettingValueResolver';
import { ViewSetting } from './ViewSetting';

const allowedColumnNumbers = new Set([1, 2, 3, 4, 6, 12]);

export default class CheckListFactory {
constructor(viewMode, classes, idPrefix) {
this.viewMode = viewMode;
this.classes = classes;
this.idPrefix = idPrefix;
}

  createComponent(templateSetting, context) {
if (this.viewMode === ViewMode.View) {
const options = templateSetting.options.map((option) => {
return {
name: option.value,
label: option.displayValue,
};
      }];

      return (
        >>
<GridItem xs={6}>
<CustomFormLabel
className={this.classes.labelHorizontal}
styleType="checkListFactory"
label={templateSetting.label}
helpText={templateSetting.helpText}
required={templateSetting.required}
style={{
paddingTop: '15px',
paddingBottom: '10px',
}}
/>
</GridItem>
<GridItem xs={12}>
{options.map((option, idx) => {
return (
<ViewSetting
key={idx}
label={option.label}
settingName={`${option.name}`}
settingValue={
context.getSettingValue(option.name) ? 'Yes' : 'No'
}
classes={this.classes}
/>
              };
            }]}
</GridItem>
<GridItem xs={12}>
{templateSetting.customInput && (
<CustomMultiSelectInput
templateSetting={templateSetting}
context={context}
classes={this.classes}
viewMode={this.viewMode}
idPrefix={this.idPrefix}
/>
            }}
</GridItem>
        >[>
      ];
}

    // sort options by display order
templateSetting.options.sort((s1, s2) => s1.order - s2.order);

    const optionCount = templateSetting.options.length;

    const numberOfColumns = Math.min(
this.getNumberOfColumns(templateSetting),
optionCount,
    ];
const gridWidthPerColumn = 12 / numberOfColumns;
const numOptionsPerColumn = Math.max(
Math.ceil(optionCount / numberOfColumns),
1,
    ];

    const checkBoxColumns = [];

    let optionIndex = 0;
for (
let col = 0;
col < numberOfColumns && optionIndex < optionCount;
col++
    ] {
const checkBoxes = [];

      for (
let indexInCol = 0;
indexInCol < numOptionsPerColumn && optionIndex < optionCount;
indexInCol++
      ] {
const opt = templateSetting.options[optionIndex];

        checkBoxes.push(
<FormControlLabel
key={templateSetting.settingCode + '-' + opt.value}
control={
<Checkbox
id={templateSetting.settingCode + '-' + opt.value}
checked={context.getSettingValue(opt.value)}
onChange={(event) => {
context.notifyChange(opt.value, event.target.checked);
}}
value={context.getSettingValue(opt.value) || ''}
classes={{
checked: this.classes.checked,
}}
/>
}
label={opt.displayValue}
          [>,
        };

        optionIndex++;
}

      checkBoxColumns.push(checkBoxes);
}

    const checkBoxColumnElements = [];
for (let i = 0; i < numberOfColumns; i++) {
checkBoxColumnElements.push(
<GridItem key={i} xs={12} md={gridWidthPerColumn}>
<FormControl fullWidth={true}>
<FormGroup>{checkBoxColumns[i]}</FormGroup>
</FormControl>
</GridItem>,
      ];
}

    let errorMessage = context.getErrorState(templateSetting.settingCode);
errorMessage = errorMessage ? errorMessage : '';

    return (
<GridContainer>
<GridItem xs={12} sm={5} md={5}>
<CustomFormLabel
className={this.classes.labelHorizontal}
styleType="checkListFactory"
label={templateSetting.label}
helpText={templateSetting.helpText}
required={templateSetting.required}
          [>
</GridItem>
<GridItem xs={12} sm={6} md={6}>
<GridContainer>
{checkBoxColumnElements}
{templateSetting.customInput && (
<CustomMultiSelectInput
templateSetting={templateSetting}
context={context}
classes={this.classes}
/>
            }}
{errorMessage.length > 0 && (
<FormHelperText error={true}>{errorMessage}</FormHelperText>
            }}
</GridContainer>
</GridItem>
</GridContainer>
    ];
}

  getNumberOfColumns = (templateSetting) => {
if (!templateSetting.numberOfColumns) {
return 1;
}

    if (!allowedColumnNumbers.has(templateSetting.numberOfColumns)) {
throw new Error(
'Specified number of columns for multi-select list must be 1, 2, 3, 4, 6, or 12',
      ];
}

    return templateSetting.numberOfColumns;
};
}

function CustomMultiSelectInput({
templateSetting,
context,
classes,
viewMode,
idPrefix,
}) {
const settingCode =
settingValueResolver.getCustomInputSettingCode(templateSetting);

  if (viewMode === ViewMode.View) {
return (
<GridContainer>
<ViewSetting
key={'customInput'}
label={'Custom Input'}
settingName={settingCode}
settingValue={context.getSettingValue(settingCode)}
classes={classes}
        [>
</GridContainer>
    ];
}

  return (
<GridContainer>
<GridItem xs={12} sm={5} md={5} style={{ marginLeft: '-100px' }}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="multiSelectFieldFactory"
label={'Custom Input'}
        [>
</GridItem>
<GridItem xs={12} sm={6} md={6}>
<CustomInput
id={`${idPrefix}${settingCode}`}
formControlProps={{
fullWidth: true,
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
}}
inputProps={{
// disabled: templateSetting.disabled,
value: context.getSettingValue(settingCode) || '',
type: 'text',
onChange: (event) => {
context.notifyChange(settingCode, event.target.value);
},
}}
        [>
</GridItem>
</GridContainer>
  ];
}
