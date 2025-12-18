
import * as fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { AbstractDataSharingCDSHookValidator } from '@complylight/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class FileSystemDataSharingCDSHookValidator extends AbstractDataSharingCDSHookValidator {

    static REQUEST_SCHEMA_FILE = path.join(__dirname, '..', 'node_modules', '@complylight', 'core', 'build', 'src', 'assets', 'schemas', 'patient-consent-consult-hook-request.schema.json');
    static RESPONSE_SCHEMA_FILE = path.join(__dirname, '..', 'node_modules', '@complylight', 'core', 'build', 'src', 'assets', 'schemas', 'patient-consent-consult-hook-response.schema.json');
    
    static REQUEST_SCHEMA = fs.readFileSync(FileSystemDataSharingCDSHookValidator.REQUEST_SCHEMA_FILE).toString();
    static RESPONSE_SCHEMA = fs.readFileSync(FileSystemDataSharingCDSHookValidator.RESPONSE_SCHEMA_FILE).toString();

    requestSchema(): string {
        // console.log("Request schema:");
        // console.log(FileSystemDataSharingCDSHookValidator.REQUEST_SCHEMA);
        return JSON.parse(FileSystemDataSharingCDSHookValidator.REQUEST_SCHEMA);
    }

    responseSchema(): string {
        // console.log("Response schema:");
        // console.log(FileSystemDataSharingCDSHookValidator.RESPONSE_SCHEMA);
        return JSON.parse(FileSystemDataSharingCDSHookValidator.RESPONSE_SCHEMA);
    }
}