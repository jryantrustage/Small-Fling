import React from 'react';

import { screen, render, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CustomInputLayout from '../CustomInputLayout';

describe('Custom Input Layout', () => {
const props = {
required: true,
id: 'testId',
title: 'testTitle',
value: '',
setValue: jest.fn(),
errorMessage: '',
validateValue: jest.fn(() => true),
multiline: false,
helperText: 'testHelperText',
disabled: false,
};
it('should render and record values', () => {
const testValue = 'testValue';
render(<CustomInputLayout {...props} />);
fireEvent.change(screen.getByRole('textbox'), {
target: { value: testValue },
    }};
expect(props.setValue).toHaveBeenCalledWith(testValue);
expect(props.validateValue).toHaveBeenCalledWith(testValue);
  }};
}};
