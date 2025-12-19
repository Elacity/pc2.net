let history_index_at_last_save=0,unsavedChanges=!1,curfile,editor;

async function attempt_exit(){
  var alert_resp;
  $(editor).pintura("history").index===history_index_at_last_save||"Don't Save"===(alert_resp=await puter.ui.alert("Do you want to save the changes you made?",[{label:"Save",type:"primary"},{label:"Don't Save"},{label:"Cancel"}]))?puter.exit():"Save"===alert_resp&&(curfile?save_file(()=>{puter.exit()}):(filename=res.filename,read_url=res.read_url,write_url=res.write_url,unsavedChanges=!1,puter.ui.setWindowTitle(filename),puter.exit()))
}

async function save_file(callback){
  try {
    console.log('[Viewer] Save button clicked, starting save...');
    console.log('[Viewer] curfile:', curfile);
    console.log('[Viewer] curfile.write:', typeof curfile?.write);
    console.log('[Viewer] curfile.write_url:', curfile?.write_url || curfile?.writeURL);
    
    var image = (await $(editor).pintura("processImage")).dest;
    console.log('[Viewer] Processed image:', image, 'Type:', typeof image, 'Is Blob:', image instanceof Blob);
    
    if (!curfile) {
      console.error('[Viewer] ❌ No curfile object!');
      alert('Error: No file object available to save');
      $("#save-btn").prop("disabled",!1);
      return;
    }
    
    // Try SDK write method first, fallback to direct write_url if available
    const writeUrl = curfile.write_url || curfile.writeURL;
    let sdkWriteSucceeded = false;
    
    if (curfile.write && typeof curfile.write === 'function') {
      console.log('[Viewer] Using SDK write() method...');
      try {
        const writeResult = await curfile.write(image);
        console.log('[Viewer] ✅ File write completed successfully via SDK', writeResult);
        sdkWriteSucceeded = true;
        
        // CRITICAL: Reload image with cache-busting after SDK write
        // SDK write might return result with IPFS hash or we can use timestamp
        if (curfile.readURL) {
          const cacheBuster = writeResult?.ipfs_hash 
            ? `&_cid=${writeResult.ipfs_hash.substring(0, 16)}`
            : `&_t=${Date.now()}`;
          const newReadURL = curfile.readURL.includes('?') 
            ? `${curfile.readURL}${cacheBuster}`
            : `${curfile.readURL}?${cacheBuster.substring(1)}`;
          
          console.log('[Viewer] Reloading image after SDK write:', newReadURL);
          curfile.readURL = newReadURL;
          
          try {
            await $(editor).pintura("loadImage", newReadURL);
            console.log('[Viewer] ✅ Image reloaded with updated content after SDK write');
          } catch (reloadError) {
            console.warn('[Viewer] ⚠️ Failed to reload image after SDK write:', reloadError);
          }
        }
      } catch (sdkError) {
        console.warn('[Viewer] ⚠️ SDK write() failed, trying direct write_url:', sdkError);
        // Fall through to direct write_url method
        sdkWriteSucceeded = false;
      }
    }
    
    // If SDK write didn't work or wasn't available, use write_url directly
    if (!sdkWriteSucceeded) {
      if (!writeUrl) {
        console.error('[Viewer] ❌ No write method or write_url available!', curfile);
        alert('Error: File write method not available');
        $("#save-btn").prop("disabled",!1);
        return;
      }
      
      console.log('[Viewer] Using direct write_url:', writeUrl);
      
      // Convert Blob to File if needed, or use Blob directly
      const response = await fetch(writeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': image.type || 'image/png'
        },
        body: image
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Write failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('[Viewer] ✅ File write completed successfully via write_url:', result);
      
      // CRITICAL: Reload image with cache-busting to show updated content
      // Add timestamp or IPFS hash to readURL to force browser to fetch new version
      if (curfile.readURL) {
        const cacheBuster = result.ipfs_hash 
          ? `&_cid=${result.ipfs_hash.substring(0, 16)}` // Use IPFS hash for cache-busting
          : `&_t=${Date.now()}`; // Fallback to timestamp
        const newReadURL = curfile.readURL.includes('?') 
          ? `${curfile.readURL}${cacheBuster}`
          : `${curfile.readURL}?${cacheBuster.substring(1)}`; // Remove & if no existing query
        
        console.log('[Viewer] Reloading image with cache-busting:', newReadURL);
        curfile.readURL = newReadURL;
        
        // Reload the image in the editor to show updated content
        try {
          await $(editor).pintura("loadImage", newReadURL);
          console.log('[Viewer] ✅ Image reloaded with updated content');
        } catch (reloadError) {
          console.warn('[Viewer] ⚠️ Failed to reload image after save:', reloadError);
          // Non-critical - image will update on next open
        }
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
