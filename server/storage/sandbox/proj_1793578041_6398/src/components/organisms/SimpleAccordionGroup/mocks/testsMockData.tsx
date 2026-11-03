import React from 'react';
import { AccordionStage, ISimpleAccordionDataItem, IAccordionContentListItem } from '../types';
import { SCDocumentUploadCustomSubTextWrapper } from '../styles';

/** Keys and accordion stages for mock accordion data items */
export const accordionDataItemKeys = ['A', 'B', 'C', 'D'];
export const accordionDataItemStages = [
AccordionStage.COMPLETED,
AccordionStage.COMPLETED,
AccordionStage.ACTIVE,
AccordionStage.UNACTIVE,
];

/** Keys for mock accordion content list items */
const accordionContentListItemKeys = [1, 2, 3];

/** Mock data for accordion content custom subtext
* (found in Docs & Processing UNACTIVE case) */
const customSubTextInfo = 'Keep an eye on your To Do list for additional required documentation.';
/** Helper to determine if mock list item should show
* custom subtext in accordion content */
export const mockListItemHasCustomSubtext = (dataItemKey: string, listItemKey: number): boolean =>
























{customSubTextInfo}
</SCDocumentUploadCustomSubTextWrapper>
) : undefined,
})
),
},
})
);
