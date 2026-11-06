import { isEmptyString } from '../../helpers/validations';
export default class FakeMerchants {
constructor() {
this.localStorageKey = '__fake_merchant__';
this.merchantsxxxx = [
{
recordState: 'Draft',
id: 125,
tenantId: 200,
cuicCustomerNumber: '1834-8475-3923',
merchantTypeId: 1,
merchantTypeCode: 'CU',
legalStatus: 'Merged',
merchantTypeName: 'Credit Union',
operationalStatus: 'Closed for Business',
legalName: 'St.Charles Credit Union',
postalName: 'West Maine CU',
phoneNumber: '630-999-9999',
startDate: '01/10/1980',
endDate: '',
addresses: [
{
addressType: 'Physical',
line1: 'Western Maine CU',
line2: '123 Main St.',
line3: '',
city: 'Bangor',
county: '',
state: 'Maine',
postalCode: '10234',
country: 'USA',
},
],
},
{
recordState: 'Draft',
id: 200,
tenantId: 200,
cuicCustomerNumber: '1834-8475-2000',
merchantTypeId: 1,
merchantTypeCode: 'CU',
legalStatus: 'Merged',
merchantTypeName: 'Credit Union',
legalName: 'Naperville Credit Union',
operationalStatus: 'Open for Business',
postalName: 'Naperville CU',
phoneNumber: '630-999-9999',
startDate: '01/10/1980',
endDate: '',
addresses: [
{
addressType: 'Physical',
line1: '2780 Ogden Avenue',
line2: 'Suite 300',
line3: '',
city: 'Naperville',
county: '',
state: 'Illinois',
postalCode: '60540',
country: 'USA',
},
{
addressType: 'Mailing',
line1: 'Western Maine CU',
line2: '123 Main St.',
line3: 'Suite 300',
city: 'Bangor',
county: '',
state: 'Maine',
postalCode: '10234',
country: 'USA',
},
],
},
];

    const lm = window.localStorage.getItem(this.localStorageKey);
if (!lm) {
window.localStorage.setItem(this.localStorageKey, JSON.stringify([]));
}
}

  getMerchants(tenantId) {
return JSON.parse(window.localStorage.getItem(this.localStorageKey)).filter(
(m) => m.tenantId.toString() === tenantId,
    ];
//return []
}

  findMerchant(id) {
return JSON.parse(window.localStorage.getItem(this.localStorageKey)).filter(
(m) => m.id.toString() === id,
    ];
}

  async saveMerchant(merchant) {
const lm = JSON.parse(window.localStorage.getItem(this.localStorageKey));
if (merchant.id && !(await isEmptyString.isValid(merchant.id))) {
const idx = lm.findIndex((x) => x.id === merchant.id);
if (idx != -1) {
lm.splice(idx, 1);
}
} else {
merchant.id = this.uuid();
}

    lm.push(merchant);
window.localStorage.setItem(this.localStorageKey, JSON.stringify(lm));
return merchant.id;
}

  uuid() {
return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
/[xy]/g,
function (c) {
const r = (Math.random() * 16) | 0,
v = c === 'x' ? r : (r & 0x3) | 0x8;
return v.toString(16);
},
    ];
}
}
