import { extractPdf } from './pdf.js';
import { extractDocx } from './docx.js';
import { extractText } from './text.js';
import { extractImage } from './image.js';

export async function extractContent({ buffer, mime, filename }) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (mime === 'application/pdf' || ext === 'pdf') return extractPdf(buffer);
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) return extractDocx(buffer);
  if (mime?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
    return extractImage(buffer);
  }
  if (mime?.startsWith('text/') || ['txt', 'md', 'csv'].includes(ext)) {
    return extractText(buffer);
  }
  // Fallback : tente du texte brut
  return extractText(buffer);
}
