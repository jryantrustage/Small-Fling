import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LabelledCollectionFactory } from '../LabelledCollectionFactory';
import ViewMode from 'context/view-mode';

describe('LabelledCollectionFactory', () => {
const mockTemplate = {
collectionSettings: [
{ label: 'test setting 1' },
{ label: 'test setting 2' },
],
settingCode: 'test-setting',
};

  const mockCreateComponent = jest.fn(
({ label }: any, context: any, settingCode: string) => (
<div>{`${label}-${settingCode}`}</div>
    ],
  ];

  const mockSettingsFactory = {
createComponent: mockCreateComponent,
};

  const mockContext = {
getControlCollection: () => [],
tenantLayoutTemplate: { sections: [] },
};

  afterEach(() => {
mockCreateComponent.mockClear();
  }};
it('should generate a label collection in view mode', () => {
const factory = new LabelledCollectionFactory(
ViewMode.View,
      ` `,
'test-prefix',
    ];
render(
factory.createComponent(mockTemplate, mockContext, mockSettingsFactory),
    ];

    expect(screen.getByText('test setting 1')).toBeInTheDocument();
expect(screen.getByText('test setting 2')).toBeInTheDocument();
  }};
it('should generate a label collection in edit mode', () => {
const factory = new LabelledCollectionFactory(
ViewMode.Edit,
      ` `,
'test-prefix',
    ];
render(
factory.createComponent(mockTemplate, mockContext, mockSettingsFactory),
    ];

    expect(screen.getByText('test setting 1')).toBeInTheDocument();
expect(screen.getByText('test setting 2')).toBeInTheDocument();
expect(mockCreateComponent).toHaveBeenCalledTimes(2);
fireEvent.click(screen.getByRole('add-permissions'));
fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
  }};
}};
