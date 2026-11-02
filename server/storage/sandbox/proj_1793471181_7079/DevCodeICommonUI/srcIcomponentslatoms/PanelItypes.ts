typescript
export interface IPanelProps extends React.HTMLAttributes<HTMLDivElement> (
children: Jsx.Element I Jsx.Element[]:

* A special type of a panel with rectangular bottom-left corner

bubbleBorder? : boolean

* A number that specific the nest level of the element relative to its container.

nestLevel? : number

* Displays panel with alert styling

alert?: boolean;

* on click handler

onclick?: () => void;
.
