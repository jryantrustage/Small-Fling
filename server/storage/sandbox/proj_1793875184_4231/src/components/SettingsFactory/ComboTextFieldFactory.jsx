[>

example template definition:

{
"type": "combo-text-field",
"comboSettingLabel": "Minimum Monthly Payment"
"firstSettingCode": "FIRST-SETTING-CODE",
"firstSettingDisplayName": "First Setting Code",
"firstSettingType": "number",
"firstSettingDisplayLabel": "Minimum Monthly Payment ($)",
"secondSettingCode": "SECOND-SETTING-CODE",
"secondSettingDisplayName": "First Setting Code",
"secondSettingType": "integer",
"secondSettingDisplayLabel": "Minimum Monthly Payment (%)",
"textBefore": "$",
"textBetween": " and/or ",
"textAfter": "%",
"bothRequired": false,
"oneRequired": true,
"firstRequired": false,
"secondRequired": false
}

>[
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Danger from 'components/Typography/Danger';
import ViewMode from 'context/view-mode';
import React from 'react';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import { ViewSetting } from './ViewSetting';

export class ComboTextFieldFactory {
constructor(viewMode, classes, idPrefix) {
this.viewMode = viewMode;
this.classes = classes;
this.idPrefix = idPrefix;
}

  createComponent(templateSetting, context) {
if (this.viewMode === ViewMode.View) {
const firstSettingValue = context.getSettingValue(
templateSetting.firstSettingCode,
      ];
const secondSettingValue = context.getSettingValue(
templateSetting.secondSettingCode,
      ];

      return (
<div>
{firstSettingValue && (
<ViewSetting
label={templateSetting.firstSettingDisplayLabel}
helpText={templateSetting.helpText}
settingName={`${templateSetting.firstSettingCode}`}
settingValue={firstSettingValue}
classes={this.classes}
/>
          }}
{secondSettingValue && (
<ViewSetting
label={templateSetting.secondSettingDisplayLabel}
settingName={`${templateSetting.secondSettingCode}`}
settingValue={secondSettingValue}
classes={this.classes}
/>
          }}
</div>
      ];
}

    const firstErrorState = context.getErrorState(
templateSetting.firstSettingCode,
    ];
const secondErrorState = context.getErrorState(
templateSetting.secondSettingCode,
    ];

    const errorState = firstErrorState
? firstErrorState
: secondErrorState
? secondErrorState
      ; ``;

    return (
<GridContainer>
<GridItem xs={12} sm={5} md={5}>
<div style={{ paddingTop: '20px' }}>
<CustomFormLabel
error={
(firstErrorState && firstErrorState.length > 0) ||
(secondErrorState && secondErrorState.length > 0)
}
className={this.classes.labelHorizontal}
styleType="textFieldFactory"
required={
templateSetting.bothRequired ||
templateSetting.oneRequired ||
templateSetting.firstRequired ||
templateSetting.secondRequired
? true
: false
}
label={templateSetting.comboSettingLabel}
helpText={templateSetting.helpText}
/>
</div>
</GridItem>
<GridItem xs={12} sm={6} md={6}>
<div
style={{
display: 'inline-block',
whiteSpace: 'nowrap',
paddingTop: '20px',
}}
>
<div style={{ display: 'inline-block' }}>
{templateSetting.textBefore}
</div>
<CustomInput
id={`${this.idPrefix}${templateSetting.firstSettingCode}`}
error={firstErrorState && firstErrorState.length > 0}
formControlProps={{
style: {
paddingTop: '0px',
paddingBottom: '0px',
display: 'inline-block',
width: '35%',
},
}}
inputProps={{
disabled: templateSetting.disabled,
value: context.getSettingValue(
templateSetting.firstSettingCode,
                },
type: 'text',
onChange: (event) => {
context.notifyChange(
templateSetting.firstSettingCode,
event.target.value,
                  ];
},
}}
/>
<div
style={{
display: 'inline-block',
paddingLeft: '6px',
paddingRight: '6px',
}}
>
{templateSetting.textBetween}
</div>
<CustomInput
id={`${this.idPrefix}${templateSetting.secondSettingCode}`}
error={secondErrorState && secondErrorState.length > 0}
formControlProps={{
style: {
paddingTop: '0px',
paddingBottom: '0px',
display: 'inline-block',
width: '35%',
},
}}
inputProps={{
disabled: templateSetting.disabled,
value: context.getSettingValue(
templateSetting.secondSettingCode,
                },
type: 'text',
onChange: (event) => {
context.notifyChange(
templateSetting.secondSettingCode,
event.target.value,
                  ];
},
}}
/>
<div style={{ display: 'inline-block' }}>
{templateSetting.textAfter}
</div>
</div>
{errorState && <Danger>{errorState}</Danger>}
</GridItem>
</GridContainer>
    ];
}
}
