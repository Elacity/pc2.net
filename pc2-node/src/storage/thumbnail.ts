/**
 * Thumbnail Generation Module
 * 
 * Generates thumbnails for images, videos, PDFs, and text files
 * Uses optional dependencies: sharp, canvas, pdfjs-dist, ffmpeg
 */

import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let sharp: any = null;
let canvas: any = null;
let pdfjs: any = null;

// Load required dependencies (sharp and pdfjs-dist are in package.json)
try {
  const sharpModule = await import('sharp');
  // sharp is the default export
  sharp = sharpModule.default || sharpModule;
  logger.info('[Thumbnail] ✅ Sharp loaded - image/video thumbnail generation enabled');
} catch (e) {
  logger.error('[Thumbnail] ❌ Sharp failed to load - image thumbnails will be disabled');
  logger.error('[Thumbnail] This is a required dependency. Please reinstall: npm install');
}

// Load optional dependency (canvas requires native compilation)
try {
  canvas = await import('canvas');
  logger.info('[Thumbnail] ✅ Canvas loaded - PDF/text thumbnail generation enabled');
} catch (e) {
  logger.warn('[Thumbnail] ⚠️  Canvas not available - PDF/text thumbnails will be disabled');
  logger.warn('[Thumbnail] 💡 Canvas is optional. To enable PDF/text thumbnails: npm install canvas');
  logger.warn('[Thumbnail] 💡 Note: Canvas requires native compilation and system libraries');
}

// Load required dependency (pdfjs-dist is in package.json)
try {
  const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs = pdfjsModule;
  logger.info('[Thumbnail] ✅ PDF.js loaded - PDF thumbnail generation enabled');
} catch (e) {
  logger.error('[Thumbnail] ❌ PDF.js failed to load - PDF thumbnails will be disabled');
  logger.error('[Thumbnail] This is a required dependency. Please reinstall: npm install');
}

/**
 * Check if a mime type supports thumbnails
 */
export function supportsThumbnails(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/') || 
         mimeType.startsWith('video/') || 
         mimeType === 'application/pdf' ||
         mimeType === 'text/plain' ||
         mimeType.startsWith('text/');
}

/**
 * Generate thumbnail for a file
 * Returns base64 data URL (matching Puter's format) or null if generation fails
 * Format: data:image/png;base64,{base64}
 */
export async function generateThumbnail(
  fileContent: Buffer | Uint8Array,
  mimeType: string,
  fileUuid: string
): Promise<string | null> {
  if (!sharp || !supportsThumbnails(mimeType)) {
    return null;
  }
  
  // Check if sharp is actually a function (it should be)
  if (typeof sharp !== 'function') {
    logger.warn('[Thumbnail] ⚠️  Sharp is not a function, skipping thumbnail generation');
    return null;
  }
  
  try {
    // Convert content to buffer
    let buffer: Buffer;
    if (Buffer.isBuffer(fileContent)) {
      buffer = fileContent;
    } else if (fileContent instanceof Uint8Array) {
      buffer = Buffer.from(fileContent);
    } else {
      return null;
    }
    
    // Skip if buffer is empty
    if (!buffer || buffer.length === 0) {
      return null;
    }
    
    if (mimeType.startsWith('image/')) {
      // Generate thumbnail for image
      const thumbnailBuffer = await sharp(buffer)
        .resize(128) // Match Puter's size (128px)
        .png() // Match Puter's format (PNG)
        .toBuffer();
      
      const base64 = thumbnailBuffer.toString('base64');
      return `data:image/png;base64,${base64}`;
      
    } else if (mimeType.startsWith('video/')) {
      // For videos, use ffmpeg to extract a frame
      try {
        const tempVideoPath = join(tmpdir(), `pc2-video-${fileUuid}.tmp`);
        const tempFramePath = join(tmpdir(), `pc2-video-frame-${fileUuid}.jpg`);
        
        // Write video buffer to temp file
        writeFileSync(tempVideoPath, buffer);
        
        // Extract first frame using ffmpeg
        execSync(
          `ffmpeg -i "${tempVideoPath}" -ss 0 -vframes 1 -vf "scale=128:128:force_original_aspect_ratio=decrease" -q:v 2 "${tempFramePath}"`,
          {
            stdio: 'ignore',
            timeout: 30000
          }
        );
        
        // Read the extracted frame
        if (existsSync(tempFramePath)) {
          const { readFileSync } = await import('fs');
          const frameBuffer = readFileSync(tempFramePath);
          const thumbnailBuffer = await sharp(frameBuffer)
            .resize(128)
            .png()
            .toBuffer();
          
          // Clean up temp files
          try { unlinkSync(tempVideoPath); } catch (e) {}
          try { unlinkSync(tempFramePath); } catch (e) {}
          
          const base64 = thumbnailBuffer.toString('base64');
          return `data:image/png;base64,${base64}`;
        }
        
        // Clean up on failure
        try { unlinkSync(tempVideoPath); } catch (e) {}
        return null;
      } catch (error: any) {
        logger.warn(`[Thumbnail] ⚠️  Video thumbnail generation failed (ffmpeg may not be installed): ${error.message}`);
        return null;
      }
      
    } else if (mimeType === 'application/pdf') {
      // For PDFs, generate thumbnail from first page
      if (!pdfjs || !canvas || !sharp) {
        return null;
      }
      
      try {
        const getDocument = pdfjs.getDocument;
        if (!getDocument) {
          return null;
        }
        
        const createCanvas = canvas.createCanvas;
        if (!createCanvas) {
          return null;
        }
        
        // Convert Buffer to Uint8Array
        const uint8Array = buffer instanceof Uint8Array 
          ? buffer 
          : new Uint8Array(buffer);
        
        // Load PDF document
        const loadingTask = getDocument({ data: uint8Array });
        const pdfDocument = await loadingTask.promise;
        
        // Get first page
        const page = await pdfDocument.getPage(1);
        
        // Calculate scale to fit 128px width
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = 128 / viewport.width;
        const scaledViewport = page.getViewport({ scale });
        
        // Create canvas and render page
        const canvasInstance = createCanvas(scaledViewport.width, scaledViewport.height);
        const context = canvasInstance.getContext('2d');
        
        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport
        };
        
        await page.render(renderContext).promise;
        
        // Convert canvas to PNG buffer
        const pdfImageBuffer = canvasInstance.toBuffer('image/png');
        
        // Use sharp to ensure consistent format and size
        const thumbnailBuffer = await sharp(pdfImageBuffer)
          .resize(128, 128, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .png()
          .toBuffer();
        
        const base64 = thumbnailBuffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      } catch (error: any) {
        logger.warn(`[Thumbnail] ⚠️  PDF thumbnail generation failed: ${error.message}`);
        return null;
      }
      
    } else if (mimeType === 'text/plain' || mimeType.startsWith('text/')) {
      // For text files, generate a thumbnail showing text preview
      if (!canvas || !sharp) {
        return null;
      }
      
      try {
        const createCanvas = canvas.createCanvas;
        if (!createCanvas) {
          return null;
        }
        
        // Convert buffer to text
        const textContent = buffer.toString('utf8');
        
        // Limit text length for thumbnail (first 500 chars)
        const previewText = textContent.substring(0, 500);
        const lines = previewText.split('\n').slice(0, 10); // First 10 lines max
        const displayText = lines.join('\n');
        
        // Create canvas for text preview
        const canvasWidth = 128;
        const canvasHeight = 128;
        const canvasInstance = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvasInstance.getContext('2d');
        
        // Background (light gray)
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Text styling
        ctx.fillStyle = '#333333';
        ctx.font = '10px monospace';
        ctx.textBaseline = 'top';
        
        // Draw text with padding
        const padding = 8;
        const lineHeight = 12;
        const maxWidth = canvasWidth - (padding * 2);
        
        let y = padding;
        for (const line of lines) {
          if (y + lineHeight > canvasHeight - padding) break;
          
          // Truncate line if too long
          let displayLine = line;
          const metrics = ctx.measureText(displayLine);
          if (metrics.width > maxWidth) {
            // Truncate and add ellipsis
            while (ctx.measureText(displayLine + '...').width > maxWidth && displayLine.length > 0) {
              displayLine = displayLine.slice(0, -1);
            }
            displayLine += '...';
          }
          
          ctx.fillText(displayLine, padding, y);
          y += lineHeight;
        }
        
        // Convert canvas to PNG buffer
        const textImageBuffer = canvasInstance.toBuffer('image/png');
        
        // Use sharp to ensure consistent format
        const thumbnailBuffer = await sharp(textImageBuffer)
          .resize(128, 128)
          .png()
          .toBuffer();
        
        const base64 = thumbnailBuffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      } catch (error: any) {
        logger.warn(`[Thumbnail] ⚠️  Text file thumbnail generation failed: ${error.message}`);
        return null;
      }
    }
  } catch (error: any) {
    logger.warn(`[Thumbnail] ⚠️  Thumbnail generation failed: ${error.message}`);
    return null;
  }
  
  return null;
}
