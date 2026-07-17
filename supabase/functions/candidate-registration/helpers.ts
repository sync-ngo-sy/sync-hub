export function detectAllowedMimeType(fileBytes: Uint8Array): string | null {
  if (
    fileBytes.length >= 5 &&
    fileBytes[0] === 0x25 &&
    fileBytes[1] === 0x50 &&
    fileBytes[2] === 0x44 &&
    fileBytes[3] === 0x46 &&
    fileBytes[4] === 0x2d
  ) {
    return "application/pdf";
  }

  if (
    fileBytes.length >= 8 &&
    fileBytes[0] === 0xd0 &&
    fileBytes[1] === 0xcf &&
    fileBytes[2] === 0x11 &&
    fileBytes[3] === 0xe0 &&
    fileBytes[4] === 0xa1 &&
    fileBytes[5] === 0xb1 &&
    fileBytes[6] === 0x1a &&
    fileBytes[7] === 0xe1
  ) {
    return "application/msword";
  }

  if (
    fileBytes.length >= 4 &&
    fileBytes[0] === 0x50 &&
    fileBytes[1] === 0x4b &&
    fileBytes[2] === 0x03 &&
    fileBytes[3] === 0x04
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return null;
}
