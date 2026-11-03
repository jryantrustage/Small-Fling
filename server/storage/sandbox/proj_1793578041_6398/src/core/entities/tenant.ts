import { Address } from 'core/types';
// import { SocialMediaLink } from 'core/data/integrations/dlxApi/tenantService';

type SocialMediaLink = any;

/**
* Theme colors that can be overriden
*/
export type BrandingColors = {
/**
* Primary override color
* e.g. "#cecece"
*/
G1?: string;
};

export type BrandingEmail = {
/**
























* TODO clarify whether it includes 'data:image/png;'
* Are other types than PNG supported?
*
* I have a converted in api layer for now so we have just
* one place to make the change
*/
altLogo?: string;
fiLoginPageUrl?: string;
fiLoginPageUrlWithParameters?: string;
logo?: string;
contactLink?: string;
footer?: string;
vanityUrl?: string;
};

export type BrandingSocialMediaLinks = {
socialMediaLinks?: SocialMediaLink[];
};

/**
* Tenant branding struct
*/
export type TenantBranding = {
notFound?: boolean; // TODO remove, handle in api facade and/or in saga
























homeBanking?: HomeBanking;
};

export type HomeBanking = 'Q2' | 'Banno';

export type Tenant = {
details: TenantDetails;
branding?: TenantBranding;
};
