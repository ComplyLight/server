// Author: Preston Lee

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { AbstractDataSegmentationModuleProvider } from '@complylight/core';
import { DataSegmentationModuleRegistry } from '@complylight/core';
import { DataSegmentationModule } from '@complylight/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class FileSystemDataSegmentationModuleProvider extends AbstractDataSegmentationModuleProvider {

    static MODULE_SCHEMA_FILE = path.join(__dirname, '..', 'node_modules', '@complylight', 'core', 'build', 'src', 'assets', 'schemas', 'data-segmentation-module.schema.json');
    static DEFAULT_MODULES_DIRECTORY = path.join(__dirname, 'data', 'modules');

    private modulesDirectory: string;
    private moduleFiles: Map<string, string> = new Map(); // moduleId -> filePath

    constructor(moduleRegistry: DataSegmentationModuleRegistry, modulesDirectory: string) {
        super(moduleRegistry);
        this.modulesDirectory = modulesDirectory;
        this.loadModules();
    }

    /**
     * Load all modules from the configured directory.
     */
    loadModules(): void {
        console.log('Loading modules from directory:', this.modulesDirectory);
        
        if (!fs.existsSync(this.modulesDirectory)) {
            try {
                console.warn(`Modules directory does not exist: ${this.modulesDirectory}. Creating it.`);
                fs.mkdirSync(this.modulesDirectory, { recursive: true });
            } catch (error: any) {
                console.error(`Failed to create modules directory ${this.modulesDirectory}:`, error.message);
                throw new Error(`Cannot create modules directory: ${error.message}`);
            }
            return;
        }

        // Verify it's actually a directory
        try {
            const stats = fs.statSync(this.modulesDirectory);
            if (!stats.isDirectory()) {
                throw new Error(`${this.modulesDirectory} exists but is not a directory`);
            }
        } catch (error: any) {
            console.error(`Error accessing modules directory ${this.modulesDirectory}:`, error.message);
            throw error;
        }

        const files = fs.readdirSync(this.modulesDirectory);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        if (jsonFiles.length === 0) {
            console.warn(`No module files found in ${this.modulesDirectory}`);
            return;
        }

        console.log(`Found ${jsonFiles.length} module file(s)`);

        for (const file of jsonFiles) {
            const filePath = path.join(this.modulesDirectory, file);
            try {
                const module = DataSegmentationModule.fromJson(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
                this.moduleRegistry.addModule(module);
                this.moduleFiles.set(module.id, filePath);
                console.log(`Loaded module: ${module.id} (${module.name}) - ${module.enabled ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error(`Failed to load module from ${filePath}:`, error);
            }
        }

        // Reinitialize bindings after loading modules
        this.reinitialize();
    }

    /**
     * Reload a specific module by ID.
     */
    reloadModule(moduleId: string): boolean {
        const filePath = this.moduleFiles.get(moduleId);
        if (!filePath || !fs.existsSync(filePath)) {
            return false;
        }

        try {
            const module = DataSegmentationModule.fromJson(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
            // Remove old module
            this.moduleRegistry.removeModule(moduleId);
            // Add reloaded module
            this.moduleRegistry.addModule(module);
            this.moduleFiles.set(module.id, filePath);
            this.reinitialize();
            console.log(`Reloaded module: ${moduleId}`);
            return true;
        } catch (error) {
            console.error(`Failed to reload module ${moduleId}:`, error);
            return false;
        }
    }

    /**
     * Save a module to disk from JSON data.
     */
    saveModule(moduleJson: any): string {
        const filePath = path.join(this.modulesDirectory, `${moduleJson.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(moduleJson, null, 2), 'utf-8');
        this.moduleFiles.set(moduleJson.id, filePath);
        return filePath;
    }

    /**
     * Delete a module file.
     */
    deleteModule(moduleId: string): boolean {
        const filePath = this.moduleFiles.get(moduleId);
        if (!filePath || !fs.existsSync(filePath)) {
            return false;
        }

        try {
            fs.unlinkSync(filePath);
            this.moduleRegistry.removeModule(moduleId);
            this.moduleFiles.delete(moduleId);
            this.reinitialize();
            console.log(`Deleted module: ${moduleId}`);
            return true;
        } catch (error) {
            console.error(`Failed to delete module ${moduleId}:`, error);
            return false;
        }
    }

    /**
     * Get the file path for a module.
     */
    getModuleFilePath(moduleId: string): string | null {
        return this.moduleFiles.get(moduleId) || null;
    }

    /**
     * Validate module JSON against schema.
     */
    validateModule(moduleJson: any): string | null {
        // Basic validation - check required fields
        if (!moduleJson.id || !moduleJson.name) {
            return 'Module must have id and name fields';
        }

        // Check if module ID already exists (for new modules)
        if (this.moduleRegistry.getModule(moduleJson.id)) {
            // This is OK for updates, but we'll handle that in the API
        }

        try {
            // Try to create module instance to validate structure
            DataSegmentationModule.fromJson(moduleJson);
            return null;
        } catch (error: any) {
            return error.message || 'Invalid module structure';
        }
    }

    /**
     * Get module schema file path.
     */
    static getModuleSchemaPath(): string {
        return FileSystemDataSegmentationModuleProvider.MODULE_SCHEMA_FILE;
    }
}

