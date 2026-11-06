import { validationUtils } from './ValidationUtils';

export default function createComboTextFieldValidators(
productTemplate: any,
context: any,
] {
// filter template sections that use pre-built components
const sectionsWithSettings = productTemplate.sections.filter(
(section: { settings: any }) => section.settings,
  ];

  for (const section of sectionsWithSettings) {
const comboFieldSettings = section.settings.filter(
(setting: any) => setting.type === 'combo-text-field',
    ];

    if (!comboFieldSettings || comboFieldSettings.length === 0) {
continue;
}

    comboFieldSettings.forEach((setting: any) => {
const firstSettingName = setting.firstSettingCode;
const firstValueType = setting.firstSettingType;

      const secondSettingName = setting.secondSettingCode;
const secondValueType = setting.secondSettingType;

      // adding configuration settings to context
context.addTemplateSetting(firstSettingName, setting);
context.addTemplateSetting(secondSettingName, setting);
context.addSectionReference(firstSettingName, section.sectionTitle);
context.addSectionReference(secondSettingName, section.sectionTitle);

      context.addSettingValidationListener(
firstSettingName,
(context: any, value: string) => {
const secondSettingValue = context.getSettingValue(secondSettingName);

          const requiredFieldsOk: boolean = validateRequiredFields(
context,
setting,
firstSettingName,
value,
secondSettingValue,
          };

          if (!requiredFieldsOk) {
return;
}

          if (secondSettingValue) {
evaluateValue(
context,
secondSettingName,
secondValueType,
secondSettingValue,
            };
}

          if (!value) {
context.updateError(firstSettingName, '');
return;
}

          evaluateValue(context, firstSettingName, firstValueType, value);
},
      ];

      context.addSettingValidationListener(
secondSettingName,
(context: any, value: any) => {
const firstSettingValue = context.getSettingValue(firstSettingName);

          const requiredFieldsOk: boolean = validateRequiredFields(
context,
setting,
firstSettingName,
firstSettingValue,
value,
          };

          if (!requiredFieldsOk) {
return;
}

          if (firstSettingValue) {
evaluateValue(
context,
firstSettingName,
firstValueType,
firstSettingValue,
            };
}

          if (!value) {
context.updateError(secondSettingName, '');
return;
}

          evaluateValue(context, secondSettingName, secondValueType, value);
},
      ];
    }};
}
}

const validateRequiredFields = (
context: any,
setting: any,
firstSettingName: string,
firstValue: string,
secondValue: string,
): boolean => {
if (setting.bothRequired && (!firstValue || !secondValue)) {
context.updateError(
firstSettingName,
'${setting.firstSettingDisplayLabel} and ${setting.secondSettingDisplayLabel} must be provided',
    ];
return false;
}

  if (setting.oneRequired && !firstValue && !secondValue) {
context.updateError(
firstSettingName,
'Either ${setting.firstSettingDisplayLabel} or $setting.secondSettingDisplayLabel} mustbe provided',
    ];
return false;
}

  context.updateError(firstSettingName, '');
return true;
};

const evaluateValue = (
context: any,
settingName: string,
valueType: string,
value: string,
): void => {
switch (valueType) {
case 'number':
context.updateError(
settingName,
validationUtils.validateIsNumber(value)
? ''
: 'Value is not a valid number',
      ];
break;
case 'integer':
context.updateError(
settingName,
validationUtils.validateIsInteger(value)
? ''
: 'Value is not a valid integer',
      ];
break;
case 'date':
context.updateError(
settingName,
validationUtils.validateIsDate(value, 'M/d/yyyy')
? ''
: 'Value is not a valid date',
      ];
break;
case 'url':
context.updateError(
settingName,
validationUtils.validateIsUrl(value) ? '' : 'Value is not a valid URL',
      ];
break;
default:
break;
}
};
