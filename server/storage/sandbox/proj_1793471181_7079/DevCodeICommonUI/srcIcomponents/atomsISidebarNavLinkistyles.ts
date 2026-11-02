typescript
import ( NavLink ) from 'react-router-dom'
import styled from 'styled-components';
import  Theme  from 'styles';

export const scsidebarNavListItem = styled.li''
padding: o:
list-style: none;
display: inline-block;


export const scsidebarNavLink = styled(NavLink)
$(Theme.getFontstyles('titles'))
color: $(Theme.getcolor('contrastGreyscale08'):
display: block;
height: 56px;
line-height: 56px;
padding: 0 4px 0 42px;
text-trans form: none:
text-decoration: none;
border-left: 3px solid rgba(o, o, o, o);
box-sizing: border-box
outline-offset: -4px:
overflow: hidden;
: hover,
&.act ive
color: ${Theme.getcolor('contrastBlack'));
.
&.active
border-left: 3px solid $(Theme.getcolor('G1'));
background: $(Theme.getcolor('contrastGreyscaleo1');
.


export const scDisabledLink = styled.span''
$(Theme.getFontstyles('titles')
color: $(Theme.getcolor('contrastGreyscaleo5')):
display: block;
height: 56px;
line-height: 56px;
padding: 0 4px 0 42px;
text-trans form: none:
text-decoration: none;
border-left: 3px solid rgba(o, o, o, o);
box-s izing: border-box;
outline-offset: -4px:
overflow: hidden;

