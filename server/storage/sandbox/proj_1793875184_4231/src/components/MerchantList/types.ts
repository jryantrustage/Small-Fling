export type MerchantAddress = {
addressType: string;
line1: string;
line2?: string;
city: string;
state: string;
postalCode: string;
country: string;
};

export interface Merchant {
recordState: string;
id: string;
cuicCustomerNumber: string;
merchantTypeId: number;
merchantTypeCode: string;
merchantTypeName: string;
legalName: string;
postalName: string;
addresses: MerchantAddress[];
resourceUrl: string;
}
