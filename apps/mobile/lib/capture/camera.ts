// The camera, asked for only at the moment she wants to take a photo. One way to open it for the
// pages of a sheet (`useAttachments`) and for a photo of her own working (issue #444,
// `components/practice/useWorkPhoto.ts`).

import * as ImagePicker from 'expo-image-picker';

/**
 * Asks for the camera, then opens it. 'blocked': she has not allowed it (say so; nothing else
 * happened). `around` runs right before the camera opens and once it is closed again — the
 * capture screen notes what the photo is for, because Android may end the app meanwhile.
 * Throws when the camera itself fails.
 */
export async function openCamera(
  around: { opening: () => Promise<void>; closed: () => void } | null = null,
): Promise<ImagePicker.ImagePickerResult | 'blocked'> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'blocked';
  await around?.opening();
  try {
    return await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] });
  } finally {
    around?.closed();
  }
}
