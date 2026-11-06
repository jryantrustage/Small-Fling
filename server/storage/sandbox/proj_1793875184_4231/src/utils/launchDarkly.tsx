import { useFlags } from 'launchdarkly-react-client-sdk';

// Enum or even a dictionary lookup.
export const FeatureFlags = {
DECISIONING: 'product2047607Decisioning',
LOS_PRODUCT_ID: 'feature2937805AddConfigToCuAdminForProductId',
};

[>>
>
* @param flagKey Key to get feature flag.  Configured in the launchDarkly file.
* @returns boolean representing if a feature is active or not
>
* NoTE: If your feature is enabled this hook is not guranteed to start returning true everytime.
It is possible for the call to useFlags to return an empty object one or more times beforereturning
* an object containing the correct feature flag values.
>[
export const useGetFeatureFlags = (
flagKey: keyof typeof FeatureFlags,
): boolean => {
const flags = useFlags();
const flag = FeatureFlags[flagKey];
return flags[flag] ?? false;
};
