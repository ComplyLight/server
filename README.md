# ComplyLight FHIR Consent Labeling & Redaction CDS Hooks Services

[![Build Status](https://ci.complylight.com/api/badges/complylight/server/status.svg)](https://ci.complylight.com/complylight/server)

The ComplyLight Server from [ComplyLight](https://www.complylight.com) is a production implementation of modular FHIR and standards-based data segmentation servers via configurable rule processing and data labeling, such that healthcare data sharing may be determination decisions and content data redaction functions based on FHIR and CDS Hooks.

At a high level, FHIR Consent Service:

 - Loads a configurable set of data segmentation modules and metadata. 
 - Accepts REST invokations (based on the CDS Hooks request/response protocol) of a data sharing consent contexnt and optional FHIR bundle.
 - Queries a FHIR backend server for Consent documents and determines which, if any, are applicable to the CDS invokation context.
 - Informs the client (via FHIR ActCodes) on the nature of segmentation rules found to be pertinent to the request.
 - Redact the optionally-provided FHIR bundle, when provided, based on all available module bindings and applicable Consent information.

# Running the Service with Docker/Podman/Kubernetes

## Step 1: Run the CDS Service and FHIR backend

### Option 1: Use your own R5 server
If you have your own FHIR R5 server, either set the following environment variables or create a `.env` file with KEY=value definitions for the following:

```bash
COMPLYLIGHT_SERVER_FHIR_BASE_URL=https://your_fhir_server_url
COMPLYLIGHT_SERVER_ADMINISTRATOR_PASSWORD=password_for_post_endpoints
COMPLYLIGHT_SERVER_MODULES_DIRECTORY=/path/to/modules/directory
```

**Note:** The `COMPLYLIGHT_SERVER_MODULES_DIRECTORY` environment variable specifies the directory where data segmentation module JSON files are stored. On first startup, default core modules will be automatically copied from the core library to this directory if it doesn't already exist.

Then run the latest ComplyLight Consent Service build:

```shell
$ docker run -it --rm -p 3000:3000 complylight/server:latest
```

To load sample FHIR bundles into your FHIR R5 backend
```shell
find src/samples -name '*.json' -exec curl -X POST -H 'Content-Type: application/fhir+json' http://localhost:8080/fhir -d @{} \;
```
### Option 2: Use our example HAPI server

If you do not have a server, you may use the  must have a backend FHIR server, such as HAPI FHIR, available as well.  

## Step 2: Load Seed Data

TODO document using the ComplyLight Stack Controller!

## Step 3: Build Your Consent Documents

Consent documents in FHIR R5 are very different than in R4 and prior releases. They are generally more flexible -- e.g. they do not only apply to patients -- and the logical representation requires different considerations than prior implementations.

We have also developed a UI for provider browsing and management of R5 Consent documents called [ComplyLight Portal](https://github.com/complylight/portal) that aims to fully support both management of FHIR Consent documents as well as comprehensive data segmentation.

## Running From Source

```shell
$ npm i # to install dependencies
$ npm run start # to run normally, or
$ npm run watch # to automatically restart upon code changes
```

## Testing From Source

```shell
$ npm run test # to run once, or
$ npm run test-watch # to automatically rerun tests upon code or test changes
```


## Building

```shell
$ docker build -t complylight/server:latest . # Local CPU architecture only
$ docker buildx build --platform linux/arm64/v8,linux/amd64 -t complylight/server:latest . --push # Multi-architecture
```

# Examples

TODO Write comprehensive examples of running each major use case.
```bash

curl -H 'Accept: application/json' -H 'Content-Type: application/json' http://localhost:3000

curl -H 'Accept: application/json' -H 'Content-Type: application/json' http://localhost:3000/cds-services

curl -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d "@`pwd`/test/example-request-permit.json" http://localhost:3000/cds-services/patient-consent-consult

curl -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d "@`pwd`/test/example-request-no-consent-found.json" http://localhost:3000/cds-services/patient-consent-consult

curl -X POST -H 'Accept: application/json' -H 'Content-Type: application/json' -d "@`pwd`/test/example-request-deny.json" http://localhost:3000/cds-services/patient-consent-consult
```

# Overriding Execution Behavior with HTTP Headers

## CDS-Confidence-Threshold: <number> (default: 0.0)

The CDS-Confidence-Threshold header can be used to specify a new minimum threshold value used to determine what constitutes an applicable binding. Bindings may use any arbitrary confidence values, though the default bindings use 0.0 <= x <= 1.0. So if you want to change this value from the default, try a value greater than 0.0 but less than 1.0. Overly high values will prevent _any_ binding from matching.

## "CDS-Redaction-Enabled": true | <any> (default: true)

By default, the engine will automatically redact any resources labeled as sensitive. You may disable this behavior if, for example, you would to see what the engine considered sensitive for a given set of inputs, but do _not_ want it to actually redact those resources.

## Attribution

Preston Lee
