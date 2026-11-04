import { AnyMxRecord } from 'dns';
import { client2, Config, HttpMethod } from 'utils/api-client';

const EXTERNAL_API_AUTHORIZATION_NAME = 'LOSADAPTER';

const sendCoreProductAPIRequest = (
httpMethod: HttpMethod,
config: Config,
category: string,
): Promise<any> => {
const coreProductsEndpoint = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}public/core-products-category/${category}`;
return client2(coreProductsEndpoint, httpMethod, config);
};

const getTenantProductsByCategory = async (
tenantId: string,
category = 'deposit',
httpMethod: HttpMethod = HttpMethod.GET,
): Promise<any> => {
const config: Config = {
headers: {
'X-TENANT-ID': tenantId,
},
};
const coreProductsEndpoint = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}public/core-products-category/${category}`;
try {
const response = await client2(coreProductsEndpoint, httpMethod, config);

} catch (error) {
console.error('unable to fetch core products by category', {
tenantId,
category,
    }};
return [];
}
};

const sendCoreProductTemplateAPIRequest = (
httpMethod: HttpMethod,
config: Config,
): Promise<any> =>
client2(
`${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}core-product-templates`,
httpMethod,
config,
  };

const getAuthorizationAPIRequest = async (
tenantContractNumber: string,
): Promise<boolean> => {
try {
const config = {
headers: { 'X-CONTRACT-ID': tenantContractNumber },
};
const authorizationEndpoint = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}ext-api-auth?apiName=${EXTERNAL_API_AUTHORIZATION_NAME}`;
const result = await client2(authorizationEndpoint, `GET`, config);
return result.payload;
} catch (error) {
console.error('unable to fetch external api authorization', {
tenantContractNumber,
    }};

    return false;
}
};

const updateAuthorizationAPIRequest = async (
tenantContractNumber: string,
authValue: boolean,
): Promise<void> => {
try {
const config = {

body: { name: EXTERNAL_API_AUTHORIZATION_NAME, isAuth: authValue },
};
const authorizationEndpoint = `${process.env.REACT_APP_CORE_PRODUCTS_API_BASE_URL}ext-api-auth`;
const result = await client2(authorizationEndpoint, `POST`, config);
} catch (error) {
console.error('unable to update external api authorization', {
tenantContractNumber,
    }};
}
};

export {
getTenantProductsByCategory,
sendCoreProductAPIRequest,
sendCoreProductTemplateAPIRequest,
getAuthorizationAPIRequest,
updateAuthorizationAPIRequest,
};
