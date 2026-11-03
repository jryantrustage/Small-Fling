/** *****************************************************************************

ENUMS

GLOBAL enums go here. These are enums that will be used by components and code
throughout the application. DO NOT REACH INTO OTHER COMPONENTS TO GRAB ENUMS!
If you need an enum that exists elsewhere, then consider moving it HERE.

Enums are distinct from constants, though they are a type of constant! Use enums
when you want to restrict a value to a certain number of options.

Use the following convention when writing enums:

























* Used by the SignInWizard to determine what text to display
*/
export enum SignInContext {
GLOBAL_NAV = 'Global Navigation',
SIMULATION = 'Simulation',
LOAN_APP = 'Loan Application',
}

export enum SignInWizardStep {
SIGN_IN,
SIGN_IN_MEMBER,
SIGN_IN_GUEST,
NEW_GUEST_USER,
RESET_USER_PASSWORD,
RESET_PASSWORD_CONFIRM,
CREATE_NEW_PASSWORD,
MFA_VERIFICATION,
MFA_VERIFICATION_PHONE_NUMBER,
UNLOCK_USER,
INVALID_RESET_TOKEN,
INVALID_UNLOCK_TOKEN,
}

/**
























DocumentUploadControl,
}

/**
* This should be self-explanatory...
*/
export enum Direction {
UP = 'UP',
DOWN = 'DOWN',
LEFT = 'LEFT',
RIGHT = 'RIGHT',
}

/**
* Is the vehicle new or used?
*/
export enum VehicleCondition {
NEW = 'NEW',
USED = 'USED',
}

export enum NotificationType {
SUCCESS = 'SUCCESS',
ERROR = 'ERROR',
























export enum DLXLoanStatus {
IN_PROGRESS = 'In Progress',
PENDING_DECISION = 'Pending Decision',
ABANDONED = 'Abandoned',
TAKEN_OVER_BY_LOAN_OFFICER = 'Taken Over By Loan Officer',
UNDER_REVIEW = 'Under Review',
APPROVED = 'Approved',
APPROVED_UPDATED = 'Approved-Updated',
APPROVED_PENDING = 'Approved-Pending',
NOT_ACTIVE = 'Not Active',
DECLINED = 'Declined',
FUNDED = 'Funded',
IDLE = 'Idle',
EXPIRED = 'Expired',
RESET = 'Reset',
ERROR = 'Error',
}

/**
* the FieldCode enum describes all field codes used in the loanApplication payloads (summary and list)
* note that the enum key uses underscores _ and the field code uses dashes -
*/
export enum FieldCode {
FIELD_FUNDED_LOS_CARD_NAME = 'FIELD-FUNDED-LOS-CARD-NAME',
























FIELD_VEHICLE_TYPE = 'FIELD-VEHICLE-TYPE',
FIELD_PURCHASE_VEHICLE_TRIM_IMAGE = 'FIELD-PURCHASE-VEHICLE-TRIM-IMAGE',
FIELD_CREDIT_PROFILE = 'FIELD-CREDIT-PROFILE',
FIELD_GAP_ELECTION = 'FIELD-GAP-ELECTION',
FIELD_LOAN_PURPOSE = 'FIELD-LOAN-PURPOSE',
FIELD_MRC_ELECTION = 'FIELD-MRC-ELECTION',
FIELD_APPROVED_LOAN_AMOUNT = 'FIELD-APPROVED-LOAN-AMOUNT',
FIELD_FUNDED_LOAN_AMOUNT_REQUESTED = 'FIELD-FUNDED-LOAN-AMOUNT-REQUESTED',
FIELD_APPROVED_LOAN_TERM_MONTHS = 'FIELD-APPROVED-LOAN-TERM-MONTHS',
FIELD_FUNDED_LOAN_TERM_MONTHS = 'FIELD-FUNDED-LOAN-TERM-MONTHS',
FIELD_FUNDED_MONTHLY_PAYMENT = 'FIELD-FUNDED-MONTHLY-PAYMENT',
FIELD_APPROVED_ANNUAL_PERCENTAGE_RATE = 'FIELD-APPROVED-ANNUAL-PERCENTAGE-RATE',
FIELD_FUNDED_ANNUAL_PERCENTAGE_RATE = 'FIELD-FUNDED-ANNUAL-PERCENTAGE-RATE',
FIELD_FUNDED_TOTAL_COST = 'FIELD-FUNDED-TOTAL-COST',
FIELD_FUNDED_TOTAL_INTEREST = 'FIELD-FUNDED-TOTAL-INTEREST',
FIELD_APPROVED_CREDIT_LIMIT = 'FIELD-APPROVED-CREDIT-LIMIT',
FIELD_FUNDED_CREDIT_LIMIT = 'FIELD-FUNDED-CREDIT-LIMIT',
FIELD_GAP_PLUS_BENEFIT_AMOUNT = 'FIELD-GAP-PLUS-BENEFIT-AMOUNT',
FIELD_APPROVED_APR = 'FIELD-APPROVED-APR',
FIELD_FUNDED_APR = 'FIELD-FUNDED-APR',
FIELD_LOS_LOAN_OFFICER_EMAIL = 'FIELD-LOS-LOAN-OFFICER-EMAIL',
FIELD_LOS_LOAN_OFFICER_PHONE = 'FIELD-LOS-LOAN-OFFICER-PHONE',
FIELD_LOS_LOAN_OFFICER_FIRST_NAME = 'FIELD-LOS-LOAN-OFFICER-FIRST-NAME',
FIELD_LOS_LOAN_OFFICER_LAST_NAME = 'FIELD-LOS-LOAN-OFFICER-LAST-NAME',























