import { logger } from '../utils/logger.js';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
let sharp = null;
let canvas = null;
let pdfjs = null;
try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default || sharpModule;
    logger.info('[Thumbnail] ✅ Sharp loaded - image/video thumbnail generation enabled');
}
catch (e) {
    logger.error('[Thumbnail] ❌ Sharp failed to load - image thumbnails will be disabled');
    logger.error('[Thumbnail] This is a required dependency. Please reinstall: npm install');
}
try {
    canvas = await import('canvas');
    logger.info('[Thumbnail] ✅ Canvas loaded - PDF/text thumbnail generation enabled');
}
catch (e) {
    logger.warn('[Thumbnail] ⚠️  Canvas not available - PDF/text thumbnails will be disabled');
    logger.warn('[Thumbnail] 💡 Canvas is optional. To enable PDF/text thumbnails: npm install canvas');
    logger.warn('[Thumbnail] 💡 Note: Canvas requires native compilation and system libraries');
}
try {
    const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs = pdfjsModule;
    logger.info('[Thumbnail] ✅ PDF.js loaded - PDF thumbnail generation enabled');
}
catch (e) {
    logger.error('[Thumbnail] ❌ PDF.js failed to load - PDF thumbnails will be disabled');
    logger.error('[Thumbnail] This is a required dependency. Please reinstall: npm install');
}
export function supportsThumbnails(mimeType) {
    if (!mimeType)
        return false;
    return mimeType.startsWith('image/') ||
        mimeType.startsWith('video/') ||
        mimeType === 'application/pdf' ||
        mimeType === 'text/plain' ||
        mimeType.startsWith('text/');
}
export async function generateThumbnail(fileContent, mimeType, fileUuid) {
    if (!sharp || !supportsThumbnails(mimeType)) {
        return null;
    }
    if (typeof sharp !== 'function') {
        logger.warn('[Thumbnail] ⚠️  Sharp is not a function, skipping thumbnail generation');
        return null;
    }
    try {
        let buffer;
        if (Buffer.isBuffer(fileContent)) {
            buffer = fileContent;
        }
        else if (fileContent instanceof Uint8Array) {
            buffer = Buffer.from(fileContent);
        }
        else {
            return null;
        }
        if (!buffer || buffer.length === 0) {
            return null;
        }
        if (mimeType.startsWith('image/')) {
            const thumbnailBuffer = await sharp(buffer)
                .resize(128)
                .png()
                .toBuffer();
            const base64 = thumbnailBuffer.toString('base64');
            return `data:image/png;base64,${base64}`;
        }
        else if (mimeType.startsWith('video/')) {
            try {
                const tempVideoPath = join(tmpdir(), `pc2-video-${fileUuid}.tmp`);
                const tempFramePath = join(tmpdir(), `pc2-video-frame-${fileUuid}.jpg`);
                writeFileSync(tempVideoPath, buffer);
                execSync(`ffmpeg -i "${tempVideoPath}" -ss 0 -vframes 1 -vf "scale=128:128:force_original_aspect_ratio=decrease" -q:v 2 "${tempFramePath}"`, {
                    stdio: 'ignore',
                    timeout: 30000
                });
                if (existsSync(tempFramePath)) {
                    const { readFileSync } = await import('fs');
                    const frameBuffer = readFileSync(tempFramePath);
                    const thumbnailBuffer = await sharp(frameBuffer)
                        .resize(128)
                        .png()
                        .toBuffer();
                    try {
                        unlinkSync(tempVideoPath);
                    }
                    catch (e) { }
                    try {
                        unlinkSync(tempFramePath);
                    }
                    catch (e) { }
                    const base64 = thumbnailBuffer.toString('base64');
                    return `data:image/png;base64,${base64}`;
                }
                try {
                    unlinkSync(tempVideoPath);
                }
                catch (e) { }
                return null;
            }
            catch (error) {
                logger.warn(`[Thumbnail] ⚠️  Video thumbnail generation failed (ffmpeg may not be installed): ${error.message}`);
                return null;
            }
        }
        else if (mimeType === 'application/pdf') {
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
                const uint8Array = buffer instanceof Uint8Array
                    ? buffer
                    : new Uint8Array(buffer);
                const loadingTask = getDocument({ data: uint8Array });
                const pdfDocument = await loadingTask.promise;
                const page = await pdfDocument.getPage(1);
                const viewport = page.getViewport({ scale: 1.0 });
                const scale = 128 / viewport.width;
                const scaledViewport = page.getViewport({ scale });
                const canvasInstance = createCanvas(scaledViewport.width, scaledViewport.height);
                const context = canvasInstance.getContext('2d');
                const renderContext = {
                    canvasContext: context,
                    viewport: scaledViewport
                };
                await page.render(renderContext).promise;
                const pdfImageBuffer = canvasInstance.toBuffer('image/png');
                const thumbnailBuffer = await sharp(pdfImageBuffer)
                    .resize(128, 128, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                    .png()
                    .toBuffer();
                const base64 = thumbnailBuffer.toString('base64');
                return `data:image/png;base64,${base64}`;
            }
            catch (error) {
                logger.warn(`[Thumbnail] ⚠️  PDF thumbnail generation failed: ${error.message}`);
                return null;
            }
        }
        else if (mimeType === 'text/plain' || mimeType.startsWith('text/')) {
            if (!canvas || !sharp) {
                return null;
            }
            try {
                const createCanvas = canvas.createCanvas;
                if (!createCanvas) {
                    return null;
                }
                const textContent = buffer.toString('utf8');
                const previewText = textContent.substring(0, 500);
                const lines = previewText.split('\n').slice(0, 10);
                const displayText = lines.join('\n');
                const canvasWidth = 128;
                const canvasHeight = 128;
                const canvasInstance = createCanvas(canvasWidth, canvasHeight);
                const ctx = canvasInstance.getContext('2d');
                ctx.fillStyle = '#f5f5f5';
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.fillStyle = '#333333';
                ctx.font = '10px monospace';
                ctx.textBaseline = 'top';
                const padding = 8;
                const lineHeight = 12;
                const maxWidth = canvasWidth - (padding * 2);
                let y = padding;
                for (const line of lines) {
                    if (y + lineHeight > canvasHeight - padding)
                        break;
                    let displayLine = line;
                    const metrics = ctx.measureText(displayLine);
                    if (metrics.width > maxWidth) {
                        while (ctx.measureText(displayLine + '...').width > maxWidth && displayLine.length > 0) {
                            displayLine = displayLine.slice(0, -1);
                        }
                        displayLine += '...';
                    }
                    ctx.fillText(displayLine, padding, y);
                    y += lineHeight;
                }
                const textImageBuffer = canvasInstance.toBuffer('image/png');
                const thumbnailBuffer = await sharp(textImageBuffer)
                    .resize(128, 128)
                    .png()
                    .toBuffer();
                const base64 = thumbnailBuffer.toString('base64');
                return `data:image/png;base64,${base64}`;
            }
            catch (error) {
                logger.warn(`[Thumbnail] ⚠️  Text file thumbnail generation failed: ${error.message}`);
                return null;
            }
        }
    }
    catch (error) {
        logger.warn(`[Thumbnail] ⚠️  Thumbnail generation failed: ${error.message}`);
        return null;
    }
    return null;
}
//# sourceMappingURL=thumbnail.js.map