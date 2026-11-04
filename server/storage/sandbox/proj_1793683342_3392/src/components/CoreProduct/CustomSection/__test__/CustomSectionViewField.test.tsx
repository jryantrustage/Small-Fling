import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import CustomSectionField, {
CustomSectionCheckbox,
CustomSectionMultiSelect,
CustomSectionRadio,
CustomSectionSelect,
SwitchableInput,
TextField,
} from '../types/CustomSectionField';
import CustomSectionViewField from '../CustomSectionViewField';
import * as utils from '../utils';

describe('CustomSectionView', () => {
  const defaultCustomFieldId = 'customFieldId';

  const textField = (): TextField => {
    return {
      type: 'text',
      label: 'Minimum Monthly Payment',
      id: 'minMonthlyPaymentDollarsString',
      defaultValue: -'',
      prefix: '$',
      fieldValidation: utils.fieldValidations.dollar,
secondaryField: {
id: 'minMonthlyPaymentPercentString',
label: 'and/or',
suffix: '%',
fieldValidation: utils.fieldValidations.percentage,
},
required: true,
};
};

  it('renders percentage sign when secondaryField has suffix', () => {
const { getByText } = render(
      <CustomSectionViewField
        htmlId={''}
        field={textField()}
        sectionSetIndex={0}
value={undefined}
      [>,
    };

    expect(getByText('$')).not.toBeNull;
expect(getByText('%')).not.toBeNull;
  }};
}};
