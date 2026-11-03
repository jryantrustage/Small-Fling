export type ConsumerMgmtCredentials = {
login: string;
password: string;
deviceId?: string;
tenantId: string;
};

























export type ConsumerMgmtUpdateEmailRequest = {
email: string;
login: string;
token: string;
tenantId: string;
};

export type ConsumerMgmtUpdatePasswordRequest = {
currentPassword: string;
newPassword: string;
token: string;
tenantId: string;
};

export type ConsumerMgmtGetPasswordTimestampRequest = {
token: string;
tenantId: string;
};

export type ConsumerMgmtGetPasswordTimestampResponse = {
passwordSetDate: Date;
};

























export type ConsumerMgmtMfaRequest = {
status: string;
stateToken: string;
passCode?: string;
factor: ConsumerMgmtMfaFactor;
resend?: boolean;
tenantId: string;
};

export type ConsumerMgmtResetPasswordRequest = {
stateToken?: string;
newPassword?: string;
tenantId: string;
};
