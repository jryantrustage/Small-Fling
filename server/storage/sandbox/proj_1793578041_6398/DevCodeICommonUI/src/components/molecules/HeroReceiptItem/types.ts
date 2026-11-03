typescript
import ( DisplayMode ) from 'styles/themes';

export enum HeroReceiptItemsize
LARGE = ‘large'',
sMALL = 'small',
.

export interface IHeroReceiptItemProps (
id: string:
label: string:
value: string:
mode? : DisplayMode
helpText? : string:
size?: HeroReceiptItemsize
ariaprops?: ( [key: string]: string :
.
