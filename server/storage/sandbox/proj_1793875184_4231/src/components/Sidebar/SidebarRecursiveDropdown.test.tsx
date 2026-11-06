import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { SidebarRecursiveDropdown } from './SidebarRecursiveDropdown';

const testLinks = [
{
path: '/path/one',
name: 'linkOne',
isNested: false,
links: [
{
path: '/path/one/subone',
name: 'linkOneSubone',
isNested: true,
},
{
path: '/path/one/subtwo',
name: 'linkOneSubtwo',
isNested: true,
},
],
},
{
path: '/path/two',
name: 'linkTwo',
isNested: false,
links: [],
},
{
path: '/path/three',
name: 'linkThree',
isNested: false,
links: [
{
path: '/path/three/subone',
name: 'linkThreeSubone',
isNested: true,
links: [
{
path: '/path/three/subone/subone',
name: 'linkThreeSuboneSubone',
isNested: true,
},
],
},
],
},
];

describe('SidebarRecursiveDropdown', () => {
it('should handle show and collapse content', () => {
render(
<Router>
<SidebarRecursiveDropdown
entryLabel={'Test Dropdown'}
links={testLinks}
depth={1}
        [>
</Router>,
    ];

    expect(screen.getByText('linkOne')).toBeInTheDocument();
expect(screen.getByText('linkOneSubone')).toBeInTheDocument();
expect(screen.getByText('linkOneSubtwo')).toBeInTheDocument();
expect(screen.getByText('linkTwo')).toBeInTheDocument();
expect(screen.getByText('linkThree')).toBeInTheDocument();
expect(screen.getByText('linkThreeSubone')).toBeInTheDocument();
expect(screen.getByText('linkThreeSuboneSubone')).toBeInTheDocument();

    fireEvent.click(screen.getByText('linkOne'));

    expect(screen.queryByText('linkOneSubone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('linkOne'));

    expect(screen.getByText('linkOneSubone')).toBeInTheDocument();
  }};
}};
