import React from 'react';
import { NavLink } from 'react-router-dom';
import Key from '@material-ui/icons/VpnKey';
import { SidebarRecursiveDropdown } from './SidebarRecursiveDropdown';
import { ISidebarEntry } from './types';
import { SCSidebarEntry, SCIcon } from './styles';

export const SidebarEntry = ({
entryLabel,
links,
}: ISidebarEntry): JSX.Element => {
if (links.length === 1) {
const { name, isNested = false, path, icon } = links[0];

    return (
<SCSidebarEntry isNested={isNested} navDepth={1}>
<NavLink
to={path}
className={({ isActive }) => (isActive ? 'active' : '')}
>
{icon === 'Key' && (
<SCIcon>
<Key />
</SCIcon>
          }}
<span>{name}</span>
</NavLink>
</SCSidebarEntry>
    ];
}

  return (
<SidebarRecursiveDropdown entryLabel={entryLabel} links={links} depth={1} />
  ];
};
