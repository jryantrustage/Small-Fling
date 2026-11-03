typescript
import { IFact, IConditionProperties } from 'core/entities/decisioning'

export interface IConditionProps extends IConditionProperties (

* Either one fact or a list of facts to select




* used to update condition values

onchange: (conditionvalues: IConditionProperties) => void;


* Used to pass condition level controls, buttons etc to place at the end of each condition line

children?: Jsx.Element


* Disables the toggle for the condition. Default: false

ischeckboxDisabled?: boolean;


* Disables the fact select field. Default: false

isFactDisabled?: boolean;


* Disables the operator select field. Default: false

isoperatorDisabled?: boolean


* Disables the value input field. Default: false

isvalueDisabled?: boolean;


* Uunique id to prefix child components with

id?: string:


* Error text to display if field is in error

errorText?: string
.

export interface IRuleFactFieldProps
id: string;
label: string:
availableFacts: IFact  IFact [
handlechange: (newProperties: Partial<IConditionProperties>) => void;
selectedFact?: string;
isDisabled?: boolean;
.
