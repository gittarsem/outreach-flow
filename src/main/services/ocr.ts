import { stat } from 'node:fs/promises';
import { createWorker } from 'tesseract.js';

const englishData = require('@tesseract.js-data/eng') as { langPath: string };
const maxImageBytes = 20 * 1024 * 1024;

export async function recognizeJobScreenshot(imagePath: string): Promise<string> {
  const image = await stat(imagePath);
  if (!image.isFile()) throw new Error('Choose an image file.');
  if (image.size > maxImageBytes) throw new Error('Choose an image smaller than 20 MB.');

  const worker = await createWorker('eng', 1, {
    langPath: englishData.langPath,
    cacheMethod: 'none'
  });
  try {
    const { data: { text } } = await worker.recognize(imagePath);
    const result = text.trim();
    if (!result) throw new Error('No readable text was found in that screenshot.');
    return result;
  } finally {
    await worker.terminate();
  }
}