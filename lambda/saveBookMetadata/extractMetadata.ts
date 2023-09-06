import { ExtractedMetadata } from "../../interfaces/databaseItems";



type data = Record<string, string | undefined>;

export const extractMetadata = (metadata: data): {
    title?: string;
    creator?: string;
    language?: string;
    source?: string;
    date?: string;
    publisher?: string;
    identifier?: string;
} => {
    const extractedMetadata: ExtractedMetadata = {};

    if (metadata['dc:title']) {
        extractedMetadata.title = typeof metadata['dc:title'][0] === 'string' ? metadata['dc:title'][0] : metadata['dc:title'][0]['_'];
    }

    if (metadata['dc:creator']) {
        extractedMetadata.creator = typeof metadata['dc:creator'][0] === 'string' ? metadata['dc:creator'][0] : metadata['dc:creator'][0]['_'];
    }

    if (metadata['dc:language']) {
        extractedMetadata.language = typeof metadata['dc:language'][0] === 'string' ? metadata['dc:language'][0] : metadata['dc:language'][0]['_'];
    }

    if (metadata['dc:source']) {
        extractedMetadata.source = typeof metadata['dc:source'][0] === 'string' ? metadata['dc:source'][0] : metadata['dc:source'][0]['_'];

    }

    if (metadata['dc:date']) {
        extractedMetadata.date = typeof metadata['dc:date'][0] === 'string' ? metadata['dc:date'][0] : metadata['dc:date'][0]['_'];
    }

    if (metadata['dc:publisher']) {
        extractedMetadata.publisher = typeof metadata['dc:publisher'][0] === 'string' ? metadata['dc:publisher'][0] : metadata['dc:publisher'][0]['_'];
    }

    if (metadata['dc:identifier']) {
        extractedMetadata.identifier = typeof metadata['dc:identifier'][0] === 'string' ? metadata['dc:identifier'][0] : metadata['dc:identifier'][0]['_'];
    }

    if (metadata.meta) {
        const metas = Array.isArray(metadata.meta) ? metadata.meta : [metadata.meta];

        for (const meta of metas) {
            const { property } = meta.$;
            const value = meta._;

            switch (property) {
                case 'dcterms:title':
                    extractedMetadata.title = value;
                    break;
                case 'dcterms:creator':
                    extractedMetadata.creator = value;
                    break;
                case 'dcterms:language':
                    extractedMetadata.language = value;
                    break;
                case 'dcterms:source':
                    extractedMetadata.source = value;
                    break;
                case 'dcterms:date':
                case 'dc:date':
                    extractedMetadata.date = value;
                    break;
                case 'dcterms:publisher':
                    extractedMetadata.publisher = value;
                    break;
                case 'dc:identifier':
                    extractedMetadata.identifier = value;
                case 'dcterms:identifier':
                    extractedMetadata.identifier = value;
                    break;
                default:
                    break;
            }
        }
    }

    return extractedMetadata;
}