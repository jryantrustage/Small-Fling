const tableTranslations = {
TABLE__NUM_ROWS: '{{numRows}} Rows',
TABLE__ALL_ROWS: 'All Rows',
TABLE__PAGE_NUMBER: 'Page Number:',
TABLE__PAGE_LENGTH: 'Table Length:',
TABLE__CURRENT_PAGE: `{{currentPage}} out of {{totalPages}}`,
TABLE_HEADER__SORT_BUTTON_ARIA_LABEL: `Sort by {{accessor}}`,
TABLE_HEADER__FILTER_CLEAR_BUTTON_ARIA_LABEL: 'Clear Filter',
























import { searchTranslations } from './Search/en';
import { accountsEnTranslations } from './accounts/en';
import { signInWizard } from './SignInWizard';
import { sessionTimeoutTranslations } from './SessionTimeout';
import { msrGlobalSearch } from './msrGlobalSearch/en';
import { globalNavigationTranslations } from './GlobalNavigation';

/**
* Error messages should be added to: src/i18n/errors/en.ts
* Multi-use generic messages should be added to: src/i18n/generic/en.ts
*
* All other component/section specific content should be added here.
*
* three part naming convention;
* 1) First part, the component name, in all caps snake case, where it is used ( example: BEFORE_UNLOAD_MODAL )
* 2) a double underscore separator ( example: __ )
* 3) Third part is the description, also in all caps snake case.
* The description would ideally be written from left to right, with an increasing in specificity.
**/

export const translation = {
ADDRESS_VERIFY_MODAL__ADDRESS_LABEL: '{{prefix}} {{type}} address',
ADDRESS_VERIFY_MODAL__ADDRESS_LABEL_GENERIC: '{{prefix}} address',
ADDRESS_VERIFY_MODAL__SUB_HEADER_TITLE: 'Confirm your address',






















BEFORE_UNLOAD_MODAL__VALID_BODY: [
'# Incomplete Form',
'There are currently unsaved changes on this page of your application. Would you like to save the changes you’ve made to this page? All of your information before this form will be saved regardless.',
],
BEFORE_UNLOAD_MODAL__VALID_BUTTON_LEAVE: `SAVE AND EXIT`,
BEFORE_UNLOAD_MODAL__VALID_BUTTON_STAY: `DISCARD AND EXIT`,
BEFORE_UNLOAD_MODAL__NATIVE_DIALOGUE: `Changes you made in this form may not be saved. All other information has been saved. Log back in to return to your application.`,

  BEFORE_UNLOAD_MODAL__LEAVING_BODY: [
`# Leaving so soon?`,
`It looks like you're about to leave the loan application. If you're just trying to go back to a previous page, use the navigation arrows or the menu to move to the correct page. If you do want to leave the application, we'll save all of your work so you can pick up where you left off when you return.`,
],
BEFORE_UNLOAD_MODAL__LEAVING_BUTTON_SAVE_AND_EXIT: 'SAVE AND EXIT',
BEFORE_UNLOAD_MODAL__LEAVING_BUTTON_STAY_IN_APPLICATION: 'STAY IN APPLICATION',

  CHECK_BOX_GROUP__CHECK_BOX_LABEL_SELECT_ALL: 'Select All',

  DOCUMENTS_UPLOAD__MODAL_TITLE: `Secure Document Upload`,
DOCUMENTS_UPLOAD__MODAL_NEXT: `Next`,
DOCUMENTS_UPLOAD__MODAL_SUBMIT: `Submit  →`,























DYNAMIC_FORM__INVALID_PHONE_NUMBER_LENGTH: '{{label}} must contain ten numbers.',
DYNAMIC_FORM__INVALID_DATE_FORMAT: '{{label}} must be entered as MM/DD/YYYY',
DYNAMIC_FORM__INVALID_DATE_VALUE: '{{label}} must be a valid date',
DYNAMIC_FORM__INVALID_VIN: 'Sorry, the VIN you entered is invalid. Please try again.',
DYNAMIC_FORM__INVALID_ZIP: '{{label}} must be in the format 12345-1234.',
DYNAMIC_FORM__INVALID_ZIP_LENGTH: '{{label}} must contain at least 5 numbers',
DYNAMIC_FORM__INVALID_NAME:
'Uh oh. Some special characters are not recognized by our system. Please edit your entry and try again.',
DYNAMIC_FORM__INVALID_ID:
'Sorry, your entry for {{label}} is not in the correct format. Please edit your entry and try again.',
DYNAMIC_FORM__ERROR_MAX_LENGTH: 'Enter a response shorter than {{maxLength}} characters.',
DYNAMIC_FORM__ERROR_MAX_LENGTH_DIGITS: 'Sorry, our system can only accept answers with {{maxLength}} digits or less.',
DYNAMIC_FORM__ERROR_MIN_LENGTH: 'Sorry, you must enter {{article}} with at least {{minLength}} characters.',
DYNAMIC_FORM__ERROR_MIN_LENGTH_DIGITS: 'Sorry, you must enter {{article}} with at least {{minLength}} digits.',
DYNAMIC_FORM__ERROR_REQUIRED_SELECT_OPTION: 'Sorry, you must select an option to continue.',
DYNAMIC_FORM__ERROR_REQUIRED_SELECT_OPTION_INPUT: 'Sorry, you must enter an option to continue.',
DYNAMIC_FORM__ERROR_REQUIRED_SELECT_LIST: 'This is a required selection',
DYNAMIC_FORM__ERROR_ELIGIBLE_YEAR: 'You must select an eligible model year',
DYNAMIC_FORM__ERROR_REQUIRED_TEXT_FIELD: `Sorry, you must enter {{article}} to continue.`,
DYNAMIC_FORM__ERROR_DISCLOSURE_CHECKBOX_WITH_LINK: 'Please visit the link and consent to the terms before proceeding',
DYNAMIC_FORM__ERROR_UNIQUE_TEXT_FIELD: `Sorry, you must enter a unique {{article}} to continue.`,
DYNAMIC_FORM__ERROR_DATE_BEFORE_1900: 'Sorry, you must enter a date after the year 1900.',
DYNAMIC_FORM__ERROR_AGE_13: 'Sorry, you must be at least 13 years old to apply for a loan.',
DYNAMIC_FORM__ERROR_DOB_INVALID_ENTRY: 'Date entry must be in the past.',























DYNAMIC_FORM__NEXT_SEGMENT: 'Next Segment',

  DYNAMIC_NOTIFICATION__ARIA_CLOSE: 'Close simulator notification',
DYNAMIC_NOTIFICATION__ALERT: 'Alert',
DYNAMIC_NOTIFICATION__ERROR: 'Error',
DYNAMIC_NOTIFICATION__INFO: 'Info',
DYNAMIC_NOTIFICATION__SUCCESS: 'Success',

  DYNAMIC_INPUT_FIELD__SECURED_ICON_ARIA_LABEL: 'Secured',

  EDIT_MODE_OVERLAY__TITLE: 'Edit Mode',
EDIT_MODE_OVERLAY__BODY:
'Any updates to your previous response may require you to add more information to previously answered sections or new sections.',
EDIT_MODE_OVERLAY__BUTTON: 'Cancel',

  GENERIC_LOAN_STATUS_CARD_ARIA_LABEL: 'Loan status card',

  LOAN_APP_TIME_STAMP__LAST_SAVED: 'Last saved',

  LOAN_PROGRESS_BAR__LEGEND_APPLY: 'Apply',
LOAN_PROGRESS_BAR__LEGEND_REVIEW: 'Review',
LOAN_PROGRESS_BAR__LEGEND_DECISION: 'Decision',
LOAN_PROGRESS_BAR__LEGEND_FUNDING: 'Funding',
LOAN_PROGRESS_BAR__LEGEND_ACTIVE: 'Active',
























'Loan Simulator is an educational tool that helps you explore how various factors can impact your loan scenario. You must apply for the loan to receive a loan offer. All terms subject to approval. Using loan simulator will not impact your credit.',

  SIDEBAR_ACCORDION__OPEN_SECTION: 'Open section',
SIDEBAR_ACCORDION__CLOSE_SECTION: 'Close section',

  SIGN_IN_BANKING_ACCOUNT__HEADING: 'Do you have an online banking account with us?',
SIGN_IN_BANKING_ACCOUNT__DESC_1: 'If so, you can sign in with your username and password.',
SIGN_IN_BANKING_ACCOUNT__DESC_2:
'If you don’t have an online banking account with us, you can create a new user profile that lets you save loan simulations, start loan applications, and sign back in at any time.',
SIGN_IN_BANKING_ACCOUNT__BUTTON_LABEL_CONFIRM: 'Yes',
SIGN_IN_BANKING_ACCOUNT__BUTTON_LABEL_REFUSE: "NO, I'LL CREATE A NEW USER PROFILE",

  SIGN_IN_MEMBER_FORK__LABEL: 'Sign in to {{tenantName}} or use a new user profile to continue.',
SIGN_IN_MEMBER_FORK__BUTTON_MEMBER: "I'm a {{typeName}} member",
SIGN_IN_MEMBER_FORK__BUTTON_GUEST: 'New User Profile',
SIGN_IN_MEMBER_FORK__SIGN_IN: 'Sign in',

  SKIP_NAVIGATION__CONTENT_SKIP_TO_MAIN: 'Skip to Main Content',

  STEPPER_INPUT_VIEW__ARIA_INCREASE: 'Increase amount in input',
STEPPER_INPUT_VIEW__ARIA_DECREASE: 'Decrease amount in input',
















TERMS_AND_CONDITIONS_MODAL__BODY_2_1: `Ohio Residents Only: The Ohio laws against discrimination require that all creditors make credit equally available to all creditworthy customers, and that credit reporting agencies maintain separate credit histories on each individual upon request. The Ohio Civil Rights Commission administers compliance with this law.`,
TERMS_AND_CONDITIONS_MODAL__BODY_2_2: `Wisconsin Residents Only: (1) No provision of any marital property agreement, unilateral statement under S.766.59, or court decree under S.766.70 will adversely affect the rights of the credit union unless the credit union is furnished a copy of the agreement, statement or decree, or has actual knowledge of its terms, before the credit is granted or the account is opened. (2) If you are not applying for this account or loan with your spouse, the credit being applied for, if granted, will be incurred in the interest of the marriage or family of the undersigned.`,
TERMS_AND_CONDITIONS_MODAL__TITLE_2: `Consent to Electronic Documents and Signatures`,
TERMS_AND_CONDITIONS_MODAL__BODY_3_1: `To submit an application electronically, you must consent to the use of electronic documents and signatures in connection with your request for credit.`,
TERMS_AND_CONDITIONS_MODAL__BODY_3_2: `Click to Access`,
TERMS_AND_CONDITIONS_MODAL__LINK_TEXT: `Electronic Documents and Signatures PDF`,
TERMS_AND_CONDITIONS_MODAL__TITLE_3: `Consensual Security Interest`,
TERMS_AND_CONDITIONS_MODAL__BODY_4_1_1: `You grant us a security interest in all individual and joint share and/or deposit accounts you have with us now and in the future to secure your credit card account. Shares and deposits in an IRA or any other account that would lose special tax treatment under state or federal law if given as security are not subject to the security interest you have given in your shares and deposits. You may withdraw these other shares unless you are in default. When you are in default, you authorize us to apply the balance in these accounts to any amounts due. For example, if you have an unpaid credit card balance, you agree we may use funds in your account{s} to pay any or all of the unpaid balance.`,
TERMS_AND_CONDITIONS_MODAL__BODY_4_2_1: `By checking the box below, you are affirmatively agreeing that you are aware that granting a security interest is a condition for the credit card and you intend to grant a security interest. You acknowledge and agree that your pledge does not apply during any periods when you are a covered borrower under the Military Lending Act. For clarity, you will not be deemed a covered borrower, and your pledge will apply, if: (i) you become obligated on a credit transaction or establish an account for credit when you are not a covered borrower; or (ii) you cease to be a covered borrower.`,
TERMS_AND_CONDITIONS_MODAL__TITLE_4: `Pledge of Shares`,
TERMS_AND_CONDITIONS_MODAL__TITLE_5: 'Important Documents and Disclosures',














'I am aware of and agree to the pledge of shares terms stated above.',
TERMS_AND_CONDITIONS_MODAL__LABEL_SECURED_CARD_3:
'I am aware of and agree to the pledge of shares and consensual security interest above.',
TERMS_AND_CONDITIONS_MODAL__LABEL_SECURED_LOAN_3:
'I am aware of and agree to the pledge of shares terms stated above.',
TERMS_AND_CONDITIONS_MODAL__LABEL_HELOC_3:
'I accessed the important documents and disclosures listed above and understand that I can download a copy for my records.',
TERMS_AND_CONDITIONS_MODAL__JOINT_APPLICATION_AGREEMENT:
'If you’re submitting a joint application, please be aware that checking these boxes confirms agreement for both applicants.',
TERMS_AND_CONDITIONS_MODAL__LABEL_1: `I agree to Terms and Conditions`,
TERMS_AND_CONDITIONS_MODAL__ERROR_1: `You must agree to the Terms and Conditions to continue.`,
TERMS_AND_CONDITIONS_MODAL__ARIA_LABEL_1: `I agree to Terms and Conditions check box.`,
TERMS_AND_CONDITIONS_MODAL__LABEL_2: `I accessed the Electronic Documents and Signatures PDF and agree to the terms.`,
TERMS_AND_CONDITIONS_MODAL__ERROR_2: `You must agree to the Electronic Documents and Signatures terms to continue.`,
TERMS_AND_CONDITIONS_MODAL__ARIA_LABEL_2: `I accessed the Electronic Documents and Signatures PDF and agree to the terms. check box`,
TERMS_AND_CONDITIONS_MODAL__LABEL_3: `I am aware of and agree to the consensual security interest above.`,
TERMS_AND_CONDITIONS_MODAL__ERROR_3: `You must agree to the consensual security interest terms to continue.`,
TERMS_AND_CONDITIONS_MODAL__ARIA_LABEL_3: `I am aware of and agree to the consensual security interest above. check box`,
TERMS_AND_CONDITIONS_MODAL__BUTTON: `SUBMIT APPLICATION →`,
TERMS_AND_CONDITIONS_MODAL__BUTTON_ARIA_LABEL: `Link downloads Terms and Conditions PDF document`,

  VALIDATIONS__PASSWORDS_DONT_MATCH: 'Provided passwords do not match. Re-enter the same password.',

  WIZARD_PROGRESS_BAR__CURRENT: 'current progress',
























DATE_RANGE_PICKER__APPLY: 'APPLY →',
DATE_RANGE_PICKER__RESET: 'Reset',

  GAP_IMAGE__ALT_TEXT: 'Vehicle Image',

  INPUT__SHOW_PASSWORD: 'Show password',
INPUT__SHOW_SSN: 'Display the SSN',
INPUT__HIDE_SSN: 'Hide the SSN',
MEMBERSHIP_ELIGIBILITY_FAIL__TITLE: 'You may not be approved for this loan based on membership eligibility.',
MEMBERSHIP_ELIGIBILITY_FAIL__DESCRIPTION:
'Our loans are available to {{typeName}} members and you may not be eligible for membership. You can review the eligibility requirements by calling {{phone}} or sending an email to {{email}}',
DP_RECOMMENDATION__TITLE_PROTECTION_MRC: 'MRC helps you pay for costly repairs as your vehicle ages.',
MRC_RECOMMENDATION__DESCRIPTION:
'As your vehicle gets older, the risk and cost of repairs increases. Mechanical Repair Coverage (MRC) covers the  cost of unexpected covered repairs after your warranty expires—you only pay your deductible.',
MRC_RECOMMENDATION__PROS_LIST: [
'Limit your repair costs to a chosen deductible',
'Get your vehicle fixed anywhere; including dealerships',
'Coverage is transferable if you decide to sell',
'24 hour emergency roadside assistance',
'Get reimbursed for travel expenses and rentals up to a certain amount per day',
],






















  MASKING_EYE_ICON: 'toggle value masking',

  REPORTS_MODULE_NO_DATA_DATE_RANGE: 'No Data Within\nSelected Date Range',
REPORTS_MODULE_NO_DATA_NO_DATE_RANGE: 'No Data\nToDisplay',
REPORTS_MODULE_DATA_NOT_AVAILABLE: 'Data\nNot Available',
REPORTS_MODULE_TOGGLE_LABEL: 'Toggle Button for',
REPORTS_MODULE_DOWNLOAD_ALT: 'Download Data for',

  UPLOAD_DOCUMENT_FILES_BUTTON: 'UPLOAD FILES',
SELECT_DOCUMENT_TYPE_PLACEHOLDER: 'Select the document type',
SELECT_DOCUMENT_TYPE_LABEL: 'Document Type',
SELECT_DOCUMENT_TYPE_EXPOSITION: 'Please select a document type before you upload the file.',
SELECT_DOCUMENT_ERROR: 'You must select a document type before uploading these files.',

  ADDITIONAL_INFO_REQUEST__ERROR_MESSAGE: 'Please type your answer.',
ADDITIONAL_INFO_REQUEST__PLACEHOLDER: 'Type your answer here...',
ADDITIONAL_INFO_REQUEST__TEXT_AREA_LABEL: 'Your answer:',

  DOC_REVIEW_REJECTION_REASON_GROUP_EXPOSITION: 'Please provide details about this document rejection.',
DOC_REVIEW_REJECTION_REASON_LABEL: 'Rejection Reason',
DOC_REVIEW_REJECTION_REASON_PLACEHOLDER: 'Select a rejection reason',
DOC_REVIEW_REJECTION_REASON_ERROR: 'You must select a rejection reason to continue',






















DO_NOT_SEND_CORRECTION_TASK_RADIO_BUTTON_LABEL: 'No',
DOCUMENT_UPLOAD_REJECTED_FILES: 'Rejected Files ({{count}})',
DOCUMENT_FILE_PREVIEW_ALT: 'File preview',

  //TextAreaMarkdown
TEXT_AREA_MARKDOWN__BUTTON: 'Preview Markdown',

  // Image Uploader
IMAGE_UPLOADER__HEADER: '{{imageType}} Image',
IMAGE_UPLOADER__DRAG_DROP_OR_BROWSE_1: 'Drag and drop your image here, or ',
IMAGE_UPLOADER__DRAG_DROP_OR_BROWSE_2: 'browse',
IMAGE_UPLOADER__DRAG_DROP_OR_BROWSE_3: ' files to select one.',
IMAGE_UPLOADER__BODY_DESCRIPTION:
'{{imageType}} images should be {{imageWidth}}px by {{imageHeight}}px. Allowable image file formats are: {{allowableFileFormatsString}}.',
IMAGE_UPLOADER__PLACEHOLDER: '{{imageType}} Image Here',
IMAGE_UPLOADER__REPLACE_IMAGE: 'Replace Image',
IMAGE_UPLOADER__IMAGE_REQUIRED_ERROR: 'You must upload a product image to continue.',
IMAGE_UPLOADER__INCOMPATIBLE_IMAGE_TYPE_ERROR:
'The file format you chose is incompatible. Allowable formats are {{allowableFileFormatsString}}.',
IMAGE_UPLOADER__IMAGE_TOO_LARGE_ERROR:
'The image you chose is too large. Select an image less than {{maxImageSize}}MB.',
IMAGE_UPLOADER__ALT_PRODUCT: 'Product',
IMAGE_UPLOADER__ALT_PRODUCT_OPTION: 'Product Option',

























RULES_CLAUSE_TAB_LABEL: 'Set clause to and or or',
RULES_CLAUSE_TAB_LABEL_AND: 'And',
RULES_CLAUSE_TAB_LABEL_OR: 'Or',
RULES_GROUP_CLAUSE: 'Group',
RULES_UNGROUP_CLAUSE: 'Ungroup',
RULES_INVALID_INPUTS: 'You must fill all fields with valid inputs before continuing.',
RULES_GROUP_INPUT_ARIA_LABEL: 'Add rule to group',
RULES_INDEX: 'Rule {{index}}',
RULES_DUPLICATE: 'Duplicate',
RULES_EDIT_MENU: 'Edit Rule',
RULES_DONE_EDITING: 'Done Editing',
RULES_PREVIEW_IF: 'If',
RULES_RULE_NAME_GENERIC: 'rule {{n}}',
RULES_AND: 'and',
RULES_RULE_ADD: '+ Add New Rule',
RULES_SELECT_CUSTOMER_FIELD: 'Select {{ruleName}} field',
RULES_SELECT_OPERATOR: 'Select {{ruleName}} operator',
RULES_FIELD_PLACEHOLDER: 'Select attribute',
RULES_OPERATOR_PLACEHOLDER: 'Select operator',
RULES_INPUT_VALUE: '{{ruleName}} {{operator}} value',
RULES_INPUT_PLACEHOLDER: 'Enter value',
RULES_INPUT_LOW_VALUE: '{{ruleName}} {{operator}} minimum value',
RULES_INPUT_LOW_PLACEHOLDER: 'Enter min',
RULES_INPUT_HIGH_VALUE: '{{ruleName}} {{operator}} maximum value',
























...accountsEnTranslations,
...signInWizard,
...sessionTimeoutTranslations,
...msrGlobalSearch,
...globalNavigationTranslations,
};
