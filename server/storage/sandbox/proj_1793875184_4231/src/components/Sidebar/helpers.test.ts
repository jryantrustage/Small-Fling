import { recursiveActiveLinkCheck } from './helpers';

const links = [
{
links: [],
path: '/admin/integration-templates',
name: 'Integration Templates',
icon: '',
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
{
links: [],
path: '/admin/loan-form-templates',
name: 'Loan Form Templates',
icon: '',
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
{
links: [],
path: '/admin/coreProductTemplates',
name: 'Core Product Templates',
hidden: false,
isHomeRoute: true,
parent: 'Templates',
},
];

describe('Sidebar helpers', () => {
it('recursiveActiveLinkCheck with match', () => {
expect(
recursiveActiveLinkCheck('/admin/integration-templates', links),
).toEqual(links[0].path);
  }};

  it('recursiveActiveLinkCheck without match', () => {
expect(recursiveActiveLinkCheck('/non/existant/path', links)).toEqual('');
  }};
}};
