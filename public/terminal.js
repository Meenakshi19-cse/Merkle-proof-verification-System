// Terminal Sync Emulator Engine
const Terminal = (() => {
  const terminalBody = document.getElementById('terminal-body');
  const terminalInput = document.getElementById('terminal-input');
  
  let history = [];
  let historyIndex = -1;
  
  // Interactive Prompt State Machine
  // Modes: 'role-select' | 'server-files' | 'client-verify' | 'shell'
  let currentMode = 'role-select';
  
  // Log message to the terminal screen
  function log(text, type = 'info-line') {
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    
    // Convert newlines to breaks or multiple lines
    if (text.includes('\n')) {
      const lines = text.split('\n');
      lines.forEach((l, idx) => {
        const subLine = document.createElement('div');
        subLine.className = `terminal-line ${type}`;
        subLine.textContent = l;
        terminalBody.appendChild(subLine);
      });
    } else {
      line.textContent = text;
      terminalBody.appendChild(line);
    }
    
    // Auto scroll to bottom
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }
  
  function clear() {
    terminalBody.innerHTML = '';
    log('CryptoShield Shell [Version 1.0.0]', 'system-line');
    log('(c) 2026 CryptoShield Corporation. All rights reserved.', 'system-line');
  }

  // Handle keys (up/down arrow for history)
  terminalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = terminalInput.value.trim();
      if (cmd) {
        history.push(cmd);
        historyIndex = history.length;
        echoCommand(cmd);
        handleInput(cmd);
      }
      terminalInput.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        terminalInput.value = history[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        terminalInput.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        terminalInput.value = '';
      }
    }
  });

  function echoCommand(text) {
    log(text, 'command-echo');
  }

  // Process the input based on current shell state
  async function handleInput(input) {
    const normalizedInput = input.trim();
    
    // Global commands available anytime
    if (normalizedInput.toLowerCase() === 'clear') {
      clear();
      showPromptForState();
      return;
    }
    
    if (normalizedInput.toLowerCase() === 'help') {
      printHelp();
      showPromptForState();
      return;
    }

    if (normalizedInput.toLowerCase().startsWith('role ')) {
      const role = normalizedInput.substring(5).trim().toLowerCase();
      if (role === 'server') {
        setMode('server-files');
      } else if (role === 'client') {
        setMode('client-verify');
      } else {
        log("Invalid role. Please enter 'Server' or 'Client'.", 'error-line');
        showPromptForState();
      }
      return;
    }

    // State-based handling
    switch (currentMode) {
      case 'role-select':
        const mode = normalizedInput.toLowerCase();
        if (mode === 'server') {
          setMode('server-files');
        } else if (mode === 'client') {
          setMode('client-verify');
        } else {
          log("Invalid role. Please enter 'Server' or 'Client'.", 'error-line');
          showPromptForState();
        }
        break;

      case 'server-files':
        // The user entered file names separated by commas
        log("\nUploading files to Pinata Cloud(IPFS)...", 'info-line');
        const files = normalizedInput.split(',').map(f => f.trim()).filter(f => f.length > 0);
        if (files.length === 0) {
          log("Error: No files specified.", 'error-line');
          showPromptForState();
          break;
        }

        // Trigger App logic to upload files and build tree
        if (window.App && typeof window.App.runServerCLI === 'function') {
          await window.App.runServerCLI(files);
        } else {
          log("App controller not fully initialized.", 'error-line');
          showPromptForState();
        }
        break;

      case 'client-verify':
        // The user entered a CID to verify
        const cid = normalizedInput;
        if (!cid) {
          log("Error: CID is required.", 'error-line');
          showPromptForState();
          break;
        }
        
        // Trigger App logic to verify CID
        if (window.App && typeof window.App.runClientCLI === 'function') {
          await window.App.runClientCLI(cid);
        } else {
          log("App controller not fully initialized.", 'error-line');
          showPromptForState();
        }
        break;

      default:
        log(`Unknown state command: ${normalizedInput}`, 'error-line');
        showPromptForState();
        break;
    }
  }

  function printHelp() {
    log('\nCryptoShield Merkle Engine CLI HELP:', 'success-line');
    log('====================================================', 'success-line');
    log('  role server      - Switch to Server mode (Publisher)', 'info-line');
    log('  role client      - Switch to Client mode (Verifier)', 'info-line');
    log('  clear            - Clear the terminal console', 'info-line');
    log('  help             - Show this help menu', 'info-line');
    log('\nWhen in SERVER mode:', 'success-line');
    log('  Enter file names (e.g. "image1.jpg, image2.jpg") directly at the prompt', 'info-line');
    log('  to upload them and automatically compile the Merkle Tree.', 'info-line');
    log('\nWhen in CLIENT mode:', 'success-line');
    log('  Enter any CID directly at the prompt to perform an integrity audit', 'info-line');
    log('  and fetch the visual Merkle path proof.', 'info-line');
    log('====================================================\n', 'success-line');
  }

  function setMode(newMode) {
    if (newMode === 'server-files') {
      currentMode = 'server-files';
      log('\nLogged in as server', 'success-line');
      // Sync GUI tab
      if (window.App && typeof window.App.switchTab === 'function') {
        window.App.switchTab('server', false); // false to avoid loop
      }
    } else if (newMode === 'client-verify') {
      currentMode = 'client-verify';
      log('\nLogged in as client', 'success-line');
      // Sync GUI tab
      if (window.App && typeof window.App.switchTab === 'function') {
        window.App.switchTab('client', false); // false to avoid loop
      }
    } else if (newMode === 'role-select') {
      currentMode = 'role-select';
    }
    showPromptForState();
  }

  function showPromptForState() {
    // Remove any existing prompt lines to avoid cluttering
    const cursorElements = document.querySelectorAll('.terminal-cursor');
    cursorElements.forEach(el => el.parentNode.removeChild(el));

    let promptText = '';
    if (currentMode === 'role-select') {
      promptText = 'Login as Server or Client?';
    } else if (currentMode === 'server-files') {
      promptText = 'Enter file names separated by commas:';
    } else if (currentMode === 'client-verify') {
      promptText = 'Enter CID to verify:';
    }

    const line = document.createElement('div');
    line.className = 'terminal-line prompt-line';
    line.textContent = promptText + ' ';
    
    const cursor = document.createElement('span');
    cursor.className = 'terminal-cursor';
    line.appendChild(cursor);
    
    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;
  }

  // Initial prompt setup
  // Wait a tiny bit for app to bind
  setTimeout(() => {
    // Do not show twice
  }, 100);

  return {
    log,
    clear,
    setMode,
    showPromptForState,
    getMode: () => currentMode
  };
})();

// Export globally
window.Terminal = Terminal;
