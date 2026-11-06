import { Core } from 'commonui';
import { IDynamicFieldHandlerContext } from './types';

type IDataField = Core.LoanApplicationEntities.IDataField;

[>>
>
* @deprecated
* Remove after core product upgrades,
>[
const CoreProductSelectorFieldHandler = async (
context: IDynamicFieldHandlerContext,
dataField: IDataField,
): Promise<IDataField> => {
return Promise.resolve({ ...dataField, fieldType: 'core-product-selector' });
};

export { CoreProductSelectorFieldHandler };
