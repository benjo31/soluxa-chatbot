import mammoth from 'mammoth';

export async function extractDocx(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return (value || '').trim();
}
