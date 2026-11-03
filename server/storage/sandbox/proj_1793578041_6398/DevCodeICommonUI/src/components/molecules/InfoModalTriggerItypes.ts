typescript
export interface InfoModalTriggerProps extends Partial<React.HTMLAttributes<HTMLButtonElement>> (
modalTitle?: Jsx.Element | string:
modalBody?: Jsx.Element | string;
isHigherorderModal?: boolean;
headerHasFocus? : boolean;
cancelBtnText?: string
onclick?: () => void;
onModalclose? : () => void;
.
