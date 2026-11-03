import React from 'react';
import { AuthorizationContext as AuthorizationContextShared } from 'commonui-shared';

























```typescript`
import { createContext } from 'react';

/** Using any type for now for flexibility, will try to replace with typescript Generics later */
export interface IDynamicFormDataContext {
data: any;
}

/**
* React Context allowing for custom data to be passed to the DynamicForm from other applications
* E.G. AOXUI will use this to pass selected account data to the Multi Percentage Allocation component
* This context has a separate instance between federated modules.
*/
export const DynamicFormDataContext = createContext({
data: {},
} as IDynamicFormDataContext);
