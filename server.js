require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');

const app = express();
const PORT = process.env.PORT || 3000;

// Pinata API credentials loaded from environment variables
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

const os = require('os');
const MERKLE_DATA_FILE = path.join(os.tmpdir(), 'merkle_data.json');
const UPLOADS_DIR = path.join(os.tmpdir(), 'temp_uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration for custom file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname)); // Serve local workspace files (e.g. images) for thumbnails

// Helper: Upload file to Pinata IPFS
async function uploadToPinata(filePath) {
  const data = new FormData();
  data.append('file', fs.createReadStream(filePath));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: "Infinity",
    headers: {
      'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_API_KEY
    }
  });
  return res.data.IpfsHash;
}

// Helper: Create simulated Base58-like hash for local mock CIDs
function generateSimulatedCID(contentBuffer, fileName) {
  const hash = SHA256(contentBuffer.toString('base64')).toString();
  // Standard IPFS CIDv0 length is 46 chars, starting with Qm
  const customSalt = fileName || Math.random().toString();
  const subHash = SHA256(hash + customSalt).toString().substring(0, 44);
  return `QmSimulated_${subHash}`;
}

// Endpoint: Get list of preloaded files in the workspace
app.get('/api/local-files', (req, res) => {
  try {
    const files = fs.readdirSync(__dirname);
    const imageFiles = files
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return (ext === '.jpg' || ext === '.jpeg' || ext === '.png') && 
               (f.startsWith('image') || f.startsWith('img'));
      })
      .map(f => {
        const stats = fs.statSync(path.join(__dirname, f));
        return {
          name: f,
          sizeBytes: stats.size,
          path: f
        };
      });
    res.json({ files: imageFiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: File Upload (handles custom multipart uploads or preloaded file selections)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  let filePath = null;
  let fileName = '';
  let isTemp = false;

  try {
    const usePinata = req.body.usePinata === 'true' || req.body.usePinata === true;

    if (req.file) {
      // User uploaded a custom file
      filePath = req.file.path;
      fileName = req.file.originalname;
      isTemp = true;
    } else if (req.body.localFilename) {
      // User chose a pre-loaded workspace file
      const localFile = path.join(__dirname, req.body.localFilename);
      if (fs.existsSync(localFile)) {
        filePath = localFile;
        fileName = req.body.localFilename;
        isTemp = false;
      } else {
        return res.status(400).json({ error: `File not found: ${req.body.localFilename}` });
      }
    } else {
      return res.status(400).json({ error: 'No file provided' });
    }

    let cid = '';
    if (usePinata) {
      cid = await uploadToPinata(filePath);
    } else {
      const content = fs.readFileSync(filePath);
      cid = generateSimulatedCID(content, fileName);
    }

    // Clean up custom upload if it was written to temp directory
    if (isTemp && filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      fileName,
      cid,
      url: usePinata ? `https://gateway.pinata.cloud/ipfs/${cid}` : `LocalSimulated://${cid}`
    });

  } catch (err) {
    // Clean up in case of failure
    if (isTemp && filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch(_) {}
    }
    console.error("Upload error:", err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Endpoint: Build Merkle Tree from CIDs
app.post('/api/build-tree', (req, res) => {
  try {
    const { cids } = req.body;
    if (!cids || !Array.isArray(cids) || cids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty CID list' });
    }

    // Leaves are SHA256 of CIDs
    const leaves = cids.map(cid => SHA256(cid));
    const tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
    const root = tree.getRoot().toString('hex');

    // Save metadata to file just like the simulation CLI does
    fs.writeFileSync(MERKLE_DATA_FILE, JSON.stringify({ cids, root }, null, 2));

    // Map tree layers for the visualizer
    // Layers will contain arrays of hex strings representing all levels from leaves to root
    const layers = tree.getLayers().map(layer => layer.map(node => node.toString('hex')));

    res.json({
      success: true,
      root,
      layers,
      cids,
      treeString: tree.toString()
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Verify CID
app.post('/api/verify', (req, res) => {
  try {
    const { cid } = req.body;
    if (!cid) {
      return res.status(400).json({ error: 'CID is required' });
    }

    if (!fs.existsSync(MERKLE_DATA_FILE)) {
      return res.status(400).json({ error: 'Merkle tree data not found. Please build the tree first.' });
    }

    const { cids, root } = JSON.parse(fs.readFileSync(MERKLE_DATA_FILE));
    
    // Check if the CID is actually in the original array
    const cidIndex = cids.indexOf(cid);
    
    // Hash of the leaf
    const leaf = SHA256(cid);
    const tree = new MerkleTree(cids.map(c => SHA256(c)), SHA256, { sortPairs: true });
    
    // Get verification proof path
    const proof = tree.getProof(leaf);
    const formattedProof = proof.map(step => ({
      position: step.position,
      data: step.data.toString('hex')
    }));

    // Verify
    const verified = tree.verify(proof, leaf, Buffer.from(root, 'hex'));

    res.json({
      success: true,
      cid,
      leafHash: leaf.toString(),
      root,
      verified,
      proof: formattedProof,
      inCidsList: cidIndex !== -1,
      cidIndex
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Get Merkle Data
app.get('/api/merkle-data', (req, res) => {
  try {
    if (!fs.existsSync(MERKLE_DATA_FILE)) {
      return res.json({ exists: false });
    }
    const data = JSON.parse(fs.readFileSync(MERKLE_DATA_FILE));
    res.json({ exists: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to serve index.html for the root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Merkle Demo server running on http://localhost:${PORT}`);
});
