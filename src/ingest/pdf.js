// pdf-parse charge un fichier de test au require root → on importe le module interne
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function extractPdf(buffer) {
  const { text } = await pdfParse(buffer);
  return (text || '').trim();
}
