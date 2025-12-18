// import fs from 'fs';
// import path from 'path';
// import dotenv from 'dotenv';
// dotenv.config();
// import axios from 'axios';

// console.log("ComplyLight CDS Sample Data Loader");

// const base = process.env.COMPLYLIGHT_SERVER_FHIR_BASE_URL;
// if (base) {
//     console.log('Using COMPLYLIGHT_SERVER_FHIR_BASE_URL: ' + base);
// } else {
//     console.error('COMPLYLIGHT_SERVER_FHIR_BASE_URL must be set. Exiting, sorry!');
//     process.exit(1);
// }


// const samples_path = path.join(__dirname, '..', 'samples');
// // console.log(samples_path);


// async function loadFile(f: string, bundle: string) {
//     return await axios.post(base!, bundle, { headers: { 'Content-Type': 'application/fhir+json' } }).then(r => {
//         console.log('Loaded ' + f);
//         // console.log( JSON.stringify(r.data));
//     }, error => {
//         console.error('Error loading ' + f);
//         console.error(error.response.data);
//     });
// }
// // console.log('Done!');

// fs.readdirSync(samples_path).filter(n => { return n.match(/.*\.json$/) }).forEach(f => {

//     const bundle = fs.readFileSync(path.join(samples_path, f)).toString();
//     // const url = base +
//     loadFile(f, bundle);
// });


