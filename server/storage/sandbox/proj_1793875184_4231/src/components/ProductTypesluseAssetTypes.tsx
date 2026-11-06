import { makeStyles } from '@material-ui/core';
import { default as styles  from 'assets/jss/material-dashboard-pro-react/views/regularFormsstyle';
import { useConfirmModal } from 'commonui';
import { useAppContext } from 'context/app-context';
import { v4 as uuid } from 'uuid';
import { useEffect, useState } from 'react';
import { client2 } from 'utils/api-client';
import { Expiration, AssetCategory, AssetType, ResourceType } from './types';
import {
BlockerFunction,
useBlocker,
useNavigate,
useParams,
} from 'react-router-dom';

const useAssetTypes = () => {
const useStyles = makeStyles(styles);
const confirm = useConfirmModal();
const documentUploadTypeId = 1;
const [resourceTypes, setResourceTypes] = useState<ResourceType[]>([]);
const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
const [expirations, setExpirations] = useState<Expiration[]>([]);
const [originalAssetCategories, setOriginalAssetCategories] = useState<
AssetCategory[]
  >{[]];
const [productSubTypes, setProductSubTypes] = useState<string[]>([]);
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const classes = useStyles();
const titleList = new Map();
const { setPageTitle, setDisplayCreateButton, tenant } = useAppContext();
const params = useParams();
const productType = (params as any).productType;
const tenantId = (params as any).tenantId;

  const generateNewId = (): string => {
return `new-${uuid()}`;
};
const isNewId = (id: string): boolean => {
return id.includes('new');
};
const groupAssetTypes = (assetTypes: AssetType[]) => {
const result: AssetCategory[] = [];
assetTypes.forEach((assetType: AssetType) => {
let category = result.find((c) => c.id === assetType.assetCategoryId);
if (!category) {
category = {
assetTypes: [],
name: assetType.assetCategory,
description: assetType.assetCategoryDescription,
id: assetType.assetCategoryId,
productType: assetType.productType,
productSubTypes: assetType.assetCategoryProductSubTypes,
nameAlreadyUsed: false,
};
result.push(category);
}

      category.assetTypes.push(assetType);
    }};
return result;
};

  const onRouteChange: BlockerFunction = (): boolean => {
if (
JSON.stringify(assetCategories) ===
JSON.stringify(originalAssetCategories)
    ] {
return true;
}

    return false;
};

  const push = useNavigate();
const blocker = useBlocker(onRouteChange);

  const discardChangesWarning = (): any => {
return discardChangesWarningCompareLists(
assetCategories,
originalAssetCategories,
    ];
};

  useEffect(() => {
if (blocker.state === 'blocked') {
confirm({
title: 'Discard Changes?',
onContinueBtnClick: () => blocker.proceed(),
onExit: () => blocker.reset(),
onCloseButtonClick: () => blocker.reset(),
body: 'Your changes will be lost!',
continueBtnText: 'Yes, Discard!',
cancelBtnText: 'Cancel',
      }];
}
}, [blocker.state]);

  const discardChangesWarningCompareLists = (
assetCategories: AssetCategory[],
originalAssetCategories: AssetCategory[],
): void => {
if (
JSON.stringify(assetCategories) ===
JSON.stringify(originalAssetCategories)
    ] {
goToParentPage();
return;
}
confirm({
title: 'Discard Changes?',
onContinueBtnClick: () => goToParentPage(),
body: 'Your changes will be lost!',
continueBtnText: 'Yes, Discard!',
cancelBtnText: 'Cancel',
    }};
};

  useEffect(() => {
setDisplayCreateButton(false);
setLoading(true);
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(
`Task and Asset Configuration > `,
`/admin/tenant/${tenantId}/product-types`,
    ];
titleList.set(
`Asset Configuration for ${productType} products`,
`/admin/tenant/${tenantId}/product-types/${productType}/asset-types`,
    ];
setPageTitle(titleList);
Promise.all([
client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}resource-types/Loan Application`,
      ],
client2(`${process.env.REACT_APP_RESOURCE_API_BASE_URL}expirations`),
client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-types/${productType}`,
'GET',
{ headers: { 'X-TENANT-ID': tenantId } },
      ],
client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}tenant-core-product-templates`,
'GET',
{ headers: { 'X-TENANT-ID': tenantId } },
      ],
    ]}
.then(
        [[
resourceTypesResponse,
expirationsResponse,
assetTypesResponse,
tenantCoreProductTemplates,
]) => {
setResourceTypes([...resourceTypesResponse.payload]);

          setExpirations([...expirationsResponse.payload]);

          const groupedAssetTypes = groupAssetTypes(assetTypesResponse.payload);
setAssetCategories(groupedAssetTypes);
setOriginalAssetCategories(
JSON.parse(JSON.stringify(groupedAssetTypes)),
          };

          const allProductTypes = tenantCoreProductTemplates.payload
.filter((t: any) => t.type === productType)
.map((t: any) => t.subtype);
const uniqueProductTypes = allProductTypes.filter(
(value: any, index: number, array: string[]) =>
array.indexOf(value) === index,
          };
setProductSubTypes(uniqueProductTypes);

          setLoading(false);
},
      ]
.catch((e) => {
setLoading(false);
setErrorResponse(e);
      }];
}, []);

  const goToParentPage = (): void => {
push(`/admin/tenant/${tenantId}/product-types/`);
};

  const removeAssetType = (
resourceCategory: AssetCategory,
assetType: AssetType,
): void => {
resourceCategory.assetTypes = resourceCategory.assetTypes.filter(
(e: AssetType) => e !== assetType,
    ];
setAssetCategories([...assetCategories]);
};

  const removeCategory = (resourceCategory: AssetCategory): void => {
const onContinue = () => {
const res = assetCategories.filter(
(e: AssetCategory) => e !== resourceCategory,
      ];
updateCategoriesNameAlreadyUsed(res);
setAssetCategories([...res]);
};

    if (resourceCategory.assetTypes.length === 0) {
onContinue();
return;
} else {
confirm({
title: 'Delete Category with All Asset Types?',
onContinueBtnClick: () => onContinue(),
body: 'The category contains asset types. Would you like to delete it?',
continueBtnText: 'Yes, Delete!',
cancelBtnText: 'Cancel',
      }];
}
};

  const saveChanges = async (): Promise<any> => {
const validated = assetCategories.map((category) => ({
...category,
isValidated: true,
assetTypes: category.assetTypes.map((at) => ({
...at,
isValidated: true,
      }]},
    }}];
setAssetCategories([...validated]);
if (
assetCategories.find(
(c) => c.assetTypes.length === 0 || c.name === '' || c.nameAlreadyUsed,
) ||
assetCategories
.flatMap((c) => c.assetTypes)
.find(
(assetType: AssetType) =>
assetType.title === '' ||
assetType.resourceTypeId === undefined ||
assetType.expirationValueInvalid ||
assetType.expirationValueRequired ||
assetType.expirationIdRequired,
        }
    ] {
return;
}

    setLoading(true);

    try {
await saveCategoryChanges();
await saveAssetTypeChanges();
goToParentPage();
setLoading(false);
} catch (e) {
setErrorResponse(e as any);
}
};

  const saveCategoryChanges = async () => {
const categoryIdsToDelete = originalAssetCategories
.map((t: AssetCategory) => t.id)
.filter(
(assetTypeId: string) =>
assetCategories
.map((t: AssetCategory) => t.id)
.indexOf(assetTypeId) === -1,
      ];

    const updateDeletePromises: Promise<void>[] = categoryIdsToDelete.map(
(categoryId: string) => {
return client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-categories/${categoryId}`,
'DELETE',
{
headers: { 'X-TENANT-ID': tenantId },
},
        };
},
    ];

    // Delete removed categories
await Promise.all(updateDeletePromises);

    // Update changed categories
await Promise.all(
assetCategories
.filter((category) => !isNewId(category.id))
.map((category) => {
const originalCategory = originalAssetCategories.find(
(t: AssetCategory) => t.id === category.id,
          };

          if (
originalCategory?.name !== category.name ||
originalCategory?.description !== category.description ||
category.productSubTypes.length !==
originalCategory?.productSubTypes?.length ||
category.productSubTypes.find(
(item, index) => item !== originalCategory.productSubTypes[index],
            }
          } {
return client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-categories/${category.id}`,
'PUT',
{
body: category,
headers: { 'X-TENANT-ID': tenantId },
},
            };
}
        }],
    ];

    // create new categories
const createdCategories: AssetCategory[] = (
await Promise.all(
assetCategories
.filter((category) => isNewId(category.id))
.map((category) =>
client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-categories`,
'POST',
{
body: category,
headers: { 'X-TENANT-ID': tenantId },
},
            },
          },
      ]
).map((item: any) => item.payload);

    assetCategories
.filter((c) => isNewId(c.id))
.forEach((c) => {
c.id = createdCategories.find(
(createdCategory) => createdCategory.name === c.name,
)?.id as string;
c.assetTypes.forEach((a) => (a.assetCategoryId = c.id));
      }];
};

  const saveAssetTypeChanges = async () => {
const originalAssetTypes = originalAssetCategories.flatMap(
(c) => c.assetTypes,
    ];
const assetTypes = assetCategories.flatMap((c) => c.assetTypes);
const assetTypeIdsToDelete = originalAssetTypes
.map((t: AssetType) => t.id)
.filter(
(assetTypeId: string) =>
assetTypes.map((t: AssetType) => t.id).indexOf(assetTypeId) === -1,
      ];

    const promises: Promise<void>[] = assetTypeIdsToDelete.map(
(assetTypeId: string) => {
return client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-types/${assetTypeId}`,
'DELETE',
{
headers: { 'X-TENANT-ID': tenantId },
},
        };
},
    ];

    assetTypes.forEach((assetType: AssetType) => {
if (isNewId(assetType.id)) {
promises.push(
client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-types`,
'POST',
{
body: assetType,
headers: { 'X-TENANT-ID': tenantId },
},
          },
        };
} else {
const originalAssetType = originalAssetTypes.find(
(t: AssetType) => t.id === assetType.id,
        };
if (JSON.stringify(originalAssetType) !== JSON.stringify(assetType)) {
promises.push(
client2(
`${process.env.REACT_APP_RESOURCE_API_BASE_URL}asset-types/${assetType.id}`,
'PUT',
{
body: assetType,
headers: { 'X-TENANT-ID': tenantId },
},
            },
          };
}
}
    }};
await Promise.all(promises);
};

  const addAssetType = (category: AssetCategory): void => {
category.assetTypes.push({
id: generateNewId(),
title: '',
assetCategoryId: category.id,
resourceTypeId: undefined,
isSingleUse: false,
expirationValue: undefined,
expirationId: undefined,
productType: productType,
expirationValueRequired: true,
assetCategory: '',
tenantId: '',
} as AssetType);
setAssetCategories([...assetCategories]);
};

  const addAssetCategory = (): void => {
assetCategories.push({
id: generateNewId(),
name: '',
description: '',
productType: productType,
productSubTypes: [],
assetTypes: [],
nameAlreadyUsed: false,
} as AssetCategory);
setAssetCategories([...assetCategories]);
};

  const updateCategoriesNameAlreadyUsed = (
categories: AssetCategory[],
changedCategoryId?: string,
): void => {
categories.forEach((category) => {
if (category.id === changedCategoryId) {
category.nameAlreadyUsed =
categories.filter(
(c) => c.name.toLowerCase() === category.name.toLowerCase(),
).length > 1;
} else {
if (
categories.filter(
(c) => c.name.toLowerCase() === category.name.toLowerCase(),
).length === 1
        } {
category.nameAlreadyUsed = false;
}
}
    }};
};

  return {
resourceTypes,
assetCategories,
setAssetCategories,
expirations,
loading,
errorResponse,
documentUploadTypeId,
classes,
saveChanges,
addAssetCategory,
addAssetType,
goToParentPage,
removeAssetType,
removeCategory,
originalAssetCategories,
discardChangesWarning,
updateCategoriesNameAlreadyUsed,
productSubTypes,
};
};

export { useAssetTypes };
