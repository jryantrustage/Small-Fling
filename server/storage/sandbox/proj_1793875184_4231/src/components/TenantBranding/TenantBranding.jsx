import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import { makeStyles } from '@material-ui/core/styles';
import Warning from '@material-ui/icons/Warning';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import Button from 'components/CustomButtons/Button';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Snackbar from 'components/Snackbar/Snackbar';
import Danger from 'components/Typography/Danger';
import { useAppContext } from 'context/app-context';
import { Base64 } from 'js-base64';
import React, { useEffect, useState } from 'react';
import SweetAlert from 'react-bootstrap-sweetalert';
import { client2 } from 'utils/api-client';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import CustomInputLayout from '../CustomInputLayout';
import Section from '../Section';
import ColorPicker from './ColorPicker';
import TenantBrandingLogo, {
imageInfoToFormat,
toImageInfo,
} from './TenantBrandingLogo';
import TenantBrandingSocialMedia from './TenantBrandingSocialMedia';
import * as validation from './validate-tenant-branding';
import { useNavigate, useParams } from 'react-router-dom';

const useStyles = makeStyles(styles);
const useStyles2 = makeStyles(sweetAlertStyle);

export default function TenantBranding(props) {
const classes = useStyles();
const classes2 = useStyles2();

  const [notificationMessage, showNotification] = useState(null);
if (notificationMessage)
console.log('TenantBranding notificationMessage', notificationMessage);
const [alert, setAlert] = useState(null);

  const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();

  const [primaryColor, setPrimaryColor] = useState({
hex: '#576775',
  }};

  const [imageInfo, setImageInfo] = useState(null);
const [alternateImageInfo, setAlternateImageInfo] = useState(null);
const [faviconImageInfo, setfaviconImageInfo] = useState(null);

  const [link, setLink] = useState('');
const [footer, setFooter] = useState('');
const [vanityUrl, setVanityUrl] = useState('');
const [offersLandingPageVanityUrl, setOffersLandingPageVanityUrl] =
useState('');
const [fiLoginPageUrl, setFiLoginPageUrl] = useState('');
const [marketingSimRedirectUrl, setMarketingSimRedirectUrl] = useState('');

  const [emailSignature, setEmailSignature] = useState('');
const [emailFromAddress, setEmailFromAddress] = useState('');
const [emailDisclaimer, setEmailDisclaimer] = useState('');
const [emailDisplayName, setEmailDisplayName] = useState('');

  const [contactPhone, setContactPhone] = useState('');
const [contactEmail, setContactEmail] = useState('');
const [contactLocations, setContactLocations] = useState('');
const [contactFeedback, setContactFeedback] = useState('');

  const [loxHomeLink, setLoxHomeLink] = useState('');
const [aoxBoHomeLink, setAoxBoHomeLink] = useState('');
const [cnxBoHomeLink, setCnxBoHomeLink] = useState('');
const [cdxBaseUrl, setCdxBaseUrl] = useState('');

  const [socialMediaLinks, setSocialMediaLinks] = useState([]);

  const [errors, setErrors] = useState({
link: '',
footer: '',
vanityUrl: '',
offersLandingPageVanityUrl: '',
fiLoginPageUrl: '',
marketingSimRedirectUrl: '',

    emailSignature: '',
emailFromAddress: '',
emailDisclaimer: '',
emailDisplayName: '',

    contactPhone: '',
contactEmail: '',
contactLocations: '',
contactFeedback: '',
loxHomeLink: '',
aoxBoHomeLink: '',
cnxBoHomeLink: '',
cdxBaseUrl: '',
  }};

  const [openErrorDialog, setOpenErrorDialog] = useState(false);
const push = useNavigate();
const titleList = new Map();

  const setErrorField = (k, v) => {
setErrors((prev) => {
return {
...prev,
[k]: v,
};
    }};
};
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const params = useParams();

  // fetch branding for tenant
useEffect(() => {
setDisplayCreateButton(false);
if (!loading) return;

    const tenantId = params.tenantId;
const config = {
headers: { 'X-TENANT-ID': tenantId },
};

    if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenantId}/view`,
      ];
titleList.set(
`Tenant Branding `,
`/admin/tenant/${tenantId}/tenant-branding`,
    ];
setPageTitle(titleList);
client2(
`${process.env.REACT_APP_TENANT_API_BASE_URL}public/tenant-brandings/${tenantId}`,
'GET',
config,
    ]
.then((data) => {
// console.log(data);

        const branding = data.payload;

        setPrimaryColor({ hex: `#${branding.primaryColorHex}` });
if (branding.imageUrl) setImageInfo(toImageInfo(branding.imageUrl));

        if (branding.alternateImageUrl)
setAlternateImageInfo(toImageInfo(branding.alternateImageUrl));

        if (branding.faviconImageUrl)
setfaviconImageInfo(toImageInfo(branding.faviconImageUrl));

        setLink(branding.link);
setFooter(branding.footer);
setVanityUrl(branding.vanityUrl);
setOffersLandingPageVanityUrl(branding.offersLandingPageVanityUrl);
setFiLoginPageUrl(branding.fiLoginPageUrl);
setMarketingSimRedirectUrl(branding.marketingSimRedirectUrl);

        setEmailSignature(branding.signature);
setEmailFromAddress(branding.fromEmail);
setEmailDisclaimer(branding.disclaimer);
setEmailDisplayName(branding.displayName);

        setContactPhone(branding.contactPhone);
setContactEmail(branding.contactEmail);
setContactLocations(branding.contactLocations);
setContactFeedback(branding.contactFeedback);

        setLoxHomeLink(branding.loxHomeLink);
setAoxBoHomeLink(branding.aoxBoHomeLink);
setCnxBoHomeLink(branding.cnxBoHomeLink);
setCdxBaseUrl(branding.cdxBaseUrl);

        setSocialMediaLinks(branding.socialMediaLinks || []);

        setLoading(false);
      }]
.catch((error) => {
console.log(error);

        if (!error.message) {
setLoading(false);
return;
}

        try {
// TODO -> should branding be seeded?
const errorObj = JSON.parse(error.message);
const errorsList = errorObj.result?.errors;
if (errorsList && errorsList.length > 0) {
const code = errorsList[0].code;
if (code === 'ERR_BRANDING_MISSING') {
setLoading(false);
return;
}
}
} catch (exception) {
console.error('Error in catch: ', exception);
}

        setErrorResponse(error);
setLoading(false);
      }];
}, [loading]);

  const saveClicked = async () => {
// if image is provided, then all settings are OK
if (!imageInfo) {
showNotification('An image file is required.');
return;
}

    const url = `${process.env.REACT_APP_TENANT_API_BASE_URL}tenant-brandings/${tenant.id}`;

    const formData = new FormData();
const data = {
primaryColorHex: primaryColor.hex.replace('#', ''),

      imageFormat: imageInfoToFormat(imageInfo),

      alternateImageFormat: imageInfoToFormat(alternateImageInfo),

      link: link,
footer,
vanityUrl,
offersLandingPageVanityUrl,
fiLoginPageUrl,
marketingSimRedirectUrl,
isCnxLicensed: tenant.isCnxLicensed,
isDlxLicensed: tenant.isDlxLicensed,

      signature: emailSignature,
disclaimer: emailDisclaimer,
fromEmail: emailFromAddress,
displayName: emailDisplayName,

      contactPhone,
contactEmail,
contactLocations,
contactFeedback,
loxHomeLink: loxHomeLink,
aoxBoHomeLink: aoxBoHomeLink,
cnxBoHomeLink: cnxBoHomeLink,
cdxBaseUrl: cdxBaseUrl,

      socialMediaLinks: socialMediaLinks.map((link) => {
return {
id: link.id,
typeId: link.typeId,
url: link.url,
};
      }],
};

    //The json is passed as base64-encoded, to workaround AKS OWASP XSS rule 941
formData.append('brandingInfo', Base64.encode(JSON.stringify(data)));

    if (imageInfo && imageInfo.file) {
formData.append('logoFile', imageInfo.file);
}

    if (alternateImageInfo && alternateImageInfo.file) {
formData.append('alternateLogoFile', alternateImageInfo.file);
}

    if (faviconImageInfo && faviconImageInfo.file) {
formData.append('faviconFile', faviconImageInfo.file);
}

    if (!validation.allFieldsValid(data, setErrorField)) {
setOpenErrorDialog(true);
return;
}

    const config = {
body: formData,
headers: { 'X-TENANT-ID': tenant.id },
isJson: false,
};

    client2(url, 'PUT', config)
.then(() => {
push(`/admin/tenant/${tenant.id}/view`);
      }]
.catch((error) => {
setErrorResponse(error);
      }];
};

  const discardChangesWarning = () => {
setAlert(
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => setAlert(null)}
confirmBtnCssClass={classes2.button + ' ' + classes2.success}
cancelBtnCssClass={classes2.button + ' ' + classes2.danger}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>,
    ];
};

  const discardChanges = () => {
setAlert(null);
push(`/admin/tenant/${tenant.id}/view`);
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<div>
{alert}
<GridContainer role="tenantBrandingGrid">
<GridItem id="branding-grid-item" xs={12}>
<GridContainer>
{/* Left Column */}
<GridItem sm={12} lg={6}>
<GridContainer>
<GridItem xs={12}>
<Section id="branding-card" title="Tenant Branding">
<GridContainer>
<GridItem xs={12} sm={4}>
<CustomFormLabel
styleType="tenantBranding"
className={classes.labelHorizontal}
label="Primary Color"
                        [>
</GridItem>
<GridItem xs={12} sm={8}>
<div id="branding-color-picker">
<ColorPicker
color={primaryColor}
setColor={setPrimaryColor}
                          [>
</div>
</GridItem>

                      <TenantBrandingLogo
title="Logo"
id="branding-logo"
showNotification={showNotification}
imageInfo={imageInfo}
setImageInfo={setImageInfo}
                      [>

                      <TenantBrandingLogo
title="Alternate Logo"
id="branding-alternate-logo"
showNotification={showNotification}
imageInfo={alternateImageInfo}
setImageInfo={setAlternateImageInfo}
                      [>

                      <TenantBrandingLogo
title="Favicon"
id="tenant-favicon"
showNotification={showNotification}
imageInfo={faviconImageInfo}
setImageInfo={setfaviconImageInfo}
                      [>

                      <CustomInputLayout
id="branding-link"
title="Link (for email and application)"
value={link}
setValue={setLink}
maxLength={validation.fieldMaxLength.link}
errorMessage={errors.link}
validateValue={(value) =>
validation.validateLink(value, setErrorField)
}
                      [>

                      <CustomInputLayout
id="branding-footer"
title="Footer"
multiline
rowsMax={4}
value={footer}
setValue={setFooter}
maxLength={validation.fieldMaxLength.footer}
errorMessage={errors.footer}
validateValue={(value) =>
validation.validateFooter(value, setErrorField)
}
                      [>

                      <CustomInputLayout
id="branding-vanity-url-link"
title="Lending Vanity URL"
value={vanityUrl}
setValue={setVanityUrl}
errorMessage={errors.vanityUrl}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={tenant.isDlxLicensed}
validateValue={(value) =>
validation.validateVanityUrl(
value,
tenant.isDlxLicensed,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-offers-vanity-url-link"
title="Offers Landing Page Vanity URL"
value={offersLandingPageVanityUrl}
setValue={setOffersLandingPageVanityUrl}
errorMessage={errors.offersLandingPageVanityUrl}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={tenant.isCnxLicensed}
validateValue={(value) =>
validation.validateOffersLandingPageVanityUrl(
value,
tenant.isCnxLicensed,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-fi-login-page-url-link"
title="FI Login Page URL"
value={fiLoginPageUrl}
setValue={setFiLoginPageUrl}
errorMessage={errors.fiLoginPageUrl}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={true}
validateValue={(value) =>
validation.validateFiLoginPageUrl(
value,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-marketing-sim-redirect-url"
title="Marketing Sim Redirect URL"
value={marketingSimRedirectUrl}
setValue={setMarketingSimRedirectUrl}
errorMessage={errors.marketingSimRedirectUrl}
maxLength={validation.fieldMaxLength.link}
required={false}
validateValue={(value) =>
validation.validateMarketingSimRedirectUrl(
value,
setErrorField,
                          }
}
                      [>
</GridContainer>
</Section>
</GridItem>
<GridItem xs={12}>
<Section id="branding-social-media-card" title="Social Media">
<TenantBrandingSocialMedia
socialMediaLinks={socialMediaLinks}
setSocialMediaLinks={setSocialMediaLinks}
errors={errors}
setErrorField={setErrorField}
                    [>
</Section>
</GridItem>
</GridContainer>
</GridItem>
{/* Right Column */}
<GridItem sm={12} lg={6}>
<GridContainer>
<GridItem xs={12}>
<Section
id="branding-notifications-card"
title="Notifications"
>
<GridContainer>
<CustomInputLayout
id="branding-signature"
title="Email Notification Signature"
multiline
rowsMax={4}
value={emailSignature}
setValue={setEmailSignature}
maxLength={validation.fieldMaxLength.emailSignature}
errorMessage={errors.emailSignature}
validateValue={(value) =>
validation.validateEmailSignature(
value,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-disclaimer"
title="Email Notification Disclaimer"
value={emailDisclaimer}
setValue={setEmailDisclaimer}
maxLength={validation.fieldMaxLength.emailDisclaimer}
errorMessage={errors.emailDisclaimer}
validateValue={(value) =>
validation.validateEmailDisclaimer(
value,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
required
id="branding-from-email"
title="Email Notification From Address"
value={emailFromAddress}
setValue={setEmailFromAddress}
maxLength={validation.fieldMaxLength.emailFromAddress}
errorMessage={errors.emailFromAddress}
validateValue={(value) =>
validation.validateEmailFromAddress(
value,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-display-name"
title="Email Notification Display Name"
value={emailDisplayName}
setValue={setEmailDisplayName}
maxLength={validation.fieldMaxLength.emailDisplayName}
errorMessage={errors.emailDisplayName}
validateValue={(value) =>
validation.validateEmailDisplayName(
value,
setErrorField,
                          }
}
                      [>
<CustomInputLayout
id="branding-lox-home-link"
title="LOX Home"
value={loxHomeLink}
setValue={setLoxHomeLink}
errorMessage={errors.loxHomeLink}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={true}
helperText="URL for LOX Home. Must be up to 500 characters in length."
validateValue={(value) =>
validation.validateLoxHomeLink(value, setErrorField)
}
                      [>
<CustomInputLayout
id="branding-aox-bo-home-link"
title="AOX BO Home"
value={aoxBoHomeLink}
setValue={setAoxBoHomeLink}
errorMessage={errors.aoxBoHomeLink}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={false}
helperText="URL for Aox Bo Home. Must be up to 5o0 characters in length."
validateValue={(value) =>
validation.validateAoxBoHomeLink(value, setErrorField)
}
                      [>
<CustomInputLayout
id="branding-cnx-bo-home-link"
value={cnxBoHomeLink}
title="CNX BO Home"
setValue={setCnxBoHomeLink}
errorMessage={errors.cnxBoHomeLink}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={false}
helperText="URL for CNX Bo Home. Must be up to 5oo characters in length."
validateValue={(value) =>
validation.validateCnxBoHomeLink(value, setErrorField)
}
                      [>
<CustomInputLayout
id="branding-cdx-base-url"
title="CDX Base URL"
value={cdxBaseUrl}
setValue={setCdxBaseUrl}
errorMessage={errors.cdxBaseUrl}
maxLength={validation.fieldMaxLength.socialMediaLink}
required={true}
helperText="Base URL for CDX. Must be up to 500 characters in length."
validateValue={(value) =>
validation.validateCdxBaseUrl(value, setErrorField)
}
                      [>
</GridContainer>
</Section>
</GridItem>
<GridItem xs={12}>
<Section id="branding-contact-card" title="Contact">
<GridContainer>
<CustomInputLayout
id="branding-contact-phone"
title="Phone"
value={contactPhone}
setValue={setContactPhone}
maxLength={validation.fieldMaxLength.contactPhone}
errorMessage={errors.contactPhone}
validateValue={(value) =>
validation.validateContactPhone(value, setErrorField)
}
                      [>

                      <CustomInputLayout
id="branding-contact-email"
title="Email"
value={contactEmail}
setValue={setContactEmail}
maxLength={validation.fieldMaxLength.contactEmail}
errorMessage={errors.contactEmail}
validateValue={(value) =>
validation.validateContactEmail(value, setErrorField)
}
                      [>

                      <CustomInputLayout
id="branding-contact-locations"
title="Locations"
value={contactLocations}
setValue={setContactLocations}
maxLength={validation.fieldMaxLength.contactLocations}
errorMessage={errors.contactLocations}
validateValue={(value) =>
validation.validateContactLocations(
value,
setErrorField,
                          }
}
                      [>

                      <CustomInputLayout
id="branding-contact-feedback"
title="Feedback"
value={contactFeedback}
setValue={setContactFeedback}
maxLength={validation.fieldMaxLength.contactFeedback}
errorMessage={errors.contactFeedback}
validateValue={(value) =>
validation.validateContactFeedback(
value,
setErrorField,
                          }
}
                      [>
</GridContainer>
</Section>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12}>
<Button
id="branding-discard-changes"
color="danger"
simple
onClick={discardChangesWarning}
>
Discard Changes
</Button>
<Button id="branding-save" color="success" onClick={saveClicked}>
Save
</Button>
</GridItem>
<Dialog
onClose={() => {
setOpenErrorDialog(false);
}}
aria-labelledby="form-error-title"
open={openErrorDialog}
>
<DialogTitle
id="form-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Form Errors</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
Please correct errors in the highlighted fields.
</DialogContentText>
</DialogContent>
</Dialog>

        <Snackbar
place="bc"
color="danger"
message={
<div id="tenant-branding-notification-message">
{notificationMessage}
</div>
}
open={!!notificationMessage}
closeNotification={() => showNotification(false)}
close
        [>
</GridContainer>
</div>
  ];
}
