import React from 'react';
import Role from '../Role';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import { act, waitFor, fireEvent, screen } from '@testing-library/react';
import * as RouterDom from 'react-router-dom';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: jest.fn().mockReturnValue({}),
}}]);

describe('Role screen', () => {
afterEach(() => {
jest.clearAllMocks();
  }};

  test('Renders Create', () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({}));

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
)
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    const role = renderWithMockContext(<Role />);

    const roleContainer = role.findByRole('systemRoleGrid');
expect(roleContainer);
  }};

  test('Renders View', () => {
jest
.spyOn(RouterDom, 'useParams')
.mockImplementation(() => ({ roleId: 123, viewMode: 'view' }));

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    const role = renderWithMockContext(<Role />);

    const roleContainer = role.findByRole('systemRoleGrid');
expect(roleContainer);
  }};

  test('Renders Copy', () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
roleId: '123',
viewMode: 'copy',
    }}];

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    const role = renderWithMockContext(<Role />);

    const roleContainer = role.findByRole('systemRoleGrid');
expect(roleContainer);
  }};

  test('Renders Edit', () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
roleId: '123',
viewMode: 'edit',
    }}];

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    const role = renderWithMockContext(<Role />);

    const roleContainer = role.findByRole('systemRoleGrid');
expect(roleContainer);
  }};

  test('Role_Save_Draft', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({}));

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    renderWithMockContext(<Role />);

    await waitFor(() =>
expect(screen.getByRole('systemRoleGrid')).toBeTruthy(),
    ];

    const saveActiveButton = screen.getByRole('role-save-draft');
fireEvent.click(saveActiveButton);
  }};

  test('Role_Save', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({}));

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    renderWithMockContext(<Role />);

    await waitFor(() =>
expect(screen.getByRole('systemRoleGrid')).toBeTruthy(),
    ];

    const saveActiveButton = screen.getByRole('role-save');
fireEvent.click(saveActiveButton);
  }};

  test('Role_Discard', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({}));

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    renderWithMockContext(<Role />);

    await waitFor(() =>
expect(screen.getByRole('systemRoleGrid')).toBeTruthy(),
    ];

    const saveActiveButton = screen.getByRole('role-discard-changes');
fireEvent.click(saveActiveButton);
  }};

  test('Role_Cancel', async () => {
jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
roleId: '123',
viewMode: 'view',
    }}];
const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ];

    renderWithMockContext(<Role />);

    await waitFor(() =>
expect(screen.getByRole('systemRoleGrid')).toBeTruthy(),
    ];

    const saveActiveButton = screen.getByRole('role-cancel');
fireEvent.click(saveActiveButton);
expect(mockPush).toHaveBeenCalled();
  }};

  test('Add_Role_Permission', async () => {
global.document.createRange = () => ({
setStart: () => {},
setEnd: () => {},
commonAncestorContainer: {
nodeName: 'BODY',
ownerDocument: document,
},
    }};

    jest.spyOn(RouterDom, 'useParams').mockImplementation(() => ({
roleId: '123',
viewMode: 'view',
    }}];

    const mockRoleCategoriesPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Loan Officers',
},
{
id: 2,
name: 'Customers',
},
],
    }};

    const mockRolePromise = Promise.resolve({
payload: {
name: 'Loan Officers',
description: 'Main Loan Officers Role',
categoryId: 1,
state: 'Draft',
isDefaultForCategory: false,
permissions: [],
},
    }};

    const mockRolePermissionsPromise = Promise.resolve({
payload: [
{
id: 1,
name: 'Permission 1',
},
{
id: 2,
name: 'Permission 2',
},
],
    }};

    jest
.spyOn(window, 'fetch')
.mockReturnValue(
Promise.resolve({
ok: true,
json: () => mockRolePermissionsPromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRoleCategoriesPromise,
        }],
      ]
.mockReturnValueOnce(
Promise.resolve({
ok: true,
json: () => mockRolePromise,
        }],
      ];

    const { container } = renderWithMockContext(<Role />);

    await waitFor(() =>
expect(screen.getByRole('systemRoleGrid')).toBeTruthy(),
    ];

    act(async () => {
const searchAutocomplete =
screen.getByTestId('permissions-search').firstChild;
fireEvent.change(searchAutocomplete, {
target: { value: 'Permission 1' },
      }];
await timeout(1500);
fireEvent.change(searchAutocomplete, {
target: { value: 'Permission 1' },
      }];
await timeout(500);

      const addPermissionsButton = screen.getByRole('add-permissions');
fireEvent.click(addPermissionsButton);

      const addedPermissionText = screen.getByText('Permission 1');
expect(addedPermissionText).toBeTruthy();
    }};
  }};

  function timeout(ms) {
return new Promise((resolve) => setTimeout(resolve, ms));
}
}};
