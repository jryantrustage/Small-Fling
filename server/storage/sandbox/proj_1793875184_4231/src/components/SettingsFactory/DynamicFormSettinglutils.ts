import {
Core,
expandFieldGroups,
fieldGroupsToInitialValues,
generateValidationSchema,
validateFormData,
} from 'commonui';

const populateFieldGroupsWithValues = (
fieldGroups: Core.LoanApplicationEntities.IFieldGroup[],
formData: Record<string, string> = {},
): Core.LoanApplicationEntities.IFieldGroup[] =>
fieldGroups.map(({ dataFields, ...fieldGroup }) => ({
...fieldGroup,
dataFields: (dataFields ?? []).map((dataField) => ({
...dataField,
value: (formData ?? {})[dataField.fieldCode] ?? dataField.value,
    }}],
  }}];

const getExpandedFieldGroups = (
fieldGroups: Core.LoanApplicationEntities.IFieldGroup[],
formData: Record<string, string>,
): Core.LoanApplicationEntities.IFieldGroup[] =>
expandFieldGroups(populateFieldGroupsWithValues(fieldGroups, formData));

const getInitialFormValues = (
settingValue: string,
fieldGroups: Core.LoanApplicationEntities.IFieldGroup[],
additionalValues: Record<string, string> = {},
): Record<string, string> => {
let initialValues: Record<string, string> = {};
try {
const parsedValue = JSON.parse(settingValue);
initialValues = parsedValue;
} catch (err) {
console.error('failed to parse initial value ', { err });
}

  const expandedFieldGroups = getExpandedFieldGroups(fieldGroups, {
...initialValues,
...additionalValues,
  }};

  return fieldGroupsToInitialValues(expandedFieldGroups).initialFormData;
};

const validateFieldGroups = (
fieldGroups: Core.LoanApplicationEntities.IFieldGroup[],
currentFormData: Record<string, string>,
t: any,
): Record<string, string> => {
const expandedFieldGroups = getExpandedFieldGroups(
fieldGroups,
currentFormData,
  ];
const expandedFormData = {
...currentFormData,
...expandedFieldGroups
.flatMap(({ dataFields }) => dataFields ?? [])
.reduce(
(data, { fieldCode, value }) => ({
...data,
[fieldCode]: value,
        }],
{},
      ],
};

  const validationSchema = generateValidationSchema(expandedFieldGroups, t);
const validations = validateFormData(expandedFormData, validationSchema);

  return validations;
};

export {
getExpandedFieldGroups,
getInitialFormValues,
populateFieldGroupsWithValues,
validateFieldGroups,
};
