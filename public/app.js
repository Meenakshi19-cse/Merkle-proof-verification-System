// Core App Controller
const App = (() => {
  // UI Elements
  const apiStatusEl = document.getElementById('api-status');
  const rootDisplayEl = document.getElementById('current-root-display');
  const preloadedContainer = document.getElementById('preloaded-files-container');
  const dragDropZone = document.getElementById('drag-drop-zone');
  const fileUploader = document.getElementById('file-uploader');
  const queueList = document.getElementById('upload-queue-list');
  const queueCountEl = document.getElementById('queue-count');
  const clearQueueBtn = document.getElementById('clear-queue-btn');
  const uploadBtn = document.getElementById('upload-queue-btn');
  const buildBtn = document.getElementById('build-tree-btn');
  const liveIpfsToggle = document.getElementById('live-ipfs-toggle');
  
  const clientCidInput = document.getElementById('verification-cid-input');
  const pasteBtn = document.getElementById('autofill-btn');
  const quickCidsContainer = document.getElementById('quick-cids-container');
  const verifyBtn = document.getElementById('verify-cid-btn');
  
  const auditCard = document.getElementById('verification-result-card');
  const auditBadge = document.getElementById('audit-badge');
  const reportCid = document.getElementById('report-cid');
  const reportLeafHash = document.getElementById('report-leaf-hash');
  const reportStatus = document.getElementById('report-status');
  const proofList = document.getElementById('proof-steps-list');

  // Application State
  let selectedLocalFiles = new Set(); // Set of preloaded filenames
  let queue = []; // Array of queued files: { id, file, localFilename, name, size, status, cid }
  let currentTreeCids = [];
  let cidsFilenameMap = {}; // Maps CID -> Filename for display purposes
  let currentRootHash = null;

  // Initialize App
  async function init() {
    setupEventListeners();
    await checkBackendHealth();
    await loadExistingTreeData();
    await loadPreloadedFiles();
    
    // Initialize Terminal Role prompt
    Terminal.clear();
    Terminal.setMode('role-select');
  }

  // Event Listeners setup
  function setupEventListeners() {
    // Tab Triggers
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        switchTab(tab, true);
      });
    });

    // Clear Queue
    clearQueueBtn.addEventListener('click', () => {
      queue = [];
      selectedLocalFiles.clear();
      document.querySelectorAll('.file-card').forEach(el => el.classList.remove('selected'));
      updateQueueUI();
      Terminal.log("Cleared file upload queue.", "warning-line");
    });

    // Drag & Drop
    dragDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dragDropZone.classList.add('dragover');
    });

    dragDropZone.addEventListener('dragleave', () => {
      dragDropZone.classList.remove('dragover');
    });

    dragDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        addFilesToQueue(e.dataTransfer.files);
      }
    });

    // Browse files
    fileUploader.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        addFilesToQueue(e.target.files);
      }
    });

    // Upload Action
    uploadBtn.addEventListener('click', uploadQueue);

    // Build Tree Action
    buildBtn.addEventListener('click', buildMerkleTree);

    // Verify CID Action
    verifyBtn.addEventListener('click', () => {
      const cid = clientCidInput.value.trim();
      if (cid) {
        verifyCID(cid);
      } else {
        alert("Please enter or select a CID to verify.");
      }
    });

    // Paste / Autofill button
    pasteBtn.addEventListener('click', () => {
      if (currentTreeCids.length > 0) {
        clientCidInput.value = currentTreeCids[currentTreeCids.length - 1];
        Terminal.log(`Autofilled input with latest CID: ${clientCidInput.value}`, "info-line");
      }
    });

    // Clear logs
    document.getElementById('clear-console-btn').addEventListener('click', () => {
      Terminal.clear();
      Terminal.showPromptForState();
    });
  }

  // Tab switching coordination
  function switchTab(tab, syncTerminal = true) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tab}-tab`);
    });

    if (syncTerminal) {
      if (tab === 'server') {
        Terminal.setMode('server-files');
      } else if (tab === 'client') {
        Terminal.setMode('client-verify');
      }
    }
  }

  // Health check: Verify backend Express server status
  async function checkBackendHealth() {
    try {
      const res = await fetch('/api/local-files');
      if (res.ok) {
        apiStatusEl.classList.remove('offline');
        apiStatusEl.querySelector('.status-text').textContent = 'Online';
      }
    } catch (err) {
      apiStatusEl.classList.add('offline');
      apiStatusEl.querySelector('.status-text').textContent = 'Offline';
      Terminal.log("Warning: Express API backend is offline. Local hosting might not be running.", "error-line");
    }
  }

  // Load preloaded files from local directory
  async function loadPreloadedFiles() {
    try {
      const res = await fetch('/api/local-files');
      const data = await res.json();
      
      preloadedContainer.innerHTML = '';
      if (!data.files || data.files.length === 0) {
        preloadedContainer.innerHTML = '<div class="loading-placeholder">No preloaded images found.</div>';
        return;
      }

      data.files.forEach(file => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.setAttribute('data-name', file.name);
        
        const thumb = document.createElement('div');
        thumb.className = 'file-thumbnail';
        // Set actual workspace image background thumbnail!
        thumb.style.backgroundImage = `url('/${file.name}')`;
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.textContent = file.name;
        nameSpan.title = file.name;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'file-size';
        sizeSpan.textContent = formatBytes(file.sizeBytes);

        card.appendChild(thumb);
        card.appendChild(nameSpan);
        card.appendChild(sizeSpan);
        
        card.addEventListener('click', () => togglePreloadedFile(file));
        
        preloadedContainer.appendChild(card);
      });
    } catch (err) {
      console.error("Error loading preloaded files:", err);
      preloadedContainer.innerHTML = '<div class="loading-placeholder">Error loading files.</div>';
    }
  }

  // Toggle preloaded file selection
  function togglePreloadedFile(file) {
    const card = document.querySelector(`.file-card[data-name="${file.name}"]`);
    if (selectedLocalFiles.has(file.name)) {
      selectedLocalFiles.delete(file.name);
      card.classList.remove('selected');
      // Remove from queue
      queue = queue.filter(item => item.localFilename !== file.name);
      Terminal.log(`Removed ${file.name} from queue.`, "info-line");
    } else {
      selectedLocalFiles.add(file.name);
      card.classList.add('selected');
      // Add to queue
      queue.push({
        id: Date.now() + Math.random().toString(),
        file: null,
        localFilename: file.name,
        name: file.name,
        size: file.sizeBytes,
        status: 'pending',
        cid: null
      });
      Terminal.log(`Added preloaded file ${file.name} to upload queue.`, "info-line");
    }
    updateQueueUI();
  }

  // Add custom files to queue
  function addFilesToQueue(filesList) {
    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      queue.push({
        id: Date.now() + Math.random().toString(),
        file: file,
        localFilename: null,
        name: file.name,
        size: file.size,
        status: 'pending',
        cid: null
      });
      Terminal.log(`Queued custom file upload: ${file.name} (${formatBytes(file.size)})`, "info-line");
    }
    updateQueueUI();
  }

  // Remove individual item from queue
  function removeQueueItem(id) {
    const item = queue.find(q => q.id === id);
    if (item) {
      if (item.localFilename) {
        selectedLocalFiles.delete(item.localFilename);
        const card = document.querySelector(`.file-card[data-name="${item.localFilename}"]`);
        if (card) card.classList.remove('selected');
      }
      queue = queue.filter(q => q.id !== id);
      Terminal.log(`Removed ${item.name} from queue.`, "info-line");
      updateQueueUI();
    }
  }

  // Update upload queue HTML UI and enable/disable action buttons
  function updateQueueUI() {
    queueCountEl.textContent = queue.length;
    
    if (queue.length === 0) {
      queueList.innerHTML = '<div class="empty-queue-msg">Queue is empty. Select files above to start.</div>';
      uploadBtn.classList.add('disabled');
      return;
    }

    queueList.innerHTML = '';
    let hasPending = false;
    let hasCids = false;

    queue.forEach(item => {
      if (item.status === 'pending') hasPending = true;
      if (item.cid) hasCids = true;

      const row = document.createElement('div');
      row.className = 'queue-item';

      const info = document.createElement('div');
      info.className = 'queue-item-info';
      
      const name = document.createElement('span');
      name.className = 'queue-item-name';
      name.textContent = `${item.name} (${formatBytes(item.size)})`;
      
      const cid = document.createElement('span');
      cid.className = 'queue-item-cid';
      cid.textContent = item.cid ? `CID: ${item.cid}` : 'Not Uploaded';
      
      info.appendChild(name);
      info.appendChild(cid);

      const statusArea = document.createElement('div');
      statusArea.className = 'queue-item-status';

      const badge = document.createElement('span');
      badge.className = `status-indicator ${item.status}`;
      badge.textContent = item.status;

      statusArea.appendChild(badge);

      if (item.status === 'pending') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-item-btn';
        removeBtn.innerHTML = '×';
        removeBtn.addEventListener('click', () => removeQueueItem(item.id));
        statusArea.appendChild(removeBtn);
      }

      row.appendChild(info);
      row.appendChild(statusArea);
      queueList.appendChild(row);
    });

    // Upload button is enabled if there are pending items
    if (hasPending) {
      uploadBtn.classList.remove('disabled');
    } else {
      uploadBtn.classList.add('disabled');
    }

    // Build button is enabled if we have at least one uploaded file CID
    if (hasCids) {
      buildBtn.classList.remove('disabled');
    } else {
      buildBtn.classList.add('disabled');
    }
  }

  // Upload Queue to Server API
  async function uploadQueue() {
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    uploadBtn.classList.add('disabled');
    Terminal.log(`\nUploading ${pendingItems.length} files to ${liveIpfsToggle.checked ? "Pinata Cloud (Live IPFS)" : "Local Simulator"}...`, 'info-line');

    for (let item of pendingItems) {
      item.status = 'uploading';
      updateQueueUI();
      
      try {
        const formData = new FormData();
        formData.append('usePinata', liveIpfsToggle.checked);
        
        if (item.file) {
          formData.append('file', item.file);
        } else {
          formData.append('localFilename', item.localFilename);
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        
        if (res.ok && data.success) {
          item.status = 'success';
          item.cid = data.cid;
          cidsFilenameMap[data.cid] = item.name;
          
          Terminal.log(`Uploaded ${item.name} → CID: ${data.cid}`, 'success-line');
          Terminal.log(`View File: ${data.url}`, 'success-line');
        } else {
          item.status = 'failed';
          Terminal.log(`Upload failed for ${item.name}: ${data.error || 'Unknown error'}`, 'error-line');
        }
      } catch (err) {
        item.status = 'failed';
        Terminal.log(`Network error uploading ${item.name}: ${err.message}`, 'error-line');
      }
      
      updateQueueUI();
    }

    Terminal.log("Queue processing complete.", 'info-line');
    Terminal.showPromptForState();
  }

  // Build Merkle Tree API
  async function buildMerkleTree() {
    const uploadedItems = queue.filter(item => item.cid);
    if (uploadedItems.length === 0) {
      Terminal.log("Error: No uploaded files with valid CIDs to construct tree.", "error-line");
      return;
    }

    buildBtn.classList.add('disabled');
    const cids = uploadedItems.map(item => item.cid);

    Terminal.log("\nBuilding Merkle Tree from CIDs...", "info-line");

    try {
      const res = await fetch('/api/build-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cids })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        currentRootHash = data.root;
        currentTreeCids = data.cids;
        
        rootDisplayEl.textContent = `${data.root.substring(0, 16)}...`;
        rootDisplayEl.title = data.root;

        Terminal.log(`\nMerkle Root: ${data.root}`, 'success-line');
        Terminal.log("\nMerkle Tree Structure:", 'success-line');
        Terminal.log(data.treeString, 'info-line');
        Terminal.log(`\nMerkle Data saved to 'merkle_data.json'`, 'success-line');

        // Draw Tree visually
        MerkleTreeVisualizer.draw(data.layers, data.cids, data.root);

        // Update Client list
        updateClientQuickCids();
      } else {
        Terminal.log(`Tree generation failed: ${data.error}`, 'error-line');
      }
    } catch (err) {
      Terminal.log(`Network error generating tree: ${err.message}`, 'error-line');
    }

    buildBtn.classList.remove('disabled');
    Terminal.showPromptForState();
  }

  // Load existing tree from disk (persistence check)
  async function loadExistingTreeData() {
    try {
      const res = await fetch('/api/merkle-data');
      const data = await res.json();
      
      if (res.ok && data.exists) {
        currentRootHash = data.root;
        currentTreeCids = data.cids;
        
        // Build filename maps for display
        data.cids.forEach((cid, i) => {
          cidsFilenameMap[cid] = `image1.jpg` || `Leaf ${i}`; // Fallback or placeholder
        });
        
        // Let's reload local file titles
        const filesRes = await fetch('/api/local-files');
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          // Map file name to CID based on mock uploads
          // In real, we can match index
          filesData.files.forEach((file, idx) => {
            if (data.cids[idx]) {
              cidsFilenameMap[data.cids[idx]] = file.name;
            }
          });
        }

        rootDisplayEl.textContent = `${data.root.substring(0, 16)}...`;
        rootDisplayEl.title = data.root;

        // Fetch tree representation by rebuild
        const rebuildRes = await fetch('/api/build-tree', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cids: data.cids })
        });
        
        if (rebuildRes.ok) {
          const rebuildData = await rebuildRes.json();
          MerkleTreeVisualizer.draw(rebuildData.layers, rebuildData.cids, rebuildData.root);
        }
        
        updateClientQuickCids();
        Terminal.log(`Loaded existing Merkle Tree from disk with root ${data.root}`, 'system-line');
      }
    } catch (err) {
      console.warn("Could not load existing tree data:", err.message);
    }
  }

  // Populate client tab CIDs list
  function updateClientQuickCids() {
    quickCidsContainer.innerHTML = '';
    
    if (currentTreeCids.length === 0) {
      quickCidsContainer.innerHTML = '<div class="empty-msg">No Merkle root loaded. Generate a tree first.</div>';
      return;
    }

    currentTreeCids.forEach(cid => {
      const chip = document.createElement('div');
      chip.className = 'cid-chip';
      const name = cidsFilenameMap[cid] || 'Uploaded File';
      chip.textContent = `${name} → ${cid}`;
      chip.title = cid;
      
      chip.addEventListener('click', () => {
        clientCidInput.value = cid;
        Terminal.log(`Selected CID: ${cid}`, 'info-line');
      });

      quickCidsContainer.appendChild(chip);
    });
  }

  // Verify CID API
  async function verifyCID(cid) {
    if (!cid) return;

    verifyBtn.classList.add('disabled');
    Terminal.log(`\nProof for CID: ${cid}`, 'info-line');

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Show report card
        auditCard.classList.add('active');
        reportCid.textContent = cid;
        reportLeafHash.textContent = data.leafHash;
        
        // Print proof steps to terminal
        proofList.innerHTML = '';
        data.proof.forEach((step, idx) => {
          Terminal.log(`Step ${idx + 1}: ${step.position} → ${step.data}`, 'proof-line');
          
          const row = document.createElement('div');
          row.className = 'proof-step-row';
          row.innerHTML = `<span class="step-num">Step ${idx + 1}:</span> <span class="step-pos">${step.position}</span> <span class="step-hash">${step.data.substring(0, 20)}...</span>`;
          proofList.appendChild(row);
        });

        // Verification Output
        if (data.verified) {
          auditBadge.className = 'badge success';
          auditBadge.textContent = 'Verified ✔';
          reportStatus.className = 'value success';
          reportStatus.textContent = '✔ CID is part of Merkle Tree';
          
          Terminal.log("\nVerification Result: ✔ CID is part of Merkle Tree", 'success-line');

          // Highlight path visually in SVG
          MerkleTreeVisualizer.highlightPath(cid);
        } else {
          auditBadge.className = 'badge failed';
          auditBadge.textContent = 'Audited ❌';
          reportStatus.className = 'value failed';
          reportStatus.textContent = '❌ CID not found in Merkle Tree';
          
          Terminal.log("\nVerification Result: ❌ CID not found in Merkle Tree", 'error-line');
        }
      } else {
        Terminal.log(`Audit failed: ${data.error}`, 'error-line');
      }
    } catch (err) {
      Terminal.log(`Network error performing audit: ${err.message}`, 'error-line');
    }

    verifyBtn.classList.remove('disabled');
    Terminal.showPromptForState();
  }

  // Selection handler called from SVG clicks
  function selectCidForVerification(cid) {
    switchTab('client', false);
    clientCidInput.value = cid;
    verifyCID(cid);
  }

  // --- CLI Synchronizers ---
  
  // Handles Terminal multi-file uploading & tree generation flow
  async function runServerCLI(filesList) {
    // 1. Map workspace file sizes to simulate the card select selection
    try {
      const res = await fetch('/api/local-files');
      const data = await res.json();
      const filesInfoMap = {};
      data.files.forEach(f => {
        filesInfoMap[f.name] = f.sizeBytes;
      });

      // Clear existing selected cards to match CLI overwrite style
      selectedLocalFiles.clear();
      document.querySelectorAll('.file-card').forEach(el => el.classList.remove('selected'));
      queue = [];

      filesList.forEach(name => {
        const size = filesInfoMap[name] || 1024 * 50; // default 50kb
        const card = document.querySelector(`.file-card[data-name="${name}"]`);
        if (card) {
          card.classList.add('selected');
          selectedLocalFiles.add(name);
        }
        
        queue.push({
          id: Date.now() + Math.random().toString(),
          file: null,
          localFilename: name,
          name: name,
          size: size,
          status: 'pending',
          cid: null
        });
      });

      updateQueueUI();

      // Trigger automatic uploads
      await uploadQueue();

      // Trigger automatic tree generation
      await buildMerkleTree();

    } catch (err) {
      Terminal.log(`CLI execution error: ${err.message}`, 'error-line');
      Terminal.showPromptForState();
    }
  }

  // Handles Terminal verification flow
  async function runClientCLI(cid) {
    clientCidInput.value = cid;
    await verifyCID(cid);
  }

  // Helper formatting size bytes
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getFilenameForCid(cid) {
    return cidsFilenameMap[cid];
  }

  return {
    init,
    switchTab,
    selectCidForVerification,
    runServerCLI,
    runClientCLI,
    getFilenameForCid
  };
})();

// Load on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
window.App = App;
