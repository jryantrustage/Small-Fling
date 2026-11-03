typescript
import styled, ( css ) from 'styled-components';
import { ISCModalwindowProps, ISCModalContentwrapperProps, DarkModeCompatibleProps } from './types';
import  Theme  from 'styles';
import ( DisplayMode ) from 'styles/themes';

export const scModal = styled.div<( isInIframe: boolean y>
position: fixed;
left: o:
top: o:
z-index: 1500
display: flex;
justify-content: center;
align-items: center:
width: 100%;



export const scBackground = styled.div
position: fixed;
left: o
top: o:
right: o:
bottom: o:
z-index: -1:
opacity: $(Theme.getopacityvalue('80%*')
background-color: $(Theme.getcolor('contrastBlack'));


export const sCModalwindow = styled.div<IscModalwindowprops>
position: absolute
width: $((props): string => props.width || '512px':
max-height: 90%;
overflow-y: clip:
background-color: $((t displayMode, theme }): string =>
displayMode === DisplayMode. DARk
? Theme.getcolor('contrastuitraBlack')(t theme )
: Theme.getcolor('contrastwhite')(t theme )
display: flex;
flex-direction: column

$ ( Theme.getMediaQuery(Theme.MD, Theme.SM) (
width: $(({ mobileFullscreen }): string => (mobileFullscreen ? ‘100%* : ‘90%);
max-height: $(({ mobileFullscreen }): string => (mobileFullscreen ? '100% : ‘90%');
$ t(props) =>
props.isInIframe &&
css
min-width: 1oovw;
max-height: 1oovh;
```
.


export const sCHeader = styled.div<DarkModecompatibleProps>
position: relative
display: flex;
align-items: center:
padding: 24px 80px 24px 24px;
background-color: $((t displayMode, theme 1): string =>
displayMode === DisplayMode.DARk
? Theme.getcolor('contrastultraBlack')(t theme )
: Theme.getcolor('contrastwhite')(t theme ));
border-bottom: 2px solid
$((t displayMode, theme f): string =>
displayMode = DisplayMode.DARk
? Theme.getcolor('contrastBlack')(t theme )
: Theme.getcolor('contrastGreyscale03')(t theme ));
min-height : 74px;
color: $(t displayMode, theme ): string =>
displayMode === DisplayMode. DARk
? Theme.getcolor('contrastwhite')(t theme )
: Theme.getcolor('contrastBlack')(t theme ):
$(Theme.getFontstyles("body2')
: focus
outline: none;
.

$( Theme.getMediaQuery(Theme.sm)
${Theme.getFontstyles('title4'));
.


export const sContentwrapper = styled.div<IsCModalcontentwrapperProps>
padding: $(props): string => (props.hidePadding ? ‘o' : '40px 24px'');
overflow-y: auto;



export const sCFooterwrapper = styled.div<DarkModecompatibleProps>
z-index: 1;
border-top: 2px solid
$((t displayMode, theme f): string =>
displayMode = DisplayMode.DARk
? Theme.getcolor('contrastBlack')(t theme )
: Theme.getcolor('contrastGreyscale03')(t theme +);
bottom: o:
left: o
right: o;
background: $(t displayMode, theme ): string =>
displayMode === DisplayMode. DARk
? Theme.getcolor('contrastuitraBlack')(t theme )
: Theme.getcolor('contrastwhite')(t theme )


export const sccloseButton = styled. button''
position: absolute
top: 22px
right : 24px;
font-size: 4opx;
cursor: pointer;
z-index: 11:
: focus

outline: auto;
.
.

