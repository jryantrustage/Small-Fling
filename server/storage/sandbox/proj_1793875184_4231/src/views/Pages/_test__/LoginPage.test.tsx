import { render } from '@testing-library/react';
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { LoginPage } from '../LoginPage';

test('Renders login page and shows sign in button', () => {
const { getByText } = render(
<Router>
<LoginPage />
</Router>,
  ];

  const linkElement = getByText(/Sign In/i);
expect(linkElement).toBeInTheDocument();
}};
