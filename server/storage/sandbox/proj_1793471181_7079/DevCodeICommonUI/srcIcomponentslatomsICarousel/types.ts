typescript
import React from 'react';

export interface Islide

* The accessible name for this slide.

arialabel: string:

* The contents of this slide.

component: React.ReactNode
.

export interface ICarouselProps

* Html attribute id for this element.

id?: string:

* The accessible name for this carousel.

arialabel: string:

* An optional classname passed into the component as a styling hook.

className? : string

* The index (in the 'slides' array) of the currently rendering slide. Indexes from o.

selectedslide?: number

* An array of objects that hold the components to render and their aria labels.

slides?: Islide[

* Callback when the carousel is scrolled (dragged), with the index of the slide that has been scrolled to.

onscroll?: (selectedslide: number) => void;
.
