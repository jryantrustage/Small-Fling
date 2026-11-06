import {
RATES_TYPE_AUTO,
RATES_TYPE_CARD,
RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
RATES_TYPE_PERSONAL_LOANS,
} from 'components/CoreProduct/constants/RateTypes';
import { DateTime } from 'luxon';
import validateRates, {
checkFieldsForMissingData,
} from '../rate-types-validator';

const getDefaultAutoRates = (startDate, endDate) => {
return {
type: RATES_TYPE_AUTO,
startDate: startDate,
endDate: endDate,
displayOrder: 1,
valuesJSON: {
rateTables: [
{
modelYearStart: '2018',
modelYearEnd: '2019',
andOlder: false,
displayOrder: 1,
terms: [
{
termLength: 36,
creditRangeRate0: 2,
creditRangeRate1: 2.25,
creditRangeRate2: 2.5,
creditRangeRate3: 2.75,
creditRangeRate4: 3,
isDefault: true,
},
{
termLength: 60,
creditRangeRate0: 2.25,
creditRangeRate1: 2.5,
creditRangeRate2: 2.75,
creditRangeRate3: 3,
creditRangeRate4: 3.5,
},
],
},
],
},
};
};

const daysBefore = (days) =>
DateTime.now().minus({ days }).toFormat('M/d/yyyy');
const daysAfter = (days) => DateTime.now().plus({ days }).toFormat('M/d/yyyy');

const getDefaultCardRates = (startDate, endDate) => {
return {
type: RATES_TYPE_CARD,
startDate,
endDate,
rateTables: [
{
startDate: daysBefore(1),
endDate: daysAfter(1),
terms: [
{
termLength: 36,
creditRangeRate0: 2,
creditRangeRate1: 2.25,
creditRangeRate2: 2.5,
creditRangeRate3: 2.75,
creditRangeRate4: 3,
},
{
termLength: 60,
creditRangeRate0: 2.25,
creditRangeRate1: 2.5,
creditRangeRate2: 2.75,
creditRangeRate3: 3,
creditRangeRate4: 3.5,
},
],
},
],
};
};

const getDefaultPersonalLineOfCreditRates = (startDate, endDate) => {
return {
type: RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
startDate: startDate,
endDate: endDate,
valuesJSON: {
discountedApr: true,
discountDescription: 'Some Description',
rateTables: [
{
displayOrder: 1,
rateTableName: 'Table 1',
creditRanges: [
{
title: '1 to 2',
low: 1.0,
high: 2.99,
termUnits: 'dollars',
valueUnits: 'percent',
creditRangeRate0: 2,
creditRangeRate1: 2.0,
creditRangeRate2: 2.25,
creditRangeRate3: 2.5,
creditRangeRate4: 3.5,
},
{
title: '3 to 4',
low: 3.0,
high: 4.99,
termUnits: 'dollars',
valueUnits: 'percent',
creditRangeRate0: 2,
creditRangeRate1: 2.25,
creditRangeRate2: 2.5,
creditRangeRate3: 2.75,
creditRangeRate4: 3,
},
],
},
],
},
};
};

const getDefaultPersonalLoanRates = (startDate, endDate) => {
return {
type: RATES_TYPE_PERSONAL_LOANS,
startDate: startDate,
endDate: endDate,
valuesJSON: {
discountedApr: true,
discountDescription: 'Some Description',
rateTables: [
{
displayOrder: 1,
rateTableName: 'Table 1',
terms: [
{
title: '3 Months',
termLength: 3,
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: 2,
creditRangeRate1: 2.25,
creditRangeRate2: 2.5,
creditRangeRate3: 2.75,
creditRangeRate4: 5,
},
{
title: '6 Months',
termLength: 6,
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: 2.25,
creditRangeRate1: 2.5,
creditRangeRate2: 2.75,
creditRangeRate3: 3,
creditRangeRate4: 3.5,
},
],
},
],
},
};
};

test('Valid set of two rates', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const sd2 = ed1.plus({ days: 1 });
const ed2 = sd2.plus({ days: 1 });

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultAutoRates(toString(sd2), toString(ed2));

  validateRates([rateSet1, rateSet2], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(0);
  }};
}};

test('Start date < end date', () => {
const sd1 = DateTime.now().plus({ days: 1 });
const ed1 = sd1.minus({ days: 1 });

  const rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet, rateSet], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(2);
expect(
errors.filter((err) =>
err.includes('Start date is later than the end date'),
).length,
).toBe(2);
  }};
}};

test('Draft state requires at least 1 pending or active rate set', () => {
// 1 expired rate set
let sd1 = DateTime.now().minus({ days: 2 });
let ed1 = sd1.plus({ days: 1 });

  let rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(2);
expect(
errors.filter((err) =>
err.includes(
'At least 1 rate set must be currently active or active in the future.',
        },
).length,
).toBe(1);
  }};

  // 1 pending rate set
sd1 = DateTime.now().plus({ days: 2 });
ed1 = sd1.plus({ days: 1 });

  rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(0);
  }};
}};

test('Active state requires at least 1 active rate set', () => {
// 1 expired rate set
let sd1 = DateTime.now().minus({ days: 2 });
let ed1 = sd1.plus({ days: 1 });

  let rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet], 'Auto', 'Active', {}, (errors) => {
expect(errors.length).toBe(2);
expect(
errors.filter((err) =>
err.includes(
'At least 1 rate set must include the current date in its range.',
        },
).length,
).toBe(1);
  }};

  // 1 pending rate set
sd1 = DateTime.now().plus({ days: 2 });
ed1 = sd1.plus({ days: 1 });

  rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet], 'Auto', 'Active', {}, (errors) => {
expect(errors.length).toBe(1);
expect(
errors.filter((err) =>
err.includes(
'At least 1 rate set must include the current date in its range.',
        },
).length,
).toBe(1);
  }};

  // 1 active rate set
sd1 = DateTime.now().minus({ days: 1 });
ed1 = sd1.plus({ days: 3 });

  rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  validateRates([rateSet], 'Auto', 'Active', {}, (errors) => {
expect(errors.length).toBe(0);
  }};
}};

test('Overlap - set #2 start date = set #1 end date', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const sd2 = ed1;
const ed2 = sd2.plus({ days: 1 });

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultAutoRates(toString(sd2), toString(ed2));

  validateRates([rateSet1, rateSet2], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};
}};

test("Overlap - set within the other set's range", () => {
const sd2 = DateTime.now();
const ed2 = sd2.plus({ days: 2 });

  const sd1 = sd2.plus({ days: 1 });
const ed1 = sd1.plus({ days: 1 });

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultAutoRates(toString(sd2), toString(ed2));

  validateRates([rateSet1, rateSet2], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};

  // check if order matters
validateRates([rateSet2, rateSet1], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};
}};

test('Overlap - overlap with start date', () => {
const sd1 = DateTime.now();
const ed1 = sd1.plus({ days: 2 });

  const sd2 = sd1.plus({ days: 1 });
const ed2 = sd2.plus({ days: 10 });

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultAutoRates(toString(sd2), toString(ed2));

  validateRates([rateSet1, rateSet2], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};

  // check if order matters
validateRates([rateSet2, rateSet1], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};
}};

test('Overlap - overlap with end date', () => {
const sd2 = DateTime.now();
const ed2 = sd2.plus({ days: 2 });

  const sd1 = sd2.plus({ days: 1 });
const ed1 = sd1.plus({ days: 10 });

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultAutoRates(toString(sd2), toString(ed2));

  validateRates([rateSet1, rateSet2], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};

  // check if order matters
validateRates([rateSet2, rateSet1], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};
}};

test('Date ranges are identical', () => {
const sd1 = DateTime.now();
const ed1 = sd1;

  const rateSet = getDefaultAutoRates(toString(sd1), toString(ed1));

  // supply the rate set twice to trigger an overlap
validateRates([rateSet, rateSet], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
expect(errors[0].includes('Date ranges overlap')).toBe(true);
  }};
}};

test('Max credit limit less than minimum credit limit and required field(s) highlightedmissing',()=>{
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const sd2 = ed1.plus({ days: 1 });
const ed2 = sd2.plus({ days: 1 });

  const rateSet1 = getDefaultCardRates(toString(sd1), toString(ed1));
const rateSet2 = getDefaultCardRates(toString(sd2), toString(ed2));

  rateSet1.maxCreditLimit = 1;
rateSet1.minCreditLimit = 2;

  validateRates([rateSet1, rateSet2], 'Card', 'Draft', {}, (errors) => {
expect(errors.length).toBe(3);
  }};
}};

test('Results in no errors for credit card products', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultCardRates(toString(sd1), toString(ed1));

  rateSet1.dlxCardName = 'Test DLX Card Name';
rateSet1.productDisplayName = 'Test Product Display Name';
rateSet1.losCardName = 'Test LOS Card Name';
rateSet1.minCreditLimitString = '500.00';
rateSet1.minMonthlyPaymentPercentString = '50.00';
rateSet1.annualFeeString = '10';
rateSet1.cardNetwork = 'Visa';
rateSet1.cardDescription = 'Test card description.';
rateSet1.cardDetails = 'Test card details.';
rateSet1.source = 'Manually Entered';
rateSet1.externalLinkKey = '12345';
rateSet1.applicationDisclosure = 'www.someurl.com';
rateSet1.dlxPurpose = ['Building Credit'];
rateSet1.losPurpose = 'Test LOS Purpose';

  validateRates([rateSet1], 'Card', 'Draft', {}, (errors) => {
expect(errors.length).toBe(0);
  }};
}};

test('Results in required field(s) highlighted missing message if credit card rate table hasmissing term data null',() => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultCardRates(toString(sd1), toString(ed1));

  rateSet1.dlxCardName = 'Test DLX Card Name';
rateSet1.productDisplayName = 'Test Product Display Name';
rateSet1.losCardName = 'Test LOS Card Name';
rateSet1.minCreditLimitString = '500.00';
rateSet1.cardNetwork = 'Visa';
rateSet1.cardDescription = 'Test card description.';
rateSet1.source = 'Manually Entered';
rateSet1.externalLinkKey = '12345';
rateSet1.applicationDisclosure = 'www.someurl.com';
rateSet1.dlxPurpose = ['Building Credit'];
rateSet1.losPurpose = 'Test LOS Purpose';
rateSet1.rateTables[0].terms[0] = {
title: 'Building Credit',
    creditRangeRateo: null,
creditRangeRate1: null,
creditRangeRate2: null,
creditRangeRate3: null,
creditRangeRate4: null,
};

  validateRates([rateSet1], 'Card', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
  }};
}};

test('Results in required field(s) highlighted missing message if credit card rate table has missing term data empty string', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultCardRates(toString(sd1), toString(ed1));

  rateSet1.dlxCardName = 'Test DLX Card Name';
rateSet1.productDisplayName = 'Test Product Display Name';
rateSet1.losCardName = 'Test LOS Card Name';
rateSet1.minCreditLimitString = '500.00';
rateSet1.cardNetwork = 'Visa';
rateSet1.cardDescription = 'Test card description.';
rateSet1.source = 'Manually Entered';
rateSet1.externalLinkKey = '12345';
rateSet1.applicationDisclosure = 'www.someurl.com';
rateSet1.dlxPurpose = ['Building Credit'];
rateSet1.losPurpose = 'Test LOS Purpose';
rateSet1.rateTables[0].terms[0] = {
title: 'Building Credit',
    creditRangeRateo: -'',
creditRangeRate1: '',
creditRangeRate2: '',
creditRangeRate3: '',
creditRangeRate4: '',
};

  validateRates([rateSet1], 'Card', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
  }};
}};

test('Results in no errors for personal line of credit products', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultPersonalLineOfCreditRates(
toString(sd1),
toString(ed1),
  ];

  validateRates(
[rateSet1],
'Personal Line of Credit',
'Draft',
{},
(errors) => {
expect(errors.length).toBe(0);
},
  ];
}};

test('Results in required field(s) highlighted missing message if personal line of credit ratetable has missing term data', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultPersonalLineOfCreditRates(
toString(sd1),
toString(ed1),
  ];

  rateSet1.valuesJSON.rateTables[0].creditRanges[0] = {
title: '1 to 2',
low: 1.0,
high: 2.99,
    creditRangeRateo: null,
creditRangeRate1: null,
creditRangeRate2: null,
creditRangeRate3: null,
creditRangeRate4: null,
};

  validateRates(
[rateSet1],
'Personal Line of Credit',
'Draft',
{},
(errors) => {
expect(errors.length).toBe(1);
},
  ];
}};

test('Results in required field(s) highlighted missing message if personal line of credit hasdiscounted apr checked but no discount description', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultPersonalLineOfCreditRates(
toString(sd1),
toString(ed1),
  ];

  rateSet1.valuesJSON.discountDescription = '';

  validateRates(
[rateSet1],
'Personal Line of Credit',
'Draft',
{},
(errors) => {
expect(errors.length).toBe(1);
},
  ];
}};

test('Results in required field(s) highlighted missing message if personal loan rate table hasmissing term data',() => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultPersonalLoanRates(toString(sd1), toString(ed1));

  rateSet1.valuesJSON.rateTables[0].terms[0] = {
title: '6 Months',
termLength: 6,
termUnits: 'months',
valueUnits: 'percent',
    creditRangeRateo: null,
creditRangeRate1: null,
creditRangeRate2: null,
creditRangeRate3: null,
creditRangeRate4: null,
};

  validateRates([rateSet1], 'Personal Loans', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
  }};
}};

test('Results in required field(s) highlighted missing message if auto loan rate set table hasmissing term data',() => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));

  rateSet1.valuesJSON.rateTables[0].terms[0] = {
termLength: 36,
    creditRangeRateo: null,
creditRangeRate1: null,
creditRangeRate2: null,
creditRangeRate3: null,
creditRangeRate4: null,
isDefault: true,
};

  validateRates([rateSet1], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
  }};
}};

test('Results in required field messages for modelYearStart and modelYearEnd auto loan ratefields',()=>{
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));
rateSet1.modelYearStart = '';
rateSet1.modelYearEnd = '';

  const fieldsWithMissingData = checkFieldsForMissingData('Auto', [rateSet1]);
expect(fieldsWithMissingData['1-modelYearEnd-input'].message).toBe(
'Required',
  ];
expect(fieldsWithMissingData['1-modelYearStart-input'].message).toBe(
'Required',
  ];
}};

test('Results in required field messages for card type table start date', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultCardRates(sd1, ed1);
rateSet1.displayOrder = 1;
rateSet1.rateTables[0].displayOrder = 1;
rateSet1.rateTables[0].startDate = '';

  const fieldsWithMissingData = checkFieldsForMissingData('Card', [rateSet1]);
expect(fieldsWithMissingData['1-rateTableStartDate-1-input'].message).toBe(
'Required',
  ];
}};

function toString(date) {
return date.toFormat('M/d/yyyy');
}

test('Default term length field not set results in error', () => {
const sd1 = DateTime.now();
const ed1 = sd1; // same as start date (should be ok)

  const rateSet1 = getDefaultAutoRates(toString(sd1), toString(ed1));

  rateSet1.valuesJSON.rateTables[0].terms[0] = {
termLength: 36,
creditRangeRate0: 1,
creditRangeRate1: 1,
creditRangeRate2: 1,
creditRangeRate3: 1,
creditRangeRate4: 1,
isDefault: false,
};

  validateRates([rateSet1], 'Auto', 'Draft', {}, (errors) => {
expect(errors.length).toBe(1);
  }};
}};
