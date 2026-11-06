import { CoreProductSettingTypes } from 'types';

export default function createTextLengthValidators(productTemplate, context) {
// filter template sections that use pre-built components
const sectionsWithSettings = productTemplate?.sections?.filter(
(section) => section.settings,
  ];

  let maxLengthSettings = [];
sectionsWithSettings?.forEach((section) => {
const targetSettings = section.settings.filter(
(setting) =>
(setting.type === CoreProductSettingTypes.TEXT_ENTRY ||
setting.type === CoreProductSettingTypes.TEXTBOX) &&
setting.maxLength &&
typeof setting.maxLength === 'number',
    ];
if (targetSettings.length === 0) return;
maxLengthSettings = maxLengthSettings.concat(targetSettings);
  }};

  maxLengthSettings.forEach((setting) => {
const settingName = setting.settingCode;
const maxLength = setting.maxLength;

    context.addSettingValidationListener(settingName, (context, value) => {
if (!value || value.length <= maxLength) {
return;
}

      context.updateError(
settingName,
'Value cannot be more than ' + maxLength + ' characters.',
      ];
    }};
  }};
}
