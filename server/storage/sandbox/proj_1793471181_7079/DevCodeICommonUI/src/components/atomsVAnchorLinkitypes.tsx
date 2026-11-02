typescript
export interface IAnchorLink
text: string;
className? : string
id?: string:
to: string;
beforeAnimate?: ) => void;
afterAnimate?: () => void;
animate?: IAnchorAnimate:
disableHistory?: boolean;
show? : boolean;
active?: boolean;
.

export interface IAnchorAnimate
offset?: any:
duration? : number
.
