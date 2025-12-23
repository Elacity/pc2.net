let history_index_at_last_save=0,unsavedChanges=!1,curfile,editor;

async function attempt_exit(){
  var alert_resp;
  $(editor).pintura("history").index===history_index_at_last_save||"Don't Save"===(alert_resp=await puter.ui.alert("Do you want to save the changes you made?",[{label:"Save",type:"primary"},{label:"Don't Save"},{label:"Cancel"}]))?puter.exit():"Save"===alert_resp&&(curfile?save_file(()=>{puter.exit()}):(filename=res.filename,read_url=res.read_url,write_url=res.write_url,unsavedChanges=!1,puter.ui.setWindowTitle(filename),puter.exit()))
}

async function save_file(callback){
  try {
    console.log('[Viewer] Save button clicked, starting save...');
    console.log('[Viewer] curfile:', curfile);
    console.log('[Viewer] curfile.write_url:', curfile?.write_url || curfile?.writeURL);
    
    // Get processed image from Pintura editor
    var image = (await $(editor).pintura("processImage")).dest;
    console.log('[Viewer] Processed image:', image, 'Type:', typeof image, 'Is Blob:', image instanceof Blob, 'Size:', image.size);
    
    if (!curfile) {
      console.error('[Viewer] ❌ No curfile object!');
      alert('Error: No file object available to save');
      $("#save-btn").prop("disabled",!1);
      return;
    }
    
    // CRITICAL: Always use direct write_url for binary data (Blobs)
    // The SDK's write() method may not handle Blobs correctly for binary data
    const writeUrl = curfile.write_url || curfile.writeURL;
    
    if (!writeUrl) {
      console.error('[Viewer] ❌ No write_url available!', curfile);
      alert('Error: File write URL not available');
      $("#save-btn").prop("disabled",!1);
      return;
    }
    
    console.log('[Viewer] Using direct write_url for binary data:', writeUrl);
    console.log('[Viewer] Image Blob details:', {
      type: image.type,
      size: image.size,
      isBlob: image instanceof Blob
    });
    
    // Get auth token from URL params or SDK
    const urlParams = new URLSearchParams(window.location.search);
    let authToken = urlParams.get('puter.auth.token');
    if (!authToken && typeof puter !== 'undefined' && puter.getAuthToken) {
      try {
        authToken = puter.getAuthToken();
      } catch (e) {
        console.warn('[Viewer] Could not get auth token from SDK:', e);
      }
    }
    
    // Build request headers with auth token
    const headers = {
      'Content-Type': image.type || 'image/png'
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
      console.log('[Viewer] Adding auth token to request headers');
    } else {
      console.warn('[Viewer] ⚠️ No auth token available for write request!');
    }
    
    // Send Blob directly as binary data
    const response = await fetch(writeUrl, {
      method: 'POST',
      headers: headers,
      body: image // Send Blob directly
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Viewer] ❌ Write failed:', response.status, response.statusText, errorText);
      throw new Error(`Write failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('[Viewer] ✅ File write completed successfully:', result);
    console.log('[Viewer] Write result details:', {
      path: result.path,
      size: result.size,
      ipfs_hash: result.ipfs_hash?.substring(0, 20) + '...',
      modified: result.modified
    });
    
    // CRITICAL: Reload image with cache-busting to show updated content
    // Use IPFS hash for cache-busting (most reliable) or timestamp as fallback
    if (curfile.readURL) {
      // Parse the original URL to preserve the file parameter
      const originalURL = new URL(curfile.readURL, window.location.origin);
      const fileParam = originalURL.searchParams.get('file');
      
      if (fileParam) {
        // Build new URL with file parameter and cache-buster
        const cacheBuster = result.ipfs_hash 
          ? `_cid=${result.ipfs_hash.substring(0, 16)}` // Use IPFS hash for cache-busting
          : `_t=${Date.now()}`; // Fallback to timestamp
        
        const newReadURL = `${originalURL.pathname}?file=${encodeURIComponent(fileParam)}&${cacheBuster}`;
        
        console.log('[Viewer] Reloading image with cache-busting:', {
          oldURL: curfile.readURL,
          newURL: newReadURL,
          cacheBuster: cacheBuster,
          fileParam: fileParam
        });
        
        // Update curfile.readURL for future reads
        curfile.readURL = newReadURL;
        
        // Reload the image in the editor to show updated content
        try {
          await $(editor).pintura("loadImage", newReadURL);
          console.log('[Viewer] ✅ Image reloaded with updated content');
        } catch (reloadError) {
          console.warn('[Viewer] ⚠️ Failed to reload image after save:', reloadError);
          // Try one more time with a different cache-buster
          try {
            const fallbackURL = `${originalURL.pathname}?file=${encodeURIComponent(fileParam)}&_t=${Date.now()}`;
            await $(editor).pintura("loadImage", fallbackURL);
            curfile.readURL = fallbackURL;
            console.log('[Viewer] ✅ Image reloaded with fallback cache-buster');
          } catch (fallbackError) {
            console.error('[Viewer] ❌ Failed to reload image even with fallback:', fallbackError);
            // Non-critical - image will update on next open
          }
        }
      } else {
        console.warn('[Viewer] ⚠️ No file parameter in readURL, skipping reload');
      }
    }
    
    unsavedChanges=!1;
    puter.ui.setWindowTitle(curfile.name);
    history_index_at_last_save=$(editor).pintura("history").index;
    $("#save-btn").prop("disabled",!0);
    
    if (void 0!==callback) {
      callback(this.responseJSON);
    }
  } catch (error) {
    console.error('[Viewer] ❌ Error saving file:', error);
    console.error('[Viewer] Error stack:', error.stack);
    alert('Error saving file: ' + (error.message || error));
    $("#save-btn").prop("disabled",!1);
  }
}

function open_file(cfile){
  curfile=cfile;
  console.log('[Viewer] Opening file:', cfile);
  console.log('[Viewer] File write_url:', cfile.write_url || cfile.writeURL);
  $(editor).pintura("loadImage",curfile.readURL);
}

$(document).ready(function(){
  useEditorWithJQuery(jQuery,pintura);
  editor=$(".my-editor").pinturaDefault({src:curfile?curfile.readURL:void 0,enableButtonExport:!1,imageWriter:{}});
  
  $(editor).on("pintura:update",function(event){
    unsavedChanges=history_index_at_last_save!==$(editor).pintura("history").index;
    setTimeout(()=>{
      history_index_at_last_save!==$(editor).pintura("history").index?$("#save-btn").prop("disabled",!1):$("#save-btn").prop("disabled",!0);
    },100);
  });
  
  puter.ui.onItemsOpened(async function(items){
    var alert_resp;
    !unsavedChanges||"Don't Save"===(alert_resp=await puter.ui.alert("Do you want to save the changes you made?",[{label:"Save",type:"primary"},{label:"Don't Save"},{label:"Cancel"}]))?(curfile=items[0],unsavedChanges=!1,open_file(curfile)):"Save"===alert_resp&&(void 0===write_url?(await puter.ui.showSaveFilePicker(editor.getValue(),curfile.name),curfile=items[0],unsavedChanges=!1,open_file(curfile)):save_file(()=>{curfile=items[0],unsavedChanges=!1,open_file(curfile)}));
  });
  
  puter.ui.onWindowClose(()=>{
    attempt_exit();
  });
});

$("#save-btn").on("click",function(){
  $("#save-btn").prop("disabled",!0);
  save_file();
});
