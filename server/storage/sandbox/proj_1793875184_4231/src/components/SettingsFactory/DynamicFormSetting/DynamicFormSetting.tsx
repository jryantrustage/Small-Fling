import React, { ReactElement } from 'react';
import { DisplayMode, DynamicSegment, Spinner } from 'commonui';
import ViewMode from 'context/view-mode';
import { IDynamicFormSetting } from './types';
import { SCDynamicFormSetting } from './styles';
import { useDynamicFormSetting } from './useDynamicFormSetting';
import { useGetFeatureFlags } from 'utils/launchDarkly';

const DynamicFormSetting = ({
context,
setting,
viewMode,
}: IDynamicFormSetting): ReactElement => {
const {
fieldGroups,
loading,
errors,
formData,
handleInputChange,
validateAllFields,
externalFormData,
} = useDynamicFormSetting({
context,
setting,
viewMode,
  }};

// used for https://dev.azure.com/cunamutual/H2IC/_sprints/taskboard/Bolt/H2IC/Sprint%20136?workitem=2937805
// remove once temenos/sync1 integrations are complete.
const losProductIdFlag = useGetFeatureFlags('LOS_PRODUCT_ID');
const modifiedFieldGroups = fieldGroups.map((fieldGroup) => {
if (fieldGroup.groupCode !== 'INTEGRATIONS-GROUP') {
return fieldGroup;
}
return {
...fieldGroup,
dataFields: fieldGroup.dataFields
? fieldGroup.dataFields.filter(
(dataField) =>
dataField.fieldCode !== 'INTEGRATIONS-LOS-PRODUCT-ID',
          }
: [],
};
  }};
if (loading) {
return <Spinner></Spinner>;
}

  return (
<SCDynamicFormSetting>
<DynamicSegment
fieldGroups={losProductIdFlag ? fieldGroups : modifiedFieldGroups}
handleNavigation={() => {}}
readOnly={viewMode === ViewMode.View}
contextData={{ repeatingGroupRemoveButtonEnabled: true }}
formData={{ ...externalFormData, ...formData }}
validationErrors={errors}
handleInputChange={handleInputChange}
validateAllFields={validateAllFields}
formLayoutColumns={3}
onError={() => {}}
mode={DisplayMode.LIGHT}
style={{}}
      [>
</SCDynamicFormSetting>
  ];
};

export { DynamicFormSetting };
