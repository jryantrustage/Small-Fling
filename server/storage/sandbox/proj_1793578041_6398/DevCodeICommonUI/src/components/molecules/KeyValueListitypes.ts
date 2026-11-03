typescript
import ( IDataField, IExposition } from ‘core/entities/loanApplication';

export interface IKeyValueListProps

* Unique id string to identify the label and value elements.

id?: string:

* class name to allow for custom styling from styled(KeyValueList)

className? : string

* The label for the receipt item.

label?: string:

* Boolean indicating whether the receipt item should be highlighted.

highlighted? : boolean;

* Boolean indicating whether the receipt value should be displayed as a currency.

currency?: boolean

* Number denoting the value of the receipt item.

value?: number I string:

* Boolean indicating whether key value list text should be heading text

isHeadingText? : boolean;

mode?: ‘DARK  ‘LIGHT'

dataFields?: IDataField:

index? : number;


* Defaults to true
* Determines if dots should be rendered before the value

showDots? : boolean


* Defaults to false
* If set to true, the value will render on a new line below the label

fullwidthvalue?: boolean

fieldType?: string

exposition?:IExposition［];


* Defaults to false
* If set to true, the dots and value will render at the bottom right of the wrapped label

alignEnd? : boolean
.
