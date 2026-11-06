import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import { ViewSetting } from './ViewSetting';

export class TextFieldFactory {
constructor(viewMode, classes, idPrefix) {
this.viewMode = viewMode;
this.classes = classes;
this.idPrefix = idPrefix;
}

  createComponent(templateSetting, context, settingFactory, customSettingCode) {
const currentValue = customSettingCode
? context.getSettingValue(customSettingCode)
: context.getSettingValue(templateSetting.settingCode);
if (this.viewMode === ViewMode.View || customSettingCode) {
return (
<ViewSetting
label={templateSetting.label}
isCustomSettingCode={customSettingCode == null ? false : true}
settingName={`${templateSetting.settingCode}`}
settingValue={currentValue}
classes={this.classes}
        [>
      ];
}

    let inputProps;

    if (templateSetting.valueType !== 'date') {
inputProps = {
disabled: templateSetting.disabled,
value: currentValue,
type: 'text',
onChange: (event) => {
context.notifyChange(templateSetting.settingCode, event.target.value);
},
};
} else {
inputProps = {
disabled: templateSetting.disabled,
type: 'text',
placeholder: 'mm/dd/yyyy',
onChange: (event) => {
context.notifyChange(templateSetting.settingCode, event.target.value);
},
// onBlur: validateChange,
value: currentValue,
};
}

    const errorState = context.getErrorState(templateSetting.settingCode);

    return (
<GridContainer>
<GridItem xs={12} sm={5} md={5}>
<CustomFormLabel
error={errorState && errorState.length > 0}
className={this.classes.labelHorizontal}
styleType="textFieldFactory"
required={templateSetting.required}
label={templateSetting.label}
          [>
</GridItem>
<GridItem xs={12} sm={6} md={6}>
<CustomInput
id={`${this.idPrefix}${templateSetting.settingCode}`}
error={errorState && errorState.length > 0}
formControlProps={{
fullWidth: true,
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
}}
inputProps={inputProps}
helperText={errorState ? errorState : ''}
          [>
</GridItem>
</GridContainer>
    ];
}
}
