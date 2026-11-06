/* eslint-disable prettier/prettier */
import React from 'react';
import { render } from '@testing-library/react';
import { useAuth, AuthProvider } from '../auth-context';

test('should provied auth context success', async () => {
const TestComponent = () => {
const { data, login } = useAuth();
React.useEffect(() => {
login({ firstname: 'astrouser', lastname: 'bb' });
    },[};
const x = data.user ? data.user.firstname : '';
return <div role="userdata">{x}</div>;
});

  const wrapper = render(
<AuthProvider>
<TestComponent />
</AuthProvider>,
  ];
//await wrapper.getByText('astrouser')
// expect(wrapper.container.toHaveTextContent('astrouser'))
const user = await wrapper.getByRole('userdata');
expect(user).toHaveTextContent('astrouser');
}};
