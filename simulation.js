require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');
const readline = require('readline');
const open = require('open');

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY;

const MERKLE_DATA_FILE = 'merkle_data.json';

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

function buildTree(cids) {
  const leaves = cids.map(cid => SHA256(cid));
  const tree = new MerkleTree(leaves, SHA256, { sortPairs: true });
  const root = tree.getRoot().toString('hex');

  console.log("\nMerkle Root:", root);
  console.log("\nMerkle Tree Structure:");
  console.log(tree.toString());

  return { tree, root };
}

function verifyCID(tree, cid, root) {
  const leaf = SHA256(cid);
  const proof = tree.getProof(leaf);

  console.log("\nProof for CID:", cid);
  proof.forEach((step, i) => {
    console.log(`Step ${i + 1}: ${step.position} → ${step.data.toString('hex')}`);
  });

  const verified = tree.verify(proof, leaf, Buffer.from(root, 'hex'));
  console.log("\nVerification Result:", verified ? "✔ CID is part of Merkle Tree" : "❌ CID not found in Merkle Tree");
}

async function serverMode(rl) {
  rl.question("Enter file names separated by commas: ", async (input) => {
    try {
      const fileNames = input.split(',').map(f => f.trim());
      const cids = [];

      console.log("\nUploading files to Pinata Cloud(IPFS)...");
      for (const file of fileNames) {
        const cid = await uploadToPinata(file);
        const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
        console.log(`Uploaded ${file} → CID: ${cid}`);
        console.log(`View File: ${url}`);
        cids.push(cid);
      }

      const { tree, root } = buildTree(cids);
      
      fs.writeFileSync(MERKLE_DATA_FILE, JSON.stringify({ cids, root }, null, 2));
      console.log(`\nMerkle Data saved to '${MERKLE_DATA_FILE}'`);

      rl.close();
    } catch (err) {
      console.error("Error:", err.response?.data || err.message);
      rl.close();
    }
  });
}


async function clientMode(rl) {
  if (!fs.existsSync(MERKLE_DATA_FILE)) {
    console.log("Merkle data not found. Please run as 'Server' first.");
    rl.close();
    return;
  }

  const { cids, root } = JSON.parse(fs.readFileSync(MERKLE_DATA_FILE));
  const tree = new MerkleTree(cids.map(cid => SHA256(cid)), SHA256, { sortPairs: true });

  rl.question("\nEnter CID to verify: ", (cid) => {
    verifyCID(tree, cid.trim(), root);
    rl.close();
  });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question("Login as Server or Client? ", (role) => {
    const mode = role.trim().toLowerCase();

    if (mode === "server") {
      console.log("\nLogged in as server");
      serverMode(rl);
    } else if (mode === "client") {
      console.log("\nLogged in as client");
      clientMode(rl);
    } else {
      console.log("Invalid role. Please enter 'Server' or 'Client'.");
      rl.close();
    }
  });
}

main();
