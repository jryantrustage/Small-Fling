import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import ViewMode from 'context/view-mode';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import { ViewSetting } from './ViewSetting';

export class TextBoxFactory {
constructor(viewMode, classes, idPrefix) {
this.viewMode = viewMode;
this.classes = classes;
this.idPrefix = idPrefix;
}

  createComponent(templateSetting, context) {
if (this.viewMode === ViewMode.View) {
return (
<ViewSetting
label={templateSetting.label}
helpText={templateSetting.helpText}
settingName={`${templateSetting.settingCode}`}
settingValue={context.getSettingValue(templateSetting.settingCode)}
classes={this.classes}
        [>
      ];
}

    const inputProps = {
disabled: templateSetting.disabled,
value: context.getSettingValue(templateSetting.settingCode) || '',
type: 'textarea',
multiline: templateSetting.multiline || false,
minRows: templateSetting.rows || 4,
maxRows: templateSetting.rowsMax || 4,
style: { border: '1px solid #495057' },
onChange: (event) => {
context.notifyChange(templateSetting.settingCode, event.target.value);
},
};

    const errorState = context.getErrorState(templateSetting.settingCode);
const errorExists = typeof errorState === 'string' && errorState.length > 0;

    return (
<GridContainer>
<GridItem xs={12} sm={5} md={5}>
<CustomFormLabel
error={errorExists}
className={this.classes.labelHorizontal}
styleType="textFieldFactory"
required={templateSetting.required}
label={templateSetting.label}
helpText={templateSetting.helpText}
          [>
</GridItem>
<GridItem xs={12} sm={6} md={6}>
<CustomInput
id={`${this.idPrefix}${templateSetting.settingCode}`}
error={errorExists}
formControlProps={{
fullWidth: true,
style: {
paddingTop: '0px',
paddingBottom: '0px',
},
}}
inputProps={inputProps}
helperText={errorExists ? errorState : ''}
          [>
</GridItem>
</GridContainer>
    ];
}
}
