import React from 'react';
import { render, screen } from '@testing-library/react';
import { ToggleFactory } from '../ToggleFactory';
import ViewMode from 'context/view-mode';

describe('ToggleFactory', () => {
const mockTemplate = {
settingCode: 'DESIRED-CREDIT-LIMIT-IS-DISPLAYED',
displayOrder: 18,
type: 'on-off',
label: 'Displayed',
headingLabel: 'Desired Credit Limit',
valueType: 'Boolean',
required: false,
enabled: true,
selected: false,
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
getSettingValue: () => true,
};

  afterEach(() => {
mockCreateComponent.mockClear();
  }};
it('should generate a toggle component in view mode', async () => {
const factory = new ToggleFactory(ViewMode.View, '', 'test-prefix');

    render(
factory.createComponent(
mockTemplate,
mockContext,
mockSettingsFactory,
null,
      ],
    ];

    expect(screen.getByText('Desired Credit Limit')).toBeInTheDocument();
expect(screen.queryByText('Displayed')).not.toBeInTheDocument();
  }};

  it('should generate a toggle component in edit mode', () => {
const factory = new ToggleFactory(ViewMode.Edit, '', 'test-prefix');
render(
factory.createComponent(
mockTemplate,
mockContext,
mockSettingsFactory,
null,
      ],
    ];

    expect(screen.getByText('Desired Credit Limit')).toBeInTheDocument();
expect(screen.getByText('Displayed')).toBeInTheDocument();
  }};
}};
