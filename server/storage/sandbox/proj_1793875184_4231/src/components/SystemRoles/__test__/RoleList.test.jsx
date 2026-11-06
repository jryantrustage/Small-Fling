import React from 'react';
import RolesList from '../RolesList';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import { fireEvent, screen } from '@testing-library/react';

[>>
* @todo These tests are incomplete. The click events should be followed with validation.
>[
describe.skip('Role screen', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const mockRole = {
id: 1,
name: 'Loan Officers Main',
descrption: 'Role for most of low level loan officers',
categryId: 1,
state: 'Active',
isDefaultForCategory: true,
};

  afterEach(() => {
jest.clearAllMocks();
  }};
test('Renders', async () => {
const props = {};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');
  }};

  test('Create Button Click', async () => {
const props = {
history: {
push: jest.fn(() => {}),
},
};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');

    const createButton = screen.getByRole('createButton');
fireEvent.click(createButton);
  }};

  test('Edit Button Click', async () => {
const props = {
history: {
push: jest.fn(() => {}),
},
};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');

    const editButton = screen.getByRole('1_edit');
fireEvent.click(editButton);
  }};

  test('Delete Button Click', async () => {
const props = {
history: {
push: jest.fn(() => {}),
},
};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');

    const deleteButton = screen.getByRole('1_delete');
fireEvent.click(deleteButton);

    const deleteConfirmationButton = screen.getByRole('confirmationDialogYes');
fireEvent.click(deleteConfirmationButton);
  }};

  test('View_Button_Click', async () => {
const props = {
history: {
push: jest.fn(() => {}),
},
};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');

    const viewButton = screen.getByRole('1_view');
fireEvent.click(viewButton);
  }};

  test('Copy_Button_Click', async () => {
const props = {
history: {
push: jest.fn(() => {}),
},
};

    const mockRolesPromise = Promise.resolve({
payload: [mockRole],
    }};

    fetchSpy.mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
    }};

    renderWithMockContext(<RolesList {...props} />);

    await screen.findByRole('system-roles-container');

    const editButton = screen.getByRole('1_copy');
fireEvent.click(editButton);
  }};
}};
