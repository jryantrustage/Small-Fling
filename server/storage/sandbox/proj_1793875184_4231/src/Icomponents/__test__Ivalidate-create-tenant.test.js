import * as validation from 'views/CreateTenant/validate-create-tenant';

const mockSetter = (k, v) => {};
let newTenant;

beforeEach(() => {
newTenant = {
legalName: '',
postalName: '',
abbreviatedName: '',
contractNumber: '',
cuicCustomerNumber: '',
tenantTypeId: '1',
tenantTypeCode: 'CU',
tenantTypeName: 'Credit Union',
numberOfMembers: '',
losMembershipRedirectUrlRefId: 'N/A',
membershipClassCode: '',
membershipClassDescription: '',
survivingContractNumber: '',
website: '',
phoneNumber: '',
assetRank: '',
assetSize: '',
legalStatus: '',
operationalStatus: '',
physicalAddress: {
addLine1: '',
addLine2: '',
addLine3: '',
addCity: '',
addCounty: '',
addState: '',
addZip: '',
addCountry: '',
},
mailingAddress: {
addLine1: '',
addLine2: '',
addLine3: '',
addCity: '',
addCounty: '',
addState: '',
addZip: '',
addCountry: '',
},
defaultZipCode: '11111',
homeBanking: '',
};
}};

test('Validate save draft', () => {
const activatingTenant = false;

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  // do not have a contract number
newTenant.legalName = 'someLegalName';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  // have legal name and valid contract number
newTenant.contractNumber = '12345678';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(true);

  // contract number too long
newTenant.contractNumber = '123456789';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  // field not required for save draft is improperly set (should be numeric)
newTenant.numberOfMembers = 'abc';
newTenant.contractNumber = '12345678';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);
}};

test('Validate save active tenant', () => {
const activatingTenant = true;

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  newTenant = {
...newTenant,
legalName: 'someLegalName',
contractNumber: '12345678',
cuicCustomerNumber: '12345',
tenantTypeId: '1',
charterType: 'State',
legalStatus: '1',
operationalStatus: '1',
isMailingSameAddress: false,
losMembershipRedirectUrl: 'https://member.creditunion.com',
physicalAddress: {
...newTenant.physicalAddress,
addLine1: '123 Some Road',
addCity: 'Some City',
addState: 'WI',
addZip: '12345',
addCountry: 'USA',
},
mailingAddress: {
...newTenant.mailingAddress,
addLine1: '123 Some Road',
addCity: 'Some City',
addState: 'WI',
addZip: '12345',
addCountry: 'USA',
},
homeBanking: 'Q2',
};

  // ... all required fields included

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(true);

  // check if mailing address flag is enforced
newTenant.isMailingSameAddress = true;
newTenant.mailingAddress.addState = '';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(true);

  // user forgot to select a state
newTenant.physicalAddress.addState = '';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  // field not required for save active tenant is improperly set (should be numeric)
newTenant.numberOfMembers = 'abc';
newTenant.physicalAddress.addState = 'WI';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(false);

  // field fixed
newTenant.numberOfMembers = '1';

  expect(
validation.validateAllFields(activatingTenant, newTenant, mockSetter),
).toBe(true);
}};

test('Validate tenant type', () => {
const activatingTenant = false;

  expect(validation.validateTenantType(activatingTenant, '', mockSetter)).toBe(
true,
  ];
expect(validation.validateTenantType(!activatingTenant, '', mockSetter)).toBe(
false,
  ];

  expect(validation.validateTenantType(activatingTenant, '1', mockSetter)).toBe(
true,
  ];
expect(
validation.validateTenantType(!activatingTenant, '1', mockSetter),
).toBe(true);
}};

test('Validate CUIC Customer Number', () => {
const activatingTenant = false;

  expect(
validation.validateCuicCustomerNumber(activatingTenant, '', mockSetter),
).toBe(true);
expect(
validation.validateCuicCustomerNumber(!activatingTenant, '', mockSetter),
).toBe(false);

  expect(
validation.validateCuicCustomerNumber(
activatingTenant,
'12345',
mockSetter,
    ],
).toBe(true);

  // must be a number
expect(
validation.validateCuicCustomerNumber(!activatingTenant, 'abc', mockSetter),
).toBe(false);
expect(
validation.validateCuicCustomerNumber(activatingTenant, 'abc', mockSetter),
).toBe(false);
}};

test('Validate number formatting', () => {
expect(validation.validateAssetRank(null, mockSetter)).toBe(true); // optional

  // must be a whole number
expect(validation.validateAssetRank(1.1, mockSetter)).toBe(false);
expect(validation.validateAssetRank('1.1', mockSetter)).toBe(false);

  // must be numeric
expect(validation.validateAssetSize('abc', mockSetter)).toBe(false);
}};

test('Validate character lengths', () => {
expect(validation.validateSurvivingContractNumber('1234', mockSetter)).toBe(
false,
  ];
expect(
validation.validateSurvivingContractNumber('12345678', mockSetter),
).toBe(true);

  expect(validation.validateMembershipClassCode('12345678', mockSetter)).toBe(
false,
  ];
expect(validation.validateMembershipClassCode('1234', mockSetter)).toBe(true);

  expect(
validation.validateCuicCustomerNumber(true, '1234567890123456', mockSetter),
).toBe(false);
expect(
validation.validateCuicCustomerNumber(true, '123456789012345', mockSetter),
).toBe(true);
}};
