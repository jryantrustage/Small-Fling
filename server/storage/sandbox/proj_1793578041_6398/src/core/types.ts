import { VehicleCondition } from './enums';

/** *****************************************************************************

TYPES

GLOBAL types go here. These are types that will be used by components throughout
the application.

DO NOT REACH INTO OTHER COMPONENTS TO GRAB TYPES!
If you need a type that exists elsewhere, then consider moving it HERE.

Types are distinct from interfaces! Though they are used in a similar fashion
























address2?: string;
city: string;
state: string;
zip5: string;
zip4: string;
}

export interface IOption {
value: string;
label: string;
}

export type Entity = {
id: string;
name: string;
};

/**
* Deprecated. Use IPricingOption instead
*/
export type VehicleValue = {
configuredValue: number;
priceTypeDisplay: string;
};
























transmission?: string;
values?: VehicleValue[];
// Ah the joys of multiple, differeing type definitions...
bodyStyleCode?: string;
weight?: number;
GVW?: number;
GVWR?: number;
HP?: number;
fuelType?: string;
source?: string;
};

export type NumberLimits = {
min: number;
max: number;
};

export type AuthToken = string;

/**
* @summary
* @param key unique identifier that can be used as React key
* @param label optional text to server as label for value
*/























