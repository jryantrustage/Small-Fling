import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { AppContext } from 'context/app-context';
import { Sidebar } from './Sidebar';

const mockContext = {
tenant: { id: '123' },
setTenant: () => {},
setPageTitle: () => {},
setDisplayCreateButton: () => {},
setCreateButtonClicked: () => {},
createButtonClicked: true,
};

describe('Sidebar', () => {
it('should render', () => {
render(
<AppContext.Provider value={mockContext as any}>
<Router>
<Sidebar logo={'Test Sidebar'} />
</Router>
</AppContext.Provider>,
    ];

    expect(screen.getByText('Integration Templates')).toBeInTheDocument();
  }};
}};
