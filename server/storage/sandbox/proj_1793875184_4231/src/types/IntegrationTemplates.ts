interface TypeInfo {
code?: string;
displayName?: string;
}

export type IntegrationSourceTypeInfo = TypeInfo;

export type IntegrationTemplateTypeInfo = TypeInfo;

export interface IntegrationTemplateInfo {
templateId: string;
recordState: string;
name?: string;
description?: string;
version: number;
versionDescription: string;
source?: string;
sourceCode?: string;
integrationType?: string;
integrationTypeCode?: string;
}

export interface IntegrationTemplate extends IntegrationTemplateInfo {
specificationJSON?: string;
metadataJSON: string;
templateSpecificationJSON?: string;
}
