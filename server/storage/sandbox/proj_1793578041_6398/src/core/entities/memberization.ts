export interface ISetErrorPayload {
message: string;
}

export interface DataFieldOption {
label?: string;
value?: string;
selected?: boolean;
}

export interface DataField {
fieldLabel?: string;
fieldType?: string;
























categoryId?: number;
responseOptions?: string;
fieldType?: string;
}

export interface EligibilityQuestionsCategory {
id?: number;
name?: string;
questions?: Array<EligibilityQuestion>;
enabled?: boolean;
areQuestionsGrouped?: boolean;
}

export interface IdentificationDocument {
id?: number;
name?: string;
enabled?: boolean;
}

export interface MembershipEligibility {
state?: string;
questionCategories?: Array<EligibilityQuestionsCategory>;
identificationDocuments?: Array<IdentificationDocument>;
}
























SUCCESS = 'SUCCESS',
}
/**
* Global notification entity that is used for errors, alerts, and growls.
*/
export interface INotification {
/**
* Indicates if the notification should be dismissable.
*/
dismissable: boolean;
/**
* Type indicator that changes the display styling of the notification.
*/
type: NotificationType;
/**
* Property that can be used to modify the display behavior of the notification.
* eg: GLOBAL will make notifications appear under the header in most views.
*/
display: NotificationDisplay | string;
/**
* Optional string representing the icon that is displayed, if any.
*/
icon?: ICON_TYPES;
/**

























/**
* Use (and add to) these enums to specify where you want a notification to
* display.  GLOBAL will generally display below the header on every view.
* Specific display locations should likely correlate to a feature or a
* component.
*/
export enum NotificationDisplay {
GLOBAL = 'GLOBAL', // Selection Wizard, Vehicle Sim, Account Settings...
SUB_TEST = 'SUB_TEST',
SIGN_IN = 'SIGN_IN',
SIGN_IN_MODAL = 'SIGN_IN_MODAL',
VEHICLE_WIZARD__SELECTION_STYLE = 'VEHICLE_WIZARD__SELECTION_STYLE',
VEHICLE_SIM__COVERAGE_PRODUCTS = 'VEHICLE_SIM__COVERAGE_PRODUCTS',
VEHICLE_SIM__VEHICLE_DETAILS = 'VEHICLE_SIM__VEHICLE_DETAILS',
VEHICLE_SIM__MAIN_PAGE = 'VEHICLE_SIM__MAIN_PAGE',
MEMBERSHIP_ELIGIBILTY = 'MEMBERSHIP_ELIGIBILTY',
LOAN_APPLICATION__LOAN_APP = 'LOAN_APPLICATION__LOAN_APP',
MY_LOAN_APPLICATION = 'MY_LOAN_APPLICATION',
LOAN_APPLICATION__PROGRESS_LIST = 'LOAN_APPLICATION__PROGRESS_LIST',
ACCOUNT_SETTINGS = 'ACCOUNT_SETTINGS',
ACCOUNTS_PER_CATEGORY_TYPE = 'ACCOUNTS_PER_CATEGORY_TYPE',
ACCOUNTS_PER_APP = 'ACCOUNTS_PER_APP',
PRODUCT_PLUS = 'PRODUCT_PLUS',
























* their respective files.
*/

/**
* An enum encapsulating the various classes of product types that Astro may
* return.
*
* As of MVP launch, this only contains `AUTO_LOAN`, but more products are
* expected to be added in the future. This is where to add them.
*/
export enum ProductType {
AUTO_LOAN = 'auto-loan',
PERSONAL = 'personal',
CREDIT_CARD = 'credit card',
AUTO = 'auto',
RECREATIONAL = 'recreational',
SECURED = 'secured',
HOME_EQUITY = 'home equity',
}

/**
* Similar to the `ProductType` enum, this is a repository of product sub-types.
*
* At present, this likewise contains only subtypes for auto loans, but this
























* property.
*/
export interface IProduct {
id: string;
name: string;
type: ProductType;
subType: ProductSubType;
allowSimulation: boolean;
}

export class ProductTypeAttributes {
productType: ProductType | undefined;

  productSubType: ProductSubType | undefined;

  constructor(productType: ProductType, productSubType: ProductSubType) {
this.productType = productType;
this.productSubType = productSubType;
}
}
