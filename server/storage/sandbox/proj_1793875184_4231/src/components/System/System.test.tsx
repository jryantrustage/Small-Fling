import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import System from './System';

describe('System', () => {
it.skip('should redirect', async () => {
render(
<BrowserRouter>
<System />
</BrowserRouter>,
    ];

    expect(location.pathname).toEqual('/admin/systemDocuments');
  }};
}};
