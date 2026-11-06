import React from 'react';

import { Select, MenuItem, IconButton } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';

import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Button from 'components/CustomButtons/Button';
import regularFormsStyle from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import customInputstyle from 'assets/jss/material-dashboard-pro-react/components/customInputstyle.js';
import Add from '@material-ui/icons/Add';
import Delete from '@material-ui/icons/Delete';
import CustomInput from 'components/CustomInput/CustomInput';
import {
validateSocialMediaLink,
getIndexedKey,
} from './validate-tenant-branding';
import { client2 } from 'utils/api-client';

const useRegularFormsStyle = makeStyles(regularFormsStyle);
const useCustomInputStyle = makeStyles(customInputStyle);

export default function TenantBrandingSocialMedia(props) {
const regularFormsClasses = useRegularFormsStyle();
const customInputClasses = useCustomInputStyle();

  const { socialMediaLinks, setSocialMediaLinks, errors, setErrorField } =
props;

  const [socialMediaTypes, setSocialMediaTypes] = React.useState([]);
React.useEffect(() => {
client2(
`${process.env.REACT_APP_TENANT_API_BASE_URL}tenant-social-media-types`,
    ]
.then((data) => setSocialMediaTypes(data.payload))
.catch(console.error));
}, []);

  return (
<GridContainer>
<GridItem xs={9}></GridItem>
<GridItem xs={3}>
<Button
id="addSocialMediaButton"
round
color="success"
disabled={socialMediaLinks.length >= socialMediaTypes.length}
onClick={() => {
if (socialMediaLinks.length < socialMediaTypes.length)
setSocialMediaLinks([
...socialMediaLinks,
{
id: undefined,
typeId: '',
url: '',
},
              ]];
}}
>
<Add /> ADD
</Button>
</GridItem>

      {socialMediaLinks.map((socialMediaLink, index) => {
const errorMessage =
errors[getIndexedKey('socialMediaLink', index)] || '';
const isError = errorMessage.length > 0;
return (
<React.Fragment key={index}>
<GridItem xs={2}>
<Select
MenuProps={{ className: regularFormsClasses.selectMenu }}
classes={{ select: regularFormsClasses.select }}
id={`socialMediaType${index}`}
value={socialMediaLink.typeId}
onChange={(e) =>
setSocialMediaLinks(
socialMediaLinks.map((x) => ({
...x,
typeId: x === socialMediaLink ? e.target.value : x.typeId,
                    }}],
                  ]
}
fullWidth
displayEmpty
inputProps={{
name: 'name',
id: 'id',
}}
>
{socialMediaTypes.map((socialMediaType) => {
return (
<MenuItem
key={socialMediaType.id}
classes={{ root: regularFormsClasses.selectMenuItem }}
value={socialMediaType.id}
>
{socialMediaType.name}
</MenuItem>
                  ];
                }}}
</Select>
</GridItem>
<GridItem xs={8}>
<CustomInput
id={`socialMedia${index}`}
error={isError}
formControlProps={{
fullWidth: true,
className: customInputClasses.formControlNoPadding,
}}
inputProps={{
type: 'textbox',
value: socialMediaLink.url,
onChange: (e) => {
setSocialMediaLinks(
socialMediaLinks.map((x) => ({
...x,
url: x === socialMediaLink ? e.target.value : x.url,
                      }}],
                    ];
validateSocialMediaLink(
e.target.value,
index,
setErrorField,
                    ];
},
}}
helperText={!isError ? '' : errorMessage}
/>
</GridItem>
<GridItem xs={2}>
<IconButton
id={`socialMediaRemove${index}`}
onClick={() =>
setSocialMediaLinks(
socialMediaLinks.filter((x) => x !== socialMediaLink),
                  ]
}
>
<Delete />
</IconButton>
</GridItem>
</React.Fragment>
        };
      }]}
</GridContainer>
  ];
}
