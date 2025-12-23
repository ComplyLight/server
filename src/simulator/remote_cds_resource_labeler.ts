// Author: Preston Lee

import { Card, DataSharingCDSHookRequest, DataSharingEngineContext } from "@complylight/core";
import { Bundle, Consent, FhirResource } from "fhir/r5";
import axios from "axios";

export class RemoteCdsResourceLabeler {

    public labeledResources: FhirResource[] = [];
    public consentDecisions: { [key: string]: Card } = {};

    constructor(public consent: Consent, public bundle: Bundle, public cdsBaseUrl: string, public threshold: number, public rulesFile: string | null) {
    }

    reset() {
        this.labeledResources = [];
    }

    recomputeLabels(sendConsentOverride: boolean = false) {
        let patientId = this.consent?.subject?.reference || ('Patient/' + this.consent?.subject?.id);
        const data = new DataSharingCDSHookRequest();
        data.context.patientId = [{ value: patientId }];
        data.context.content = this.bundle;
        if(sendConsentOverride) {
            data.context.consent = [this.consent];
        }
        const headers: { [key: string]: string } = {};
        headers[DataSharingEngineContext.HEADER_CDS_REDACTION_ENABLED] = 'false';
        headers[DataSharingEngineContext.HEADER_CDS_CONFIDENCE_THRESHOLD] = this.threshold.toString();
        headers[DataSharingEngineContext.HEADER_CDS_CREATE_AUDIT_EVENT_ENABLED] = 'false';
        if(this.rulesFile) {
            headers[DataSharingEngineContext.HEADER_CDS_RULES_FILE] = this.rulesFile;
        }
        const url = this.cdsBaseUrl + '/cds-services/' + (new DataSharingCDSHookRequest().hook);
        console.debug('Invoking remote CDS labeling service at:', url);
        // console.debug('Data:', JSON.stringify(data.context));
        return axios.post<Card>(url, data, { headers: headers }).then((result) => {
            const data = result.data;
            // console.debug('Result: ', data);
            if (data.extension.content?.entry) {
                // console.debug('Entries:', data.extension.content.entry.length);
                this.labeledResources = data.extension.content.entry.map((e: any) => e.resource).filter((r: any) => r !== undefined);
            }
            // console.log('Security labeling completed.');
        });
    }

}

