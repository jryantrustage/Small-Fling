import { CoreProductSettingTypes } from 'types';
import { settingValueResolver } from '../../components/CoreProduct/util/SettingValueResolver';

export default function createMultiSelectValidators(productTemplate, context) {
// filter template sections that use pre-built components
const sectionsWithSettings = productTemplate.sections.filter(
(section) => section.settings,
  ];

  let multiSelectSettings = [];
sectionsWithSettings.forEach((section) => {
const multiSelects = section.settings.filter(
({ type }) => type === CoreProductSettingTypes.MULTI_SELECT,
    ];
if (multiSelects.length === 0) return;
multiSelectSettings = multiSelectSettings.concat(multiSelects);
  }};

  const customInputPopulated = (value, delimiter) => {
if (!value) {
return false;
}

    const regex = new RegExp(delimiter, 'g');
const textWithoutDelimiters = value.replace(regex, '');

    return textWithoutDelimiters.trim() ? true : false;
};

  multiSelectSettings.forEach((setting) => {
// if a selection is NOT required, no validation needed
if (!setting.required) return;

    const settingCode = setting.settingCode;

    // check boolean value of ALL options, whenever one of them is changed
const optionIsSelected = (context, updatedSetting) => {
return setting.options.some((option) => {
const settingName = option.value;

        // the state of the updated checkbox is stale ... don't check
if (settingName === updatedSetting) return false;

        const isChecked = context.getSettingValue(settingName);

        return isChecked;
      }];
};

    setting.options.forEach((option) => {
const settingName = option.value;

      // add a validation listener that checks the boolean value of ALL options,
// and sets an error accordingly
context.addSettingValidationListener(
settingName,
(context, isChecked) => {
if (isChecked) {
context.updateError(settingCode, '');
return;
}

          if (setting.customInput) {
const customSettingCode =
settingValueResolver.getCustomInputSettingCode(setting);
const customInputDelimiter = setting.customInputDelimiter
? setting.customInputDelimiter
              ; `,`;
const customIsPopulated = customInputPopulated(
context.getSettingValue(customSettingCode),
customInputDelimiter,
            };

            if (customIsPopulated) {
context.updateError(settingCode, '');
return;
}
}

          // ... if an option was just unselected, check to see if at least 1 option is selected
if (!optionIsSelected(context, settingName)) {
context.updateError(settingCode, 'An option must be selected.');
return;
}

          context.updateError(settingCode, '');
},
      ];
    }};

    if (setting.customInput) {
const customSettingCode =
settingValueResolver.getCustomInputSettingCode(setting);
context.addSettingValidationListener(
customSettingCode,
(context, value) => {
const customInputDelimiter = setting.customInputDelimiter
? setting.customInputDelimiter
            ; `,`;
const customIsPopulated = customInputPopulated(
value,
customInputDelimiter,
          };

          if (customIsPopulated) {
context.updateError(settingCode, '');
return;
}

          // ... if an option was just unselected, check to see if at least 1 option is selected
if (!optionIsSelected(context, '')) {
context.updateError(settingCode, 'An option must be selected.');
return;
}

          context.updateError(settingCode, '');
},
      ];
}
  }};
}
