// Author: Preston Lee

import axios from 'axios';
import { defer, map } from 'rxjs';

import { Bundle, Coding, Consent } from 'fhir/r5';

import { AbstractDataSharingEngine, AbstractDataSegmentationModuleProvider, DataSharingEngineContext, DataSegmentationModuleRegistry, SystemCode, SystemValue } from '@complylight/core';
import { FHIRAuditService } from '../audit/fhir_audit_service.js';

export class FileSystemCodeMatchingThesholdCDSHookEngine extends AbstractDataSharingEngine {

    static DEFAULT_THRESHOLD = 0.0;

    constructor(
        moduleProvider: AbstractDataSegmentationModuleProvider,
        threshold: number,
        redaction_enabled: boolean,
        create_audit_event: boolean,
        moduleRegistry: DataSegmentationModuleRegistry
    ) {
        super(moduleProvider, threshold, redaction_enabled, create_audit_event, moduleRegistry);
    }

    async findConsents(subjects: SystemValue[], categories: SystemCode[]) {
        let url = process.env.COMPLYLIGHT_SERVER_FHIR_BASE_URL + '/Consent';
        // console.log(JSON.stringify(categories));        
        // console.log(subjects.map(n => { return 'subject=' + n.value }).join('&'));
        let params = [...subjects.map(n => { return 'subject=' + n.value }), ...categories.map(n => { return 'category=' + n.code })];
        let query = '?' + params.join('&');
        // console.log('URL: ' + url + query);
        // let consents = await this.queryConsents(url + query);

        // We can't return the native axios object since it's not in the abstract method signature.
        // Using rxjs instead: https://medium.com/front-end-weekly/how-to-wrap-axios-inside-rxjs-with-typescript-and-react-6c21e47dcb63
        return defer(() => axios.get<Bundle<Consent>>(url + query)).pipe(map(response => response.data));
    }


    createAuditEvent(consents: Consent[], engineContext: DataSharingEngineContext, outcodeCode: Coding) {
        FHIRAuditService.create(consents, engineContext, outcodeCode).then(res => {
            console.log("Created AuditEvent/" + res.data.id);
        }, e => {
            console.error('Failed to create AuditEvent: ' + e);
        });
    }


}
