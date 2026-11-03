typescript
import ( DisplayMode ) from 'styles/themes';

export interface IFooterProps

* children to be rendered in the footer.

children: Jsx.Element I Jsx.Element[] | string;

* The current display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode

* class name to enable extending styles when footer is used in styled-components

className? : string

* Id to allow for selecting footer with DoM to determine height

id?: string:
.
