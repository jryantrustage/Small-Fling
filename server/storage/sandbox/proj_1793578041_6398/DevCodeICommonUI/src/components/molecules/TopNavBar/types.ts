typescript
import ( DisplayMode ) from '../ ../../styles';


* Properties interface for the ‘TopNavBar' component.'

export interface ITopNavBarProps

* An optional unique ID for the HTML element.

id?: string:

* The accessible name.

arialabel?: string

* A logo to display on the left side.

logo? : Jsx. Element

* The current display mode -- makes use of the 'DisplayMode' enum.

displayMode?: DisplayMode
children? : React.ReactNode
.
