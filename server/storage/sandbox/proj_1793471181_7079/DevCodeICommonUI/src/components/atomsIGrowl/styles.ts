typescript
import styled, ( simpleInterpolation ) from 'styled-components';

export const scGrowlwrapper = styled.div<{ variant: string >
display: flex;
align-items: center:
border-radius: 2opx;
padding: 16px
margin: 8px auto;
box-sizing: border-box
box-shadow: opx 4px 8px rgb(o o o / 6%);
$t(props): simpleInterpolation =>
if (props.variant =-= ‘Default')
return
background: #f 1f7ff:
border: 1px solid #5597fb;

.
if (props.variant = ‘warning')
return
background: #fff7ef;
border: 1px solid #fbaf5f
white-space: pre-line

.
if (props.variant == 'success')
return
background: #eafdf7:
border: 1px solid #269b78;

.

return
background: #faf5 f;
border: 1px solid #cd2155:




export const scGrowlIconwrapper = styled. div
min-width: 24px;
min-height : 24px;
height: 100%;
display: flex;
margin: 5px 24px auto o


export const scGrowlTextcontainer = styled.div
font -size: 14px;
font-weight: normal;


export const scGrowilTitle = styled.div
font-weight: soo:
line-height: 20px;
color: #262c30;
word-break: break-word


export const scGrowiMessage = styled.div
font-size: 14px;
line-height: 20px;
co1or: #576975;


export const scGrowilButtonwrapper = styled.div
display: flex:
height : 100%;
margin: o o auto auto;

img
width: 16px;
height: 16px;
.

