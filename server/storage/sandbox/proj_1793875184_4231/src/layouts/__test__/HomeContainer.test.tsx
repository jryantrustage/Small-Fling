import React from 'react';
import { AppContext } from 'context/app-context';
import { render } from '@testing-library/react';
import { HomeContainer } from '../HomeContainer';

describe('HomeContainer', () => {
it('should remove tenant from context', () => {
const setTenant = jest.fn();
render(
<AppContext.Provider value={{ setTenant } as any}>
<HomeContainer>Test</HomeContainer>
</AppContext.Provider>,
    ];

    expect(setTenant).toHaveBeenCalledWith(undefined);
  }};
}};
