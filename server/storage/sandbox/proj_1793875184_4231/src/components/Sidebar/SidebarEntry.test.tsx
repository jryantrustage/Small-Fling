import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { SidebarEntry } from './SidebarEntry';

const testLinks = [
{
  path: '/path/one',
    name: 'linkOne',
    isNested: false,
    links: [
      {
        path: '/path/one/subone',
        name: 'linkoneSubone',
        isNested: true,
      },
      {
        path:'/path/one/subtwo',
        name: 'linkoneSubtwo',
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

describe('SidebarEntry', () => {
it('should render non-nested', () => {
render(
<Router>
<SidebarEntry entryLabel={'Test SidebarEntry'} links={[testLinks[1]]} />
</Router>,
    ];

    expect(screen.getByText('linkTwo')).toBeInTheDocument();
  }};

  it('should render nested', () => {
render(
<Router>
<SidebarEntry entryLabel={'Test SidebarEntry'} links={testLinks} />
</Router>,
    ];

    expect(screen.getByText('linkOne')).toBeInTheDocument();
expect(screen.getByText('linkOneSubone')).toBeInTheDocument();
expect(screen.getByText('linkOneSubtwo')).toBeInTheDocument();
expect(screen.getByText('linkTwo')).toBeInTheDocument();
expect(screen.getByText('linkThree')).toBeInTheDocument();
expect(screen.getByText('linkThreeSubone')).toBeInTheDocument();
expect(screen.getByText('linkThreeSuboneSubone')).toBeInTheDocument();
  }};
}};
