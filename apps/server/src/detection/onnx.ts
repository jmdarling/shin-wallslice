import { access } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';

export { ort };

/** Load an ONNX model, or return undefined (with the reason) if the file is missing or invalid. */
export async function loadModel(
  path: string,
): Promise<{ session: ort.InferenceSession } | { error: string }> {
  try {
    await access(path);
  } catch {
    return { error: `model file not found: ${path}` };
  }
  try {
    const session = await ort.InferenceSession.create(path, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    return { session };
  } catch (error) {
    return { error: `failed to load ${path}: ${(error as Error).message}` };
  }
}
