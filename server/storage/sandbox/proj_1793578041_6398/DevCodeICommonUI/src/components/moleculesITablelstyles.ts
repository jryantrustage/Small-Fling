typescript
import styled,  css } from 'styled-components';
import ( Theme ) from 'styles/themes/themeutility';
import ( sCMenu, sCTrigger ) from 'components/atoms/Dropdown/styles';
import ( Tablespacing ) from 'components/molecules/Table/types';

export const scTHead = styled.thead<( stickyHeader?: boolean j>''
position: $(({ stickyHeader }) => (stickyHeader ? 'sticky' : 'relative'));
top: o:
z-index: $(({ stickyHeader }) => (stickyHeader ? 2 : ‘unset'):'
background-color: $(Theme.getcolor('contrastGreyscaleo1')


const celiPadding =
[Tablespacing.coNDENSED] : css''
padding: 10px 16px:

[Tablespacing.sTANDARD] : css
padding: 22px 16px:



export const scHeadercolumn = styled.th<
maxwidth? : string:
tablespacing?: Tablespacing
defaultWidthForResizable?: string:

$((( tablespacing ) => CellPadding[tablespacing ?? Tablespacing.STANDARD])
resize: $((( maxWidth ) =>(maxwidth ? 'none' : ‘horizontal'');
width: $({ maxWidth, defaultwidthForResizable }) => maxWidth || defaultwidthForResizable || 'auto'}:
overflow: auto;
border-bottom: solid 2px $(Theme.getColor('contrastGreyscale02');
color: $(Theme.getcolor('contrastGreyscale08'):
button
color: ${Theme.getcolor('contrastGreyscaleo8'));
width: 100%
cursor: pointer;

> div
display: flex;
align-items: center;

margin: o 1opx:
.
.
.
input
margin: 1opx o:
.


export const scTablewrapper = styled.div<{ tablespacing: Tablespacing >
border-radius: 2opx;
box-shadow: rgba(100, 100, 111, 0.2) opx 7px 29px opx;
padding: 2opx
background-color: $(Theme.getcolor('contrastwhite'));
> table
table-layout: fixed;
border-collapse: collapse
width: 100%;
tr
transition: background-color 30oms:
td
$( tablespacing ) => CellPadding[tablespacing ?? Tablespacing.STANDARD]
overflow: auto:
border-bottom: solid 2px $(Theme.getcolor('contrastGreyscale03')):
.
.
tbody tr : hover
background-color: ${Theme.getcolor('contrastGreyscaleo1'):
.
.


export const scTopPaginationwrapper = styled.div'';

export const scBottomPaginationwrapper = styled.div
padding-bottom: 2oopx;


export const scPagination = styled.div<( issticky?: boolean }>''
display: flex:
justify-content: space-between;
padding: 1opx:
align-items: center;
$t(t issticky ) => issticky && 'position: sticky:'}
$t(t issticky ) => issticky && 'left: o:'}
> div
display: flex;
align-items : center;
label
margin: o
margin-right: 8px;
.
.

& $ (scMenuy
background: $(Theme.getColor('contrastGreyscaleo1'));
.

& $ (scTriggery
$(Theme.getFontstyles('label2'))
.


export const scFilter = styled.div
position: relative
button
right: 1opx;
top: 4px;
height: 2opx;
width: 2opx;
position: absolute:
.


export const scTableEmptystatewrapper = styled.tbody''
> tr: first-child
td
padding: o:
border-bottom: none;
.
.


export const scchevronButton = styled.button''
: hover
cursor: pointer;
.

padding: 5px;


export const sCPageNumber = styled.button<( isselected?: boolean y>
width: 26px;
height: 26px;
border-radius: 2opx;
pointer-events: none:
font-size: 16px;


export const sCPageNumbercontainer = styled.div<( isselected?: boolean )>＇
cursor: pointer:
$ scPageNumbery
$(Theme.getFontstyles("body1'"));
background-color: $((t isselected y) =
isselected ? Theme.getcolor('contrastBlack') : Theme.getcolor('contrastwhite'));
color: $ ((t isselected y) =>
isselected ? Theme.getcolor('contrastwhite') : Theme.getColor('contrastGreyscaleo7'):
text-decoration: none;
.


export const scPageNumberwrapper = styled.div
display: flex;

span
margin: o 8px o 8px;
line-height: 26px;
.


export const scsimplePagination = styled.div
display: flex:
justify-content: center;


export const scsimplePaginationwrapper = styled.div
display: flex;
justify-content: space-between;
margin-top: 16px;
width: 280px;

