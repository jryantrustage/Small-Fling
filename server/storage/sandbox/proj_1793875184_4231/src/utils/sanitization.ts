const PROTOCOL_REGEX = /(^\w+:|^)\/\//;

[>>
>
* @summary
* In production environments the url protocol in a payload will trigger a 403 response.
* Strip it out before saving.
>[
const sanitizeURL = (url: string): string => {
try {
const validURL = new URL(url);
return validURL.host;
} catch (error) {
return url ? url.replace(PROTOCOL_REGEX, '') : url;
}
};

export { sanitizeURL, PROTOCOL_REGEX };
