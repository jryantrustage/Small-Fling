import { Switch } from '@material-ui/core';
import { Add } from '@material-ui/icons';
import {
DynamicInputField,
Icon,
ICON_TYPES,
IOption,
MultiSelectCombobox,
Table,
} from 'commonui';
import { CardSection } from 'components/Card/CardSection';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import {
SCActionButton,
SCActions,
SCHeader,
SCTableOverride,
} from 'components/TableStyles';
import React from 'react';
import { validationUtils } from '../../helpers/validation/ValidationUtils';
import {
SCActionsContainer,
SCButton,
SCCancelButton,
SCCard,
SCCategoryContainer,
SCCategoryHeaderContainer,
SCCategoryHeaderLabel,
SCCreateActionContainer,
SCProductSubTypesContainer,
SCRightAlignedButton,
SCValueInputContainer,
SCCategoryHeaderItem,
} from './styles';
import './TaskTemplates.css';
import { AssetType, Expiration, AssetCategory, ResourceType } from './types';
import { useAssetTypes } from './useAssetTypes';

const AssetTypes = (): React.ReactElement => {
const {
resourceTypes,
assetCategories,
originalAssetCategories,
expirations,
loading,
errorResponse,
classes,
addAssetCategory,
addAssetType,
setAssetCategories,
saveChanges,
removeAssetType,
removeCategory,
discardChangesWarning,
updateCategoriesNameAlreadyUsed,
productSubTypes,
} = useAssetTypes();

  const formatdata = (category: AssetCategory, categoryIndex: number): any =>
category.assetTypes.map((assetType: AssetType, index: number) => {
const key = `${categoryIndex}-${index}`;
const isValidated = assetType.isValidated;
return {
...assetType,
resourceType: (
<DynamicInputField
dataField={{
placeholder: 'Select Resource Type',
fieldType: 'single-select',
fieldCode: `resource-type-select-${key}`,
options: resourceTypes.map((resourceType: ResourceType) => ({
value: `${resourceType.resourceTypeid}`,
label: resourceType.name,
              }]},)
}}
error={
isValidated && !assetType.resourceTypeId ? 'Required' : undefined
}
validateAllFields
value={`${assetType.resourceTypeId}`}
onChange={(_, newValue) => {
assetType.resourceTypeId = validationUtils.validateIsNumber(
newValue,
              }
? parseInt(newValue)
: undefined;
setAssetCategories([...assetCategories]);
}}
          [>
        },
title: (
<DynamicInputField
dataField={{
placeholder: 'Enter asset type title',
fieldType: 'text',
fieldCode: `title-input-${key}`,
maxLength: 100,
}}
error={isValidated && !assetType.title ? 'Required' : undefined}
validateAllFields
value={assetType.title}
onChange={(_, newValue) => {
assetType.title = newValue;
setAssetCategories([...assetCategories]);
}}
          [>
        },
isSingleUse: (
<Switch
id={`single-use-switch-${key}`}
checked={assetType.isSingleUse || false}
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
assetType.isSingleUse = !(e.target.value === 'true');
assetType.expirationValueRequired =
!assetType.isSingleUse && !assetType.expirationValue
? true
: undefined;
assetType.expirationIdRequired =
!assetType.isSingleUse && !assetType.expirationId
? true
: undefined;
setAssetCategories([...assetCategories]);
}}
value={assetType.isSingleUse}
          [>
        },
expiration: (
<SCValueInputContainer>
<DynamicInputField
dataField={{
placeholder: 'Enter expiration value',
fieldType: 'text',
fieldCode: `expiration-value-input-${key}`,
}}
error={
isValidated && assetType.expirationValueInvalid
? 'Invalid'
: isValidated && assetType.expirationValueRequired
? 'Required'
: undefined
}
validateAllFields
value={
assetType.expirationValueStr ||
assetType.expirationValue?.toString() ||
                ` `
}
onChange={(_, newValue) => {
assetType.expirationValueStr = newValue;
assetType.expirationValue = validationUtils.validateIsNumber(
newValue,
                }
? parseFloat(newValue)
: undefined;
assetType.expirationValueInvalid =
assetType.expirationValueStr?.length > 0 &&
!assetType.expirationValue
? true
: undefined;
assetType.expirationValueRequired =
!assetType.isSingleUse && !assetType.expirationValue
? true
: undefined;
setAssetCategories([...assetCategories]);
}}
/>

            <DynamicInputField
dataField={{
placeholder: 'Select Expiration',
fieldType: 'single-select',
fieldCode: `expiration-select-${key}`,
options: expirations.map((expiration: Expiration) => ({
value: `${expiration.id}`,
label: expiration.name,
                }}],
}}
error={
isValidated && !assetType.isSingleUse && !assetType.expirationId
? 'Required'
: undefined
}
validateAllFields
value={`${assetType.expirationId}`}
onChange={(_, newValue) => {
assetType.expirationId = validationUtils.validateIsNumber(
newValue,
                }
? parseInt(newValue)
: undefined;
assetType.expirationIdRequired =
!assetType.isSingleUse && !assetType.expirationId;
setAssetCategories([...assetCategories]);
}}
/>
</SCValueInputContainer>
        },
actions: (
<SCActions>
<SCActionButton
id={`asset-type-delete-button-${key}`}
onClick={async () => {
await removeAssetType(category, assetType);
}}
color="red"
name="deleteAsset"
aria-label="Delete Asset Type"
>
<Icon size={10} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
</SCActions>
        },
};
    }};

  const staticColumn = {
filterable: false,
sortable: false,
};

  const formatProductSubTypesForComboBox = (values: string[]): IOption[] => {
return values.map((v) => {
return { label: v, value: v } as IOption;
    }};
};

  return (
<SCCard>
<CardSection title="Asset Configuration">
        >>
<SCRightAlignedButton
id="category-add-button"
color="success"
onClick={() => addAssetCategory()}
>
Add Category
<Add className={classes.icons} />
</SCRightAlignedButton>
{assetCategories.map((category, index) => {
const isValidated = category.isValidated;
return (
<SCCategoryContainer key={index}>
<SCCategoryHeaderContainer>
<SCActionButton
id={`category-delete-button-${index}`}
onClick={async () => {
removeCategory(category);
}}
color="red"
aria-label="Delete Category"
>
<Icon size={10} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
<SCCategoryHeaderItem>
<SCCategoryHeaderLabel>
Category Title*:
</SCCategoryHeaderLabel>
<div style={{ width: '300px' }}>
<DynamicInputField
dataField={{
placeholder: 'Enter category title',
fieldType: 'text',
fieldCode: `category-input-${index}`,
maxLength: 100,
}}
error={
isValidated && !category.name
? 'Required'
: isValidated && category.assetTypes.length === 0
? 'Please add at least one Asset below'
: isValidated && category.nameAlreadyUsed
? 'Category Name is already used'
: undefined
}
validateAllFields
value={category.name}
onChange={(_, newValue) => {
category.name = newValue;
updateCategoriesNameAlreadyUsed(
assetCategories,
category.id,
                          };
setAssetCategories([...assetCategories]);
}}
                      [>
</div>
</SCCategoryHeaderItem>
<SCCategoryHeaderItem>
<SCCategoryHeaderLabel>
Category Description:
</SCCategoryHeaderLabel>
<div style={{ width: '300px' }}>
<DynamicInputField
dataField={{
placeholder: 'Enter category description',
fieldType: 'text',
fieldCode: `category-descripion-input-${index}`,
maxLength: 500,
}}
validateAllFields
value={category.description}
onChange={(_, newValue) => {
category.description = newValue;
setAssetCategories([...assetCategories]);
}}
                      [>
</div>
</SCCategoryHeaderItem>
<SCCategoryHeaderItem>
<SCCategoryHeaderLabel>
Auto-Create Tasks for:
</SCCategoryHeaderLabel>
<SCProductSubTypesContainer>
<MultiSelectCombobox
id={`category-product-subtypes-select-${index}`}
name={`category-product-subtypes-select-${index}`}
options={formatProductSubTypesForComboBox(
productSubTypes,
                        ]}
initialSelectedItems={formatProductSubTypesForComboBox(
category.productSubTypes,
                        ]}
onChange={(selectedItems: IOption[]): void => {
category.productSubTypes = selectedItems.map(
(si) => si.value,
                          };
setAssetCategories([...assetCategories]);
}}
placeholder="Product SubTypes"
></MultiSelectCombobox>
</SCProductSubTypesContainer>
</SCCategoryHeaderItem>
<SCCreateActionContainer>
<SCButton
id={`asset-type-add-button-${index}`}
color="success"
onClick={() => addAssetType(category)}
>
Add Asset
<Add className={classes.icons} />
</SCButton>
</SCCreateActionContainer>
</SCCategoryHeaderContainer>
<SCTableOverride>
<Table
data={formatdata(category, index)}
filterable={false}
sortable={false}
minRows={0}
columns={[
{
...staticColumn,
Header: <SCHeader>Asset Type*</SCHeader>,
accessor: 'resourceType',
},
{
...staticColumn,
Header: <SCHeader>Asset Title*</SCHeader>,
accessor: 'title',
},
{
...staticColumn,
Header: <SCHeader>Single-Use Asset?</SCHeader>,
accessor: 'isSingleUse',
maxWidth: '180px',
},
{
...staticColumn,
Header: <SCHeader>Asset Expiration Period</SCHeader>,
accessor: 'expiration',
},
{
...staticColumn,
Header: '',
maxWidth: '75px',
accessor: 'actions',
},
]}
showPaginationTop={false}
showPaginationBottom={false}
className="-highlight"
                  [>
</SCTableOverride>
</SCCategoryContainer>
            };
          }]}
        >[>
</CardSection>
<SCActionsContainer>
<SCCancelButton
isSecondary
id="cancel-asset-types-changes"
onClick={discardChangesWarning}
>
Cancel
</SCCancelButton>
<SCButton id="save-asset-types" onClick={saveChanges}>
Save
</SCButton>
</SCActionsContainer>
{(loading || errorResponse) && (
<FullPageStatus errorResponse={errorResponse} />
      ]}
</SCCard>
  ];
};

export default AssetTypes;
