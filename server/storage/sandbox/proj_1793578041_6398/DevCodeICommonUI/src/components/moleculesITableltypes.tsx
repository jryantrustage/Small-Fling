typescript
import React from 'react';

export interface IHeader
Header: React.ReactElement | string
accessor: string:
maxwidth?: string

* use to serialize a column for sorting and filtering

serialize?: (row: IRow) => string I number:
sortable? : boolean
filterable?: boolean;
defaultwidth? : string;
.

export enum Tablespacing t
cONDENSED =  condensed''
sTANDARD = 'standard'
.

export interface ITableProps
id?: string:
className?: string
pages ize?: number;
data: IRow

* row data to place at the bottom of the table which needs no sorting and no filtering

additionalData?: IRown;
sortable? : boolean
filterable?: boolean;
minRows? : number;
columns: IHeader[
showPaginationTop?: boolean
showPaginationBottom?: boolean;
getTrGroupProps?: (row: IRow) => { style: Record<string, string> } & React.HTMLAttributes<HTMLTableRowElement>;
stickyHeader? : boolean;
defaultsort?: Isort:
emptystatecomponent?: Jsx.Element

* use to change the visual density of the table.

* standard is the default

* condensed will reduce the amount of padding on each cell, headers included

tablespacing?: Tablespacing
pageDataLoader?: (pagesize: number, pageNumber: number) => Promise<void>;
totalDatasize?: number

* If a method is provided to the table to update query params,
* It will report all its state in a query param string
* This will include: Filters, Sort, Page, PageLength

updateQueryParams?: (querystring: string) => void;

* Query params can be provided to initialize the
* Filters, sort, Page, Pagelength

initialQueryParams?: string:
simplePagination?: boolean
stickyPagination?: boolean
separatePaginationFromTable?: boolean;
I/ when the given column name is clicked it will sort by the sortIndexcolumn's order'
customsort?: ( column: string: sortIndexcolumn: string [l
// optionally used in conjuction with custom sort to allow parent component to handle sorting
onsortclick?:(column: string) => void;
.

export interface Isort
column: string;
direction: asc'  'desc';
.

type onsort = (column: string) =>() => void;
type onFilter = (column: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
type onclearFilter = (column: string) => () => void;

export interface IHeaderProps
columns: IHeader[
onsort: onsort;
onclearFilter: onclearFilter;
onFilter: onFilter
sort: Isort;
sortable? : boolean
filters: Record<string, string>
filterable?: boolean;
stickyHeader? : boolean;
tablespacing?:Tablespacing;
.

export interface IFilterProps
accessor: string:
filtervalue: string:
label: string:
onclearFilter: onclearFilter;
onFilter: onFilter
.

export interface IRow extends Record<string, React.ReactElement I string | number | any> (
id: string | number:

* Extra data to use when serializing a column for sorting

rawData?: Record<string, any>

* to specify the column span of a table data cell

colspanData?: ICoispanData!:

* Individual rows can have a class name attached on render
* Can bel used to highlight or color a row

className?: string
.

export interface ICreditRow extends IRow

* used in Astro -- CreditRanges

id: string;
category: React.ReactNode
high: React. ReactNode
low: React. ReactNode:
.

export interface IPagination
id?: string:
currentPage: number:
setcurrentPage: (currentPage: number) => void
pageLength: number
numPages: number:
changePageLength: (pageLength: number) => void;
disabled? : boolean
showAliRowsoption?: boolean
issticky? : boolean
.

export interface IsimplePagination (
id?: string:
currentPage: number:
setcurrentPage: (currentPage: number) => void
numPages: number:
disabled? : boolean
.

export interface IuseTablePayload extends IPagination (
filters: Record<string, string>
order: string:
sort: Isort;
sortedData: IRown
onsort: onsort;
onclearFilter: onclearFilter
onFilter: onFilter
loadingPagination?: boolean;
.

export interface IColspanData
accessor: string:
.colspan: humber:
.
