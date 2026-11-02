typescript
import React from 'react'
import ( scNavBarLink, sCNavLink } from '. /styles';
import ( INavBarLinkProps  from './ types':


* A styled version of react-router's NavLink, for use in the main navigation bar.

export const NavBarLink = ({ route, text, displayMode : INavBarLinkProps): Jsx.Element => {
return
<scNavBarLink sdisplayMode={displayMode)>
<scNavLink to={route) $displayMode={displayMode)>
(text)
/scNavLink>
</scNavBarLink>