import createTypeValidators from './type-validation-factory';
import createMultiSelectValidators from './multi-select-validation-factory';
import createTextLengthValidators from './text-length-validation-factory';
import configureUserRules from './user-rules-configuration';
import createComboTextFieldValidators from './ComboTextFieldValidationFactory';

const defaultProductTemplate = { sections: [] };

export default function configureValidators(
productTemplate = defaultProductTemplate,
productConfig,
productFormContext,
] {
const productTemplateWithDefault = {
...defaultProductTemplate,
...productTemplate,
};
createTypeValidators(productTemplateWithDefault, productFormContext);
createTextLengthValidators(productTemplateWithDefault, productFormContext);
createMultiSelectValidators(productTemplateWithDefault, productFormContext);
configureUserRules(productTemplateWithDefault, productFormContext);
createComboTextFieldValidators(
productTemplateWithDefault,
productFormContext,
  ];
}
