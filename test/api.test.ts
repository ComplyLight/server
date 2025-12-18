// Author: Preston Lee

import { describe, it } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import { DataSharingCDSHookRequest } from '@complylight/core';

import app from '../build/api.js';

describe('GET /', () => {

    it('it should return a JSON status document', async () => {
        const response = await request(app)
            .get('/')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200);
        
        assert.ok(response.body.message, "Document didn't include expected properties");
        assert.ok(response.body.datetime > 0, "Timestamp field 'datetime' not present");
    });

});

describe('GET /cds-services', () => {

    it('it should not choke or query parameters', async () => {
        await request(app)
            .get('/cds-services?foo=bar&type=valid&crap=null&junk=nil&bad=undefined')
            .expect(200);
    });

    it('it should contain at least one service declaration', async () => {
        const response = await request(app)
            .get('/cds-services')
            .expect(200);
        
        assert.ok(response.body.services.length > 0, "No services provided!");
        
        for (let n = 0; n < response.body.services.length; n++) {
            let r = response.body.services[n];
            assert.ok(r.hook, "Missing hook property");
            assert.ok(r.description, "Missing description property");
            assert.ok(r.id, "Missing id property");
            assert.ok(r.title, "Missing title property");
        }
    });

});

describe('POST /cds-services/patient-consent-consult', () => {

    it('it should not accept invalid JSON', async () => {
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send('something clearly not going to parse as JSON')
            .expect(400);
    });

    it('it should accept valid request', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId =[{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        // Add consent data to bypass FHIR server query
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200);
    });

});

describe('GET /schemas/*', () => {

    it('should return request schema', async () => {
        const response = await request(app)
            .get('/schemas/patient-consent-consult-hook-request.schema.json')
            .expect(200);
        
        const content = response.text || response.body?.toString?.();
        assert.ok(content, "Schema should be returned");
        assert.ok(content.includes('$schema'), "Should be valid JSON schema");
    });

    it('should return response schema', async () => {
        const response = await request(app)
            .get('/schemas/patient-consent-consult-hook-response.schema.json')
            .expect(200);
        
        const content = response.text || response.body?.toString?.();
        assert.ok(content, "Schema should be returned");
        assert.ok(content.includes('$schema'), "Should be valid JSON schema");
    });

    it('should return data segmentation module schema', async () => {
        const response = await request(app)
            .get('/schemas/data-segmentation-module.schema.json')
            .expect(200);
        
        const content = response.text || response.body?.toString?.();
        assert.ok(content, "Schema should be returned");
        assert.ok(content.includes('$schema'), "Should be valid JSON schema");
    });

});

describe('POST /cds-services/patient-consent-consult with headers', () => {

    it('should accept custom confidence threshold', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .set('x-cds-confidence-threshold', '0.8')
            .send(data)
            .expect(200);
    });

    it('should handle redaction disabled', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .set('x-cds-redaction-enabled', 'false')
            .send(data)
            .expect(200);
    });

    it('should handle audit event creation disabled', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .set('x-cds-create-audit-event-enabled', 'false')
            .send(data)
            .expect(200);
    });

});

describe('POST /cds-services/patient-consent-consult edge cases', () => {

    it('should handle empty patientId array', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200);
    });

    it('should handle empty category array', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.category = [];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200);
    });

    it('should handle request with content field', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.category = [{system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'patient-privacy'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        data.context.content = {
            resourceType: 'Bundle',
            type: 'collection',
            id: 'test-bundle',
            total: 1,
            entry: [{
                resource: {
                    resourceType: 'Observation',
                    id: 'obs-1',
                    status: 'final',
                    code: {
                        coding: [{
                            system: 'http://snomed.info/sct',
                            code: '123456789',
                            display: 'Test observation'
                        }]
                    }
                }
            }]
        };
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200);
    });

    it('should handle missing context fields gracefully', async () => {
        let data = new DataSharingCDSHookRequest();
        data.context.patientId = [{value: '2321'}];
        data.context.consent = [{
            resourceType: 'Consent',
            id: 'test-consent',
            status: 'active'
        }];
        // No category field
        
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send(data)
            .expect(200);
    });

});

describe('POST /cds-services/patient-consent-consult error handling', () => {

    it('should handle malformed JSON', async () => {
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send('{"invalid": json}')
            .expect(400);
    });

    it('should handle completely invalid request body', async () => {
        await request(app)
            .post('/cds-services/patient-consent-consult')
            .send('not json at all')
            .expect(400);
    });

});

describe('GET /modules', () => {

    it('should return list of modules', async () => {
        const response = await request(app)
            .get('/modules')
            .expect(200);
        
        assert.ok(Array.isArray(response.body), "Should return an array");
    });

});

describe('GET /modules/:id', () => {

    it('should return 404 for non-existent module', async () => {
        await request(app)
            .get('/modules/non-existent-module')
            .expect(404);
    });

});

describe('POST /modules', () => {

    it('should reject without authentication', async () => {
        await request(app)
            .post('/modules')
            .send({ id: 'test', name: 'Test' })
            .expect(401);
    });

    it('should reject invalid module without auth', async () => {
        await request(app)
            .post('/modules')
            .auth('administrator', process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD || '')
            .send({ invalid: 'structure' })
            .expect(400);
    });

});

describe('PUT /modules/:id', () => {

    it('should reject without authentication', async () => {
        await request(app)
            .put('/modules/test-module')
            .send({ id: 'test', name: 'Test' })
            .expect(401);
    });

    it('should return 404 for non-existent module', async () => {
        await request(app)
            .put('/modules/non-existent-module')
            .auth('administrator', process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD || '')
            .send({ id: 'non-existent-module', name: 'Test' })
            .expect(404);
    });

});

describe('DELETE /modules/:id', () => {

    it('should reject without authentication', async () => {
        await request(app)
            .delete('/modules/test-module')
            .expect(401);
    });

    it('should return 404 for non-existent module', async () => {
        await request(app)
            .delete('/modules/non-existent-module')
            .auth('administrator', process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD || '')
            .expect(404);
    });

});

describe('POST /modules/:id/enable', () => {

    it('should reject without authentication', async () => {
        await request(app)
            .post('/modules/test-module/enable')
            .expect(401);
    });

    it('should return 404 for non-existent module', async () => {
        await request(app)
            .post('/modules/non-existent-module/enable')
            .auth('administrator', process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD || '')
            .expect(404);
    });

});

describe('POST /modules/:id/disable', () => {

    it('should reject without authentication', async () => {
        await request(app)
            .post('/modules/test-module/disable')
            .expect(401);
    });

    it('should return 404 for non-existent module', async () => {
        await request(app)
            .post('/modules/non-existent-module/disable')
            .auth('administrator', process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD || '')
            .expect(404);
    });

});
