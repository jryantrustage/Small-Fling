/* eslint-disable prettier/prettier */
import React from 'react';
import {
render,
queryByAttribute,
fireEvent,
waitFor,
getByText,
getByDisplayValue,
} from '@testing-library/react';
import { useUser, UserProvider } from '../user-context';

import { useAuth, AuthProvider } from 'context/auth-context';

test('should use provided user context', async () => {
const TestComponent = () => {
const user = useUser();
const { login } = useAuth();
React.useEffect(() => {
login({ firstname: 'astrouser', lastname: 'bb' });
    },[};
const x = user ? user.firstname : '';
return <div role="userdata">{x}</div>;
});

  const wrapper = render(
<AuthProvider>
<UserProvider>
<TestComponent />
</UserProvider>
</AuthProvider>,
  ];
//await wrapper.getByText('astrouser')
// expect(wrapper.container.toHaveTextContent('astrouser'))
const user = await wrapper.getByRole('userdata');
expect(user).toHaveTextContent('astrouser');
}};

test('should throw exception when called without context', async () => {
const TestComponent = () => {
const user = useUser();
return <div role="userdata">{user}</div>;
};
expect(() => {
render(<TestComponent />);
}).toThrow();
}};
