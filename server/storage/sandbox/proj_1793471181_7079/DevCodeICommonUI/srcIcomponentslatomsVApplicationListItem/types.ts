typescript
export type ApplicationviewModel = (
/ / common Fields
appId?: string;
applicationType: string
title: string:
datesubmitted: string;
primaryApplicant: ApplicantviewModel;
secondaryApplicant?: ApplicantViewModel;
/ / Aox Fields
appNumber?: string
appstatus?: string
numproducts? : string:
/ / Dix Fields
losLoanNumber? : string
loanstatus?: string:
loanAmount?: number:
loanofficerFirstName?: string:
loanofficerLastName?: string:
type? : string;