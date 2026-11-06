import React from 'react';
import {
queryByAttribute,
fireEvent,
waitFor,
screen,
} from '@testing-library/react';

import 'jest-canvas-mock';

import { renderWithMockTenant } from 'components/__mock__/mock-context';
import TenantBranding from '../TenantBranding';
import { Base64 } from 'js-base64';
import { allFieldsValid } from '../validate-tenant-branding';

const getById = queryByAttribute.bind(null, 'id');
const getByValue = queryByAttribute.bind(null, 'value');
const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: () => ({
tenantId: 'tenantId',
  }},
}}];

const fetchedBranding = {
payload: {
primaryColorHex: 'ABC123',
disclaimer: 'abc123',
signature: 'abc123',
link: 'abc123',
fromEmail: 'abc123@abc.com',
displayName: 'abc123',
socialMediaLinks: [],
imageUrl: 'someUrl',
faviconImageUrl: 'faviconImageURL',
loxHomeLink: 'http://abc123.com',
cdxBaseUrl: 'http://abc123.com',
vanityUrl: 'https://link.com',
offersLandingPageVanityUrl: 'https://offers.com',
fiLoginPageUrl: 'https://login.mycu.com',
marketingSimRedirectUrl: 'http://marketing.Sim.Redirect.Url',
},
};

const brandingInfoData = {
primaryColorHex: '110303',
imageFormat: 'png',
alternateImageFormat: 'png',
link: 'https://link.com',
footer: 'The footer.',
vanityUrl: 'https://link.com',
offersLandingPageVanityUrl: 'http://offers.com',
fiLoginPageUrl: 'https://login.mycu.com',

  signature: 'My Signature',
disclaimer: 'Disclaimer',
fromEmail: 'my@email.com',
displayName: 'Display Name',

  contactPhone: '555-555-5555',
contactEmail: 'my@email.com',
contactLocations: 'Locations',
contactFeedback: 'My feedback',
loxHomeLink: 'https://link.com',
cdxBaseUrl: 'https://link.com',
marketingSimRedirectUrl: 'http://marketing.Sim.Redirect.Url',

  socialMediaLinks: [
{
id: 'c56aa04f-fd39-4b42-b900-c4f387e549de',
typeId: 1,
url: 'https://link.com',
},
],
};

const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

describe('TenantBranding', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const defaultProps = {
match: {
path: '',
params: {
tenantId: mockTenant.id,
},
},

    history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: (v) => {},
},
};

  beforeEach(() => {
fetchSpy.mockClear();
fetchSpy.mockReset();
  }};

  test.skip('Update color', async () => {
const updateColor = jest.fn();
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      if (
config.method === 'PUT' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
const data = JSON.parse(Base64.decode(config.body.get('brandingInfo')));

        updateColor(data['primaryColorHex']);

        return Promise.resolve({
ok: true,
json: () => {},
        }];
}

      console.log(
'Update color Unhandled fetch mockImplementation',
endpoint,
config,
      ];

      return Promise.resolve({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({
message: 'Invalid file format',
statusCode: '500',
            }],
          },
      }];
    }};

    const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: jest.fn(),
},
};

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantBranding {...props} />,
    ];

    const saveButton = await screen.findByText('Save');

    const colorPicker = getById(wrapper.container, 'branding-color-picker');
fireEvent.click(colorPicker.firstChild.firstChild.firstChild);
const hexTextbox = getByValue(wrapper.container, 'ABC123');
fireEvent.change(hexTextbox, { target: { value: 'aaaaaa' } });

    fireEvent.click(saveButton);

    expect(updateColor).toHaveBeenCalledWith('aaaaaa');
await waitFor(() =>
expect(props.history.push).toHaveBeenCalledWith(
`/admin/tenant/${mockTenant.id}/view`,
      ],
    ];
  }};

  test('Update favicon test', async () => {
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      console.log(
'Update Favicon Unhandled fetch mockImplementation',
endpoint,
config,
      ];

      return Promise.resolve({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({
message: 'Invalid file format',
statusCode: '500',
            }],
          },
      }];
    }};

    const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/view`,
},
},
};

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantBranding {...props} />,
    ];

    const saveButton = await screen.findByText('Save');

    const tenantFaviconInput = getById(
wrapper.container,
'tenant-favicon-file-input',
    ];

    const fs = require('fs');
const faviconBitmap = fs.readFileSync(
'src/components/TenantBranding/__test__/Astro_Logo.png',
    ];

    const faviconFile = new Blob([faviconBitmap]);

    fireEvent.change(tenantFaviconInput, { target: { files: [faviconFile] } });

    fireEvent.click(saveButton);
const alert = screen.getByText('The file must be an image.', {
exact: false,
    }};

    await waitFor(() => {
expect(screen.queryByText(alert)).not.toBeInTheDocument();
    }};
  }};

  test('Invalid file format', async () => {
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      console.log(
'Invalid file format Unhandled fetch mockImplementation',
endpoint,
config,
      ];

      return Promise.resolve({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({
message: 'Invalid file format',
statusCode: '500',
            }],
          },
      }];
    }};

    const props = {
...defaultProps,
};

    const wrapper = renderWithMockTenant(
mockTenant,
<TenantBranding {...props} />,
    ];

    const saveButton = await screen.findByText('Save');

    const colorPicker = getById(wrapper.container, 'branding-color-picker');
fireEvent.click(colorPicker.firstChild.firstChild.firstChild);
const hexTextbox = getByValue(wrapper.container, 'ABC123');
fireEvent.change(hexTextbox, { target: { value: 'aaaaaa' } });

    const fs = require('fs');
const bitmap = fs.readFileSync(
'src/components/TenantBranding/__test__/Astro_Logo.docx',
    ];
// const docxBase64 = new Buffer(bitmap).toString('base64');

    const file = new Blob([bitmap], {
type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }};

    const imageInput = getById(wrapper.container, 'branding-logo-file-input');
fireEvent.change(imageInput, { target: { files: [file] } });

    fireEvent.click(saveButton);

    // const message = await wrapper.getBy('tenant-branding-notification-message');
//wrapper.queryAllBy
const alert = screen.getByText('The file must be an image.', {
exact: false,
    }};
expect(alert);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  }};

  test('Fetch provides no data', async () => {
const serviceResponse = {
payload: null,
result: {
code: 1,
message: null,
errors: [
{
code: 'ERR_BRANDING_MISSING',
message: 'Cannot find branding for the specified tenant.',
},
],
},
};

    const mockJsonPromise = Promise.resolve(JSON.stringify(serviceResponse));
fetchSpy.mockResolvedValue({
ok: false,
text: () => mockJsonPromise,
    }};

    const props = {
...defaultProps,
};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const saveButton = await screen.findByText('Save');

    fireEvent.click(saveButton);

    const alert = screen.getByText('An image file is required.');
expect(alert);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  }};

  test('Should display and hide discard message', async () => {
const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
},
};

    const mockJsonPromise = Promise.resolve(fetchedBranding);
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
    }};

    const dom = renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const discardButton = await dom.findByText('Discard Changes');
fireEvent.click(discardButton);
const confirmButton = await dom.findByText('Yes, Discard!');
fireEvent.click(confirmButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${mockTenant.id}/view`,
    ];
  }};

  test('Should display and cancel discard message', async () => {
const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: (v) => {
fail(); // should not be called
},
},
};

    const mockJsonPromise = Promise.resolve(fetchedBranding);
fetchSpy.mockResolvedValue({
ok: true,
json: () => mockJsonPromise,
    }};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const discardButton = await screen.findByText('Discard Changes');
fireEvent.click(discardButton);
const cancel = await screen.findByText('Cancel');
fireEvent.click(cancel);
await waitFor(() => {
expect(
screen.queryByText('Your changes will be lost!'),
).not.toBeInTheDocument();
    }};
  }};

  test('Fetch returns error', async () => {
fetchSpy.mockResolvedValue({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
        },
    }};

    const props = {
...defaultProps,
};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const errorNotification = await screen.findByRole('full-page-status-error');
expect(errorNotification);
await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  }};

  /* TODO
test('Put returns error', async () => {
jest
.spyOn(window, 'fetch')
.mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
      }];
    }}
.mockImplementationOnce(() => {
return Promise.resolve({
ok: false,
text: () =>
Promise.resolve(
JSON.stringify({ message: 'error message', statusCode: '500' }),
          },
      }];
    }};

  const mockTenant = {
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
};

  const props = {
match: {
path: '',
params: {
tenantId: mockTenant.id,
},
},

    history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: v => {},
},
};

  const dom = renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

  const saveButton = await dom.findByText('Save');
act(() => {
fireEvent.click(saveButton);
  }};

  const errorNotification = await dom.findByRole('full-page-status-error');
expect(errorNotification);

  const getByArialabel = queryByAttribute.bind(null, 'aria-label');
const closeButton = await getByArialabel(dom.container, 'Close');
expect(closeButton);
act(() => {
fireEvent.click(closeButton);
  }};
}};
>[

  test('Notification Link URL input elements render with helper text.', async () => {
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      return Promise.resolve({
ok: false,
json: () => Promise.resolve(undefined),
      }];
    }};

    const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: (v) => {
fail();
},
},
};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    await screen.findByText(
'URL for LOX Home. Must be up to 500 characters in length.',
    ];
await screen.findByText(
'Base URL for CDX. Must be up to 500 characters in length.',
    ];
  }};

test('Notification Link URL input elements fail length validation 5oo+ characters.', async ()
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      return Promise.resolve({
ok: false,
json: () => Promise.resolve(undefined),
      }];
    }};

    const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: (v) => {
fail();
},
},
};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const loxHomeHelperTextEle = await screen.findByText(
'URL for LOX Home. Must be up to 500 characters in length.',
    ];
const cdxBaseUrlHelperTextEle = await screen.findByText(
'Base URL for CDX. Must be up to 500 characters in length.',
    ];

    let bigString = '';
for (let i = 0; i < 1000; i++) {
bigString += String(i);
}

    [loxHomeHelperTextEle, cdxBaseUrlHelperTextEle].forEach(
async (textElement) => {
const relatedInput = textElement.parentElement.querySelector('input');

// Input element related to helper text should have same id, minus the "-text" at the end.
expect(relatedInput).toHaveAttribute('id', textElement.id.slice(0, -5));

        fireEvent.change(relatedInput, { target: { value: bigString } });

        expect(textElement).toHaveTextContent(
'Value must be less than 500 characters long.',
        };
},
    ];
  }};

test('Notification Link URL input elements fail required validation with no input.', async ()
fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      return Promise.resolve({
ok: false,
json: () => Promise.resolve(undefined),
      }];
    }};

    const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
push: (v) => {
fail();
},
},
};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);

    const loxHomeHelperTextEle = await screen.findByText(
'URL for LOX Home. Must be up to 500 characters in length.',
    ];
const cdxBaseUrlHelperTextEle = await screen.findByText(
'Base URL for CDX. Must be up to 500 characters in length.',
    ];

    [loxHomeHelperTextEle, cdxBaseUrlHelperTextEle].forEach(
async (textElement) => {
const relatedInput = textElement.parentElement.querySelector('input');

I/ Input element related to helper text should have same id, minus the "-text" at the end.
expect(relatedInput).toHaveAttribute('id', textElement.id.slice(0, -5));

        fireEvent.change(relatedInput);

        await waitFor(() => {
expect(textElement).toHaveTextContent('A value must be provided.');
        }];
},
    ];
  }};

  test('Validate all fields succeeds when data is valid.', () => {
const result = allFieldsValid(brandingInfoData, (k, v) => {
console.log(`${k} key failed validation with error ${v}.`);
    }};
expect(result).toBeTruthy();
  }};

  test('Validate all fields fails when required URLs are invalid.', () => {
const validate = (dataToValidate) => {
return allFieldsValid(dataToValidate, (k, v) => {
//console.log(`${k} key failed validation with error ${v}.`);
      }];
};

    let data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.loxHomeLink = '';
expect(validate(data)).toBeFalsy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.cdxBaseUrl = '';
expect(validate(data)).toBeFalsy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.vanityUrl = '';
data.isDlxLicensed = true;
expect(validate(data)).toBeFalsy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.vanityUrl = '';
data.isDlxLicensed = false;
expect(validate(data)).toBeTruthy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.offersLandingPageVanityUrl = '';
data.isCnxLicensed = true;
expect(validate(data)).toBeFalsy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.offersLandingPageVanityUrl = '';
data.isCnxLicensed = false;
expect(validate(data)).toBeTruthy();

    data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.fiLoginPageUrl = '';
expect(validate(data)).toBeFalsy();

    data = Object.assign({}, brandingInfoData);
data.marketingSimRedirectUrl = 'A'.repeat(500);
expect(validate(data)).toBeTruthy();
data.marketingSimRedirectUrl = 'A'.repeat(501);
expect(validate(data)).toBeFalsy();
  }};

  test('Validate vanity url field fails when there is a trailing slash.', () => {
const validate = (dataToValidate) => {
return allFieldsValid(dataToValidate, (k, v) => {
console.log(`${k} key failed validation with error ${v}.`);
      }];
};

    const data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.vanityUrl = 'https://link.com/';
data.isDlxLicensed = true;
expect(validate(data)).toBeFalsy();
  }};

  test('Validate Offers vanity url field fails when there is a trailing slash.', () => {
const validate = (dataToValidate) => {
return allFieldsValid(dataToValidate, (k, v) => {
console.log(`${k} key failed validation with error ${v}.`);
      }];
};

    const data = Object.assign({}, brandingInfoData);
expect(validate(data)).toBeTruthy();
data.offersLandingPageVanityUrl = 'https://link.com/';
data.isCnxLicensed = true;
expect(validate(data)).toBeFalsy();
  }};

  test.skip('Should display social media section', async () => {
const props = {
...defaultProps,
history: {
location: {
pathname: `/admin/tenant/${mockTenant.id}/tenant-branding`,
},
},
};

    const fetchedBranding = {
payload: {
primaryColorHex: 'ABC123',
disclaimer: 'abc123',
signature: 'abc123',
link: 'abc123',
fromEmail: 'abc123@abc.com',
displayName: 'abc123',
socialMediaLinks: [
{
id: 'c56aa04f-fd39-4b42-b900-c4f387e549de',
typeId: 1,
url: 'https://link.com',
},
],
imageUrl: 'someUrl',
loxHomeLink: 'http://abc123.com',
cdxBaseUrl: 'http://abc123.com',
vanityUrl: 'https://link.com',
fiLoginPageUrl: 'https://login.mycu.com',
},
};

    fetchSpy.mockImplementation((endpoint, config) => {
if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-social-media-types') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve({ payload: [] }),
        }];
}

      if (
config.method === 'GET' &&
endpoint.indexOf('/tenant-brandings/') >= 0
      ] {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(fetchedBranding),
        }];
}

      return Promise.resolve({
ok: false,
json: () => Promise.resolve(undefined),
      }];
    }};

    renderWithMockTenant(mockTenant, <TenantBranding {...props} />);
const socialMedia = await screen.findByText('ADD');

    fireEvent.click(socialMedia);

    const discardButton = screen.getByRole('button', {
name: 'Discard Changes',
    }};
fireEvent.click(discardButton);
const confirmButton = await screen.findByText('Yes, Discard!');
fireEvent.click(confirmButton);
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${mockTenant.id}/view`,
    ];
  }};
}};
