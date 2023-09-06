import AdmZip from 'adm-zip';
import { parseString } from 'xml2js';

import { Metadata } from '../../interfaces/databaseItems';
import { extractMetadata } from './extractMetadata';


export const getMetadata = async (zipFilePath: string): Promise<Metadata | undefined> => {

    // Open the ZIP file
    const zip = new AdmZip(zipFilePath);

    const path = await getPackageOpfPath(zipFilePath);
    console.log(path);
    const substrings = path.split('/');

    console.log(substrings[substrings.length - 1]);

    // Get the entries in the OPS folder
    const opsEntries = zip.getEntries().filter((entry) => true);

    // Find the package.opf entry
    const packageOpfEntry = opsEntries.find((entry) => entry.entryName.endsWith(substrings[substrings.length - 1]));

    if (packageOpfEntry) {
        // Read the content of the package.opf file as XML
        const packageOpfXml = zip.readAsText(packageOpfEntry);


        // Parse XML to JSON
        const parseXml = (xml: string) =>
            new Promise((resolve, reject) => {
                parseString(xml, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

        try {
            const result = await parseXml(packageOpfXml);

            // Convert JSON to a single metadata object
            const packageOpfJson = JSON.parse(JSON.stringify(result, null, 2));

            let meta = [];
            if (typeof packageOpfJson.package.metadata != 'undefined')
                meta = packageOpfJson.package.metadata[0]
            else
                meta = packageOpfJson.package['opf:metadata'][0]

            const extracted = extractMetadata(meta);

            console.log(extracted);

            const metadata: Metadata = {
                id: extracted.identifier ?? "",
                title: extracted.title ?? "",
                creator: extracted.creator ?? "",
                language: extracted.language ?? "",
                source: extracted.source ?? "",
                date: extracted.date ?? "",
                publisher: extracted.publisher ?? "",
            };

            return metadata;
        } catch (error) {
            console.log('Error parsing XML:', error);
            return undefined;
        }
    } else {
        console.log('package.opf file not found.');
        return undefined;
    }

}


const getPackageOpfPath = async (zipFilePath: string) => {

    // Open the ZIP file
    const zip = new AdmZip(zipFilePath);

    const opsEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('META-INF/'));

    const packageOpfEntry = opsEntries.find((entry) => entry.entryName.endsWith('container.xml'));

    if (packageOpfEntry) {
        // Read the content of the package.opf file as XML
        const packageOpfXml = zip.readAsText(packageOpfEntry);

        // Parse XML to JSON
        const parseXml = (xml: string) =>
            new Promise((resolve, reject) => {
                parseString(xml, (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

        try {
            const result = await parseXml(packageOpfXml);

            // Convert JSON to a string with proper formatting
            const packageOpfJson = JSON.parse(JSON.stringify(result, null, 2));

            // console.log(packageOpfJson.container.rootfiles[0].rootfile[0]['$']['full-path']);

            let path = packageOpfJson.container.rootfiles[0].rootfile[0]['$']['full-path'];

            return path;

        } catch (error) {
            console.log('Error parsing XML:', error);
            return undefined;
        }
    } else {
        console.log('container.xml file not found.');
        return undefined;
    }

}
