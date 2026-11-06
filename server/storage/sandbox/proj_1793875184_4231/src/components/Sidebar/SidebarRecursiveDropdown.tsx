import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, ICON_TYPES } from 'commonui';
import { recursiveActiveLinkCheck } from './helpers';
import { ISidebarEntry } from './types';
import {
SCAccordionDepthWrapper,
SCAccordion,
SCSidebarEntry,
SCIcon,
} from './styles';

export const SidebarRecursiveDropdown = ({
entryLabel,
links,
depth,
}: ISidebarEntry & { depth: number }): JSX.Element => {
const [expanded, setExpanded] = useState(true);
const currentPath = window.location.pathname;
const activeRoute = recursiveActiveLinkCheck(currentPath, links);
const hasActiveRoute = Boolean(activeRoute);

  return (
<SCAccordionDepthWrapper depth={depth}>
<SCAccordion
hasBorder={depth === 1}
id={entryLabel}
title={entryLabel}
onSetExpanded={setExpanded}
expandedOverride={expanded}
buttonComponent={
<SCSidebarEntry isNested={false} navDepth={depth}>
<div className={hasActiveRoute ? 'active' : ''}>
<SCIcon expanded={expanded}>
<Icon size={20} name={ICON_TYPES.ARROW_DOWN_FIT} />
</SCIcon>
<span>{entryLabel}</span>
</div>
</SCSidebarEntry>
}
content={links.map(
({ name, path, links }) =>
(links && links.length && (
<SidebarRecursiveDropdown
key={name}
entryLabel={name}
links={links}
depth={depth + 1}
/>
)) || (
<SCSidebarEntry key={name} isNested={true} navDepth={depth}>
<NavLink
to={path}
className={({ isActive }) => (isActive ? 'active' : '')}
>
{name}
</NavLink>
</SCSidebarEntry>
            },
        }}
      [>
</SCAccordionDepthWrapper>
  ];
};
