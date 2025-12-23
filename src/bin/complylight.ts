#!/usr/bin/env node

// Author: Preston Lee

import fs from 'fs';
import path from 'path';

import { program } from 'commander';
import axios from 'axios';
import { fileURLToPath } from 'url';

import { Bundle, Consent } from 'fhir/r5';
import { RemoteCdsResourceLabeler } from '../simulator/remote_cds_resource_labeler.js';
// Note: ConsoleDataSharingEngine, DummyRuleProvider, and ConsentCategorySettings may not be available in @complylight/core
// These are used only by the simulate-consent-cds command

// @ts-ignore - csv-parser doesn't have type definitions
import csvParser from 'csv-parser';
import { performance } from 'perf_hooks';

// import {start, stop}  from 'marky';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).version;

let dryRun = false;

const complylight = program.version(version)
	.description('CLI tool for managing CQL files as FHIR resources by the ComplyLight team.');

complylight
	.command('convert <filePath> [outputPath]')
	.description('Converts a .cql file to a base64 string')
	.action((filePath: string, outputPath?: string) => {
		try {
			const content = fs.readFileSync(filePath);
			const base64Content = content.toString('base64');
			if (outputPath) {
				fs.writeFileSync(outputPath, base64Content);
				console.log(`Base64 content written to ${outputPath}`);
			} else {
				console.log(base64Content);
			}
		} catch (error: any) {
			console.error(`Error: ${error.message}`);
		}
	});

complylight
	.command('create-fhir-bundle <filePath> <outputPath> <description> [ipUrl]')
	.description('Creates a FHIR bundle as a JSON file from an input .cql file')
	.action((filePath: string, outputPath: string, description: string, ipUrl: string = 'http://localhost:8080/fhir/') => {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			// Extract library name and version from the content using regex
			const libraryInfo = extractLibraryInfo(content);
			if (!libraryInfo) {
				console.error('Could not extract library name and version from the .cql file.');
				process.exit(1);
			}
			const { libraryName, version } = libraryInfo;

			const base64Content = Buffer.from(content).toString('base64');

			// Build the FHIR bundle JSON
			const fhirBundle = buildFHIRBundle(libraryName, version, description, base64Content, ipUrl);

			// Write the FHIR bundle JSON to outputPath
			fs.writeFileSync(outputPath, JSON.stringify(fhirBundle, null, 2));
			console.log(`FHIR bundle written to ${outputPath}`);
		} catch (error: any) {
			console.error(`Error: ${error.message}`);
		}
	});

complylight
	.command('post-fhir <filePath> <url>')
	.description('Posts a FHIR bundle JSON file to a FHIR server')
	.action(async (filePath: string, url: string) => {
		try {
			// Read the FHIR bundle JSON file
			const bundleContent = fs.readFileSync(filePath, 'utf8');
			const bundleJson = JSON.parse(bundleContent);

			// Perform POST request
			const response = await axios.post(url, bundleJson, {
				headers: {
					'Content-Type': 'application/fhir+json',
					'Accept': 'application/fhir+json',
				},
			});

			console.log(`Response Status: ${response.status} ${response.statusText}`);
			console.log('Response Data:', JSON.stringify(response.data, null, 2));
		} catch (error: any) {
			if (error.response) {
				console.error(`HTTP Error: ${error.response.status} ${error.response.statusText}`);
				console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
			} else {
				console.error(`Error: ${error.message}`);
			}
		}
	});

complylight
	.command('create-and-post <filePath> <outputPath> <description> <url>')
	.description('Creates a FHIR bundle from a .cql file and posts it to a specified URL')
	.action(async (filePath: string, outputPath: string, description: string, url: string) => {
		try {
			const content = fs.readFileSync(filePath, 'utf8');

			const libraryInfo = extractLibraryInfo(content);
			if (!libraryInfo) {
				console.error('Could not extract library name and version from the .cql file.');
				process.exit(1);
			}
			const { libraryName, version } = libraryInfo;
			const base64Content = Buffer.from(content).toString('base64');

			const baseUrl = url.endsWith('/') ? url : url + '/';
			const fhirBundle = buildFHIRBundle(libraryName, version, description, base64Content, baseUrl);

			fs.writeFileSync(outputPath, JSON.stringify(fhirBundle, null, 2));
			console.log(`FHIR bundle written to ${outputPath}`);

			const response = await axios.post(baseUrl, fhirBundle, {
				headers: {
					'Content-Type': 'application/fhir+json',
					'Accept': 'application/fhir+json',
				},
			});

			console.log(`Response Status: ${response.status} ${response.statusText}`);
			console.log('Response Data:', JSON.stringify(response.data, null, 2));
		} catch (error: any) {
			if (error.response) {
				console.error(`HTTP Error: ${error.response.status} ${error.response.statusText}`);
				console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
			} else {
				console.error(`Error: ${error.message}`);
			}
		}
	});

complylight.command('synthea-upload')
	.description('Upload a directory of Synthea-generated FHIR resources to a FHIR URL using Synthea file naming conventions and loading order.')
	.argument('<directory>', 'Directory with Synthea-generate "fhir" resource files')
	.argument('<url>', 'URL of the FHIR server to upload the resources to')
	.option('-d, --dry-run', 'Perform a dry run without uploading any resources')
	.action((directory: string, fhirUrl: string, options: any) => {
		dryRun = options.dryRun;
		if (dryRun) {
			console.log('Dry run enabled. No resources will be uploaded.');
		}
		const sDirectory = safeFilePathFor(directory);
		console.log(`Uploading Synthea-generated FHIR resources from ${sDirectory} to ${fhirUrl}`);
		const files = fs.readdirSync(sDirectory).filter(file => path.extname(file).toLowerCase() === '.json');
		const hospitals: string[] = [];
		const pratitioners: string[] = [];
		const patients: string[] = [];
		files.forEach((file, i) => {
			if (file.startsWith('hospitalInformation')) {
				hospitals.push(file);
			} else if (file.startsWith('practitionerInformation')) {
				pratitioners.push(file);
			} else {
				patients.push(file);
			}
		});
		// const sFiles = files.map((file) => path.join(sDirectory, file));
		uploadResources(hospitals, sDirectory, fhirUrl).then(() => {
			uploadResources(pratitioners, sDirectory, fhirUrl).then(() => {
				uploadResources(patients, sDirectory, fhirUrl).then(() => {
					console.log('Done');
				});
			});
		});
	});


complylight.command('simulate-consent-cds')
	.description('Headless consent simulator (Note: This command requires ConsoleDataSharingEngine, DummyRuleProvider, and ConsentCategorySettings from @complylight/core)')
	.argument('<cdsBaseUrl>', 'URL of the FHIR server from which to fetch Consent documents')
	.argument('<confidenceThreshold>', 'Confidence threshold for the simulator')
	.argument('<fhirBaseUrl>', 'URL of the FHIR server from which to fetch Consent documents')
	.argument('<consentId>', 'Identifier of a Consent resource to simulate')
	.argument('<bundleDirectory>', 'Local arbitrary directory of JSON FHIR Bundle files to use as patient record content. Each Bundle must contain a Patient resource.')
	.argument('<outputDirectory>', 'Directory in which to write simulator output')
	.option('-r, --rules-file <fileName.json>', 'Name of an alternate server-side JSON file containing rules for the engine')
	.option('-d, --dry-run', 'Perform a dry run without modifying any resources')
	.action((cdsBaseUrl: string, confidenceThreshold: string, fhirBaseUrl: string, consentId: string, bundleDirectory: string, outputDirectory: string, options: any) => {
		// marky.mark('simulator');
		dryRun = options.dryRun;
		if (dryRun) {
			console.log('Dry run enabled. No resources will be modified.');
		}
		const rulesFile: string | null = options.rulesFile || null;
		const sOutputDirectory = safeFilePathFor(outputDirectory);
		const url = `${fhirBaseUrl}/Consent/${consentId}`;
		axios.get(url, { headers: { 'Accept': 'application/fhir+json' } }).then((response) => {
			const consent = response.data as Consent;
			simulateAllConsents(cdsBaseUrl, parseFloat(confidenceThreshold), consent, bundleDirectory, sOutputDirectory, rulesFile).then(() => {
				console.log('Simulation complete');
				// marky.stop('total');
				// marky.entries().forEach((entry: any) => {
				// 	console.log(`${entry.name}: ${entry.duration}`);
				// 	console.log(entry.toJSON());
				// });
				// console.log('pp');				
				// swAll.prettyPrint();
				// console.log('s');				
				// console.log(swAll.shortSummary());
				// console.log('l');
				// console.log(swAll.getTotalTime());
			});
		}).catch((error) => {
			console.error(`Error fetching Consent resource:`, error);
		});
	});

complylight
	.command('verify-codes')
	.description(
		'Verifies JSON files for relevant codes based on a provided CSV and deletes irrelevant files if the delete flag is set.'
	)
	.argument('<fhirPath>', 'Path to the directory containing JSON files')
	.argument('<csvFilePath>', 'Path to the CSV file containing codes')
	.option('--delete', 'Delete irrelevant files')
	.action((fhirPath: string, csvFilePath: string, options: any) => {
		const { delete: deleteFlag } = options;
		verifyCodes(fhirPath, csvFilePath, deleteFlag);
	});

program.parse(process.argv);

complylight
	.command('valueset')
	.description('Download VSAC ValueSets and optionally upload to a HAPI-FHIR server')
	.argument('<ids...>', 'VSAC OIDs or canonical URLs')
	.option('--mode <m>', 'definition|expansion|both', 'expansion')
	.option('--version <yyyymmdd>', 'Specific VSAC ValueSet version')
	.option('--filter <text>', 'Server-side filter for $expand (optional)')
	.option('--out <dir>', 'Output directory', './valuesets')
	.option('--post <fhirBaseUrl>', 'Post to a FHIR server after download')
	.option('--post-mode <m>', 'definition|expanded', 'expanded')
	.option('--bundle', 'Wrap uploads in a transaction Bundle')
	.option('--umls-key <key>', 'UMLS API key (overrides env)')
	.option('--count <n>', 'Expansion page size', '1000')
	.option('--concurrency <n>', 'Concurrent OIDs to fetch', '4')
	.option('--retry <n>', 'Max retries for transient errors', '3')
	.option('--cache <dir>', 'Cache dir for fetched pages', '.vsac_cache')
	.option('--dry-run', 'Print actions without making changes', false)
	.action(async (ids: string[], opts: any) => {
		try {
			const umlsKey = opts.umlsKey || process.env.UMLS_API_KEY;
			if (!umlsKey) throw new Error('Missing UMLS API key. Set --umls-key or UMLS_API_KEY.');
			const client = buildVsacAxios(umlsKey);
			const concurrency = Math.max(1, +opts.concurrency || 4);
			const results: any[] = [];
			const startTime = performance.now();
			let completed = 0;
			let running = 0, idx = 0;
			async function next() {
				if (idx >= ids.length) return;
				const myIdx = idx++;
				running++;
				const id = ids[myIdx];
				try {
					const oid = normalizeVsacId(id);
					let defRes: any = null, expRes: any = null, versionForName: string | null = null;
					if (opts.mode === 'definition' || opts.mode === 'both') {
						defRes = opts.dryRun ? { resourceType: 'ValueSet', id: oid, version: opts.version || 'unknown' } : await fetchValueSetDefinition(client, oid, opts.version);
						versionForName = deriveVsacVersion(defRes) || opts.version || 'unknown';
						writeValueSetFiles(opts.out, oid, String(versionForName), defRes, 'definition');
					}
					if (opts.mode === 'expansion' || opts.mode === 'both') {
						const pages = opts.dryRun ? [{ resourceType: 'ValueSet', id: oid, version: opts.version || 'unknown', expansion: { contains: [] } }] : await fetchValueSetExpansion(client, oid, { version: opts.version, filter: opts.filter, count: +opts.count, cacheDir: opts.cache, dryRun: opts.dryRun, retry: +opts.retry });
						const merged = mergeExpansionPages(pages);
						versionForName = deriveVsacVersion(merged) || versionForName || opts.version || 'unknown';
						writeValueSetFiles(opts.out, oid, String(versionForName), merged, 'expanded');
						expRes = merged;
					}
					results[myIdx] = { oid, defRes, expRes, version: versionForName };
				} catch (e: any) {
					console.error(`[${id}] Error:`, e.response?.data ? operationOutcomeToMessage(e.response.data) : e.message);
					results[myIdx] = { oid: id, error: e.message };
				}
				completed++;
				const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
				const percent = Math.round((completed / ids.length) * 100);
				process.stdout.write(`\rProgress: ${completed}/${ids.length} OIDs (${percent}%) | Elapsed: ${elapsed}s`);
				running--;
				if (idx < ids.length) await next();
			}
			const starters = Array(Math.min(concurrency, ids.length)).fill(0).map(() => next());
			await Promise.all(starters);
			process.stdout.write('\n');
			if (opts.post) {
				const toUpload = results.flatMap(r => {
					if (opts.postMode === 'expanded' && r.expRes) return [r.expRes];
					if (opts.postMode === 'definition' && r.defRes) return [r.defRes];
					return [];
				});
				await postValueSetsToHapi(opts.post, toUpload, { bundle: !!opts.bundle, dryRun: opts.dryRun });
			}
			console.log('Summary:');
			console.log(`  OIDs processed: ${ids.length}`);
			console.log(`  Downloaded: ${results.filter(r => !r.error).length}`);
			console.log(`  Errors: ${results.filter(r => r.error).length}`);
		} catch (e: any) {
			console.error('Fatal error:', e.message);
			process.exit(1);
		}
	});


async function simulateAllConsents(cdsBaseUrl: string, confidenceThreshold: number, consent: Consent, bundleDirectory: string, outputDirectory: string, rulesFile: string | null) {
	const dirs = fs.readdirSync(bundleDirectory);
	for (let i = 0; i < dirs.length; i++) {
		const file = dirs[i];
		if (!file.endsWith('.json')) {
			console.warn(`Ignoring file that does not end in '.json': ${file}`);
		} else {
			const sBundleFile = safeFilePathFor(path.join(bundleDirectory, file));
			const json = JSON.parse(fs.readFileSync(sBundleFile).toString());
			await simulateConsent(cdsBaseUrl, confidenceThreshold, consent, json, outputDirectory, rulesFile);
		}
	}
}


async function simulateConsent(cdsBaseUrl: string, confidenceThreshold: number, consent: Consent, bundle: Bundle, outputDirectory: string, rulesFile: string | null) {
	console.error('Error: simulate-consent-cds command requires ConsoleDataSharingEngine, DummyRuleProvider, and ConsentCategorySettings from @complylight/core, which are not currently available.');
	console.error('This command is not functional until these classes are exported from @complylight/core.');
	throw new Error('simulate-consent-cds command not available: missing required classes from @complylight/core');
	
	// Original implementation (commented out until classes are available):
	// const labeler = new RemoteCdsResourceLabeler(consent, bundle, cdsBaseUrl, confidenceThreshold, rulesFile);
	// console.log(`Simulating Consent/${consent.id} from server with local Bundle of ${bundle.entry?.length} resources`);
	// const ruleProvider = new DummyRuleProvider();
	// const engine = new ConsoleDataSharingEngine(ruleProvider, confidenceThreshold, false, false);
	// const sharingContextSettings = new ConsentCategorySettings();
	// sharingContextSettings.treatment.enabled = true;
	// sharingContextSettings.research.enabled = true;
	// await labeler.recomputeLabels(true);
	// const decisions = engine.computeConsentDecisionsForResources(labeler.labeledResources, consent, sharingContextSettings);
	// let data = engine.exportDecisionsForCsv(sharingContextSettings, labeler.labeledResources, decisions);
	// let patientId = firstFirstPatientId(bundle);
	// if (patientId) {
	// 	fs.mkdirSync(outputDirectory, { recursive: true });
	// 	const csvPath = path.join(outputDirectory, `consent-${consent.id}-patient-${patientId}-simulation.csv`);
	// 	if (dryRun) {
	// 		console.log(`Dry run: Would have written CSV data to ${csvPath}`);
	// 	} else {
	// 		fs.writeFileSync(csvPath, data);
	// 		console.log(`CSV data written to ${csvPath}`);
	// 	}
	// } else {
	// 	console.warn(`No patient ID found in data file. Not writing CSV data for this file.`);
	// }
}

function firstFirstPatientId(bundle: Bundle) {
	let id = null;
	bundle.entry?.forEach((entry) => {
		if (entry.resource?.resourceType == 'Patient' && entry.resource?.id) {
			id = entry.resource.id;
		}
	})
	return id;
}

async function uploadResources(_paths: string[], directory: string, fhirUrl: string) {
	let next = _paths.shift();
	if (next) {
		await uploadResource(next, directory, fhirUrl);
		if (_paths.length > 0) {
			await uploadResources(_paths, directory, fhirUrl);
		}
	}
}

async function uploadResource(fileName: string, directory: string, fhirUrl: string) {
	const file = path.join(directory, fileName);
	const raw = fs.readFileSync(file).toString();
	const json = JSON.parse(raw) as any;
	// console.log(json);

	if (dryRun) {
		return new Promise<void>((resolve, reject) => {
			console.log(`Dry run: Would have uploaded ${fileName}`);
			resolve();

		});
	} else {
		return axios.post(fhirUrl, json, {
			headers: {
				'Content-Type': 'application/fhir+json',
				'Accept': 'application/fhir+json',
			},
		}).then((response) => {
			console.log(`[SUCCESS]: ${response.status} ${response.statusText}`, file);
			// console.log('Response Data:', JSON.stringify(response.data, null, 2));
		}).catch((error) => {
			if (error.response) {
				console.error(`[FAILURE]: ${error.response.status} ${error.response.statusText}`, file);
				console.error(JSON.stringify(error.response.data, null, 2));
			} else {
				console.error(`[ERROR]: ${error.message}`, file);
			}
		});
	}
}

function safeFilePathFor(fileName: string) {
	let safePath = fileName;
	if (!path.isAbsolute(fileName)) {
		safePath = path.join(process.cwd(), fileName);
	}
	// console.debug(`Safe path: ${safePath}`);
	return safePath;
}

function extractLibraryInfo(content: string) {
	const libraryRegex = /^library\s+(\w+)\s+version\s+'([^']+)'/m;
	const match = content.match(libraryRegex);
	if (match) {
		const libraryName = match[1];
		const version = match[2];
		return { libraryName, version };
	} else {
		return null;
	}
}

function buildFHIRBundle(
	libraryName: string,
	version: string,
	description: any,
	base64Content: string,
	baseUrl: string = 'http://localhost:8080/fhir/'
) {
	const libraryResource = {
		resourceType: 'Library',
		id: libraryName,
		url: `${baseUrl}Library / ${libraryName}`,
		version: version,
		name: libraryName,
		title: libraryName,
		status: 'active',
		description: description,
		content: [
			{
				contentType: 'text/cql',
				data: base64Content,
			},
		],
	};

	const bundle = {
		resourceType: 'Bundle',
		type: 'transaction',
		entry: [
			{
				fullUrl: `urn: uuid: ${libraryName}`,
				resource: libraryResource,
				request: {
					method: 'POST',
					url: `Library / ${libraryName}`,
				},
			},
		],
	};

	return bundle;
}

// Interfaces generated for mapping functions
interface CodeSystemMapping {
	[key: string]: string;
}

interface Instance {
	code: string;
	system: string;
	lineNumber: number;
}

interface FileInstance {
	file: string;
	instances: Instance[];
}

// Maps code formats in CSV to the formats present in FHIR bundles
const codeSystemMapping: CodeSystemMapping = {
	"SNOMED-CT": "http://snomed.info/sct",
	"LOINC": "http://loinc.org",
	"RxNorm": "http://www.nlm.nih.gov/research/umls/rxnorm",
};

async function parseCSV(filePath: string): Promise<Set<[string, string]>> {
	return new Promise((resolve, reject) => {
		const codes = new Set<[string, string]>();
		fs.createReadStream(filePath)
			.pipe(csvParser())
			.on('data', (row: any) => {
				if (row.Code && row.Code_Type && codeSystemMapping[row.Code_Type]) {
					codes.add([row.Code, codeSystemMapping[row.Code_Type]]);
				}
			})
			.on('end', () => resolve(codes))
			.on('error', reject);
	});
}

// TODO - Add option for custom paths for generated reports.
async function verifyCodes(inputPath: string, inputCsv: string, deleteFlag: boolean) {
	try {
		const codes = await parseCSV(inputCsv);
		// Other than non json files, selection ignores practitioner and hospital information
		const totalFiles = fs.readdirSync(inputPath).filter(
			(file) =>
				file.endsWith('.json') &&
				!file.startsWith('practitionerInformation') &&
				!file.startsWith('hospitalInformation')
		);

		let relevantFiles = 0;
		let irrelevantFiles = 0;
		const deletedFiles: string[] = [];
		const textSearchInstances: FileInstance[] = [];
		const startTime = performance.now();

		for (const [index, filename] of totalFiles.entries()) {
			const filePath = path.join(inputPath, filename);
			const lines = fs.readFileSync(filePath, 'utf-8').split('\n');

			let found = false;
			const instances: Instance[] = [];

			lines.forEach((line, lineIndex) => {
				codes.forEach(([code, system]) => {
					if (line.includes(code)) {
						const above = lineIndex > 0 ? lines[lineIndex - 1] : '';
						const below = lineIndex < lines.length - 1 ? lines[lineIndex + 1] : '';

						if (above.includes(system) || below.includes(system)) {
							instances.push({
								code,
								system,
								lineNumber: lineIndex + 1,
							});
							found = true;
						}
					}
				});
			});

			if (instances.length > 0) {
				textSearchInstances.push({
					file: filename,
					instances,
				});
			}

			if (found) {
				relevantFiles++;
			} else {
				irrelevantFiles++;
				if (deleteFlag) {
					fs.unlinkSync(filePath);
					deletedFiles.push(filename);
				}
			}
			const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
			const percent = Math.round(((index + 1) / totalFiles.length) * 100);
			process.stdout.write(`\rProgress: ${index + 1}/${totalFiles.length} Files (${percent}%) | Elapsed: ${elapsed}s`);
		}

		process.stdout.write('\n');
		const endTime = performance.now();
		const totalTime = ((endTime - startTime) / 1000).toFixed(2);

		const report = {
			totalFiles: totalFiles.length,
			relevantFiles,
			irrelevantFiles,
			deletedFiles,
			textSearchInstances,
			totalTime: `${totalTime} seconds`,
		};

		const reportPath = path.join(inputPath, 'verification_report.json');
		fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

		console.log('Verification complete:');
		console.log(`  Total files processed: ${totalFiles.length}`);
		console.log(`  Relevant files: ${relevantFiles}`);
		console.log(`  Irrelevant files: ${irrelevantFiles}`);
		if (deleteFlag) {
			console.log(`  Files deleted: ${deletedFiles.length}`);
		}
		console.log(`  Total time: ${totalTime} seconds`);
		console.log(`  Report saved to: ${reportPath}`);
	} catch (error) {
		if (error instanceof Error) {
			console.error(`Error: ${error.message}`);
		}
	}
}



// --- VSAC ValueSet Download/Upload Command Helper Functions ---
const VSAC_BASE = 'https://cts.nlm.nih.gov/fhir';

function normalizeVsacId(id: string): string {
	// Accepts OID, urn:oid:OID, or canonical URL
	const match = id.match(/([0-9]+\.[0-9.]+)/);
	if (!match) throw new Error(`Could not extract OID from '${id}'`);
	return match[1];
}

function buildVsacAxios(umlsKey: string) {
	return axios.create({
		baseURL: VSAC_BASE,
		auth: { username: 'apikey', password: umlsKey },
		headers: { Accept: 'application/fhir+json' },
		timeout: 30000,
	});
}

async function fetchValueSetDefinition(client: any, oid: string, version?: string) {
	const url = `/ValueSet/${oid}` + (version ? `?valueSetVersion=${version}` : '');
	const res = await client.get(url);
	return res.data;
}

async function fetchValueSetExpansion(client: any, oid: string, opts: { version?: string, filter?: string, count: number, cacheDir?: string, dryRun?: boolean, retry: number }) {
	let offset = 0, pages: any[] = [], got = 0, tries = 0;
	while (true) {
		let params: any = { offset, count: opts.count };
		if (opts.version) params.valueSetVersion = opts.version;
		if (opts.filter) params.filter = opts.filter;
		const paramStr = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
		const url = `/ValueSet/${oid}/$expand?${paramStr}`;
		let page;
		const cacheFile = opts.cacheDir ? path.join(opts.cacheDir, `vsac-${oid}-${opts.version || 'latest'}-page-${offset}.json`) : undefined;
		if (opts.cacheDir && cacheFile && fs.existsSync(cacheFile)) {
			page = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
		} else if (!opts.dryRun) {
			while (tries < opts.retry) {
				try {
					const res = await client.get(url);
					page = res.data;
					if (opts.cacheDir && cacheFile) {
						fs.mkdirSync(opts.cacheDir, { recursive: true });
						fs.writeFileSync(cacheFile, JSON.stringify(page, null, 2));
					}
					break;
				} catch (e: any) {
					if (e.response && e.response.status >= 500 || e.response?.status === 429) {
						tries++;
						await new Promise(r => setTimeout(r, 1000 * Math.pow(2, tries)));
						continue;
					}
					throw e;
				}
			}
			if (!page) throw new Error(`Failed to fetch expansion after ${opts.retry} retries.`);
		}
		if (!page) throw new Error('No expansion page fetched.');
		pages.push(page);
		const contains = page.expansion?.contains?.length || 0;
		got += contains;
		const total = page.expansion?.total;
		if (!contains || !total || got >= total) break;
		if (contains === 0) break;
		offset += contains;
	}
	return pages;
}

function mergeExpansionPages(pages: any[]): any {
	if (!pages.length) throw new Error('No expansion pages to merge.');
	const base = { ...pages[0] };
	base.expansion = { ...base.expansion, contains: pages.flatMap(p => p.expansion?.contains || []) };
	return base;
}

function deriveVsacVersion(resource: any): string {
	return resource.version || resource.expansion?.identifier || 'unknown';
}

function writeValueSetFiles(outDir: string, oid: string, version: string, data: any, mode: 'definition' | 'expanded') {
	fs.mkdirSync(outDir, { recursive: true });
	const safeVersion = version || 'unknown';
	const file = path.join(outDir, `ValueSet-${oid}-${safeVersion}-${mode}.json`);
	fs.writeFileSync(file, JSON.stringify(data, null, 2));
	return file;
}

async function postValueSetsToHapi(baseUrl: string, resources: any[], opts: { bundle?: boolean, dryRun?: boolean }) {
	if (opts.bundle) {
		const bundle = {
			resourceType: 'Bundle',
			type: 'transaction',
			entry: resources.map(r => ({
				resource: r,
				request: { method: 'POST', url: 'ValueSet' },
			}))
		};
		if (opts.dryRun) {
			console.log(`[Dry run] Would POST bundle to ${baseUrl}/`);
			return;
		}
		const res = await axios.post(baseUrl, bundle, {
			headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
		});
		console.log(`Bundle POST response: ${res.status} ${res.statusText}`);
	} else {
		for (const r of resources) {
			if (opts.dryRun) {
				console.log(`[Dry run] Would POST ValueSet to ${baseUrl}/ValueSet`);
				continue;
			}
			const res = await axios.post(baseUrl.replace(/\/?$/, '/ValueSet'), r, {
				headers: { 'Content-Type': 'application/fhir+json', 'Accept': 'application/fhir+json' },
			});
			console.log(`ValueSet POST response: ${res.status} ${res.statusText}`);
		}
	}
}

function operationOutcomeToMessage(oo: any): string {
	return (oo.issue || []).map((i: any) => i.diagnostics).join('; ');
}
// --- End of VSAC ValueSet Download/Upload Command Helper Functions ---

