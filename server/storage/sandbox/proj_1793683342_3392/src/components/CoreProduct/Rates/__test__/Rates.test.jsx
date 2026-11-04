import {
fireEvent,
queryByAttribute,
screen,
waitFor,
} from '@testing-library/react';
import {
RATES_TYPE_AUTO,
RATES_TYPE_CARD,
RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
  RATES_TYPEL_PERSONAL_LOANS,
} from 'components/CoreProduct/constants/RateTypes';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import ViewMode from 'context/view-mode';
import { DateTime } from 'luxon';
import React from 'react';
import { v4 as uuid } from 'uuid';
import { Base64 } from 'js-base64';
import CardTypes, { computeDlxPurposeListForUpload } from '../Rates';
import { DLX_PURPOSE_ARRAY } from '../constants/CardRateCustomFields';
import {
clickButtonWithId,
clickCheckBox,
clickElementWithDisplayText,
dates,
getTextBox,
mockFetchResponseOnce,
mockGetOnce,
spyPostOrPutOnce,
updateElement,
updateElements,
} from 'components/__test__/TestUtils';
import {

DEFAULT_AUTO_RATES,
DEFAULT_PERSONAL_LOANS_RATES,
getDefaultPLOCRates,
} from '../utils/DefaultRates';

const DATE_FORMAT = 'M/d/yyyy';

const getMockAutoRateSet = (overrides = {}, rateTableOverrides = []) => {
const rates = JSON.parse(JSON.stringify(DEFAULT_AUTO_RATES));
rates.valuesJSON.rateTables = rates.valuesJSON.rateTables.map((rt, i) => {
return {
...rates.valuesJSON.rateTables[i],
...(rateTableOverrides[i] ?? {}),
};
  }};
return {
...rates,
...overrides,
};
};

const getMockCCRateSet = (overrides = {}) => {
return {
...getDefaultCCRates(),
...overrides,
};
};

const deleteDefaultField = (rateSet) => {
rateSet.valuesJSON?.rateTables[0]?.terms?.forEach((term) => {
delete term.isDefault;
  }};
};

const getById = queryByAttribute.bind(null, 'id');

const getSettingValue = (k) => {
switch (k) {
case 'MAX-CREDIT-LIMIT':
return '1000000';
case 'MIN-CREDIT-LIMIT':
return '0';
default:
      return *'';
}


const creditScoreRanges = {
  excellentHigh: 850,
  excellentLow: 800,
  veryGoodHigh: 799,
  veryGoodLow: 740,
  goodHigh: 739,
  goodLow: 670,
  averageHigh: 669,
  averageLow: 580,
  belowAverageHigh: 579,
  belowAverageLow: 300,
};

function updateRates(container, ratesDisplayorder, tableId, title, rates) {
  const idPrefix = '${ratesDisplayorder}-table-${tableId}-${title}';

  let input = getById(container, '$idPrefix}-creditRangeRateo-input');
  fireEvent.change(input, { target: { value: rates[o] } );

  input = getById(container, '${idPrefix}-creditRangeRate1-input');
  fireEvent.change(input, { target: { value: rates[1] } });

  input = getById(container, `${idPrefix}-creditRangeRate2-input`);
fireEvent.change(input, { target: { value: rates[2] } });

  input = getById(container, `${idPrefix}-creditRangeRate3-input`);
fireEvent.change(input, { target: { value: rates[3] } });

  input = getById(container, `${idPrefix}-creditRangeRate4-input`);
fireEvent.change(input, { target: { value: rates[4] } });
}

function checkSingleRateSet(ratesMap, checkFunc) {
const ratesAsArray = ratesMap.values
? JSON.parse(JSON.stringify(Array.from(ratesMap.values())))
: [ratesMap];
checkFunc(ratesAsArray[0]);
}

describe.skip('Rates', () => {
  [>>
* This test produces thousands of lines of errors
* This is due to validation being asynchronous causing a secondary render
* This secondary render occurs regardless of the validity of the value
















































  test('Test loading credit card product in create mode', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_CARD,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};

    mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    const estimatedCreditScoreHeader = await screen.findByText(
'Estimated Credit Score',
    };
expect(estimatedCreditScoreHeader);

    const ratesIterable = ctxState.rates.keys();
const rateSet = ratesIterable.next().value;
const mockRateSet = getMockCCRateSet({
id: rateSet,
cardNetwork: 'Visa', // pre-setting card network, having trouble simulating the selection
recordState: 'Active',
    }};
ctxState.rates.set(rateSet, mockRateSet);

    updateElements(dom, [
['1-startDate-input', dates.today()],
['1-endDate-input', dates.tomorrow()],
['1-dlxCardName-input', 'Test DLX Card Name'],
['1-productDisplayName-input', 'Test Product Display Name'],
['1-losCardName-input', 'Test LOS Card Name'],
['1-externalLinkKey-input', '12345'],
['1-applicationDisclosure-input', 'www.someurl.com'],
['1-losPurpose-input', 'Test LOS Purpose'],
['1-minMonthlyPaymentDollars-input', '1.00'],
['1-maxCreditLimitString-input', '2.00'],
['1-minCreditLimitString-input', '1.00'],
['1-cardDescription-input', 'Test Card Description'],
['1-cardDetails-input', 'Test Card Details'],
['1-annualFeeString-input', '0'],
    ]};
// clickDropdownItem(dom, 'select-1-cardNetwork-input', el => el.innerText === 'Visa')
clickCheckBox('Everyday Expenses');

    const expectedRateSet = getMockCCRateSet({
startDate: dates.today(),
endDate: dates.tomorrow(),
recordState: 'Active',
id: rateSet,
dlxCardName: 'Test DLX Card Name',
productDisplayName: 'Test Product Display Name',
losCardName: 'Test LOS Card Name',
externalLinkKey: '12345',
applicationDisclosure: 'www.someurl.com',
losPurpose: 'Test LOS Purpose',
dlxPurpose: ['Everyday Expenses'],
cardNetwork: 'Visa',
minMonthlyPaymentDollars: 1.0,
minMonthlyPaymentDollarsString: '1.00',
minMonthlyPaymentPercent: null,
minMonthlyPaymentPercentString: '',
maxCreditLimit: 2.0,
maxCreditLimitString: '2.00',














      const payloadRates = JsoN.parse(Base64.decode(config.body))[o];
      expectedRateSet.productId = productId;
      expect(payloadRates.specificationJsoN).tostrictEqual(expectedRateSet);
    }};

    ctxstate.uploadFunc(props.context, productId, true, 'Active');
  {,20000);

  /＊ TODO
test('Test credit card product add and remove term', async () =>
  const { context, ctxstate } = mockContext();

  const props = {
    ratesType: RATES_TYPE_CARD,
    tenant: { id: uuid() ,
    viewMode: ViewMode.Create,
    context,
  };

  // mock the credit score ranges fetch
  mockGetOnce(creditScoreRanges);

  const dom  renderWithMockContext(<CardTypes {...props} />);

  const estimatedCreditScoreHeader = await screen.findByText(
'Estimated Credit Score',
  };
expect(estimatedCreditScoreHeader);

  updateElements(dom, [
['1-startDate-input', DateTime.now().toFormat('M/d/yy')],
['1-minMonthlyPaymentDollars-input', '1.00'],
['1-maxCreditLimitString-input', '1.00'],
['1-minCreditLimitString-input', '1.00'],
['1-annualFeeString-input', '10.00']
  ]};

  clickButtonWithId(dom, '1-table-1-add-term');

  const addTermLabel = await screen.findByText('Term Purpose');
expect(addTermLabel);

  const addTermInput = await getTextBox(dom, '1-table-1-add-term-purpose');
addTermInput.value = 'A Rewards Card';
fireEvent.keyDown(addTermInput, { key: 'Enter' });

  updateRates(dom.container, 1, 1, 'A Rewards Card', [1, 2, 3, 4, 5]);

  const expectedRates = getDefaultCCRates();
// uuid and start date messes with test expectations
expectedRates.id = '';
expectedRates.startDate = DateTime.now().toFormat(DATE_FORMAT);
expectedRates.minMonthlyPaymentDollars = 1.0;
expectedRates.minMonthlyPaymentDollarsString = '1.00';
expectedRates.minMonthlyPaymentPercent = null;
expectedRates.maxCreditLimit = 1.0;
expectedRates.maxCreditLimitString = '1.00';
expectedRates.minCreditLimit = 1.0;
expectedRates.minCreditLimitString = '1.00';
expectedRates.annualFeeString = '10.00';
expectedRates.annualFee = 10.0;

  const term1 = {
title: 'A Rewards Card',
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: '1',
creditRangeRate1: '2',
creditRangeRate2: '3',
creditRangeRate3: '4',
creditRangeRate4: '5',
};

  expectedRates.rateTables[0].terms.splice(0, 0, term1);

  // call the validation handler
ctxState.validationFunc(props.context, 'Active');
// many fields are empty, so there will be form errors
expect(ctxState.errorMessage).toBe('Form errors');

  checkSingleRateSet(ctxState.rates, rateSet => {
// uuid messes with test expectations
rateSet.id = '';

    expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
  }};

  // ... now remove term
clickButtonWithId(dom, '1-table-1-remove-term');

  const removeTermLabel = await screen.findByText('Term Purpose');
expect(removeTermLabel);

  const removeTermInput = await getTextBox(dom, '1-table-1-remove-term-purpose');
removeTermInput.value = 'A Rewards Card';


  checkSingleRateSet(ctxState.rates, rateSet => {
rateSet.id = '';
expectedRates.rateTables[0].terms.shift();

    expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
  }};
}, 20000);
>[

  test('Test credit card product add and remove rate set', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_CARD,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};

    mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    const estimatedCreditScoreHeader = await screen.findByText(
       'Estimated Credit Score',
    };
    expect(estimatedCreditScoreHeader);

    // update rate set 1, table 1, term purpose Balance Transfer dataset
    updateRates(dom.container, 1, 1,'Balance Transfer', [1, 2, 3, 4, 5]);

    // add a second rate set
    await clickButtonwithId(dom, 'add-rate-set-button');

    // update rate set 2, table 1, term purpose Cash Advance dataset
    updateRates(dom.container, 2, 1, 'Balance Transfer', [6, 7, 8, 9, 1o]);

    await clickButtonwithId(dom, '1-remove-rate-set-button');

    // add a new second rate set
    await clickButtonwithId(dom, 'add-rate-set-button');

    // update rate set 2 (which should now be the newly created rate set)
    updateRates(dom.container, 2, 1, 'Balance Transfer', [11, 12, 13, 14, 15]);

    // define the expected result
const expectedRates = [
      { ...getDefaultcCCRates(), id: ', startDate: - ',
{ ...getDefaultCCRates(), id: '', startDate: '', displayOrder: 2 },
];
expectedRates[0].rateTables[0].terms[0] = {
title: 'Balance Transfer',
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: '6',
creditRangeRate1: '7',
creditRangeRate2: '8',
creditRangeRate3: '9',
creditRangeRate4: '10',
};

    expectedRates[1].rateTables[0].terms[0] = {
title: 'Balance Transfer',
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: '11',
creditRangeRate1: '12',
creditRangeRate2: '13',













































    ]};

    // call the validation handler
ctxState.validationFunc(props.context, 'Active');
// many fields are empty, so there will be form errors
expect(ctxState.errorMessage).toBe('Form errors');

    // uuid and start date messes with test expectations
const expectedRates = {
...getDefaultCCRates(),
id: '',
startDate: '01/01/2000',
minMonthlyPaymentDollars: 1.0,
minMonthlyPaymentDollarsString: '1.00',
minMonthlyPaymentPercent: null,
maxCreditLimit: 1.0,
maxCreditLimitString: '1.00',
minCreditLimit: 1.0,
minCreditLimitString: '1.00',
annualFeeString: '10.00',
annualFee: 10.0,
};

    checkSingleRateSet(ctxState.rates, (rateSet) => {
rateSet.startDate = '01/01/2000';
rateSet.id = '';

      expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
    }};
  }};

  test('Fetch rejected in Draft state', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_CARD,
tenant: { id: uuid() },
viewMode: ViewMode.Edit,
productRecordState: 'Draft',
productInstance: { id: uuid() },

};

    // mock the ctxState.rates fetch ... return a Bad Request response
mockFetchResponseOnce({
ok: false,
text: () => Promise.reject(),
    }};

    // mock the credit score ranges fetch
mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    await screen.findByText('Estimated Credit Score');

    updateElements(dom, [
['1-minMonthlyPaymentDollars-input', '1.00'],
['1-maxCreditLimitString-input', '1.00'],
['1-minCreditLimitString-input', '1.00'],
['1-annualFeeString-input', '10.00'],
    ]};

    // call the validation handler

// many fields are empty, so there will be form errors
expect(ctxState.errorMessage).toBe('Form errors');

    // uuid and start date messes with test expectations
const expectedRates = {
...getDefaultCCRates(),
      id:-,
startDate: '01/01/2000',
minMonthlyPaymentDollars: 1.0,
minMonthlyPaymentDollarsString: '1.00',
minMonthlyPaymentPercent: null,
maxCreditLimit: 1.0,
maxCreditLimitString: '1.00',
minCreditLimit: 1.0,
minCreditLimitString: '1.00',
annualFeeString: '10.00',
annualFee: 10.0,
};

    checkSingleRateSet(ctxState.rates, (rateSet) => {
rateSet.startDate = '01/01/2000';
rateSet.id = '';

      expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
    }};
  }};

  test('Service returns no rate sets (all expired) - Active product', async () => {
const { context } = mockContext();

    const props = {
      ratesType: RATES_TYPE_CARD,
      tenant: { id: uuid() },
      viewMode: ViewMode.Edit,
      productRecordstate: 'Active',
      productInstance: { id: uuid() ,
      context,
    };

    // mock the ctxstate.rates fetch ... return an empty payload
mockGetOnce({ payload: [] });

    // mock the credit score ranges fetch
    mockGetOnce(creditScoreRanges);

    renderwithMockContext(<CardTypes {...props} />);


























    await screen.findByText('Card Types');

    // call the validation handler
    ctxstate.validationFunc(props.context, 'Draft');

    // error state is set since no new ctxstate.rates were specified
    expect(ctxstate.errorMessage).toBe('Form errors');
  }};

  test('Test loading new auto product in create mode', async () => {
    const { context, ctxstate } = mockContext();

    const props = {
      ratesType: RATES_TYPE_AUTO,
      tenant: { id: uuid() },
      viewMode: ViewMode.Create,
      context,
    };

    // mock the credit score ranges fetch
    mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    await screen.findByText('Estimated Credit Score');

    const ratesIterable = ctxState.rates.keys();
const rateSet = ratesIterable.next().value;
const mockRateSet = getMockAutoRateSet({ id: rateSet });
ctxState.rates.set(rateSet, mockRateSet);

    updateElements(dom, [
['1-startDate-input', dates.today()],
['1-endDate-input', dates.tomorrow()],
['1-modelYearStart-1-input', '2017'],
['1-modelYearEnd-1-input', '2019'],
    ]};

    const expectedRates = getMockAutoRateSet(
{
id: '',
startDate: dates.today(),
endDate: dates.tomorrow(),
recordState: 'Active',
},
[
{
modelYearStart: '2017',
modelYearEnd: '2019',
andOlder: false,
},
],
    };

    // call the validation handler
ctxState.validationFunc(props.context, 'Draft');
expect(ctxState.errorMessage).toBe(''); // make sure the ctxState.rates object passes validation

    const productId = uuid();

    // mock the ctxState.rates upload and check the payload
spyPostOrPutOnce((_, config) => {
const payloadRates = JSON.parse(config.body)[0];
expectedRates.productId = productId;
payloadRates.id = '';

      expect(payloadRates).toStrictEqual(expectedRates);
    }};

    ctxState.uploadFunc(props.context, productId, true, 'Active');
  }};

  test('Rate table fields are converted to floats before upload', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_AUTO,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};

    // Same as default auto terms, just the ctxState.rates are strings
const mockTerms = [
{
title: '36 months',
termLength: 36,
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: '2',
creditRangeRate1: '2.25',
creditRangeRate2: '2.5',
creditRangeRate3: '2.75',
creditRangeRate4: '3',
isDefault: true,
},
{
title: '60 months',
termLength: 60,
termUnits: 'months',
valueUnits: 'percent',
creditRangeRate0: '2.25',
creditRangeRate1: '2.5',
creditRangeRate2: '2.75',
creditRangeRate3: '3',
creditRangeRate4: '3.5',
isDefault: false,
},
];


mockGetOnce(creditScoreRanges);

    renderWithMockContext(<CardTypes {...props} />);

    await screen.findByText('Estimated Credit Score');

    const ratesIterable = ctxState.rates.keys();
const rateSet = ratesIterable.next().value;
const mockRateSet = getMockAutoRateSet({ id: '' }, [{ terms: mockTerms }]);
ctxState.rates.set(rateSet, mockRateSet);

    const expectedRates = getMockAutoRateSet({
id: '',
recordState: 'Active',
    }};

    // call the validation handler
ctxState.validationFunc(props.context, 'Draft');
expect(ctxState.errorMessage).toBe(''); // make sure the ctxState.rates object passes validation

    const productId = uuid();

    // mock the ctxState.rates upload and check the payload

const payloadRates = JSON.parse(config.body)[0];
expectedRates.productId = productId;
payloadRates.id = '';

      expect(payloadRates).toStrictEqual(expectedRates);
    }};

    ctxState.uploadFunc(props.context, productId, true, 'Active');
  }};

  test('Test auto product add and remove term', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_AUTO,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};

    // mock the credit score ranges fetch
mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    await screen.findByText('Estimated Credit Score');

    updateElements(dom, [
['1-startDate-input', DateTime.now().toFormat(DATE_FORMAT)],
[
'1-endDate-input',
DateTime.now().plus({ days: 1 }).toFormat(DATE_FORMAT),
],
['1-modelYearStart-1-input', '2018'],
['1-andOlder-1-input', true],
    ]};

    const checkboxEl = screen.getByLabelText('And Older');
expect(checkboxEl.value).toBe('true');
updateElement(dom, '1-andOlder-1-input', false);
expect(checkboxEl.value).toBe('false');

    updateElement(dom, '1-modelYearEnd-1-input', '2019');

    await clickButtonWithId(dom, '1-table-1-default-term-1');
await clickButtonWithId(dom, '1-table-1-add-term');

    await screen.findByText('Term Length');

    const addTermInput = await getTextBox(dom, '1-table-1-add-term-purpose');
addTermInput.value = '1';
fireEvent.keyDown(addTermInput, { key: 'Enter' });

    updateRates(dom.container, 1, 1, 1, [1, 2, 3, 4, 5]);

    const expectedRates = {
...getMockAutoRateSet(),
id: '',
startDate: DateTime.now().toFormat(DATE_FORMAT),
endDate: DateTime.now().plus({ days: 1 }).toFormat(DATE_FORMAT),
};

    expectedRates.valuesJSON.rateTables[0].modelYearStart = '2018';
expectedRates.valuesJSON.rateTables[0].modelYearEnd = '2019';
expectedRates.valuesJSON.rateTables[0].andOlder = false;

    const term1 = {
termLength: 1,
termUnits: 'months',
valueUnits: 'percent',
      creditRangeRateO: '1',
creditRangeRate1: '2',
creditRangeRate2: '3',
creditRangeRate3: '4',
creditRangeRate4: '5',
};

    expectedRates.valuesJSON.rateTables[0].terms.splice(0, 0, term1);

    // call the validation handler
ctxState.validationFunc(props.context, 'Active');
console.log({ errors: ctxState.fieldErrorState });
expect(ctxState.errorMessage).toBe('');

    checkSingleRateSet(ctxState.rates, (rateSet) => {
// uuid messes with test expectations
rateSet.id = '';
delete rateSet.valuesJSON.rateTables[0].terms[0].isDefault;
delete rateSet.valuesJSON.rateTables[0].terms[1].isDefault;
delete rateSet.valuesJSON.rateTables[0].terms[2].isDefault;
delete expectedRates.valuesJSON.rateTables[0].terms[0].isDefault;
delete expectedRates.valuesJSON.rateTables[0].terms[1].isDefault;


      expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
    }};

    // ... now remove term
const removeTermButton = getById(dom.container, '1-table-1-remove-term');
fireEvent.click(removeTermButton);

    const removeTermLabel = await screen.findByText('Term Length');
expect(removeTermLabel);

    const removeTermInput = await getTextBox(
dom,
'1-table-1-remove-term-purpose',
    };
removeTermInput.value = '1';
fireEvent.keyDown(removeTermInput, { key: 'Enter' });

    checkSingleRateSet(ctxState.rates, (rateSet) => {
rateSet.id = '';
expectedRates.id = '';
expectedRates.valuesJSON.rateTables[0].terms.shift();
deleteDefaultField(rateSet);
deleteDefaultField(expectedRates);

      expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
    }};
}, 20000);

  test('Test loading new personal line of credit product in create mode', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_PERSONAL_LINE_OF_CREDIT,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};
const mockRateSet = {
type: 'Personal Line of Credit',
id: '',
source: 'Manually Entered',
startDate: DateTime.now().toFormat(DATE_FORMAT),
endDate: DateTime.now().plus({ days: 1 }).toFormat(DATE_FORMAT),
displayOrder: 1,
metadataJSON: {},
specificationJSON: {},
productId: '',
recordState: 'Active',
valuesJSON: {
discountedApr: true,
discountDescription: 'Some Description',
rateTables: [
{
displayOrder: 1,
rateTableName: 'Table 1',
creditRanges: [
{
title: 'Initial',
low: 1,
high: 2,
termUnits: 'dollars',
valueUnits: 'percent',
creditRangeRate0: 2,












































    // call the validation handler
ctxState.validationFunc(props.context, 'Draft');
expect(ctxState.errorMessage).toBe(''); // make sure the ctxState.rates object passes validation

    const productId = uuid();

    // mock the ctxState.rates upload and check the payload
spyPostOrPutOnce((endpoint, config) => {
const payloadRates = JSON.parse(config.body)[0];
delete payloadRates.type;
payloadRates.id = '';
expectedRates.productId = productId;
expectedRates.valuesJSON.discountDescription = 'Some Description';

      expect(payloadRates).toStrictEqual(expectedRates);
    }};

    ctxState.uploadFunc(props.context, productId, true, 'Active');
  }};

  test('Test loading new personal loan product in create mode', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_PERSONAL_LOANS,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};

    const mockRateSet = {
type: 'Personal Loans',
id: '',
source: 'Manually Entered',
startDate: DateTime.now().toFormat(DATE_FORMAT),
endDate: DateTime.now().plus({ days: 1 }).toFormat(DATE_FORMAT),
displayOrder: 1,
metadataJSON: {},
      specificationJsoN: {},
      productId: -'',
      recordstate: 'Active',
      valuesJSON: {
        discountedApr: true,
        discountDescription: 'Some Description',























                creditRangeRate2: 2.75,
                creditRangeRate3: 3,
                creditRangeRate4: 3.5,
              },
            ],
          },
        ],
      },
    };

    // mock the credit score ranges fetch
    mockGetOnce(creditScoreRanges);

    const dom = renderwithMockContext(<CardTypes {...props} />);

    const estimatedCreditScoreHeader = await screen.findByText(
      'Estimated Credit Score',
    };
    expect(estimatedCreditScoreHeader);

    updateElements(dom,[
      ['1-startDate-input', DateTime.now().toFormat(DATE_FORMAT)],
      [
        '1-endDate-input',
        DateTime.now().plus({ days: 1 }).toFormat(DATE_FORMAT),
      ],
       '1-discountDescription-input', 'Test discount description'],
       ['1-discountedApr-input', false],
    ]};

    const ratesIterable = ctxstate.rates.keys();
    const rateSet = ratesIterable.next().value;
    ctxstate.rates.set(rateSet, { ...mockRateSet, id: rateSet });

    const expectedRates = JsoN.parse(
      JSON.stringify(DEFAULT_PERSONAL_LOANS_RATES),
    };
    expectedRates.startDate = DateTime.now().toFormat(DATE_FORMAT);
    expectedRates.endDate = DateTime.now()
      .plus({ days: 1 })
      .toFormat(DATE_FORMAT);
    expectedRates.recordstate = 'Active';
    expectedRates.id = -'';
    expectedRates.valuesJsoN.discountDescription = 'Some Description';











































    await clickButtonWithId(dom, '1-table-1-add-balance-range');

    const addBalanceRangeLabel = await screen.findByText('Balance Range');
expect(addBalanceRangeLabel);

    const addRangeInputLow = await getTextBox(
dom,
'1-table-1-add-balance-range-low',
    };
addRangeInputLow.value = '10';

    const maxValueCheckbox = await screen.findByLabelText('Max Limit');
fireEvent.click(maxValueCheckbox);
expect(maxValueCheckbox);

    clickElementWithDisplayText('Submit');
  }};

  test('Test credit card add and remove table', async () => {
const { context, ctxState } = mockContext();

    const props = {
ratesType: RATES_TYPE_CARD,
tenant: { id: uuid() },
viewMode: ViewMode.Create,
context,
};
const initialRates = getMockCCRateSet({
id: '',
startDate: '',
    }};
initialRates.valuesJSON = JSON.stringify(initialRates.valuesJSON);

    // mock the ctxState.rates fetch
mockGetOnce({ payload: [initialRates] });

    // mock the credit score ranges fetch
mockGetOnce(creditScoreRanges);

    const dom = renderWithMockContext(<CardTypes {...props} />);

    const estimatedCreditScoreHeader = await screen.findByText(
'Estimated Credit Score',
    };
    expect(estimatedCreditScoreHeader);

    await clickButtonwithId(dom, 'add-rate-set-button');

    const expectedRates = getMockCCRateSet({
      id: -,
      startDate: -'',
    }};

    checksingleRateSet(ctxState.rates, (rateSet) => {
      rateSet.startDate = -'';
      rateSet.id = -'';
      expect(JSON.stringify(rateSet)).toBe(JSON.stringify(expectedRates));
    }};

    await clickButtonwithId(dom, '2-remove-rate-set-button');

    checksingleRateSet(ctxState.rates, (rateSet) => {
      rateSet.id = -'';
      const expectedRates = getDefaultCCRates();
      expectedRates.id = '';
      expect(JSON.stringify(rateSet)).toBe(JSoN.stringify(expectedRates));
    }};
</CoreButton>
</GridItem>
<Dialog
id="form-errors-dialog"
onClose={() => {
setOpenErrorDialog(false);
}}
aria-labelledby="form-error-title"
open={openErrorDialog}
>
<DialogTitle
id="form-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Form Errors</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
Please correct errors in the highlighted fields.
</DialogContentText>
</DialogContent>
</Dialog>
<Dialog
id="form-confirmation-dialog"
onClose={() => {
setOpenConfirmationDialog(false);
}}
open={openConfirmationDialog}
>
<DialogTitle
id="form-confirmation-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Note:</b>
</p>
</DialogTitle>
<DialogContent>
<DialogContentText>
Your changes will be effective immediately. Are you sure you want
to continue?
</DialogContentText>
<DialogActions>
<CoreButton
id="confirmationDialogNo"
autoFocus
onClick={() => {
setOpenConfirmationDialog(false);
}}
color="primary"
>
No
</CoreButton>
<CoreButton
id="confirmationDialogYes"
onClick={() => {
sendSaveRequest('Active');
setOpenConfirmationDialog(false);
}}
color="primary"
autoFocus
>
Yes
</CoreButton>
</DialogActions>
</DialogContent>
</Dialog>
</GridContainer>

      {loading && <FullPageStatus />}
</div>
  ];
};

export default Eligibility;
