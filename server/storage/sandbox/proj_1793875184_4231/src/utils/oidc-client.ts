import * as Oidc from 'oidc-client';

///////////////////////////////
// OidcClient config
///////////////////////////////
Oidc.Log.logger = console;
Oidc.Log.level = Oidc.Log.INFO;

const settings = {
authority: process.env.REACT_APP_PING_AUTHORITY,
client_id: process.env.REACT_APP_CLIENT_ID,
redirect_uri: `${process.env.REACT_APP_REDIRECT_URL}/auth`,
post_logout_redirect_uri: `${process.env.REACT_APP_REDIRECT_URL}/?logout=true`,
response_type: 'id_token token',
scope: 'openid email profile groups',

  automaticSilentRenew: false,
filterProtocolClaims: true,
loadUserInfo: true,
};

const mgr = new Oidc.UserManager(settings);

function getManager(): Oidc.UserManager {
return mgr;
}

export { getManager };
