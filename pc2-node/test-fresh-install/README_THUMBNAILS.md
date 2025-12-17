# Thumbnail Generation

PC2 Node includes automatic thumbnail generation for images, videos, PDFs, and text files.

## Dependencies

### Required (Included in package.json)
- **sharp** - Image processing and thumbnail generation
- **pdfjs-dist** - PDF thumbnail generation

### Optional
- **canvas** - Required for PDF and text file thumbnails (requires native compilation)
  - If not installed, PDF and text thumbnails will be disabled
  - Images and videos will still generate thumbnails

### System Requirements
- **ffmpeg** - Required for video thumbnail generation
  - Install via system package manager:
    - macOS: `brew install ffmpeg`
    - Ubuntu/Debian: `sudo apt-get install ffmpeg`
    - Fedora: `sudo dnf install ffmpeg`
  - If not installed, video thumbnails will be disabled
  - Images will still generate thumbnails

## Installation

When you install PC2 Node, required dependencies are automatically installed:

```bash
npm install
```

To enable PDF and text file thumbnails (optional):

```bash
npm install canvas
```

**Note:** Canvas requires native compilation. On some systems, you may need to install system libraries first:

- **macOS**: `brew install pkg-config cairo pango libpng jpeg giflib librsvg`
- **Linux**: Usually available via package manager (e.g., `sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`)

## How It Works

1. When a file is uploaded, PC2 Node automatically:
   - Detects the file type (image, video, PDF, text)
   - Generates a 128x128 PNG thumbnail
   - Stores it as a base64 data URL in the database
   - Returns it in API responses (`/stat`, `/readdir`)

2. Thumbnails are included in:
   - File metadata responses
   - Directory listings
   - WebSocket events (when files are added/modified)

3. If a dependency is missing:
   - Files still work normally
   - Only thumbnails for that file type are disabled
   - Logs will indicate which features are unavailable

## Supported File Types

- ✅ **Images** (JPEG, PNG, GIF, WebP, etc.) - Requires `sharp`
- ✅ **Videos** (MP4, MOV, WebM, etc.) - Requires `sharp` + `ffmpeg`
- ⚠️ **PDFs** - Requires `sharp` + `pdfjs-dist` + `canvas` (optional)
- ⚠️ **Text Files** - Requires `sharp` + `canvas` (optional)

## Troubleshooting

### Thumbnails not generating for images
- Check that `sharp` is installed: `npm list sharp`
- Check server logs for thumbnail errors
- Reinstall if needed: `npm install sharp`

### Video thumbnails not working
- Verify `ffmpeg` is installed: `ffmpeg -version`
- Check that `sharp` is installed
- Install `ffmpeg` via system package manager

### PDF/Text thumbnails not working
- Check that `canvas` is installed: `npm list canvas`
- If installation fails, install system libraries first (see above)
- PDF/Text thumbnails are optional - images/videos will still work

