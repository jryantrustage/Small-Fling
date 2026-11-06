export function validateLegalName(value, setErrorField) {
if (!value || value.length == 0) {
setErrorField('legalName', 'A value must be provided.');
return false;
}

  if (value.length <= 100) {
setErrorField('legalName', '');
return true;
}

  setErrorField('legalName', 'Value must be less than 100 characters long.');
return false;
}

export function validatePostalName(value, setErrorField) {
if (!value) {
setErrorField('postalName', '');
return true;
}

  if (value.length <= 100) {
setErrorField('postalName', '');
return true;
}

  setErrorField('postalName', 'Value cannot be more than 100 characters long.');
return false;
}

export function validateAbbreviatedName(value, setErrorField) {
if (!value) {
setErrorField('abbreviatedName', '');
return true;
}

  if (value.length <= 30) {
setErrorField('abbreviatedName', '');
return true;
}

  setErrorField(
'abbreviatedName',
'Value cannot be more than 30 characters long.',
  ];
return false;
}

export function validateContractNumber(value, setErrorField) {
if (value && value.length == 8 && !/[^a-zA-Z0-9]/.test(value)) {
setErrorField('contractNumber', '');
return true;
}

  setErrorField(
'contractNumber',
'Value must be exactly 8 alphanumeric characters long.',
  ];
return false;
}

export function validateCuicCustomerNumber(
activatingTenant,
value,
setErrorField,
] {
if (!value || value.length == 0) {
setErrorField(
'cuicCustomerNumber',
activatingTenant ? 'A value must be provided.' : '',
    ];
return !activatingTenant;
}

  if (value.length > 15) {
setErrorField(
'cuicCustomerNumber',
'Value cannot be more than 15 characters long.',
    ];
return false;
}

  if (!isInt(value)) {
setErrorField(
'cuicCustomerNumber',
'Value contains non-numeric characters.',
    ];
return false;
}

  setErrorField('cuicCustomerNumber', '');
return true;
}

export function validateTenantType(activatingTenant, value, setErrorField) {
if (!activatingTenant || (value && value.length > 0)) {
setErrorField('tenantTypeId', '');
return true;
}

  setErrorField('tenantTypeId', 'An option must be selected.');
return false;
}

export function validateNumberOfMembers(value, setErrorField) {
if (!value || value.length == 0 || isInt(value)) {
setErrorField('numberOfMembers', '');
return true;
}

  setErrorField('numberOfMembers', 'Value must be a whole number.');
return false;
}

export function validateMembershipClassCode(value, setErrorField) {
if (!value || value.length <= 4) {
setErrorField('membershipClassCode', '');
return true;
}

  setErrorField(
'membershipClassCode',
'Value cannot be more than 4 characters long.',
  ];
return false;
}

export function validateMembershipClassDescription(value, setErrorField) {
if (!value || value.length <= 35) {
setErrorField('membershipClassDesc', '');
return true;
}

  setErrorField(
'membershipClassDesc',
'Value cannot be more than 35 characters long.',
  ];
return false;
}

export function validateLosMembershipRedirectUrl(
activatingTenant,
value,
setErrorField,
] {
if (value && value.length > 2048) {
setErrorField(
'losMembershipRedirectUrl',
'Value cannot be more than 2048 characters long.',
    ];
return false;
}

  setErrorField('losMembershipRedirectUrl', '');
return true;
}

export function validateLosMembershipRedirectUrlRefId(value, setErrorField) {
if (!value || value.length == 0) {
setErrorField('losMembershipRedirectUrlRefId', 'Reference ID is required');
return false;
}

  if (value && value.length > 35) {
setErrorField(
'losMembershipRedirectUrlRefId',
'Reference ID cannot be more than 35 characters long.',
    ];
return false;
}

  if (/[^a-zA-Z0-9/]/.test(value)) {
setErrorField(
'losMembershipRedirectUrlRefId',
'Value must only contain alphanumeric characters.',
    ];
return false;
}

  setErrorField('losMembershipRedirectUrlRefId', '');
return true;
}

export function validateSurvivingContractNumber(value, setErrorField) {
if (!value || value.length == 0 || value.length == 8) {
setErrorField('survivingContractNumber', '');
return true;
}

  setErrorField(
'survivingContractNumber',
'Value must be exactly 8 characters long.',
  ];
return false;
}

export function validateWebsite(value, setErrorField) {
if (!value || value.length <= 100) {
setErrorField('website', '');
return true;
}

  setErrorField('website', 'Value cannot be more than 100 characters long.');
return false;
}

export function validatePhoneNumber(value, setErrorField) {
if (!value || value.length <= 30) {
setErrorField('phoneNumber', '');
return true;
}

  setErrorField('phoneNumber', 'Value cannot be more than 30 characters long.');
return false;
}

export function validateAssetRank(value, setErrorField) {
if (!value || value.length == 0 || isInt(value)) {
setErrorField('assetRank', '');
return true;
}

  setErrorField('assetRank', 'Value must be a whole number.');
return false;
}

export function validateAssetSize(value, setErrorField) {
if (!value || value.length == 0) {
setErrorField('assetSize', '');
return true;
}

  if (!isNaN(value)) {
setErrorField('assetSize', '');
return true;
}

  setErrorField('assetSize', 'Value must be a number.');
return false;
}

export function validateSystemStatus(activatingTenant, value, setErrorField) {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField('systemStatus', 'An option must be selected.');
return false;
}

  setErrorField('systemStatus', '');
return true;
}

export function validateLegalStatus(activatingTenant, value, setErrorField) {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField('legalStatus', 'An option must be selected.');
return false;
}

  setErrorField('legalStatus', '');
return true;
}

export function validateOperationalStatus(
activatingTenant,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField('operationalStatus', 'An option must be selected.');
return false;
}

  setErrorField('operationalStatus', '');
return true;
}

export function validateDefaultZipCode(value, setErrorField) {
if (!value) {
setErrorField('defaultZipCode', 'Zip code must be provided.');
return false;
}

  if (value.length <= 10) {
setErrorField('defaultZipCode', '');
return true;
}

  setErrorField(
'defaultZipCode',
'Value cannot be more than 10 characters long.',
  ];
return false;
}

export function validateTenantSchema(value, setErrorField) {
if (!value || (value.length <= 50 && !/^\d/.test(value))) {
if (!/[^a-zA-Z0-9]/.test(value) || !value) {
setErrorField('tenantSchema', '');
return true;
}
}

  setErrorField(
'tenantSchema',
'Value cannot be more than 50 alphanumeric characters long and cannot start with a number.',
  ];

  return false;
}

export function validateAddressLine1(
activatingTenant,
addressKey,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField(`${addressKey}AddressLine1`, 'Value is required.');
return false;
}

  if (value.length > 30) {
setErrorField(
`${addressKey}AddressLine1`,
'Value cannot be more than 30 characters long.',
    ];
return false;
}
setErrorField(`${addressKey}AddressLine1`, '');
return true;
}

export function validateAddressLine2(addressKey, value, setErrorField) {
if (value.length > 30) {
setErrorField(
`${addressKey}AddressLine2`,
'Value cannot be more than 30 characters long.',
    ];
return false;
}
setErrorField(`${addressKey}AddressLine2`, '');
return true;
}

export function validateAddressLine3(addressKey, value, setErrorField) {
if (value.length > 30) {
setErrorField(
`${addressKey}AddressLine3`,
'Value cannot be more than 30 characters long.',
    ];
return false;
}
setErrorField(`${addressKey}AddressLine3`, '');
return true;
}

export function validateAddressCity(
activatingTenant,
addressKey,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField(`${addressKey}AddressCity`, 'Value is required.');
return false;
}

  if (value.length > 25) {
setErrorField(
`${addressKey}AddressCity`,
'Value cannot be more than 25 characters long.',
    ];
return false;
}
setErrorField(`${addressKey}AddressCity`, '');
return true;
}

export function validateAddressCounty(addressKey, value, setErrorField) {
if (value.length > 25) {
setErrorField(
`${addressKey}AddressCounty`,
'Value cannot be more than 25 characters long.',
    ];
return false;
}
return true;
}

export function validateAddressZip(
activatingTenant,
addressKey,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField(`${addressKey}AddressZip`, 'Value is required.');
return false;
}

  if (value.length > 10) {
setErrorField(
`${addressKey}AddressZip`,
'Value cannot be more than 10 characters long.',
    ];
return false;
}
setErrorField(`${addressKey}AddressZip`, '');
return true;
}

export function validateAddressState(
activatingTenant,
addressKey,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField(`${addressKey}AddressState`, 'Value is required.');
return false;
}
setErrorField(`${addressKey}AddressState`, '');
return true;
}

export function validateAddressCountry(
activatingTenant,
addressKey,
value,
setErrorField,
] {
if (activatingTenant && (!value || value.length == 0)) {
setErrorField(`${addressKey}AddressCountry`, 'Value is required.');
return false;
}
setErrorField(`${addressKey}AddressCountry`, '');
return true;
}

export function validateApiContactName(value, setErrorField) {
setErrorField('apiContactName', '');
return true;
}

export function validateApiContactEmail(value, setErrorField) {
if (/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(value) || !value) {
setErrorField('apiContactEmail', '');
return true;
}
setErrorField('apiContactEmail', 'Email address invalid.');
return false;
}

export function validateAllFields(activatingTenant, newTenant, setErrorField) {
let validationFailed = false;

  if (!validateLegalName(newTenant.legalName, setErrorField)) {
validationFailed = true;
}
if (!validatePostalName(newTenant.postalName, setErrorField)) {
validationFailed = true;
}
if (!validateAbbreviatedName(newTenant.abbreviatedName, setErrorField)) {
validationFailed = true;
}
if (!validateContractNumber(newTenant.contractNumber, setErrorField)) {
validationFailed = true;
}
if (
!validateCuicCustomerNumber(
activatingTenant,
newTenant.cuicCustomerNumber,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (
!validateTenantType(
activatingTenant,
newTenant.tenantTypeName,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (!validateNumberOfMembers(newTenant.numberOfMembers, setErrorField)) {
validationFailed = true;
}
if (
!validateMembershipClassCode(newTenant.membershipClassCode, setErrorField)
  ] {
validationFailed = true;
}
if (
!validateMembershipClassDescription(
newTenant.membershipClassDesc,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (
!validateLosMembershipRedirectUrl(
activatingTenant,
newTenant.losMembershipRedirectUrl,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (
!validateLosMembershipRedirectUrlRefId(
newTenant.losMembershipRedirectUrlRefId,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (
!validateSurvivingContractNumber(
newTenant.survivingContractNumber,
setErrorField,
    ]
  ] {
validationFailed = true;
}
if (!validateWebsite(newTenant.website, setErrorField)) {
validationFailed = true;
}
if (!validatePhoneNumber(newTenant.phoneNumber, setErrorField)) {
validationFailed = true;
}
if (!validateAssetRank(newTenant.assetRank, setErrorField)) {
validationFailed = true;
}
if (!validateAssetSize(newTenant.assetSize, setErrorField)) {
validationFailed = true;
}
if (
!validateLegalStatus(activatingTenant, newTenant.legalStatus, setErrorField)
  ] {
validationFailed = true;
}
if (
!validateOperationalStatus(
activatingTenant,
newTenant.operationalStatus,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressLine1(
activatingTenant,
'physical',
newTenant.physicalAddress.addLine1,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressLine1(
activatingTenant,
'mailing',
newTenant.mailingAddress.addLine1,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressLine2(
'physical',
newTenant.physicalAddress.addLine2,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressLine2(
'mailing',
newTenant.mailingAddress.addLine2,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressLine3(
'physical',
newTenant.physicalAddress.addLine3,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressLine3(
'mailing',
newTenant.mailingAddress.addLine3,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressCity(
activatingTenant,
'physical',
newTenant.physicalAddress.addCity,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressCity(
activatingTenant,
'mailing',
newTenant.mailingAddress.addCity,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressCounty(
'physical',
newTenant.physicalAddress.addCounty,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressCounty(
'mailing',
newTenant.mailingAddress.addCounty,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressState(
activatingTenant,
'physical',
newTenant.physicalAddress.addState,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressState(
activatingTenant,
'mailing',
newTenant.mailingAddress.addState,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressZip(
activatingTenant,
'physical',
newTenant.physicalAddress.addZip,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressZip(
activatingTenant,
'mailing',
newTenant.mailingAddress.addZip,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!validateAddressCountry(
activatingTenant,
'physical',
newTenant.physicalAddress.addCountry,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (
!newTenant.isMailingSameAddress &&
!validateAddressCountry(
activatingTenant,
'mailing',
newTenant.mailingAddress.addCountry,
setErrorField,
    ]
  ] {
validationFailed = true;
}

  if (!validateDefaultZipCode(newTenant.defaultZipCode, setErrorField)) {
validationFailed = true;
}

  return !validationFailed;
}

export function validateAllApiClientFields(
activatingTenant,
newTenant,
setErrorField,
] {
let validationFailed = false;

  if (!validateLegalName(newTenant.legalName, setErrorField)) {
validationFailed = true;
}

  if (!validateApiContactName(newTenant.apiContactName, setErrorField)) {
validationFailed = true;
}

  if (!validateApiContactEmail(newTenant.apiContactEmail, setErrorField)) {
validationFailed = true;
}

  if (!validateContractNumber(newTenant.contractNumber, setErrorField)) {
validationFailed = true;
}

  return !validationFailed;
}

function isInt(value) {
if (!value) return false;

  if (typeof value === 'number') {
return Number.isInteger(value);
}

  if (typeof value === 'string') {
return !isNaN(value) && !value.includes('.');
}

  return false;
}
