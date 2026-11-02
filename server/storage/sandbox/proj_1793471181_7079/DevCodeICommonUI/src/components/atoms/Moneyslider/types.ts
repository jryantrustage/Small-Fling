typescript

* Properties interface for the ‘Moneyslider' component.'

export interface IMoneysliderProps (

* The value of the Moneyslider.

value: number:

* Minimal value accepted as valid by the ‘Moneyslider' component.'

min: number:

* Maximal value accepted as valid by the ‘Moneyslider' component.'

max: number:

* Specifies the interval between legal numbers for the 'Moneyslider' component.

step? : number:

* The name attribute of the component

name: string:

* optional callback function, triggered upon slider value change.

onchange: (name: string, value: string) => void;

* optional callback function, triggered upon slider blur.

onBlur: (name: string, value: string | number) => void;

* optional number displaying the initial vehicle price.

vehicleprice?: number;

* Error message to display to the user.

error? : string:

* Boolean determining whether to display the ‘Moneyslider' component.'

hidden?: boolean;

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string

* Array of values considered acceptable by the ‘Moneyslider' component.'

valuesList?: number[;

* component ID

id: string:
.


* The money slider needs to dispatch some information about its movement, as well.

export interface IMoneysliderResponse
amount: number;
action? : WidgetAction;
.


* Enum for different actions dispatched from the money slider

export enum widgetAction t
up = up
DowN = down''
MANUAL_ENTRY = 'manual_entry',
.
