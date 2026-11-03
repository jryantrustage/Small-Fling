typescript
import ( APIContext, TenantContext, Windowontext  from 'context';
import React, ( usecontext, useEffect, usestate ) from 'react';
import ( scIFramecontainer ) from './styles';
import ( IFrameProps ) from './ types';
import ( get ) from 'lodash';
import  spinner } from '../../atoms';


* used to ensure the iframe does not render with a scrollbar
const HEIGHT_OFFSET = 16


const MOBILE_WIDTH = 360
const MOBILE_HEIGHT = 1350;
const DEFAULT_WIDTH = · 100%
const DEFAULT_HEIGHT = 1300;

const IFrame = (t

fieldcode
handlesubmit,
onchange,
valueRules = [],
value.
: IIFrameProps): Jsx.Element => (
const  clientLog } = useContext(APIContext);
const ( isMobile  = usecontext(Windowcontext);
const tenant = usecontext(TenantContext)
const contractNumber = tenant? .details?.contractNumber ?? ·'';
const tenantId = tenant? . details?.id ?? '';
const iFrameRule = valueRules.find( use }) => use === ‘sE_IFRAME');
const [isFlowCompleted, setFlowCompleted] = usestate(false);
const [loading, setLoading] = usestate(true);
if (liFrameRule)
return <></>;
.

let parsedvalueMetaData
try
parsedValueMetaData = JsoN.parse(iFrameRule.valueMetaData ?? '');
catch (err: unknown)
// eslint-disable-next-line no-console
console.error('Error in IFrame component during JsoN parse of valueMetaData', ( iFrameRule, err }):
return <></>;
.
const
origin,
type,
url

requestedjsoNPath = 'paymentData.paytoken',
= parsedvalueMetaData

const safeLog = (message: string, level: string, metadata: Record<string, any>) => {
try
clientLog?.(message, level,
...metadata,
contractNumber,
tenant d,

catch (error: unknown)
// eslint-disable-next-line no-console
console.error('Failed to client log iframe', ( error );
.