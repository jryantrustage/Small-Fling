export const allFieldsValid = (data, setErrorField) => {
const validationResults = [
validateName(data.name, setErrorField),
validateRequired('roleName', data.name, setErrorField),
validateDescription(data.description, setErrorField),
validateRequired('roleDescription', data.description, setErrorField),
validateCategory(data.categoryId, setErrorField),
];
return validationResults.every((x) => x);
};

function validateLength(errorFieldName, length, value, setErrorField) {
if ((value || '').length <= length) {
setErrorField(errorFieldName, '');
return true;
}

  setErrorField(
errorFieldName,
`Value must be less than ${length} characters long.`,
  ];
return false;
}

export function validateRequired(errorFieldName, value, setErrorField) {
if (!value || value.length == 0) {
setErrorField(errorFieldName, 'A value must be provided.');
return false;
}

  setErrorField(errorFieldName, '');
return true;
}

export const fieldMaxLength = {
name: 250,
description: 500,
creditRange: 3,
};

export const validateName = (value, setErrorField) =>
validateLength('roleName', fieldMaxLength.name, value, setErrorField);
export const validateDescription = (value, setErrorField) =>
validateLength(
'roleDescription',
fieldMaxLength.description,
value,
setErrorField,
  ];
export const validateCategory = (value, setErrorField) =>
validateRequired('roleCategoryId', value, setErrorField);
