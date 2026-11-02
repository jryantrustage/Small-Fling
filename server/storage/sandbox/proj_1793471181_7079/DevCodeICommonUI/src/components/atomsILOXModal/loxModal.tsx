typescript
import React, ( ReactFragment, useEffect, useRef ) from 'react';
import FocusLock from 'react-focus-lock';
import ( LoxButton as Button ) from '.. / LoxButton/ LoxButton';
import ( Title  from '../Title/title';
import ( subTitle ) from '../subTitle/subTitle';
import closer from '../static/close.svg';
import './ loxmodal.css';


* Renders an Lox-based Modal.
* @param (boolean) show - Set to show or hide the modal
* @param (void) onclose - function to call in parent when the modal is being closed
* @param (void) onConfirm - (optional) function to call in parent when the modal's "confirm" button is clicked'
* @param (any Content - (optional) Children to be placed inside the modal
* @param (boolean) takeover - (optional) Set to determine if the modal takes over the page entirely
* @param (string) dimclass - (optional) class css name for the dimming background
* @param (any) passThruData - (optional) Data that is to pass through to the Content
* @param (ReactFragment) Panel - (optional) Jsx Fragment for inner content (no pass through data)
* @param (string) modalTitle - (optional) Title shown in the header in the modal
* @param (string) modalsubTitle - (optional) Text under the title shown in the header of the modal
* @param (string) cancelButtonText - (optional) Text shown in the Cancel button. If this is not defined, the cancel button will not be shown
* @param (string) confirmButtonText - (optional) Text shown in the Confirm button. If this is not defined, the confirm button will not be shown
* @param (boolean) flex - (optional) This boolean determines if the modal is build with Flexbox css (allowing the middle section to be scrollable)


type LoxModalprops =
show: boolean
onclose:(value: any) => void:
onconfirm?: (value: any) => void I undefined;
content? : any:
takeover: boolean
modalclassName? : string:
dimclass? : string:
pass ThruData? : any
// setPDF, grouping, and setGrouping are all passthrough values.
Panel?: ReactFragment;
modalTitle?: string | ReactFragment
modalsubTitle?: string:
cancelButtonText?: string:
confirmButtonText?: string;
flex? : boolean;