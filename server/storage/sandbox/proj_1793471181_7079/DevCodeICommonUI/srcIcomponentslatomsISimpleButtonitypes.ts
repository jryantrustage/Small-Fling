typescript
export interface Iprops

* Uunique string id to identify the button.

id?: string:

* A boolean denoting whether the button style is the secondary variation.

issecondary? : boolean;

* A boolean denoting whether the button is a link instead.

isLink?: boolean;

* A boolean denoting whether the button style is rounded.

isRounded? : boolean;

* A boolean denoting whether the button is disabled.

disabled?: boolean

* Element to diplay within the button.

children: Jsx.Element | string;

* The click handler, triggered when the button is pressed.

onclick?:(params: any) => any:

* Type of button in case you're using it for form submission'

type? “button'  'submit'  'reset''
/** the order of the button if desired *
order? : number;
/** boolean denoting whether the button is the ghost variation */
isGhost? : boolean;
.
