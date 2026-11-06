import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks/dom';
import { wrapWithMockTenant } from 'components/__mock__/mock-context';
import { uniqueId } from 'lodash';
import * as api from 'utils/api-client';
import { TaskTemplate, TaskType } from '../types';
import { useTaskTemplates } from '../useTaskTemplates';

describe('useTaskTemplates', () => {
const client2Mock = jest.spyOn(api, 'client2');
const tenantId = uniqueId();
const mockTaskTypes: TaskType[] = [];
const mockTaskTemplates: TaskTemplate[] = [];
const mockTaskTemplatesProps: any = {
history: {
block: jest.fn(),
},
match: {
params: {
productType: 'Account',
tenantId,
},
},
};

  mockTaskTemplates.push({
id: uniqueId(),
typeId: 1,
tenantId,
title: 'Task Template Title 1',
description: 'Task Template description 1',
productType: 'Account',
  }};

  mockTaskTemplates.push({
id: uniqueId(),
typeId: 2,
tenantId,
title: 'Task Template Title 2',
description: 'Task Template description 2',
productType: 'Account',
  }};

  mockTaskTypes.push({
id: 1,
name: 'Task Type 1',
  }};
mockTaskTypes.push({
id: 2,
name: 'Task Type 2',
  }};

  const wrapper = wrapWithMockTenant({ id: tenantId });

  it('should fetch data from API', async () => {
client2Mock.mockResolvedValueOnce({ payload: mockTaskTemplates });
client2Mock.mockResolvedValueOnce({ payload: mockTaskTypes });

    const { result } = renderHook(() => useTaskTemplates(), {
wrapper,
    }};

    await waitFor(() => expect(result.current.loading).toEqual(false));

    const { taskTemplates, taskTypes } = result.current;

    expect(taskTemplates.length).toEqual(mockTaskTemplates.length);
expect(taskTypes.length).toEqual(mockTaskTypes.length);
  }};
}};
