typescript
import ( Ioption ) from 'core/entities/loanApplication';
import ( DisplayMode ) from 'styles/ themes';

export interface IHerosingleselectProps (
-fieldcode'?: string:'
‘id': string';
‘options?: Ioption[];
'error'?: string:
'disabled'?: boolean;
'displayMode'? : DisplayMode
value'?: string:'
'aria-describedby'?: string;
‘aria-invalid'?: boolean 丨 ‘true' 丨 'false' 丨'grammar' 丨 'spelling' | undefined;
‘onchange': (name: string, value: string) => void';
usecustomprops'?: boolean';
className'?: string:'
.

export enum optionType t
CREDIT_CARD = ‘CREDIT-CARD-TYPES'',
PERSONAL_LOAN = ‘PERSONAL-LOAN-TERMS'',
RECREATIONAL_VEHICLE = ‘RECREATIONAL-VEHICLE'',
SIMPLE = ‘SIMPLE''
.
