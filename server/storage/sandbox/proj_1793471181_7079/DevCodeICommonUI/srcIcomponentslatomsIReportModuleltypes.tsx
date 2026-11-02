typescript
import  ReactNode  from 'react'

export interface IToggleTabData
label: string:
value: string:
.

export const oONE_coLuMN = 40o;
export const Two_coLuMN = 816;

export interface IReportModuleProps

* items to be placed into the node module ((chart/table/etc)

children? : ReactNode:

* Title of the module

title?: string:

* subtitle of module

subtitle?: string;

* preTitle- the count or a word to put in bold?

pretitle?: string:

* class name for use with external css/styled Components

className? : string

* id for html consistency

id?: string:

* is the date range used? (mainly for error message

isDateRangeused?: boolean;

* numerical value for if the graph data is loaded-
* -2: empty
* -1: failed
* o: not loaded
* 1 : loaded

loaded: -2 — -1 - 0 - 1;

* width of the node module

width?: number  ‘2-column'  1-column'

* height of the node module

height? : number:

* inner padding of the node module

padding? : number:

* radius of the rounded rectangle corners

borderRadius? : number;

* Bottom margin to separate other graphs

marginBottom? : number;

* Separating margin for chart div from Top Line

chart TopMargin?: number

* toggle menu dropdown values and labels using Tabs

toggleData?: IToggleTabData[l:

* Download button action

onDownloadclick?:() => void;

* Toggle selection action

onToggleselect?: (label: string) => void:
.
