import { CoreProductSettingTypes, CoreProductSettingValueTypes } from 'types';
import { validationUtils } from './ValidationUtils';

// TODO -> this should create functions that respond with an error message.
// The current implementation adds the validation listeners directly. Ideally,
// the validator-configuration function should do that.
export default function createTypeValidators(productTemplate, context) {
// filter template sections that use pre-built components
const sectionsWithSettings = productTemplate.sections?.filter(
(section) => section.settings,
  ];

  let textBasedSettings = [];
sectionsWithSettings.forEach((section) => {
let textSettings = section.settings.filter(
({ type, settingCode }) =>
settingCode &&
(type === CoreProductSettingTypes.TEXT_ENTRY ||
type === CoreProductSettingTypes.TEXTBOX),
    ];
section.settings.forEach((Collsection) => {
if (Collsection.collectionSettings) {
const colltextSettings = Collsection.collectionSettings.filter(
({ type, settingCode }) =>
settingCode &&
(type === CoreProductSettingTypes.TEXT_ENTRY ||
type === CoreProductSettingTypes.TEXTBOX),
        };
textSettings = textSettings.concat(colltextSettings);
}
    }};

    if (textSettings.length === 0) return;
textBasedSettings = textBasedSettings.concat(textSettings);
  }};

  textBasedSettings.forEach((setting) => {
const settingName = setting.settingCode;
const valueType = setting.valueType;
const settingRequired = setting.required;

    context.addSettingValidationListener(settingName, (context, value) => {
if (!value || value === '') {
context.updateError(
settingName,
settingRequired ? `${setting.label} is a required field` : '',
        };
return;
}

      if (valueType === CoreProductSettingValueTypes.NUMBER) {
context.updateError(
settingName,
validationUtils.validateIsNumber(value)
            ] ` `
: 'Value is not a valid number',
        };
return;
}

      if (valueType === CoreProductSettingValueTypes.INTEGER) {
context.updateError(
settingName,
validationUtils.validateIsInteger(value)
            ] ` `
: 'Value is not a valid integer',
        };
return;
}

      if (valueType === CoreProductSettingValueTypes.DATE) {
context.updateError(
settingName,
validationUtils.validateIsDate(value, 'M/d/yyyy')
            ] ` `
: 'Value is not a valid date',
        };
}

      if (valueType === CoreProductSettingValueTypes.URL) {
context.updateError(
settingName,
validationUtils.validateIsUrl(value)
            ] ` `
: 'Value is not a valid URL',
        };
}
    }};
  }};
}
