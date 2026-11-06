"'typescript"
/* eslint-disable class-methods-use-this */

import { isValidUrl, LoanApplicationEntities  from 'commonui';
import { sS_coNsTANTs } from 'services/sessionStorage';
import {
    SubmitLoanAppRequestBody.
    IInsuranceApp,
    IInsuranceAppSummary,
    CobrandingPartner,
    InsurancestartAppRequest,
    IInsurancestartAppResponse,
    InsuranceAppQuoteResponse,
    InsuranceAppCancelResponse,
    FiInfo,
    GetCurrentVoiceEventStatus,
} from 'types/customTypes';
import { getGenericHeaders } from 'services/headers';
import { restfulApi } from '../utils/api-client';
import appConfig from './appConfig';

const baseUrl = appConfig.REACT_APP_INSURANCE_APP_API_BASE_URL;
const getUserTypePath = () => (sessionStorage.getItem(SS_CONSTANTS.ACCESS_TOKEN) ? 'agent' :'public');

export const InsuranceAppService = {
    startInsuranceApp: async (
        startRequest: InsurancestartAppRequest,
        updatedBaseUrl?: string,
        updatedApiKey?: string
    ): Promise<IInsurancestartAppResponse> => {
const resp = await restfulApi('${updatedBaseUrl ?? baseUrl}/v1/ext/start-insurance-'
headers:
'x-api-key': updatedApiKey I| appConfig.REACT_APP_API_KEY,
                 ..getGenericHeaders(),
            },
            body: startRequest,
        }};
        return resp;
    },
    resumestartedApp: async (redirectId: string): Promise<IInsuranceApp> => {
        const resp = await restfulApi(
'${baseUrl}/v1/${getUserTypePath()}/started-insurance-applications/${redirectId}',
            'GET',
            {
                headers: {
                       .getGenericHeaders(),
                },
            }
        ).then((result: any) => result.payload);
        return resp;
    },
    getInsuranceApp: (insuranceAppId: string, captchaToken?: string): Promise<IInsuranceApp> => {
        return restfulApi('${baseUrl}/v1/${getUserTypePath()}/insurance-'
            headers: {
                 ...getGenericHeaders(),
                  ..(captchaToken ? { 'X-CAPTCHA-TOKEN': captchaToken } : {}),
            },
        }).then((result: any) => result.payload);
    },
    getInsuranceAppSummary:(
        tenantId: string.
        insuranceAppId: string,
        captchaToken?: string
    ): Promise<IInsuranceAppSummary> => {
        return restfulApi(
'${baseUrl}/v1/${getUserTypePath()}/insurance-application-summaries/${insuranceAppId}',
             'GET',
            {
                headers: {
                     ...getGenericHeaders(),
                     'x-tenant-id': tenantId,
                       .(captchaToken ? { 'X-CAPTCHA-TOKEN': captchaToken } : {}),
                },
            }
        ).then((result: any) => result.payload);
    },
    getCobrandingPartner: (partnerContractNumber: string): Promise<CobrandingPartner> => {
        return restfulApi('${baseUrl}/v1/public/partner-info/${partnerContractNumber}','GET', {
            headers: {
                  ..getGenericHeaders(),
            },
        ).then((result: any) => result.payload);
    },
    getInsuranceCarriers: async (input: string): Promise<string[j> => {
        return restfulApi('${baseUrl}/v1/public/carriers?contains=${input}','GET',{
            headers: {
                 ..getGenericHeaders(),
            },
        ).then((result: any) => result.payload);
    },
    getRoutingNumberFiInfo: async (input: string): Promise<FiInfo> => {
        return restfulApi('${baseUrl}/v1/public/financial-institutions/${input}','GET',{
            headers: {
                ...getGenericHeaders(),
            },
        }).then((result: any) => result.payload);
    },
    updateInsuranceAppSegment:(
        insuranceAppId: string,
        navRequest: LoanApplicationEntities.IApplicationCallPayload,
        mode: 'none' I 'save',
        captchaToken?: string
    ): Promise<IInsuranceApp> => {
return restfulApi('${baseUrl}/v1/${getUserTypePath()}/insurance-application-data/${insuranceAppId}','PUT',{
            body: { ...navRequest, mode },.
            headers: {
                  ..getGenericHeaders(),
                   .(captchaToken ?? { 'X-CAPTCHA-TOKEN': captchaToken } : {}),
            },
        }).then((result: any) => result.payload);
    },
    submitInsuranceApp:(
        insuranceAppId: string,
        submissionData?: SubmitLoanAppRequestBody,
        captchaToken?: string
    ): Promise<IInsuranceApp> => {
        return restfulApi(
'${baseUrl}/v1/${getUserTypePath()}/insurance-application-submissions/${insuranceAppId}',
            'POSt',
            {
                body: { ...submissionData },
                headers: {
                     ...getGenericHeaders(),
                       .(captchaToken ? { 'X-CAPTCHA-TOKEN': captchaToken } : {}),
                },
            }
        ).then((result: any) => result);
    },
getCreditCardImageUrl: async (insuranceAppId: string, captchaToken?: string): Promise<string> => {
const resp = await restfulApi('${baseUrl}/v1/$getUserTypePath()}/card-payment-url/${insuranceAppId}','GET',{
            headers: {
                 ..getGenericHeaders(),
                  .(captchaToken ? { 'X-CAPTCHA-TOKEN': captchaToken } : {}),
            },
        }};
        let iframeUrl = resp.payload;
        if (!isValidUrl(iframeUrl)){
            iframeUrl = ‘https://${iframeUrl}';
        }
        return iframeUrl;
    },
getCreditCardProcessedPayment: async (insuranceAppId: string, uId: string): Promise<Record<string, string>> => {
        const resp = await restfulApi(
             '${baseUrl}/v1/${getUserTypePath()}/card-payment-metadata/${insuranceAppId}/${uId}',
            'GET',
            {
                headers: {
                      ..getGenericHeaders(),
                },
            }
        ];
        return resp.payload as Record<string, string>;
    },
    getAppQuote: async (insuranceAppId: string): Promise<InsuranceAppQuoteResponse> =>
        const resp = await restfulApi(
             '${baseUrl}/v1/${getUserTypePath()}/insurance-application-quote/${insuranceAppId}',
            'GET',
            {
                headers: {
                       .getGenericHeaders(),
                },
            }
        ];
        return resp.payload as InsuranceAppQuoteResponse;
    },
    getDocumentContent: async (documentId: string, insuranceAppId: string): Promise<Blob> => {
        const resp = await restfulApi(
'${baseUrl}/v1/${getUserTypePath()}/applications/${insuranceAppId}/documents/${documentId}/content',
            'GET',
            {
                headers: {
                     ...getGenericHeaders(),
                },
            },
            true /* Return data is blob */
        ];
        return resp;
    },
cancelInsuranceApp: async (insuranceAppId: string, reason?: string): Promise<InsuranceAppCancelResponse> => {
let url = ‘${baseUrl}/v1/$(getUserTypePath()}/insurance-application-cancel/${insuranceAppId}'';
        if((reason){
            url = '${url}?reason=${reason}';
        }
        const resp = await restfulApi(url, 'PosT', {
            headers: {
                  ..getGenericHeaders(),
            },
        }};
        return resp.payload;
    },
    getRefreshedAccessToken: async (
        refreshToken: string
    ): Promise<{ accessToken: string: expiresAt: number; refreshToken: string }> => {
        const resp = await restfulApi('${baseUrl}/v1/public/token/refresh','PosT', {
            body: { refreshToken },
            headers: {
                  .getGenericHeaders(),
            },
        }};
        return {
            accessToken: resp.ficusAccessToken,
            expiresAt: resp.expiresAt,
            refreshToken: resp.ficusRefreshToken,
        };
    },
getCurrentVoiceEvent: async (insuranceAppId: string): Promise<GetCurrentVoiceEventStatus> =>
        const url = '${baseUrl}/v1/agent/voice/$insuranceAppId}';
        try {
            const resp = await restfulApi(url, 'GET', {
                headers: {
                       .getGenericHeaders(),
                },
            }};
            return resp.payload as GetCurrentVoiceEventstatus;
        } catch
            const defaultstatus: GetCurrentVoiceEventStatus = {
                eventstatus: undefined,
                id: ,
phoneNumber:'',
                accessCode: -',
            };
            return defaultstatus:
        }
    },
};
