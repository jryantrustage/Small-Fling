import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks/dom';
import { wrapWithMockTenant } from 'components/__mock__/mock-context';
import { uniqueId } from 'lodash';
import * as api from 'utils/api-client';
import { AssetType, Expiration, ResourceType } from '../types';
import { useAssetTypes } from '../useAssetTypes';

describe('useAssetTypes', () => {
const client2Mock = jest.spyOn(api, 'client2');
const tenantId = uniqueId();
const mockResourceTypes: ResourceType[] = [];
const mockExpirations: Expiration[] = [];
const mockAssetTypes: AssetType[] = [];

  mockResourceTypes.push({
resourceTypeid: 1,
name: 'Resource Type 1',
  }};
mockResourceTypes.push({
resourceTypeid: 2,
name: 'Resource Type 2',
  }};

  mockExpirations.push({
id: 1,
name: 'Resource Expiration 1',
  }};
mockExpirations.push({
id: 2,
name: 'Resource Expiration 2',
  }};

  mockAssetTypes.push({
id: uniqueId(),
productType: 'Account',
tenantId,
title: 'Asset Title 1',
isSingleUse: true,
expirationValueInvalid: false,
expirationValueRequired: false,
expirationIdRequired: false,
resourceTypeId: 1,
assetCategoryId: '1',
assetCategory: '1',
assetCategoryDescription: 'Description 1',
assetCategoryProductSubTypes: [],
  }};

  mockAssetTypes.push({
id: uniqueId(),
productType: 'Account',
tenantId,
title: 'Asset Title 2',
isSingleUse: true,
expirationValueInvalid: false,
expirationValueRequired: false,
expirationIdRequired: false,
resourceTypeId: 2,
assetCategoryId: '2',
assetCategory: '2',
assetCategoryDescription: 'Description 2',
assetCategoryProductSubTypes: [],
  }};

  const wrapper = wrapWithMockTenant({ id: tenantId });

  it('should fetch data from API', async () => {
client2Mock.mockResolvedValueOnce({ payload: mockResourceTypes });
client2Mock.mockResolvedValueOnce({ payload: mockExpirations });
client2Mock.mockResolvedValueOnce({ payload: mockAssetTypes });

    const { result } = renderHook(() => useAssetTypes(), {
wrapper,
    }};

    await waitFor(() => expect(result.current.loading).toEqual(false));

    const { resourceTypes, expirations, assetCategories } = result.current;

    expect(resourceTypes.length).toEqual(mockResourceTypes.length);
expect(expirations.length).toEqual(mockExpirations.length);
expect(assetCategories.length).toEqual(mockAssetTypes.length);
  }};
}};
