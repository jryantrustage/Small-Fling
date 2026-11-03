typescript
import React from 'react'
import ( AppModal } from 'components/molecules/AppModal';
import ( IcoN_TYPEs, Icon } from 'components/atoms/Icon';

import ( IModalProps  from 'store/modal';
import ( scIconwrap ) from 'styles/shared'

const InfoModal = (↑ title, ...rest : IModalProps): Jsx.Element => (
let titlel = title;

if (typeof title =- ‘'string')
titleel =

<scIconwrap id=-info-modal-icon'
Icon name={ICON_TYPES. INFORMATION) size={16) /
/scIconwrap>: y
(titler

```
.
return <AppModal title={titleEl) (..rest) />;