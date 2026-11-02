typescript
import React from 'react'

import ( scImgcontainer, scImg } from './styles';
import ( IofferImageProps } from './types'


* Displays the product image for an offer.

const OfferImage = ( id, className, size, mediaurl, mediaBgcolor }: IofferImageProps): Jsx.Element I null => {
I/ Note that an empty 'alt' attribute is preferred for decorative images, which is the case here.
const imageElement = (
<SCImg id={id) alt=' className={className} src={mediaurl) size={size} hasMediaBgcolor={!!mediaBgcolor) />
```
if (mediaurl && mediaBgcolor)
return (
<sCImgContainer className={className) size={size) bgColor=(mediaBgcolor)>
(imagelementy
</scImgContainer>
```
.
return mediaurl ? imageElement : null;