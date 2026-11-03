import { SignInWizardSuccess } from 'components/organisms';
import { LocalStorageBackupValues } from 'commonui-shared';

interface IStorageService {
getItem: (name: string) => string | null;
set: (name: string, value: string) => void;
removeItem: (name: string) => void;
clear: () => void;
}

export const storagePrimary: IStorageService = {
getItem: (name: string): string | null => {
return window.localStorage.getItem(name);
},
set: (name: string, value: string): void => {
window.localStorage.setItem(name, value);
},
removeItem: (name: string): void => {
window.localStorage.removeItem(name);
},
























export const retryWithBackup = <T>(action: (storage: IStorageService) => T): T => {
try {
return action(storageRef);
} catch (e: any) {
if (e instanceof DOMException && storageRef === storagePrimary) {
// switch to backup storage and retry
storageRef = storageBackup;
return action(storageRef);
}
throw e;
}
};

export const set = (name: string, value: string): void => retryWithBackup(({ set }) => set(name, value));
export const getItem = (name: string): string | null => retryWithBackup(({ getItem }) => getItem(name));
export const removeItem = (name: string): void => retryWithBackup(({ removeItem }) => removeItem(name));
export const clearAll = (): void => retryWithBackup(({ clear }) => clear());

export const CONSTANTS = {
ALERT__SIM_SUPPRESS_ADJUSTMENT_GROWL: 'alert_sim_suppressAdjustmentGrowl',
MYLOAN_GET_ACCESS_MEMBERSHIP_GROWL: 'myloan-get-access-membership-growl',
OKTA_TOKEN_STORAGE: 'okta-token-storage',
OAUTH2_TOKEN_STORAGE: 'oauth2-token-storage',
CACHED_SIMULATION: 'cached-simulation',
























refreshToken: input.refreshToken,
codeVerifier: input.codeVerifier,
userEmail: input.userEmail,
userId: input.userId,
};
set(CONSTANTS.OKTA_TOKEN_STORAGE, JSON.stringify(obj));
};
