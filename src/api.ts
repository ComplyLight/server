// Author: Preston Lee

import fs from 'fs';
import express from "express";
import basicAuth from 'express-basic-auth';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const my_version = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json')).toString()).version;

import { DataSharingCDSHookRequest, DataSharingEngineContext, DataSegmentationModuleRegistry, DataSegmentationModule } from '@complylight/core';

import { BundleEntry, Consent } from 'fhir/r5';

import { FileSystemCodeMatchingThesholdCDSHookEngine } from './patient_consent_consult_hook_processors/file_system_code_matching_theshold_cds_hook_engine.js';
import { FileSystemDataSharingCDSHookValidator } from './file_system_data_sharing_cds_hook_validator.js';
import { FileSystemDataSegmentationModuleProvider } from './file_system_data_segmentation_module_provider.js';

// Environment variable validation
if (process.env.COMPLYLIGHT_SERVER_FHIR_BASE_URL) {
    console.log('Using COMPLYLIGHT_SERVER_FHIR_BASE_URL ' + process.env.COMPLYLIGHT_SERVER_FHIR_BASE_URL);
} else {
    console.error('COMPLYLIGHT_SERVER_FHIR_BASE_URL must be set. Exiting, sorry!');
    process.exit(1);
}
if (!process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD) {
    console.error('COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD must be set. Exiting, sorry!');
    process.exit(1);
}
if (!process.env.COMPLYLIGHT_SERVER_MODULES_DIRECTORY) {
    console.error('COMPLYLIGHT_SERVER_MODULES_DIRECTORY must be set. Exiting, sorry!');
    process.exit(1);
}

// Resolve modules directory path (handles both absolute and relative paths)
// Relative paths are resolved relative to the current working directory
const modulesDirectoryRaw = process.env.COMPLYLIGHT_SERVER_MODULES_DIRECTORY;
const modulesDirectory = path.isAbsolute(modulesDirectoryRaw) 
    ? modulesDirectoryRaw 
    : path.resolve(process.cwd(), modulesDirectoryRaw);

// Create modules directory if it doesn't exist
if (!fs.existsSync(modulesDirectory)) {
    try {
        fs.mkdirSync(modulesDirectory, { recursive: true });
        console.log(`Created modules directory: ${modulesDirectory}`);
    } catch (error: any) {
        console.error(`Failed to create modules directory ${modulesDirectory}:`, error.message);
        process.exit(1);
    }
} else {
    // Verify it's actually a directory
    const stats = fs.statSync(modulesDirectory);
    if (!stats.isDirectory()) {
        console.error(`${modulesDirectory} exists but is not a directory. Exiting, sorry!`);
        process.exit(1);
    }
}

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use(cors());

// Copy prepackaged modules from core library if they don't exist
const prepackagedModulesDir = path.join(__dirname, '..', 'node_modules', '@complylight', 'core', 'build', 'src', 'assets', 'modules');

if (fs.existsSync(prepackagedModulesDir)) {
    try {
        const files = fs.readdirSync(prepackagedModulesDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        for (const file of jsonFiles) {
            const sourcePath = path.join(prepackagedModulesDir, file);
            const destPath = path.join(modulesDirectory, file);
            
            if (!fs.existsSync(destPath)) {
                try {
                    fs.copyFileSync(sourcePath, destPath);
                    console.log(`Copied ${file} to modules directory`);
                } catch (error) {
                    console.error(`Failed to copy ${file}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Failed to read prepackaged modules directory:', error);
    }
} else {
    console.warn('Prepackaged modules directory not found in core package. Expected at:', prepackagedModulesDir);
}

// Initialize module registry and provider
const moduleRegistry = new DataSegmentationModuleRegistry();
let moduleProvider: FileSystemDataSegmentationModuleProvider;
let cds_hooks_validator: FileSystemDataSharingCDSHookValidator;

try {
    moduleProvider = new FileSystemDataSegmentationModuleProvider(moduleRegistry, modulesDirectory);
    cds_hooks_validator = new FileSystemDataSharingCDSHookValidator();
} catch (error: any) {
    console.error('Failed to initialize module provider:', error.message);
    process.exit(1);
}

// Root URL
app.get('/', (req, res) => {
    res.json({
        message: "This is a CDS Hooks server that is accessed programmatically via HTTP REST calls. You probably meant to call the /cds-services discovery endpoint instead.",
        datetime: Date.now(),
        version: my_version
    });
});

// The CDS Hooks discovery endpoint.
app.get('/cds-services', (req, res) => {
    const json =
    {
        "services": [
            {
                "hook": "patient-consent-consult",
                "title": "ComplyLight Patient Consent Consult",
                "description": "ComplyLight consent decision services enable queries about the patient consents applicable to a particular workflow or exchange context.",
                "id": "patient-consent-consult",
                "prefetch": { "patient": "Patient/{{context.patientId}}" },
                "usageRequirements": "Access to the FHIR Patient data potentially subject to consent policies."
            }]
    }
        ;
    res.json(json);

});

const custom_theshold_header = DataSharingEngineContext.HEADER_CDS_CONFIDENCE_THRESHOLD.toLowerCase();
const redaction_enabled_header = DataSharingEngineContext.HEADER_CDS_REDACTION_ENABLED.toLowerCase();
const create_audit_event_header = DataSharingEngineContext.HEADER_CDS_CREATE_AUDIT_EVENT_ENABLED.toLowerCase();

app.post('/cds-services/patient-consent-consult', (req, res) => {
    const results = cds_hooks_validator.validateRequest(req.body);

    if (results) {
        res.status(400).json({ html: results });
    } else {
        let data: DataSharingCDSHookRequest = req.body;
        let subjects = (data.context.patientId || []);
        let categories = data.context.category || [];

        let redaction_enabled: boolean = (req.headers[redaction_enabled_header] == 'true' || req.headers[redaction_enabled_header] == null);
        console.log("Resource redaction:", redaction_enabled);

        let create_audit_event: boolean = (req.headers[create_audit_event_header] == 'true' || req.headers[create_audit_event_header] == null);
        console.log('Create audit event:', create_audit_event);

        let threshold: number = Number(req.headers[custom_theshold_header]);
        if (threshold) {
            console.log("Using requested confidence threshold: " + threshold);
        } else {
            threshold = FileSystemCodeMatchingThesholdCDSHookEngine.DEFAULT_THRESHOLD;
            console.log('Using default confidence threshold: ' + threshold);
        }

        let proc = new FileSystemCodeMatchingThesholdCDSHookEngine(moduleProvider, threshold, redaction_enabled, create_audit_event, moduleRegistry);
        if (data.context.consent != null && data.context.consent.length > 0) {
            console.log("Consent(s) overrides in request context will forgo FHIR server query.");
            let card = proc.process(data.context.consent, data.context);
            res.status(200).send(JSON.stringify(card, null, "\t"));
        } else {
            console.log('Querying FHIR server for Consent document(s).');
            proc.findConsents(subjects, categories).then(resp => {
                resp.subscribe({
                    next: n => {
                        const entries: BundleEntry<Consent>[] | undefined = n.entry;
                        if (entries) {
                            let consents: Consent[] = entries.map(n => { return n.resource! }) as unknown as Consent[];
                            console.log('Consents returned from FHIR server:');
                            console.log(JSON.stringify(consents));
                            let card = proc.process(consents, data.context);
                            res.status(200).send(JSON.stringify(card, null, "\t"));
                        } else {
                            res.status(502).send({ message: 'No Consent documents or other error processing request. See logs.' });
                        }
                    }, error: e => {
                        let msg = 'Error loading Consent documents.';
                        console.error(msg);
                        res.status(502).send({ message: msg, details: e });
                    }
                });
            });
        }
    }
});

// Schema endpoints
app.get('/schemas/patient-consent-consult-hook-request.schema.json', (req, res) => {
    try {
        const content = fs.readFileSync(FileSystemDataSharingCDSHookValidator.REQUEST_SCHEMA_FILE);
        res.status(200).send(content);
    } catch (error) {
        console.error('Error reading request schema file:', error);
        res.status(500).json({ error: 'Failed to read schema file' });
    }
});

app.get('/schemas/patient-consent-consult-hook-response.schema.json', (req, res) => {
    try {
        const content = fs.readFileSync(FileSystemDataSharingCDSHookValidator.RESPONSE_SCHEMA_FILE);
        res.status(200).send(content);
    } catch (error) {
        console.error('Error reading response schema file:', error);
        res.status(500).json({ error: 'Failed to read schema file' });
    }
});

app.get('/schemas/data-segmentation-module.schema.json', (req, res) => {
    try {
        const content = fs.readFileSync(FileSystemDataSegmentationModuleProvider.getModuleSchemaPath());
        res.status(200).send(content);
    } catch (error) {
        console.error('Error reading module schema file:', error);
        res.status(500).json({ error: 'Failed to read schema file' });
    }
});

// Module management endpoints
app.get('/modules', (req, res) => {
    try {
        const modules = moduleRegistry.getModules().map(m => ({
            id: m.id,
            name: m.name,
            version: m.version,
            description: m.description,
            enabled: m.enabled
        }));
        res.status(200).json(modules);
    } catch (error) {
        console.error('Error listing modules:', error);
        res.status(500).json({ error: 'Failed to list modules' });
    }
});

app.get('/modules/:id', (req, res) => {
    try {
        const module = moduleRegistry.getModule(req.params.id);
        if (!module) {
            res.status(404).json({ error: 'Module not found' });
            return;
        }
        // Read the module file directly to return the original JSON
        const filePath = moduleProvider.getModuleFilePath(req.params.id);
        if (!filePath || !fs.existsSync(filePath)) {
            res.status(404).json({ error: 'Module file not found' });
            return;
        }
        const moduleJson = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.status(200).json(moduleJson);
    } catch (error: any) {
        console.error('Error getting module:', error);
        res.status(500).json({ error: 'Failed to get module', details: error.message });
    }
});

app.post('/modules', basicAuth({ users: { administrator: process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    try {
        const validationError = moduleProvider.validateModule(req.body);
        if (validationError) {
            res.status(400).json({ message: "Invalid module.", error: validationError });
            return;
        }

        // Check if module already exists
        if (moduleRegistry.getModule(req.body.id)) {
            res.status(409).json({ message: "Module with this ID already exists. Use PUT to update." });
            return;
        }

        const module = DataSegmentationModule.fromJson(req.body);
        moduleProvider.saveModule(req.body);
        moduleRegistry.addModule(module);
        moduleProvider.reinitialize();
        
        console.log('Module created:', module.id);
        res.status(201).json({ message: 'Module created successfully.', id: module.id });
    } catch (error: any) {
        console.error('Error creating module:', error);
        res.status(500).json({ error: 'Failed to create module', details: error.message });
    }
});

app.put('/modules/:id', basicAuth({ users: { administrator: process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    try {
        const existingModule = moduleRegistry.getModule(req.params.id);
        if (!existingModule) {
            res.status(404).json({ error: 'Module not found' });
            return;
        }

        // Ensure the ID in the body matches the URL parameter
        if (req.body.id && req.body.id !== req.params.id) {
            res.status(400).json({ error: 'Module ID in body must match URL parameter' });
            return;
        }
        req.body.id = req.params.id;

        const validationError = moduleProvider.validateModule(req.body);
        if (validationError) {
            res.status(400).json({ message: "Invalid module.", error: validationError });
            return;
        }

        const module = DataSegmentationModule.fromJson(req.body);
        moduleProvider.saveModule(req.body);
        moduleRegistry.removeModule(req.params.id);
        moduleRegistry.addModule(module);
        moduleProvider.reinitialize();
        
        console.log('Module updated:', module.id);
        res.status(200).json({ message: 'Module updated successfully.', id: module.id });
    } catch (error: any) {
        console.error('Error updating module:', error);
        res.status(500).json({ error: 'Failed to update module', details: error.message });
    }
});

app.delete('/modules/:id', basicAuth({ users: { administrator: process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    try {
        const module = moduleRegistry.getModule(req.params.id);
        if (!module) {
            res.status(404).json({ error: 'Module not found' });
            return;
        }

        const deleted = moduleProvider.deleteModule(req.params.id);
        if (deleted) {
            res.status(200).json({ message: 'Module deleted successfully.' });
        } else {
            res.status(500).json({ error: 'Failed to delete module file' });
        }
    } catch (error: any) {
        console.error('Error deleting module:', error);
        res.status(500).json({ error: 'Failed to delete module', details: error.message });
    }
});

app.post('/modules/:id/enable', basicAuth({ users: { administrator: process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    try {
        const enabled = moduleRegistry.enableModule(req.params.id);
        if (enabled) {
            moduleProvider.reinitialize();
            res.status(200).json({ message: 'Module enabled successfully.' });
        } else {
            res.status(404).json({ error: 'Module not found' });
        }
    } catch (error: any) {
        console.error('Error enabling module:', error);
        res.status(500).json({ error: 'Failed to enable module', details: error.message });
    }
});

app.post('/modules/:id/disable', basicAuth({ users: { administrator: process.env.COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD } }), (req, res) => {
    try {
        const disabled = moduleRegistry.disableModule(req.params.id);
        if (disabled) {
            moduleProvider.reinitialize();
            res.status(200).json({ message: 'Module disabled successfully.' });
        } else {
            res.status(404).json({ error: 'Module not found' });
        }
    } catch (error: any) {
        console.error('Error disabling module:', error);
        res.status(500).json({ error: 'Failed to disable module', details: error.message });
    }
});

export default app;
