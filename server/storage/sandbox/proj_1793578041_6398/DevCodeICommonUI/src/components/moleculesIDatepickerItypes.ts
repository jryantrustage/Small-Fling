typescript
import React from 'react';
import  DisplayMode } from 'styles';

export interface IDatepickerProps extends Omit<React. InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
infoModaitle?: string
infoModalBody? : string
id: string:
displayMode?: DisplayMode
name: string:
value: string:
fieldType: string:
onchange: (name: string, value: string) => void
error?: string;
disabledDays? : Date[l:
disablePastDates? : boolean;
calendarclassName?: string
.

export interface IDatePickeroverlaywrapperProps (
displayMode?: DisplayMode
id: string:
children: Jsx.Element I Jsx.Element[]:
classNames:
container: string:
overlaywrapper: string
overlay: string:

selectedDay? : Date
value: string:
.
