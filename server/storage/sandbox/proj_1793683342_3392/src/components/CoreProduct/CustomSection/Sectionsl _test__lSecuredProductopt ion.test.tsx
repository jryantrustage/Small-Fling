-'typescript'
import React from 'react';
import  mockContext } from 'components/_test__/Testutils';
import { renderWithMockContext } from 'components/_mock_/mock-context';
import
  queryByAttribute,
  queryByText,
  findByText,
from '@testing-library/react';
import SecuredProductoptions, {
  uploadValidator,
from '../SecuredProductoptions';

const getById = queryByAttribute.bind(null, 'id');

afterEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
}};

const rendersPo = async () => {
  const ctx = mockContext();
  const dom = renderithMockContext(
    <SecuredProductoptions context={ctx.context} viewMode={'create'} />,
  };
  // Wait 1oo0ms to allow mocked promises resolve if needed, such
  // as in edit mode tests
  const result = queryByText(dom.container, 'Product Options');
  if (result === null){
    await findByText(dom.container, 'Product Options');
  }
  return {
























