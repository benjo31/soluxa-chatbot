import { config } from '../config.js';

export async function extractImage(buffer) {
  if (!config.enableOcr) {
    return '[Image fournie — OCR désactivé. Activez ENABLE_OCR=1 et installez tesseract.js pour extraire le texte.]';
  }
  // Import paresseux pour éviter de charger tesseract si pas utilisé
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('fra+eng');
  try {
    const { data } = await worker.recognize(buffer);
    return (data.text || '').trim();
  } finally {
    await worker.terminate();
  }
}
