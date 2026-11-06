import React from 'react';
import { fireEvent, screen, render } from '@testing-library/react';

import { TextBox } from './TextBox';

describe('TextBox', () => {
const defaultProps = {
required: true,
label: 'test',
elementId: 'testId',
inputProps: {
value: '',
onChange: jest.fn(),
},
helperText: 'help text',
errorState: false,
};
it('should render', () => {
render(<TextBox {...defaultProps} />);
fireEvent.change(screen.getByRole('textbox'), {
target: { value: 'test' },
    }};
expect(defaultProps.inputProps.onChange).toHaveBeenCalled();
  }};
it('should render disabed', () => {
const props = {
...defaultProps,
inputProps: {
...defaultProps.inputProps,
disabled: true,
},
};
render(<TextBox {...props} />);
expect(screen.getByRole('textbox')).toBeDisabled();
  }};
}};
