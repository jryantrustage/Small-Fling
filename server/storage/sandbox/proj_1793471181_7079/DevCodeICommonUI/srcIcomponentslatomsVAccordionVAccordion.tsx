typescript
import React from 'react';
import ( IcoN_TYPEs ) from ‘components/atoms/Icon'';
import ( Panel  from ‘components/atoms/Panel'';
import ( CollapsiblePanel ) from 'components/atoms/CollapsiblePanel';
import ( ContainerWithIcon, Position  from 'components/atoms/ContainerWithIcon';
import ( IAccordionProps ) from '. /types';


* Wrapper component that conditionally renders ‘Panel' or 'CollapsedPanel' and passes children.'

const Accordion = (props: IAccordionProps): Jsx.Element =>
const  items  = props;

return (

(items.map((t expandcomponent, collapsedComponent, isCollapsable, onInfoIconclick, ariaLabel, isopened, id }) => {
let accessibilityprops: any =
expanded: ‘t rue'',
```
if (id)
accessibilityProps =
...accessibilityprops
id,

.
// cloning prop in order to pass 'expanded' prop to the CoverageProductListcolapsedItem component
const clonedcollapsedcomponent: Jsx.Element = React.cloneElement(collapsedComponent, accessibilityProps);

const expandedchildren = (

fexpandcomponenty
<containerwithIcon
name={ICON_TYPES.INFORMATION
action=fonInfoIconclicky
position=(Position.BOTTOoM_RIGHT)
ariaLabel='More information'>
clonedcollapsedcomponenty
</ containerwithIcon


return (
<React.Fragment key={'accordion_item-$ idy' >
(iscollapsable ? (
collaps iblePanel
nestLevel={1y
collapsedchildren={collapsedcomponent)
expandedchildren=expandedchildren
initiallycollapsed={lisopenedy
arialabel=(arialabely


Panel nestLevel={1)>(expandedchildrenj</ Panel>

/React . Fragment>






export  Accordion :
