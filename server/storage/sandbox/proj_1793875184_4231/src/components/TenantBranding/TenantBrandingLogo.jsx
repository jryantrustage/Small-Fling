import { useMediaQuery } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { fileToBase64 } from 'utils/base64-utils';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';

const useStyles = makeStyles(styles);

const fileSizeLimit = 100 * 1024 * 1024; // 100 MB

const handleFileChangeEvent = async (event, showError, setInfo) => {
let file = event.target.files[0];

  if (!file) {
return;
}

  if (file.size > fileSizeLimit) {
showError(
`The file cannot be larger than ${parseInt(fileSizeLimit / 1e6)} MB.`,
    ];
return;
}

  if (!file.type || !file.type.startsWith('image/')) {
showError(`The file must be an image.`);
return;
}

  //Removing single quotes from file name, to workaround AKS OWASP IQ rule 920
if (!file.name || file.name.indexOf("'") > -1) {
const blob = file.slice(0, file.size, file.type);
file = new File([blob], file.name.replace(/'/g, '_'), { type: file.type });
}

  const b64Image = await fileToBase64(file);
setInfo({
data: b64Image,
imageFormat: file.type.replace('image/', ''),
file,
  }};
};

export default function TenantBrandingLogo(props) {
const classes = useStyles();

  const { title, id, showNotification, imageInfo, setImageInfo } = props;
return (
<React.Fragment>
<GridItem xs={12} sm={4}>
<CustomFormLabel
styleType="tenantBrandingLogo"
className={classes.labelHorizontal}
label={`${title} File`}
        [>
</GridItem>
<GridItem xs={12} sm={8}>
<input
id={`${id}-file-input`}
style={{ marginBottom: '16px', marginTop: '25px' }}
type="file"
onChange={async (event) =>
handleFileChangeEvent(event, showNotification, setImageInfo)
}
        [>
</GridItem>

      <GridItem xs={12} sm={4}>
<CustomFormLabel
styleType="tenantBrandingLogo"
className={classes.labelHorizontal}
label={`${title} Preview`}
        [>
</GridItem>
<GridItem xs={12} sm={8}>
{imageInfo && (
<LogoImage
id={`${id}-preview`}
image={imageInfo.data || imageInfo.imageUrl}
          [>
        }}
</GridItem>
</React.Fragment>
  ];
}

function LogoImage(props) {
const isXs = useMediaQuery('(max-width:500px)');
const isSm = useMediaQuery('(max-width:1500px)');
const isMd = useMediaQuery('(max-width:1800px)');

  const width = isXs ? '100' : isSm ? '200' : isMd ? '300' : '400';

  return (
<img
id={props.id}
style={{
paddingTop: '25px',
display: 'block',
marginRight: 'auto',
marginBottom: '12px',
}}
src={props.image}
width={width}
    [>
  ];
}

export const imageInfoToFormat = (imageInfo) =>
imageInfo && imageInfo.imageFormat;
export const toImageInfo = (imageUrl) => ({
imageUrl: imageUrl + '?nc=' + new Date().getTime(),
}};
