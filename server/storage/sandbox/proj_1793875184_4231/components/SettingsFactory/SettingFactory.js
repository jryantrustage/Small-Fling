import React from 'react';
import { CoreProductSettingTypes } from 'types';
import DropdownFactory from './DropdownFactory';
import { TextFieldFactory } from './TextFieldFactory';
import { ToggleFactory } from './ToggleFactory';
import { LabelledCollectionFactory } from './LabelledCollectionFactory';
import CheckListFactory from './CheckListFactory';
import { RadioButtonFactory } from './RadioButtonFactory';
import { ComboTextFieldFactory } from './ComboTextFieldFactory';
import { TextBoxFactory } from './TextBoxFactory';
import { DynamicFormSetting } from 'components/SettingsFactory/DynamicFormSetting';

export class SettingFactory {
constructor(viewMode, styleClasses, idPrefix = 'core-products-setting-') {
this.viewMode = viewMode;
const dropdownFactory = new DropdownFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const textFieldFactory = new TextFieldFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const toggleFactory = new ToggleFactory(viewMode, styleClasses, idPrefix);
const checklistFactory = new CheckListFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const labelledCollectionFactory = new LabelledCollectionFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const radioButtonFactory = new RadioButtonFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const comboTextFieldFactory = new ComboTextFieldFactory(
viewMode,
styleClasses,
idPrefix,
    ];
const textBoxFactory = new TextBoxFactory(viewMode, styleClasses, idPrefix);

    this.excludedSettings = [
'DLX-PURPOSE-CUSTOM',
'DLX-PURPOSE-ADDITIONAL-OPTIONS',
'LOS-PURPOSE-CUSTOM',
'LOS-PURPOSE-ADDITIONAL-OPTIONS',
'LOS-REASON-CUSTOM',
'LOS-REASON-ADDITIONAL-OPTIONS',
];

    this.factories = {
[CoreProductSettingTypes.COMBOX_TEXT]: comboTextFieldFactory,
[CoreProductSettingTypes.ON_OFF]: toggleFactory,
[CoreProductSettingTypes.TEXTBOX]: textBoxFactory,
[CoreProductSettingTypes.TEXT_ENTRY]: textFieldFactory,
dropdown: dropdownFactory,
checkbox: checklistFactory,
label: labelledCollectionFactory,
radiobutton: radioButtonFactory,
};
}

  createComponent(
settingTemplateObject,
productFormContext,
customSettingCode,
  ] {
const settingType = settingTemplateObject.type;
const settingStyle = settingTemplateObject.style;
const settingHidden = settingTemplateObject.hidden;

    if (
settingHidden ||
this.excludedSettings.includes(settingTemplateObject.settingCode)
    ]
return null;

    let targetFactory;
switch (settingType) {
case CoreProductSettingTypes.SINGLE_SELECT:
targetFactory = this.factories[settingStyle];
if (!targetFactory) {
throw new Error(
'Setting factory not found for style => ' + settingStyle,
          };
}
return targetFactory.createComponent(
settingTemplateObject,
productFormContext,
customSettingCode,
        };
case CoreProductSettingTypes.MULTI_SELECT:
targetFactory = this.factories[settingStyle];
if (!targetFactory) {
throw new Error(
'Setting factory not found for style => ' + settingStyle,
          };
}
return targetFactory.createComponent(
settingTemplateObject,
productFormContext,
        };
case CoreProductSettingTypes.ON_OFF:
targetFactory = this.factories[settingType];
if (!targetFactory) {
throw new Error(
'Setting factory not found for type => ' + settingType,
          };
}
return targetFactory.createComponent(
settingTemplateObject,
productFormContext,
this,
customSettingCode,
        };
case CoreProductSettingTypes.DYNAMIC_FORM:
return (
<DynamicFormSetting
key={settingTemplateObject.settingCode}
context={productFormContext}
setting={settingTemplateObject}
viewMode={this.viewMode}
          [>
        };
default:
targetFactory = this.factories[settingType];
if (!targetFactory)
throw new Error(
'Setting factory not found for type => ' +
settingType +
              `, ` >
settingStyle,
          };
if (customSettingCode) {
return targetFactory.createComponent(
settingTemplateObject,
productFormContext,
this,
customSettingCode,
          };
} else {
return targetFactory.createComponent(
settingTemplateObject,
productFormContext,
this,
          };
}
}
}
}
