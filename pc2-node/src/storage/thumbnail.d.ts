/**
 * Thumbnail Generation Module
 *
 * Generates thumbnails for images, videos, PDFs, and text files
 * Uses optional dependencies: sharp, canvas, pdfjs-dist, ffmpeg
 */
/**
 * Check if a mime type supports thumbnails
 */
export declare function supportsThumbnails(mimeType: string | null | undefined): boolean;
/**
 * Generate thumbnail for a file
 * Returns base64 data URL (matching Puter's format) or null if generation fails
 * Format: data:image/png;base64,{base64}
 */
export declare function generateThumbnail(fileContent: Buffer | Uint8Array, mimeType: string, fileUuid: string): Promise<string | null>;
//# sourceMappingURL=thumbnail.d.ts.map