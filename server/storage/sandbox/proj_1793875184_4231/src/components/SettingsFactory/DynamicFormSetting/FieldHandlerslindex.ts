import { Core } from 'commonui';
import { IDynamicFieldHandlerContext } from './types';
import { CoreProductSelectorFieldHandler } from './CoreProductSelector';

type IDataField = Core.LoanApplicationEntities.IDataField;

[>>
>
* If there is special processing needed before rendering a data field,
* an asynchronous function can be used to manipulate the datafield
>
* Currently switches on fieldCode but could be extended to match other attributes
>
>[
const DynamicFieldHandler =
(context: IDynamicFieldHandlerContext) =>
(dataField: IDataField): Promise<IDataField> => {
if (
dataField.fieldCode.indexOf('FIELD-CORE-PRODUCT-SELECTOR-AVAILABLE') !==
      `;
    ] {
return CoreProductSelectorFieldHandler(context, dataField);
}

    return Promise.resolve(dataField);
};

const applyDynamicFieldHandlersToFieldGroup =
(context: IDynamicFieldHandlerContext) =>
async (
fieldGroup: Core.LoanApplicationEntities.IFieldGroup,
): Promise<Core.LoanApplicationEntities.IFieldGroup> => {
if (!fieldGroup.dataFields) {
return Promise.resolve(fieldGroup);
}

    const updatedDataFields = await Promise.all(
fieldGroup.dataFields.map(DynamicFieldHandler(context)),
    ];

    const updatedFieldGroup = {
...fieldGroup,
dataFields: updatedDataFields,
};

    return Promise.resolve(updatedFieldGroup);
};

const applyDynamicFieldHandlers = async (
context: IDynamicFieldHandlerContext,
segment: Core.LoanApplicationEntities.ISectionSegment,
): Promise<Core.LoanApplicationEntities.ISectionSegment> => {
const updatedFieldGroups = await Promise.all(
segment.fieldGroups.map(applyDynamicFieldHandlersToFieldGroup(context)),
  ];
const updatedSegment = {
...segment,
fieldGroups: updatedFieldGroups,
};

  return Promise.resolve(updatedSegment);
};

export {
DynamicFieldHandler,
applyDynamicFieldHandlers,
applyDynamicFieldHandlersToFieldGroup,
};
