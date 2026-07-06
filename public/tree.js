// Merkle Tree SVG Visualizer Component
const MerkleTreeVisualizer = (() => {
  const svg = document.getElementById('tree-svg');
  const tooltip = document.getElementById('node-tooltip');
  const tooltipTitle = document.getElementById('tooltip-node-title');
  const tooltipHash = document.getElementById('tooltip-node-hash');
  const tooltipChildren = document.getElementById('tooltip-child-container');
  const tooltipNodeChildren = document.getElementById('tooltip-node-children');
  
  let treeData = null; // Contains layers, cids, root
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  
  // Set up event listeners for panning and zooming
  setupPanZoom();

  function setupPanZoom() {
    const container = document.getElementById('tree-container');

    container.addEventListener('mousedown', (e) => {
      // Don't drag if clicking a node circle
      if (e.target.classList.contains('node-circle')) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY < 0) {
        zoomLevel = Math.min(zoomLevel * zoomFactor, 3.0);
      } else {
        zoomLevel = Math.max(zoomLevel / zoomFactor, 0.4);
      }
      applyTransform();
    });

    // Zoom Buttons Control
    document.getElementById('zoom-in-btn').addEventListener('click', () => {
      zoomLevel = Math.min(zoomLevel * 1.2, 3.0);
      applyTransform();
    });
    
    document.getElementById('zoom-out-btn').addEventListener('click', () => {
      zoomLevel = Math.max(zoomLevel / 1.2, 0.4);
      applyTransform();
    });

    document.getElementById('reset-view-btn').addEventListener('click', () => {
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;
      applyTransform();
    });
  }

  function applyTransform() {
    const mainGroup = svg.querySelector('#tree-main-group');
    if (mainGroup) {
      mainGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoomLevel})`);
    }
  }

  // Draw the Merkle Tree
  function draw(layers, cids, root) {
    treeData = { layers, cids, root };
    svg.innerHTML = ''; // Clear SVG

    // Create main viewport group for zoom/pan
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.id = 'tree-main-group';
    svg.appendChild(mainGroup);

    // If there is only 1 layer (1 leaf), duplicate it visually to create a 2-level tree structure (Leaf -> Root)
    let visualLayers = [...layers];
    if (visualLayers.length === 1) {
      visualLayers.push([layers[0][0]]);
    }

    const L = visualLayers.length; // Number of levels
    if (L === 0) return;

    // Dimensions
    const svgWidth = svg.clientWidth || 800;
    const svgHeight = svg.clientHeight || 450;
    
    // Vertical spacing
    const levelHeight = Math.max(100, (svgHeight - 120) / (L > 1 ? L - 1 : 1));
    const startYPos = 60; // Top margin

    // Store node positions: positions[level][nodeIndex] = {x, y}
    const positions = [];

    // Calculate node coordinates bottom-up
    // Leaves at the bottom, root at the top
    for (let level = 0; level < L; level++) {
      positions[level] = [];
      const nodeCount = visualLayers[level].length;
      const y = startYPos + (L - 1 - level) * levelHeight;
      
      const widthAllowance = svgWidth - 100;
      const xSpacing = nodeCount > 1 ? widthAllowance / (nodeCount - 1) : 0;
      const startXPos = nodeCount > 1 ? 50 : svgWidth / 2;

      for (let i = 0; i < nodeCount; i++) {
        const x = startXPos + i * xSpacing;
        positions[level][i] = { x, y };
      }
    }

    // 1. Draw Links (edges)
    const linksGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    linksGroup.id = 'tree-links-group';
    mainGroup.appendChild(linksGroup);

    for (let level = 0; level < L - 1; level++) {
      const parentLevel = level + 1;
      const childCount = visualLayers[level].length;
      
      for (let i = 0; i < childCount; i++) {
        const parentIdx = Math.floor(i / 2);
        
        if (positions[parentLevel] && positions[parentLevel][parentIdx]) {
          const startPos = positions[level][i];
          const endPos = positions[parentLevel][parentIdx];
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M ${startPos.x} ${startPos.y} L ${endPos.x} ${endPos.y}`);
          path.setAttribute('class', 'tree-link');
          path.setAttribute('id', `link-${level}-${i}-to-${parentLevel}-${parentIdx}`);
          linksGroup.appendChild(path);
        }
      }
    }

    // 2. Draw Nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.id = 'tree-nodes-group';
    mainGroup.appendChild(nodesGroup);

    for (let level = 0; level < L; level++) {
      const nodeCount = visualLayers[level].length;
      for (let i = 0; i < nodeCount; i++) {
        const pos = positions[level][i];
        const hash = visualLayers[level][i];
        
        // Node Type
        let nodeClass = 'node-circle';
        let label = '';
        if (level === L - 1) {
          nodeClass += ' root';
          label = 'Root';
        } else if (level === 0) {
          nodeClass += ' leaf';
          label = `Leaf ${i}`;
          if (cids && cids[i]) {
            const fileName = window.App ? window.App.getFilenameForCid(cids[i]) : null;
            if (fileName) {
              label = fileName.length > 10 ? fileName.substring(0, 8) + '..' : fileName;
            }
          }
        } else {
          label = `H(${level}-${i})`;
        }

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Node circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', level === L - 1 ? 22 : level === 0 ? 18 : 16);
        circle.setAttribute('class', nodeClass);
        circle.setAttribute('id', `node-${level}-${i}`);
        circle.setAttribute('data-hash', hash);
        circle.setAttribute('data-level', level);
        circle.setAttribute('data-index', i);
        
        // Attach Tooltip hover handlers
        circle.addEventListener('mouseenter', (e) => showTooltip(e, level, i, hash));
        circle.addEventListener('mouseleave', hideTooltip);
        
        // Clicking a leaf loads it into the Verifier input
        if (level === 0) {
          circle.addEventListener('click', () => {
            if (cids && cids[i] && window.App) {
              window.App.selectCidForVerification(cids[i]);
            }
          });
        }

        // Text label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', pos.x);
        text.setAttribute('y', pos.y + 4);
        text.setAttribute('class', 'node-text label');
        text.textContent = label;

        // Hash preview text below node
        const hashText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        hashText.setAttribute('x', pos.x);
        hashText.setAttribute('y', pos.y + (level === L - 1 ? 34 : level === 0 ? 30 : 28));
        hashText.setAttribute('class', 'node-text');
        hashText.textContent = hash.substring(0, 6) + '...';

        g.appendChild(circle);
        g.appendChild(text);
        g.appendChild(hashText);
        nodesGroup.appendChild(g);
      }
    }

    applyTransform();
  }

  // Highlight audit path path from leaf up to root
  function highlightPath(targetCid) {
    if (!treeData) return;
    
    // Clear all previous highlight states
    document.querySelectorAll('.node-circle').forEach(el => {
      el.classList.remove('path-active', 'sibling-active');
    });
    document.querySelectorAll('.tree-link').forEach(el => {
      el.classList.remove('path-active');
    });

    const L = treeData.layers.length === 1 ? 2 : treeData.layers.length;
    if (L === 0) return;

    // Find the leaf index of the target CID
    const targetIdx = treeData.cids.indexOf(targetCid);
    if (targetIdx === -1) {
      console.warn("CID not found in tree data for visual highlighting:", targetCid);
      return;
    }

    let currIdx = targetIdx;
    
    // Iterate from bottom level (0) up to second-to-top level (L-2)
    for (let level = 0; level < L - 1; level++) {
      // Highlight current active node
      const nodeEl = document.getElementById(`node-${level}-${currIdx}`);
      if (nodeEl) nodeEl.classList.add('path-active');

      // Highlight sibling node
      const isEven = currIdx % 2 === 0;
      const siblingIdx = isEven ? currIdx + 1 : currIdx - 1;
      
      const layerNodesCount = treeData.layers[level] ? treeData.layers[level].length : 1;
      if (siblingIdx < layerNodesCount) {
        const siblingEl = document.getElementById(`node-${level}-${siblingIdx}`);
        if (siblingEl) siblingEl.classList.add('sibling-active');
      }

      // Parent index
      const parentIdx = Math.floor(currIdx / 2);
      
      // Highlight link to parent
      const linkEl = document.getElementById(`link-${level}-${currIdx}-to-${level + 1}-${parentIdx}`);
      if (linkEl) linkEl.classList.add('path-active');

      currIdx = parentIdx;
    }

    // Highlight root node at the top level
    const rootEl = document.getElementById(`node-${L - 1}-0`);
    if (rootEl) rootEl.classList.add('path-active');
  }

  function showTooltip(e, level, index, hash) {
    const rect = e.target.getBoundingClientRect();
    const container = document.getElementById('tree-container').getBoundingClientRect();
    
    // Calculate tooltip coordinates relative to tree container
    const x = rect.left - container.left + rect.width / 2 + 10;
    const y = rect.top - container.top - 80;

    let titleText = '';
    let showChildren = false;

    const visualL = treeData.layers.length === 1 ? 2 : treeData.layers.length;

    if (level === visualL - 1) {
      titleText = 'Merkle Root';
    } else if (level === 0) {
      const originalCid = treeData.cids[index];
      const fileName = window.App ? window.App.getFilenameForCid(originalCid) : null;
      titleText = `Leaf [Index: ${index}]`;
      if (fileName) {
        titleText += ` - ${fileName}`;
      }
    } else {
      titleText = `Intermediate Hash [L${level}, I${index}]`;
      showChildren = true;
    }

    tooltipTitle.textContent = titleText;
    tooltipHash.textContent = hash;
    
    if (showChildren) {
      tooltipChildren.style.display = 'flex';
      const leftChild = treeData.layers[level - 1][2 * index];
      const rightChild = treeData.layers[level - 1][2 * index + 1] || leftChild;
      tooltipNodeChildren.innerHTML = `L: ${leftChild.substring(0, 10)}...<br>R: ${rightChild.substring(0, 10)}...`;
    } else {
      if (level === 0) {
        tooltipChildren.style.display = 'flex';
        tooltipNodeChildren.textContent = `CID: ${treeData.cids[index]}`;
      } else {
        tooltipChildren.style.display = 'none';
      }
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
    tooltip.style.display = 'flex';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  return {
    draw,
    highlightPath
  };
})();

// Export globally
window.MerkleTreeVisualizer = MerkleTreeVisualizer;
