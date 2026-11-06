export interface TaskType {
id: number;
name: string;
}

export interface TaskTemplate {
id: string;
typeId?: number;
tenantId: string;
title: string;
description: string;
productType: string;
}

export interface ResourceType {
resourceTypeid: number;
name: string;
}

export interface AssetType {
id: string;
assetCategoryId: string;
assetCategory: string;
assetCategoryDescription: string;
assetCategoryProductSubTypes: string[];
resourceTypeId?: number;
productType: string;
tenantId: string;
title: string;
isSingleUse: boolean;
expirationValueStr?: string;
expirationValue?: number;
expirationId?: number;
expirationValueInvalid?: boolean;
expirationValueRequired?: boolean;
expirationIdRequired?: boolean;
isValidated?: boolean;
}

export interface AssetCategory {
id: string;
name: string;
description: string;
productType: string;
productSubTypes: string[];
assetTypes: AssetType[];
nameAlreadyUsed: boolean;
isValidated?: boolean;
}

export interface Expiration {
id: number;
name: string;
}
