path="C:\DevCode\AstrouI\srclcomponents\CoreProduct\CustomSection\__test__ICustomSection.test.tsx"
import React from 'react';
o3 import * as testutils from 'components/__test__/Testutils';
import * as utils from '../utils';
import { mockContext } from 'components/__test__/Testutils';
import { renderWithMockContext } from 'components/_mock_/mock-context';
import CustomSection, { CustomSectionProps } from '../CustomSection';
import {
  screen,
  act,
  queryByAttribute,
  queryByText,
  findByText,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import CustomSectionField, {
  CustomSectionCheckbox,
  CustomSectionMultiSelect,
  CustomSectionRadio,
  CustomSectionSelect,
  CustomSectionSwitch,
  SwitchableInput,
  TextField,
} from '../types/CustomSectionField';


const getById = queryByAttribute.bind(null, 'id');

describe('CustomSection', () => {
const TEST_SET_TYPE = 'Test Type';
const TEST_SECTION_NAME = 'Test Section';
const TEST_SECTION_SET_NAME = 'Test Section Set';

  afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  const renderCustomSection = async (
fields: CustomSectionField[],
props?: Partial<CustomSectionProps>,
) => {
const ctx = mockContext();
const dom = renderWithMockContext(
<CustomSection
sectionSetType={TEST_SET_TYPE}
sectionName={props?.sectionName ?? TEST_SECTION_NAME}
context={ctx.context}
viewMode={props?.viewMode ?? 'create'}
sectionSetFields={fields}
>
<CustomSectionSetManager
maxSetNumber={4}
sectionSetName={TEST_SECTION_SET_NAME}
        [>
</CustomSection>,
    };
// Wait 1000ms to allow mocked promises resolve if needed, such
// as in edit mode tests
const result = queryByText(dom.container, TEST_SECTION_NAME);
if (result === null) {
await findByText(dom.container, TEST_SECTION_NAME);
}
return {
dom,
...ctx,
};
};

  const textField = (id: string, opts: Partial<TextField> = {}): TextField => {
return {
type: 'text',
id,
label: id,
name: id,
defaultValue: '',
required: true,
...opts,
};
};

  const radioField = (
id: string,
opts: Partial<CustomSectionRadio> = {},
): CustomSectionRadio => {
return {
type: 'radio',
id,
label: id,
defaultValue: 'Radio Option 1',
required: true,
options: [
{



























defaultValue: false,
id: `${id}_switch`,
label: `${id}_switch`,
},
...opts,
};
};

  const switchField = (
id: string,
opts: Partial<CustomSectionSwitch> = {},
): CustomSectionSwitch => {
return {
type: 'switch',
id,
label: id,
required: false,
secondaryLabel: `${id}_secondary_label`,
defaultValue: false,
...opts,
};
};

  const checkbox = (
    id: string.
    opts: Partial<CustomSectionCheckbox> = {},
  ): CustomSectionCheckbox => {
    return {
      type: 'checkbox',
      id,
      label: id,
      defaultValue: false,
      required: false,
        .opts.
    };
  };

  const selectField = (
    id: string,.
    opts: Partial<CustomSectionSelect> = {},
  ): CustomSectionSelect => {
    return {
      type: 'select',






















required: true,
customFieldId: defaultCustomFieldId,
...opts,
};
};

  const checkTextIsOnPage = (toCheck: string[]) => {
toCheck.forEach((x) => {
// Check that there is at least one element with this text
screen.getAllByText(x);
    }};
};

  const _assertCheckbox = (
checked: boolean,
text: string,
displayIndex?: number,
): void => {
let cb;
if (displayIndex !== undefined) {
displayIndex = displayIndex - 1;
const r = screen.getAllByLabelText(text) as HTMLInputElement[];
if (!r[displayIndex]) {
        fail('Could not find checkbox ${displayIndex} with text ${text}');
      }
      cb = r[displayIndex];
    } else {
      cb = screen.getByLabelText(text) as HTMLInputElement;
    }
    if(checked){
      expect(cb).toBeChecked();
    } else {
      expect(cb).not.toBeChecked();
    }
  };

  const assertUnchecked = (text: string, index?: number) =>
    _assertCheckbox(false, text, index);
  const assertChecked = (text: string, index?: number) =>
     _assertCheckbox(true, text, index);
  const stateFromCache = (ctxState: any) => {
    if (!ctxstate) throw new Error('No ctxstate provided');
    if (!ctxState.cache) throw new Error('Could not find cache in ctxstate');l











































    CustomSectionSwitch,
  ] => {
return [
      textField('text1'),
      radioField('radio1'),
      multiSelectField('ms1'),
      switchableField('si1'),
      checkbox('cb1'),
selectField('select1'),
switchField('switch1'),
];
};

  test('Fields are rendered', async () => {
await renderCustomSection(getAllFields());

    // Check text field
checkTextIsOnPage(['text1']);

    // Check radio field
checkTextIsOnPage([
'radio1',
      'Radio Option 1',
      'Radio Option 2',
      'Radio Option 3',
    ]};

    // Check radio field
    checkTextIsOnPage(['ms1', 'MS Option 1', 'MS Option 2' 'MS Option 3'J);

    // Switchable field
checkTextIsOnPage(['si1','si1_switch']);

    //checkbox
checkTextIsOnPage(['cb1']);

    // select
    checkTextIsOnPage(['select1'J);
checkTextIsOnPage(['select1']);
    // Switch field
checkTextIsOnPage(['switch1']);
  }};

  test('Correct Default Values are set', async () => {
const testText1 = 'text default 1';
const tf = textField('text1', {
defaultValue: testText1,
    }};
const radio = radioField('radio1', {
defaultValue: 'Radio Option 2',
    }};
const ms1 = multiSelectField('ms1', {
defaultValue: ['MS Option 1', 'MS Option 3'],
    }};
const si1 = switchableField('si1', {
defaultValue: 'Switch Default Text',
    }};
const switch1 = switchField('switch1', {
defaultValue: false,
    }};
const fields = [tf, radio, ms1, si1, switch1];
const { ctxState, dom } = await renderCustomSection(fields);

    let r = await screen.findAllByRole('textbox');
expect(r[0]).toHaveValue(testText1);

    assertUnchecked('Radio Option 1');
assertChecked('Radio Option 2');
assertUnchecked('Radio Option 3');

    assertChecked('MS Option 1');
assertUnchecked('MS Option 2');
assertChecked('MS Option 3');

    r = (await testUtils.getTextBox(
dom,
utils.htmlId(0, 'si1'),
)) as HTMLInputElement as any;
expect(r).toHaveValue('Switch Default Text');

    r = getCustomSetFromCache(ctxState, 0);
expect(r).toStrictEqual({
customFieldId: '',



























    clickAdd();
    userTypes(dom, testId, '444', 3);

    await waitFor(() =>
      expect(ctxstate.cache).tostrictEqual([
         textField: '111', tables: {} },
         textField: '222', tables: {} },
         textField: '333', tables: {} },
         textField: '444', tables: {} },
      ]},
    };

    // Check add button is not rendered
    expect(
      screen.queryByText('Add ${TEST_SECTION_SET_NAME}'),
    ).not.toBeInTheDocument();

    clickRemove(1);
    expect(ctxstate.cache).tostrictEqual([
      { textField: '222', tables: {} },
      { textField: '333', tables: {} },
      { textField: '444', tables: {} },
    ]};

    clickRemove(2);
    expect(ctxstate.cache).tostrictEqual([
      { textField: '222', tables: {} },
      { textField: '444', tables: {} },
    ]};

    expect(
      screen.queryByText('Add ${TEST_SECTION_SET_NAME}'),
    ).toBeInTheDocument();
  }};

  describe('Custom Section Validations: ', () => {
    const v = utils.fieldValidations;
    const testId = 'testInput1';

    test('date displays error message correctly', async () => {








































      // Required is not initially shown until upload
expect(screen.queryByText('Required')).not.toBeInTheDocument();

      // Simulate an upload and check required is displayed
act(() => {
ctxState.validationFunc(context);
      }};
checkTextIsOnPage(['Required']);

      // Click an option and verify required is hidden
testUtils.userEventClickCheckbox(field.options[0] as string);
assertChecked(field.options[0] as string);
expect(screen.queryByText('Required')).not.toBeInTheDocument();

      // Uncheck the option and simulate another upload,
testUtils.userEventClickCheckbox(field.options[0] as string);
act(() => {
ctxState.validationFunc(context);
      }};
checkTextIsOnPage(['Required']);

      // Enter a custom field value and verify it hides requried msg
await userTypes(dom, field.customFieldId as string, 'Custom1,Custom2');
expect(screen.queryByText('Required')).not.toBeInTheDocument();
    }};
  }};

  describe('Custom section edit mode', () => {
const getMockEditData = () => [
{
text1: 'Test Edit Text 1',
radio1: 'Radio Option 3',
ms1: ['MS Option 1', 'MS Option 3'],
[defaultCustomFieldId]: 'Custom1, Custom2',
},
{
text1: 'Test Edit Text 2',
radio1: 'Radio Option 2',
ms1: ['MS Option 1', 'MS Option 3'],
[defaultCustomFieldId]: 'Custom3, Custom4',
},
];

    test('displays existing fields correctly', async () => {
const mockData = getMockEditData();
testUtils.mockGetOnce({
payload: mockData.map((data) => ({ valuesJSON: data })),
      }};
const fields = getAllFields();
const { dom } = await renderCustomSection(fields, {
viewMode: 'edit',
      }};

      // Set 1
let f = testUtils.getElementById(
dom,
utils.htmlId(0, fields[0].id),
) as HTMLInputElement;
expect(f.value).toBe(mockData[0].text1);

      assertChecked('Radio Option 3', 1);

      assertChecked('MS Option 1', 1);
      alssertUnchecked('Ms Option 2', 1);
assertChecked('MS Option 3', 1);

      f = testUtils.getElementById(
        dom,
        utils.htmlId(O, defaultCustomFieldId),
) as HTMLInputElement;
expect(f.value).toBe(mockData[0][defaultCustomFieldId]);

      // Set 2
f = testUtils.getElementById(
dom,
utils.htmlId(1, fields[0].id),
) as HTMLInputElement;
expect(f.value).toBe(mockData[1].text1);

      assertChecked('Radio Option 2', 2);

      assertChecked('MS Option 1', 2);
assertUnchecked('MS Option 2', 2);
assertChecked('MS Option 3', 2);

      f = testUtils.getElementById(
dom,
utils.htmlId(1, defaultCustomFieldId),
) as HTMLInputElement;
expect(f.value).toBe(mockData[1][defaultCustomFieldId]);
});

    test('tables are correctly handled from service', async () => {
const mockData = getMockEditData() as any[];
mockData[0].tables = {};

      testUtils.mockGetOnce({
payload: mockData.map((data) => ({ valuesJSON: data })),
      }};
const fields = getAllFields();
const { ctxState } = await renderCustomSection(fields, {
viewMode: 'edit',
      }};

      const state = stateFromCache(ctxState);

      expect(typeof state[0]?.tables).toBe('object');

      expect(typeof state[1]?.tables).toBe('object');
    }};
  }};

  describe('Custom section upload', () => {
    test.skip('upload completes successfully', async () => {
      const fields = getAllFields();
      const expected = {
        [fields[o].id]: 'test text',
        [fields[1].id]: fields[1].options[1].value,
        [fields[2].id]: ['MS Option 1', 'MS Option 3'].
        [fields[2].customFieldId as string]: 'Custom1,Custom2',
        [fields[3].id as string]: -'',
        [fields[3].switchField.id as string]: false,
        [fields[4].id]: false,
        [fields[5].id]: 'Select Option 2',
        [fields[6].id]: true,
        tables:[].
      };
      testutils.spyPostorPutonce((_, config) => {
        if (!config?.body) throw new Error('Did not receive body from spy');
        const body = JsoN.parse(config.body as string);
        expect(body[o].valuesJsoN).tostrictEqual(expected);
      }};
      const { dom, context, ctxstate } = await renderCustomSection(fields);

      userTypes(dom, fields[o].id, expected[fields[o].id] as string);

      testUtils.clickRadioButton(fields[1].options[1].value); // click Radio Option 2

      testUtils.userEventClickCheckbox(fields[2].options[o] as string); // Click Ms Option 1
      testUtils.userEventclickCheckbox(fields[2].options[2] as string); // Click Ms Option 3

      // Click twice to enable, then disable, which should clear the main input field
      const inputSwitch = getById(
        dom.container,
        utils.htmlId(O, fields[3].switchField.id),
      };
      if (!inputSwitch) fail('Could not get input switch');
      fireEvent.click(inputSwitch);
      fireEvent.click(inputSwitch);

      const switchField = getById(dom.container, utils.htmlId(0, fields[6].id));
if (!switchField) fail('Could not get switch');
fireEvent.click(switchField);

      userTypes(
dom,
fields[2].customFieldId as string,
expected[fields[2].customFieldId as string] as string,
      };

      act(() => {
ctxState.validationFunc(context);
      }};

      await waitFor(() =>
expect(screen.queryAllByText('Required')).toEqual([]),
      };

      act(() => {
ctxState.uploadFunc(context, true, 'Active');
      }};
    }};
  }};

  describe('Custom section view mode',() => {
const getMockViewData = () =>[
      {
        text1: 'Test Edit Text 1',
        radio1: 'Radio Option 3',
        ms1: ['MS Option 1','MS Option 3'],
        [defaultCustomFieldId]:'Custom1, Custom2',
        si1: 'Switch Default Text from API 1',
        si1_switch: false,
        switch1: false,
      },
      {
        text1: 'Test Edit Text 2',
        radio1: 'Radio Option 2',
        ms1: ['MS Option 1','MS Option 3'].
        [defaultCustomFieldId]: 'Custom3, Custom4',
        si1: 'Switch Default Text from API 2',
        si1_switch: true,
        switch1: true,
      },
    ];









      }};

      mockData.forEach((data) => {
checkTextIsOnPage([
data.text1,
data.radio1,
'MS Option 1, MS Option 3',
data[defaultCustomFieldId],
data.si1,
        ]];
      }};
    }};
  }};
}};
