// State Management
let testState = {
  isRunning: false,
  currentTest: null,
  history: [],
  metrics: {
    throughput: 0,
    avgResponse: 0,
    activeUsers: 0,
    successRate: 0
  },
  chartData: {
    responseTime: [],
    throughput: [],
    timestamps: []
  },
  advanced: {
    headers: {},
    body: {}
  }
};

// Theme state (using in-memory variable instead of localStorage)
let currentTheme = 'dark';

// Settings state
let appSettings = {
  defaultEngine: 'k6',
  defaultVUS: 5,
  defaultDuration: 60,
  defaultRampup: 5,
  theme: 'dark',
  notifyComplete: true,
  notifyErrors: true,
  soundAlerts: true,
  timeout: 30000,
  retries: 3,
  maxConcurrent: 5
};

// Scheduled tests state
let scheduledTests = [];

// Chart instances
let charts = {
  responseTime: null,
  throughput: null
};

// Mock test data
const mockTests = [
  {
    url: "https://pack-nbn.netlify.app/",
    engine: "k6",
    test_type: "Stress Test",
    users: 20,
    status: "Sucessas",
    diagnostic: "Performance boa",
    error_rate: 1.3,
    avg_response: 452
  },
  {
    url: "https://api.exemplo.com/users",
    engine: "k6",
    test_type: "Load Test",
    users: 500,
    status: "Sucessas",
    diagnostic: "Performance excelente",
    error_rate: 1.3,
    avg_response: 284
  },
  {
    url: "https://api.exemplo.com/products",
    engine: "jmeter",
    test_type: "Stress Test",
    users: 1000,
    status: "Sucessas",
    diagnostic: "Site com performance razoável",
    error_rate: 4.8,
    avg_response: 450
  },
  {
    url: "https://api.exemplo.com/orders",
    engine: "k6",
    test_type: "Spike Test",
    users: 2000,
    status: "Erro",
    diagnostic: "Site muito lento",
    error_rate: 27.8,
    avg_response: 892
  }
];

// --- SCRIPT DISPLAY LOGIC ---

const scriptTemplates = {
  k6: `import http from 'k6/http';\n\nexport const options = {\n  stages: [\n    { target: VUS, duration: 'RAMPUP' },\n    { target: VUS, duration: 'DURATION' }\n  ]\n};\n\nexport default function() {\n  http.METHOD('ENDPOINT');\n}`,
  jmeter: `<?xml version=\"1.0\"?>\n<jmeterTestPlan version=\"1.2\">\n  <hashTree>\n    <TestPlan testname=\"Test\"/>\n    <hashTree>\n      <ThreadGroup testname=\"TG\">\n        <stringProp name=\"ThreadGroup.num_threads\">VUS</stringProp>\n        <stringProp name=\"ThreadGroup.ramp_time\">RAMPUP</stringProp>\n        <stringProp name=\"ThreadGroup.duration\">DURATION</stringProp>\n      </ThreadGroup>\n      <hashTree>\n        <HTTPSampler testname=\"HTTP\">\n          <stringProp name=\"HTTPSampler.domain\">DOMAIN</stringProp>\n          <stringProp name=\"HTTPSampler.path\">PATH</stringProp>\n          <stringProp name=\"HTTPSampler.method\">METHOD</stringProp>\n        </HTTPSampler>\n        <hashTree/>\n      </hashTree>\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>`
};

const defaultScriptParams = {
  method: "GET",
  endpoint: "https://www.lojasinoar.com.br/",
  vus: 5,
  duration: 15,
  engine: "k6",
  rampup: 5
};

function getScriptParams() {
  // Get the live parameter values from form
  return {
    engine: (document.getElementById('engineSelect')?.value || defaultScriptParams.engine),
    method: (document.getElementById('methodSelect')?.value || defaultScriptParams.method),
    endpoint: (document.getElementById('urlInput')?.value || defaultScriptParams.endpoint),
    vus: (document.getElementById('usersInput')?.value || defaultScriptParams.vus),
    duration: (document.getElementById('durationInput')?.value || defaultScriptParams.duration),
    rampup: (document.getElementById('rampUpInput')?.value || defaultScriptParams.rampup)
  };
}

function getScriptCode(params) {
  if (!params) params = defaultScriptParams;
  let t;
  // Render compact JMeter if chosen
  if (params.engine === "jmeter") {
    // Parsing endpoint for DOMAIN and PATH (for preview minified JMeter)
    let domain = '', path = '/';
    try {
      const urlObj = new URL(params.endpoint);
      domain = urlObj.hostname;
      path = urlObj.pathname + urlObj.search;
      if (path === '') path = '/';
    } catch (e) {
      domain = params.endpoint;
    }
    t = scriptTemplates.jmeter
      .replace(/VUS/g, params.vus)
      .replace(/RAMPUP/g, params.rampup)
      .replace(/DURATION/g, params.duration)
      .replace(/METHOD/g, params.method)
      .replace(/DOMAIN/g, domain)
      .replace(/PATH/g, path);
    return t;
  } else {
    // K6 script with advanced settings
    const hasHeaders = Object.keys(testState.advanced.headers).length > 0;
    const hasBody = Object.keys(testState.advanced.body).length > 0;
    
    if (hasHeaders || hasBody) {
      t = `import http from 'k6/http';\n\nexport const options = {\n  stages: [\n    { target: VUS, duration: 'RAMPUP' },\n    { target: VUS, duration: 'DURATION' }\n  ]\n};\n\nexport default function() {\n`;
      
      if (hasHeaders) {
        t += `  const headers = ${JSON.stringify(testState.advanced.headers, null, 2).replace(/\n/g, '\n  ')};\n`;
      }
      
      if (hasBody) {
        t += `  const body = JSON.stringify(${JSON.stringify(testState.advanced.body)});\n`;
      }
      
      t += `  `;
      if (hasHeaders && hasBody) {
        t += `http.METHOD('ENDPOINT', body, { headers: headers });`;
      } else if (hasHeaders) {
        t += `http.METHOD('ENDPOINT', null, { headers: headers });`;
      } else if (hasBody) {
        t += `http.METHOD('ENDPOINT', body);`;
      }
      
      t += `\n}`;
    } else {
      t = scriptTemplates.k6;
    }
  }
  
  t = t.replace(/VUS/g, params.vus)
       .replace(/METHOD/g, params.method.toLowerCase())
       .replace(/ENDPOINT/g, params.endpoint)
       .replace(/DURATION/g, params.duration + "s")
       .replace(/RAMPUP/g, params.rampup + "s");
  return t;
}

function updateScriptDisplay() {
  const params = getScriptParams();
  const code = getScriptCode(params);
  const pre = document.getElementById('scriptCode');
  if (pre) {
    pre.innerHTML = renderScriptWithHighlight(code, params.engine);
    // Resize code content for super compact script on JMeter
    if(params.engine==='jmeter'){
      pre.parentElement.parentElement.style.maxHeight='370px';
      pre.parentElement.parentElement.style.overflowY='auto';
    } else {
      pre.parentElement.parentElement.style.maxHeight='';
      pre.parentElement.parentElement.style.overflowY='';
    }
  }
  // language indicator
  const langSpan = document.getElementById('scriptLanguage');
  if (langSpan) {
    langSpan.className = 'script-language' + (params.engine === 'jmeter' ? ' jmeter' : '');
    langSpan.textContent = params.engine === 'jmeter' ? 'JMeter' : 'K6';
    // Change filename if jmeter
    const fileNameEl = document.querySelector('.script-filename');
    if (fileNameEl) fileNameEl.textContent = params.engine === 'jmeter' ? 'jmeter-test.jmx' : 'script.js';

    // Visually indicate compact/minified mode for JMeter
    if (params.engine === 'jmeter') {
      langSpan.classList.add('minified');
    } else {
      langSpan.classList.remove('minified');
    }
  }
}

// Format script with line numbers and syntax highlighting
function renderScriptWithHighlight(code, engine) {
  const lines = code.split('\n');
  const highlighted = engine === 'jmeter' ? 
    lines.map(line => highlightXML(line)) : 
    lines.map(line => highlightJS(line));
  
  // Generate line numbers
  const lineNumbers = lines.map((_, i) => i + 1).join('\n');
  
  // Create wrapper with line numbers and code with proper word wrapping
  return `<div class="script-code-wrapper"><div class="script-line-numbers">${lineNumbers}</div><div class="script-code-content">${highlighted.map(line => `<div class="script-line-content">${line || ' '}</div>`).join('')}</div></div>`;
}

function highlightJS(line) {
  // Enhanced JS syntax highlighting with proper colors
  line = line.replace(/(import|export|const|function|default|return|from)/g, '<span class="keyword">$1</span>')
             .replace(/(http)/g, '<span class="function">$1</span>')
             .replace(/('.*?'|".*?")/g, '<span class="string">$1</span>')
             .replace(/(\d+)/g, '<span class="number">$1</span>')
             .replace(/([\[\]\{\}\(\)])/g, '<span class="bracket">$1</span>')
             .replace(/([,:;])/g, '<span class="operator">$1</span>');
  return line;
}
function highlightXML(line) {
  // Enhanced XML syntax highlighting + comments in gray
  line = line
    .replace(/(<!--.*?-->)/g, '<span class="comment">$1</span>')
    .replace(/(<\/?[a-zA-Z_][a-zA-Z0-9_:\-]*)/g, '<span class="tag">$1</span>')
    .replace(/([a-zA-Z_][a-zA-Z0-9_:\-]*)(=)("[^"]*")/g, '<span class="attribute">$1</span>$2<span class="string">$3</span>')
    .replace(/("[^"]*")/g, '<span class="string">$1</span>')
    .replace(/(\d+)/g, '<span class="number">$1</span>')
    .replace(/([<>\/])/g, '<span class="bracket">$1</span>');
  return line;
}

// Update script whenever a config parameter changes
function bindScriptUpdater() {
  ['engineSelect','methodSelect','urlInput','usersInput','durationInput','rampUpInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateScriptDisplay);
      el.addEventListener('change', updateScriptDisplay);
    }
  });
  updateScriptDisplay();
  
  // Bind copy script button
  const copyBtn = document.getElementById('copyScriptBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', copyScriptToClipboard);
  }
  
  // Bind JSON validation for advanced fields
  initializeAdvancedSettings();
}

// Copy script to clipboard
function copyScriptToClipboard() {
  const params = getScriptParams();
  const code = getScriptCode(params);
  
  // Create a temporary textarea to copy text
  const textarea = document.createElement('textarea');
  textarea.value = code;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    document.execCommand('copy');
    
    // Update button to show success
    const btn = document.getElementById('copyScriptBtn');
    const originalHTML = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <span>Copied!</span>
    `;
    
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = originalHTML;
    }, 2000);
    
    showNotification('success', 'Script copiado para a área de transferência!');
  } catch (err) {
    showNotification('error', 'Erro ao copiar script');
  } finally {
    document.body.removeChild(textarea);
  }
}

// Tab navigation logic
function bindHeaderTabs() {
  const tabs = document.querySelectorAll('.header-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update sidebar nav active state
      document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.toggle('active', navItem.dataset.nav === tab.dataset.tab);
      });
      
      // Views
      document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active');
      });
      const viewElement = document.getElementById(tab.dataset.tab+"View");
      if (viewElement) {
        viewElement.classList.add('active');
      }
    });
  });
}

// Sidebar collapse logic
function bindSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const hamburger = document.getElementById('hamburgerMenu');
  
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
  
  // Hamburger menu toggle (mobile/tablet)
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
      
      // Add overlay on mobile
      if (sidebar.classList.contains('mobile-open')) {
        createOverlay();
      } else {
        removeOverlay();
      }
    });
  }
}

// Create overlay for mobile sidebar
function createOverlay() {
  if (document.getElementById('sidebarOverlay')) return;
  
  const overlay = document.createElement('div');
  overlay.id = 'sidebarOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
    backdrop-filter: blur(4px);
    animation: fadeIn 0.3s ease;
  `;
  
  overlay.addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('mobile-open');
    removeOverlay();
  });
  
  document.body.appendChild(overlay);
}

// Remove overlay
function removeOverlay() {
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) {
    overlay.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => overlay.remove(), 300);
  }
}

// Add fade animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(styleSheet);

// Theme management
function initializeTheme() {
  // Set default theme to dark
  applyTheme(currentTheme);
  
  // Bind theme toggle buttons
  const themeToggle = document.getElementById('themeToggle');
  const themeToggleHeader = document.getElementById('themeToggleHeader');
  
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  if (themeToggleHeader) {
    themeToggleHeader.addEventListener('click', toggleTheme);
  }
}

function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
}

function applyTheme(theme) {
  const html = document.documentElement;
  
  if (theme === 'light') {
    html.setAttribute('data-theme', 'light');
  } else {
    html.removeAttribute('data-theme');
  }
  
  // Force repaint to ensure all colors update
  document.body.style.display = 'none';
  document.body.offsetHeight;
  document.body.style.display = '';
  
  // Update theme label
  const themeLabels = document.querySelectorAll('.theme-label');
  themeLabels.forEach(label => {
    label.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  });
  
  // Redraw charts if they exist to match new theme
  setTimeout(() => {
    if (charts.responseTime && charts.throughput && testState.chartData.timestamps.length > 0) {
      const responseColor = theme === 'light' ? '#0891B2' : '#00D9FF';
      const throughputColor = '#10B981';
      
      drawChart(
        charts.responseTime,
        testState.chartData.timestamps,
        testState.chartData.responseTime,
        responseColor,
        'ms'
      );
      drawChart(
        charts.throughput,
        testState.chartData.timestamps,
        testState.chartData.throughput,
        throughputColor,
        'req/s'
      );
    }
  }, 50);
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  setupEventListeners();
  loadHistoryFromMemory();
  bindScriptUpdater();
  bindHeaderTabs();
  bindSidebarToggle();
  initializeTheme();
  initializeSettings();
  initializeTools();
  initializeScheduler();
  initializeNumberSpinners();
  initializeInfoTooltips();
});

// Initialize info tooltips
function initializeInfoTooltips() {
  // Aguardar um pouco para garantir que o DOM está totalmente carregado
  setTimeout(() => {
    const infoIcons = document.querySelectorAll('.info-icon-container');
    
    if (infoIcons.length === 0) {
      return;
    }
    
    infoIcons.forEach((container) => {
      const icon = container.querySelector('.info-icon');
      const tooltip = container.querySelector('.info-tooltip');
      
      if (icon && tooltip) {
        // Garantir que o tooltip está oculto inicialmente
        tooltip.style.display = 'none';
        
        // Adicionar event listeners
        container.addEventListener('mouseenter', function(e) {
          e.stopPropagation();
          const tooltip = this.querySelector('.info-tooltip');
          if (tooltip) {
            tooltip.style.display = 'block';
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
          }
        });
        
        container.addEventListener('mouseleave', function(e) {
          e.stopPropagation();
          const tooltip = this.querySelector('.info-tooltip');
          if (tooltip) {
            tooltip.style.display = 'none';
            tooltip.style.opacity = '1';
            tooltip.style.visibility = 'visible';
          }
        });
      }
    });
  }, 200);
}

function initializeApp() {
  // Load history from localStorage first
  try {
    const savedHistory = localStorage.getItem('testHistory');
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory);
      if (Array.isArray(parsed) && parsed.length > 0) {
        testState.history = parsed;
        updateHistoryTable();
        updateSidebarStats();
        return; // Don't load mock data if we have saved history
      }
    }
  } catch (e) {
    // localStorage might be disabled or corrupted, continue with mock data
  }
  
  // Load mock history data only if no saved history exists
  mockTests.forEach((test, index) => {
    const date = new Date();
    date.setHours(date.getHours() - (mockTests.length - index));
    testState.history.push({
      date: date.toISOString(),
      ...test
    });
  });
  
  // Save mock data to localStorage
  try {
    localStorage.setItem('testHistory', JSON.stringify(testState.history));
  } catch (e) {
    // localStorage might be full or disabled
  }
  
  updateHistoryTable();
  updateSidebarStats();
}

function setupEventListeners() {
  // Sidebar nav (to match header tabs)
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const nav = item.dataset.nav;
      
      // Update sidebar nav active state
      document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.remove('active');
      });
      item.classList.add('active');
      
      // Update header tabs
      document.querySelectorAll('.header-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === nav);
      });
      
      // Show corresponding view
      document.querySelectorAll('.tab-view').forEach(view => {
        view.classList.remove('active');
      });
      const viewElement = document.getElementById(nav+"View");
      if (viewElement) {
        viewElement.classList.add('active');
      }
    });
  });

  // File upload
  const fileUpload = document.getElementById('fileUpload');
  const fileInput = document.getElementById('fileInput');
  if (fileUpload && fileInput) {
    fileUpload.addEventListener('click', () => fileInput.click());
    fileUpload.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileUpload.style.borderColor = '#00D9FF';
    });
    fileUpload.addEventListener('dragleave', () => {
      fileUpload.style.borderColor = '#2D3F5A';
    });
    fileUpload.addEventListener('drop', (e) => {
      e.preventDefault();
      fileUpload.style.borderColor = '#2D3F5A';
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleFileUpload(file);
    });
  }

  // Test button with safe access
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.addEventListener('click', startTest);
  } else {
    console.error('Botão startBtn não encontrado no DOM');
  }

  // History actions
  document.getElementById('clearHistoryBtn').addEventListener('click', showClearHistoryConfirmation);
  
  // AI Wizard button in config
  const aiWizardBtn = document.querySelector('.btn-ai-wizard');
  if (aiWizardBtn) {
    aiWizardBtn.addEventListener('click', () => openToolModal('ai-wizard'));
  }
}



function handleFileUpload(file) {
  if (!file) return;
  
  const allowedTypes = ['.jmx', '.har', '.json'];
  const fileExtension = '.' + file.name.split('.').pop();
  
  if (!allowedTypes.includes(fileExtension)) {
    addLog('error', 'Tipo de arquivo não suportado. Use JMX, HAR ou JSON.');
    return;
  }
  
  document.getElementById('fileName').textContent = file.name;
  addLog('success', `Arquivo "${file.name}" carregado com sucesso`);
}

function startTest() {
  try {
    
    if (testState.isRunning) {
      addLog('warning', 'Teste já está em execução');
      return;
    }
    
    // Validate DOM is ready
    if (!document.getElementById('urlInput')) {
      console.error('DOM não está pronto. Elementos não encontrados.');
      addLog('error', 'Erro: DOM não está pronto. Recarregue a página.');
      return;
    }

  // Switch to monitor tab
  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'monitor');
  });
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById('monitorView').classList.add('active');

  // Reset chart data
  testState.chartData = {
    responseTime: [],
    throughput: [],
    timestamps: []
  };

  // Get configuration with safe element access
  const urlInput = document.getElementById('urlInput');
  const usersInput = document.getElementById('usersInput');
  const durationInput = document.getElementById('durationInput');
  const rampUpInput = document.getElementById('rampUpInput');
  const thinkTimeInput = document.getElementById('thinkTimeInput');
  const engineSelect = document.getElementById('engineSelect');
  const methodSelect = document.getElementById('methodSelect');
  const testTypeSelect = document.getElementById('testTypeSelect');
  
  // Validate required elements
  if (!urlInput) {
    addLog('error', 'Erro: Campo URL não encontrado');
    console.error('Elemento urlInput não encontrado no DOM');
    return;
  }
  
  if (!methodSelect) {
    addLog('error', 'Erro: Campo Method não encontrado');
    console.error('Elemento methodSelect não encontrado no DOM');
    return;
  }
  
  const config = {
    url: urlInput.value || '',
    users: usersInput ? parseInt(usersInput.value) || 5 : 5,
    duration: durationInput ? parseInt(durationInput.value) || 15 : 15,
    rampUp: rampUpInput ? parseInt(rampUpInput.value) || 5 : 5,
    thinkTime: thinkTimeInput ? parseInt(thinkTimeInput.value) || 1 : 1,
    engine: engineSelect ? engineSelect.value || 'k6' : 'k6',
    method: methodSelect.value || 'GET',
    testType: testTypeSelect ? testTypeSelect.value : 'Load Test'
  };

  if (!config.url || config.url.trim() === '') {
    addLog('error', 'Por favor, insira uma URL válida');
    return;
  }
  
  // Validate URL format
  try {
    new URL(config.url);
  } catch (e) {
    addLog('error', 'URL inválida. Por favor, use um formato válido (ex: https://example.com)');
    return;
  }

  testState.isRunning = true;
  testState.currentTest = {
    ...config,
    startTime: Date.now(),
    duration: config.duration * 1000
  };

  // Update UI
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.disabled = true;
  }

  // Clear previous logs
  const logsContainer = document.getElementById('logsContainer');
  if (logsContainer) {
    logsContainer.innerHTML = '';
  } else {
    console.error('logsContainer não encontrado');
  }

  // Add logs
  addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  addLog('success', 'Teste iniciado com sucesso');
  addLog('info', `URL: ${config.url}`);
  addLog('info', `Engine: ${config.engine}`);
  addLog('info', `Tipo: ${config.testType}`);
  addLog('info', `Usuários: ${config.users}`);
  addLog('info', `Duração: ${config.duration}s`);
  addLog('info', `Ramp-up: ${config.rampUp}s`);
  
  // Log advanced settings if present
  const hasHeaders = Object.keys(testState.advanced.headers).length > 0;
  const hasBody = Object.keys(testState.advanced.body).length > 0;
  
  if (hasHeaders || hasBody) {
    addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    addLog('info', 'Configurações Avançadas:');
    
    if (hasHeaders) {
      const headerPreview = JSON.stringify(testState.advanced.headers).substring(0, 60);
      addLog('success', `📋 Headers: ${headerPreview}${JSON.stringify(testState.advanced.headers).length > 60 ? '...' : ''}`);
    }
    
    if (hasBody) {
      const bodyPreview = JSON.stringify(testState.advanced.body).substring(0, 60);
      addLog('success', `📦 Body: ${bodyPreview}${JSON.stringify(testState.advanced.body).length > 60 ? '...' : ''}`);
    }
    
    addLog('success', '✓ Configuração validada com sucesso');
  }
  
  addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Initialize charts
  try {
  initializeCharts();
  } catch (error) {
    console.error('Erro ao inicializar gráficos:', error);
    addLog('warning', 'Aviso: Gráficos podem não funcionar corretamente');
  }

    // Start real performance test
  setTimeout(() => {
    addLog('success', 'Ramp-up iniciado');
      runRealPerformanceTest(config);
  }, 1000);
  } catch (error) {
    console.error('Erro em startTest():', error);
    addLog('error', `Erro ao iniciar teste: ${error.message}`);
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.disabled = false;
    }
    testState.isRunning = false;
  }
}

// Real performance test with actual HTTP requests
async function runRealPerformanceTest(config) {
  const startTime = Date.now();
  const duration = config.duration * 1000;
  const rampUpDuration = config.rampUp * 1000;
  
  // Metrics tracking - store in testState for access when test is stopped
  let metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    responseTimes: [],
    requestTimestamps: [] // Track when each request was made
  };
  
  // Store metrics in testState for access when test is stopped
  testState.currentMetrics = metrics;
  
  // Active user sessions
  const activeSessions = [];
  let lastChartUpdate = 0;
  let lastLogTime = 0;
  let lastThroughputCount = 0;
  let lastThroughputTime = Date.now();
  const chartUpdateInterval = 2000;
  const logInterval = 2000;
  
  // CORS Proxy configuration - using reliable and tested proxies
  const corsProxies = [
    'https://api.allorigins.win/raw?url=',  // Most reliable, supports all methods
    'https://corsproxy.io/?',                // Good for GET/POST requests
    'https://api.codetabs.com/v1/proxy?quest=', // Alternative proxy
    'https://thingproxy.freeboard.io/fetch/',  // Backup proxy
    'https://cors-anywhere.herokuapp.com/',   // May require activation but works well
    'https://proxy.cors.sh/?',                // Newer proxy service
    'https://api.allorigins.win/get?url='      // Alternative allorigins endpoint
  ];
  
  // URLs known to block CORS - use proxy from start
  const knownCorsBlockedDomains = [
    'google.com',
    'brandili.com.br',
    'lojasinoar.com.br',
    'amazon.com',
    'facebook.com',
    'twitter.com',
    'instagram.com'
  ];
  
  // For production stores, ALWAYS use proxy from start - they almost always block CORS
  let useCorsProxy = false;
  
  // Check if URL is likely to block CORS - use proxy from start for known domains
  try {
    const urlHost = new URL(config.url).hostname.toLowerCase();
    const likelyBlocksCors = knownCorsBlockedDomains.some(domain => urlHost.includes(domain));
    
    // For known CORS-blocking domains (especially production stores), ALWAYS use proxy
    if (likelyBlocksCors) {
      useCorsProxy = true;
      corsProxyIndex = 0; // Start with first proxy
    }
  } catch (e) {
    // On URL parse error, try without proxy first
  }
  
  let corsProxyIndex = 0;
  let corsErrorsCount = 0;
  let lastCorsErrorTime = 0;
  
  // Function to get URL with optional CORS proxy
  function getRequestUrl(url) {
    if (useCorsProxy && corsProxies[corsProxyIndex]) {
      const proxy = corsProxies[corsProxyIndex];
      let proxyUrl;
      
      // Different proxy formats - handle each proxy's specific format correctly
      // IMPORTANT: Always encode the URL properly to avoid 404 errors
      const encodedUrl = encodeURIComponent(url);
      
      if (proxy.includes('allorigins.win')) {
        // allorigins.win format: https://api.allorigins.win/raw?url=ENCODED_URL
        // Works with both /raw?url= and /get?url=
        proxyUrl = proxy + encodedUrl;
      } else if (proxy.includes('corsproxy.io')) {
        // corsproxy.io format: https://corsproxy.io/?ENCODED_URL
        proxyUrl = proxy + encodedUrl;
      } else if (proxy.includes('codetabs.com')) {
        // codetabs format: https://api.codetabs.com/v1/proxy?quest=ENCODED_URL
        proxyUrl = proxy + encodedUrl;
      } else if (proxy.includes('cors-anywhere')) {
        // cors-anywhere format: https://cors-anywhere.herokuapp.com/URL
        // This one doesn't need encoding in the path
        proxyUrl = proxy + url;
      } else if (proxy.includes('cors.sh')) {
        // cors.sh format: https://proxy.cors.sh/?ENCODED_URL
        proxyUrl = proxy + encodedUrl;
      } else if (proxy.includes('thingproxy')) {
        // thingproxy format: https://thingproxy.freeboard.io/fetch/URL
        // This one doesn't need encoding
        proxyUrl = proxy + url;
      } else {
        // Default: encode URL for safety
        proxyUrl = proxy + encodedUrl;
      }
      
      // Validate URL before returning
      try {
        new URL(proxyUrl);
      } catch (e) {
        // Fallback: try with double encoding if single encoding failed
        proxyUrl = proxy + encodeURIComponent(encodeURIComponent(url));
      }
      
      
      return proxyUrl;
    }
    return url;
  }
  
  // Function to try next proxy if current one fails
  function tryNextProxy() {
    const previousProxy = corsProxies[corsProxyIndex];
    const previousIndex = corsProxyIndex;
    corsProxyIndex++;
    if (corsProxyIndex >= corsProxies.length) {
      corsProxyIndex = 0; // Reset to first proxy
      // Don't disable proxy completely, just cycle back
      addLog('warning', `⚠️ Todos os ${corsProxies.length} proxies foram testados. Reiniciando ciclo...`);
      // Reset metrics to give new cycle a chance
      return true; // Continue trying
    }
    addLog('warning', `🔄 Proxy ${previousIndex + 1}/${corsProxies.length} falhou. Trocando para proxy ${corsProxyIndex + 1}/${corsProxies.length}...`);
    return true;
  }
  
  // Prepare request options
  const requestOptions = {
    method: config.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...testState.advanced.headers
    }
  };
  
  // Add body if present and method supports it
  if (testState.advanced.body && Object.keys(testState.advanced.body).length > 0) {
    if (['POST', 'PUT', 'PATCH'].includes(config.method)) {
      requestOptions.body = JSON.stringify(testState.advanced.body);
    }
  }
  
  // Function to make a single HTTP request
  async function makeRequest(sessionId) {
    if (!testState.isRunning) return null;
    
    const requestStart = performance.now();
    let responseTime = 0;
    let timeoutId = null;
    
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      // Try to fetch with current configuration
      let fetchUrl = getRequestUrl(config.url);
      let fetchOptions = {
        ...requestOptions,
        signal: controller.signal,
        mode: useCorsProxy ? 'cors' : 'cors',
        credentials: 'omit'
      };
      
      // If using proxy, simplify headers to avoid preflight requests
      if (useCorsProxy && corsProxies[corsProxyIndex]) {
        const currentProxy = corsProxies[corsProxyIndex];
        
        // Simplify headers to avoid CORS preflight (OPTIONS requests)
        // Only use simple headers that don't trigger preflight
        const simpleHeaders = {
          'Accept': 'application/json, text/plain, */*'
        };
        
        // Different proxies have different requirements
        if (currentProxy.includes('allorigins.win')) {
          // allorigins.win - best proxy, supports all methods
          fetchOptions.method = config.method || 'GET';
          fetchOptions.headers = simpleHeaders;
          // Only add Content-Type if we have a body (for POST/PUT/PATCH)
          if (fetchOptions.body && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
            fetchOptions.headers['Content-Type'] = 'application/json';
          }
        } else if (currentProxy.includes('corsproxy.io')) {
          // corsproxy.io - supports GET and POST
          if (['GET', 'POST'].includes(config.method)) {
            fetchOptions.method = config.method;
            fetchOptions.headers = simpleHeaders;
            if (fetchOptions.body && config.method === 'POST') {
              fetchOptions.headers['Content-Type'] = 'application/json';
            }
          } else {
            fetchOptions.method = 'GET';
            delete fetchOptions.body;
            fetchOptions.headers = simpleHeaders;
          }
        } else {
          // Other proxies - GET only for safety (most reliable)
          fetchOptions.method = 'GET';
          delete fetchOptions.body;
          fetchOptions.headers = simpleHeaders;
        }
        
      }
      
      const response = await fetch(fetchUrl, fetchOptions);
      
      if (timeoutId) clearTimeout(timeoutId);
      const requestEnd = performance.now();
      responseTime = Math.round(requestEnd - requestStart);
      
      metrics.totalRequests++;
      metrics.responseTimes.push(responseTime);
      metrics.requestTimestamps.push(Date.now());
      // Update testState metrics
      testState.currentMetrics = metrics;
      
      // Handle proxy-specific error detection
      if (useCorsProxy) {
        const status = response.status;
        
        // Proxies may return these status codes when they fail or block requests
        // 404 means proxy couldn't find the URL - likely URL encoding issue
        if (status === 403 || status === 404 || status === 429 || status === 502 || status === 503 || status === 504) {
          // Proxy error - try next proxy immediately
          corsErrorsCount++;
          if (corsErrorsCount >= 1) {
            if (tryNextProxy()) {
              corsErrorsCount = 0;
              addLog('warning', `⚠️ Proxy retornou erro ${status}${status === 404 ? ' (URL não encontrada)' : ''}. Tentando próximo proxy...`);
            }
          }
          metrics.failedRequests++;
          return { success: false, responseTime, status: status };
        }
        
        // Check if proxy is failing consistently (many failures with no successes)
        // This helps detect when a proxy is blocking specific domains (common with production stores)
        // More aggressive: try next proxy after just 2-3 failures
        if (metrics.totalRequests >= 3 && metrics.successfulRequests === 0 && metrics.failedRequests >= 2) {
          // Proxy seems to be blocking - try next one immediately
          if (corsErrorsCount >= 1) {
            if (tryNextProxy()) {
              corsErrorsCount = 0;
              addLog('warning', `⚠️ Proxy bloqueando requisições (${metrics.failedRequests} falhas, 0 sucessos). Tentando próximo...`);
            }
          }
        }
      }
      
      // Standard response handling
      if (response.ok) {
        metrics.successfulRequests++;
        // Update testState metrics
        testState.currentMetrics = metrics;
        // Log first success to confirm proxy is working
        if (metrics.successfulRequests === 1 && useCorsProxy) {
        }
        return { success: true, responseTime, status: response.status };
      } else {
        metrics.failedRequests++;
        
        // If using proxy and getting non-2xx, might be proxy issue - try next proxy
        if (useCorsProxy && (response.status === 403 || response.status === 429 || response.status >= 500)) {
          corsErrorsCount++;
          if (corsErrorsCount >= 1) {
            if (tryNextProxy()) {
              corsErrorsCount = 0;
              addLog('warning', `⚠️ Proxy retornou erro ${response.status}. Tentando próximo proxy...`);
            }
          }
        }
        
        // Only log non-2xx status codes occasionally to avoid spam
        if (metrics.failedRequests % 10 === 0) {
          addLog('warning', `Requisição ${sessionId}: Status HTTP ${response.status}`);
        }
        return { success: false, responseTime, status: response.status };
      }
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      
      const requestEnd = performance.now();
      responseTime = Math.round(requestEnd - requestStart);
      
      metrics.totalRequests++;
      metrics.failedRequests++;
      metrics.responseTimes.push(responseTime);
      metrics.requestTimestamps.push(Date.now());
      // Update testState metrics
      testState.currentMetrics = metrics;
      
      // Categorize error types
      const errorName = error.name || '';
      const errorMsg = error.message || String(error) || 'Erro desconhecido';
      let errorMessage = errorMsg;
      let errorType = 'unknown';
      
      if (errorName === 'AbortError' || errorMsg.includes('aborted')) {
        errorType = 'timeout';
        errorMessage = 'Timeout (requisição demorou mais de 30s)';
      } else if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || errorMsg.includes('getaddrinfo') || errorMsg.includes('ENOTFOUND')) {
        errorType = 'dns';
        errorMessage = 'DNS não resolveu (domínio não encontrado ou inválido)';
      } else if (errorMsg.includes('CORS') || errorMsg.includes('cross-origin') || errorMsg.includes('Access-Control') || errorMsg.includes('blocked by CORS policy') || 
                 (errorMsg.includes('Failed to fetch') && (error.stack?.includes('CORS') || error.stack?.includes('Access-Control')))) {
        // CORS error - check console for CORS messages
        errorType = 'cors';
        errorMessage = 'Erro CORS (servidor bloqueou requisição cross-origin)';
        corsErrorsCount++;
        
          // Auto-enable CORS proxy IMMEDIATELY on first CORS error
          const now = Date.now();
          if (!useCorsProxy) {
            useCorsProxy = true;
            corsProxyIndex = 0;
            corsErrorsCount = 0;
            addLog('warning', '🔄 Erro CORS detectado! Ativando proxy...');
          } else {
            // Already using proxy but still getting CORS errors - try next proxy immediately
            corsErrorsCount++;
            if (corsErrorsCount >= 1) {
              if (tryNextProxy()) {
                corsErrorsCount = 0; // Reset counter for new proxy
              }
            }
          }
        lastCorsErrorTime = now;
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('Network request failed') || errorMsg.includes('fetch') || errorMsg.includes('TypeError')) {
        // Generic network error - check if it's likely CORS based on pattern
        // If requests are failing immediately with "Failed to fetch" and none succeeded, likely CORS
        if (metrics.failedRequests >= 1 && metrics.successfulRequests === 0) {
          // Pattern suggests CORS - requests failing immediately
          errorType = 'cors';
          errorMessage = 'Erro CORS (provavelmente bloqueado por política CORS)';
          corsErrorsCount++;
          
          // Auto-enable CORS proxy IMMEDIATELY on first failure
          const now = Date.now();
          if (!useCorsProxy) {
            useCorsProxy = true;
            corsProxyIndex = 0;
            corsErrorsCount = 0;
            addLog('warning', '🔄 Erro de rede detectado! Ativando proxy...');
          } else {
            // Already using proxy but still failing - try next proxy IMMEDIATELY
            corsErrorsCount++;
            if (corsErrorsCount >= 1) {
              if (tryNextProxy()) {
                corsErrorsCount = 0;
              }
            }
          }
          lastCorsErrorTime = now;
        } else {
          errorType = 'network';
          // Check if it's a DNS error
          if (errorMsg.includes('ERR_NAME_NOT_RESOLVED') || errorMsg.includes('getaddrinfo') || errorMsg.includes('ENOTFOUND')) {
            errorType = 'dns';
            errorMessage = 'DNS não resolveu (domínio não encontrado ou inválido)';
          } else {
            errorMessage = 'Erro de rede (servidor inacessível ou timeout)';
          }
        }
      }
      
      // Only log errors occasionally to avoid console spam
      if (metrics.failedRequests === 1) {
        addLog('error', `Primeira requisição falhou: ${errorMessage}`);
        if (errorType === 'dns') {
          addLog('info', '💡 Verifique se a URL está correta e o domínio existe');
        } else if (errorType === 'cors') {
          addLog('info', '💡 O servidor bloqueou requisições CORS');
          if (!useCorsProxy) {
            addLog('info', '🔄 Proxy CORS será ativado automaticamente após alguns erros');
            addLog('info', '💡 Dica: Marque "Usar Proxy CORS" para ativar desde o início');
          } else {
            addLog('info', '⚠️ Proxy CORS está ativo mas ainda há erros');
            addLog('info', '🔄 Tentando próximo proxy automaticamente...');
          }
          addLog('info', '💡 Sugestão: Teste APIs que permitem CORS como jsonplaceholder.typicode.com');
          addLog('info', '📖 Veja CORS_SOLUTIONS.md para mais opções');
        } else if (errorType === 'network') {
          addLog('info', '💡 Verifique sua conexão e se o servidor está acessível');
        }
        // Log detalhado apenas no console, não poluir a UI
        // Error logged to UI, no console spam
          name: errorName,
          message: errorMsg,
          type: errorType,
          url: config.url
        });
      } else if (metrics.failedRequests % 10 === 0) {
        addLog('warning', `${metrics.failedRequests} requisições falharam. Último erro: ${errorMessage}`);
      }
      
      return { success: false, responseTime, error: errorMessage, errorType };
    }
  }
  
  // Function to run a user session (simulates one virtual user)
  async function runUserSession(sessionId) {
    while (testState.isRunning) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) break;
      
      // Make request
      await makeRequest(sessionId);
      
      // Think time (simulates user thinking/reading)
      if (config.thinkTime > 0) {
        await new Promise(resolve => setTimeout(resolve, config.thinkTime * 1000));
      } else {
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  
  // Ramp-up: gradually increase active users
  const rampUpInterval = setInterval(() => {
    if (!testState.isRunning) {
      clearInterval(rampUpInterval);
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= duration) {
      clearInterval(rampUpInterval);
      return;
    }
    
    // Calculate target active users based on ramp-up
    let targetUsers;
    if (elapsed < rampUpDuration) {
      targetUsers = Math.max(1, Math.floor(config.users * (elapsed / rampUpDuration)));
    } else {
      targetUsers = config.users;
    }
    
    // Start new sessions if needed
    while (activeSessions.length < targetUsers && testState.isRunning) {
      const sessionId = activeSessions.length + 1;
      activeSessions.push(sessionId);
      runUserSession(sessionId);
    }
  }, 500);
  
  // Metrics update interval
  const metricsInterval = setInterval(() => {
    if (!testState.isRunning) {
      clearInterval(metricsInterval);
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    
    if (elapsed >= duration) {
      clearInterval(metricsInterval);
      clearInterval(rampUpInterval);
      
      // Calculate final metrics
      const avgResponseTime = metrics.responseTimes.length > 0
        ? Math.round(metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length)
        : 0;
      
      const successRate = metrics.totalRequests > 0
        ? ((metrics.successfulRequests / metrics.totalRequests) * 100)
        : 0;
      
      endTest(config, {
        requests: metrics.totalRequests,
        avgResponse: avgResponseTime,
        successRate: successRate
      });
      return;
    }
    
    // Calculate current metrics (last 2 seconds)
    const now = Date.now();
    const twoSecondsAgo = now - 2000;
    const recentRequests = metrics.requestTimestamps.filter(ts => ts > twoSecondsAgo).length;
    const throughput = recentRequests / 2; // requests per second
    
    // Get recent response times (last 20 requests)
    const recentResponseTimes = metrics.responseTimes.slice(-20);
    const avgResponseTime = recentResponseTimes.length > 0
      ? Math.round(recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length)
      : 0;
    
    const successRate = metrics.totalRequests > 0
      ? ((metrics.successfulRequests / metrics.totalRequests) * 100)
      : 0;
    
    const activeUsers = activeSessions.length;
    
    // Update UI metrics
    updateMetric('throughput', throughput);
    updateMetric('avgResponse', avgResponseTime);
    updateMetric('activeUsers', activeUsers);
    updateMetric('successRateMetric', successRate.toFixed(1));

    // Update charts every 2 seconds
    if (elapsed - lastChartUpdate >= chartUpdateInterval) {
      addChartData(elapsedSeconds, avgResponseTime, throughput);
      lastChartUpdate = elapsed;
    }

    // Add periodic logs
    if (elapsed - lastLogTime >= logInterval) {
      addLog('info', `[${elapsedSeconds}s] ${activeUsers} usuários ativos, ${throughput} req/s, ${avgResponseTime}ms média, ${successRate.toFixed(1)}% sucesso`);
      lastLogTime = elapsed;
    }
  }, 1000);
}

// Helper function to save test to history
function saveTestToHistory(config, results) {
  // Determine status and diagnostic
  let status = 'Sucessas';
  let diagnostic = 'Performance excelente';
  const errorRate = 100 - results.successRate;

  if (results.avgResponse > 500 || errorRate > 10) {
    status = 'Erro';
    diagnostic = 'Site muito lento';
  } else if (results.avgResponse > 400 || errorRate > 5) {
    diagnostic = 'Performance razoável';
  } else if (results.avgResponse > 300 || errorRate > 2) {
    diagnostic = 'Performance boa';
  }

  // Save to history
  const testRecord = {
    date: new Date().toISOString(),
    url: config.url,
    engine: config.engine.toLowerCase().includes('k6') ? 'k6' : 'jmeter',
    test_type: config.testType,
    users: config.users,
    status: status,
    diagnostic: diagnostic,
    error_rate: errorRate,
    avg_response: results.avgResponse
  };

  testState.history.unshift(testRecord);
  
  // Persist to localStorage
  try {
    localStorage.setItem('testHistory', JSON.stringify(testState.history));
  } catch (e) {
    // localStorage might be full or disabled, continue without persistence
  }
  
  updateHistoryTable();
  updateSidebarStats();
}

function endTest(config, results) {
  testState.isRunning = false;

  addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  addLog('success', 'Teste finalizado');
  addLog('info', `Total de requisições: ${results.requests}`);
  addLog('info', `Tempo médio de resposta: ${results.avgResponse}ms`);
  addLog('info', `Taxa de sucesso: ${results.successRate.toFixed(1)}%`);
  addLog('info', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Save to history
  saveTestToHistory(config, results);

  // Reset UI
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.disabled = false;
  }
  
  // Clear current metrics
  testState.currentMetrics = null;
  testState.currentTest = null;
}

function stopTest() {
  if (!testState.isRunning) return;
  
  const wasRunning = testState.isRunning;
  testState.isRunning = false;
  
  // Save test to history if we have metrics
  if (wasRunning && testState.currentTest && testState.currentMetrics) {
    const metrics = testState.currentMetrics;
    
    // Calculate final metrics from current state
    const avgResponseTime = metrics.responseTimes.length > 0
      ? Math.round(metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length)
      : 0;
    
    const successRate = metrics.totalRequests > 0
      ? ((metrics.successfulRequests / metrics.totalRequests) * 100)
      : 0;
    
    // Save to history
    saveTestToHistory(testState.currentTest, {
      requests: metrics.totalRequests,
      avgResponse: avgResponseTime,
      successRate: successRate
    });
    
    addLog('warning', 'Teste interrompido pelo usuário');
    addLog('info', `Total de requisições: ${metrics.totalRequests}`);
    addLog('info', `Tempo médio de resposta: ${avgResponseTime}ms`);
    addLog('info', `Taxa de sucesso: ${successRate.toFixed(1)}%`);
  } else {
    addLog('warning', 'Teste interrompido pelo usuário');
  }
  
  const startBtn = document.getElementById('startBtn');
  if (startBtn) {
    startBtn.disabled = false;
  }
  
  // Clear current metrics
  testState.currentMetrics = null;
  testState.currentTest = null;
}

function updateMetric(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  const currentValue = element.textContent.replace(/[^0-9.]/g, '');
  const newValue = typeof value === 'number' ? value : parseFloat(value);
  
  if (currentValue != newValue) {
    element.style.transform = 'scale(1.1)';
    setTimeout(() => {
      element.style.transform = 'scale(1)';
    }, 200);
  }

  if (id === 'throughput') {
    element.textContent = Math.round(newValue);
  } else if (id === 'avgResponse') {
    element.innerHTML = `${Math.round(newValue)}<span class="metric-unit">ms</span>`;
  } else if (id === 'activeUsers') {
    element.textContent = Math.round(newValue);
  } else if (id === 'successRateMetric') {
    element.innerHTML = `${parseFloat(newValue).toFixed(1)}<span class="metric-unit">%</span>`;
  }
}

function addLog(type, message) {
  const container = document.getElementById('logsContainer');
  if (!container) {
    return;
  }
  
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  
  const time = new Date().toLocaleTimeString('pt-BR');
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-message">${message}</span>
  `;
  
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

function updateHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  
  if (testState.history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum teste executado ainda</td></tr>';
    return;
  }

  tbody.innerHTML = testState.history.map(test => {
    const date = new Date(test.date);
    const formattedDate = date.toLocaleDateString('pt-BR');
    const formattedTime = date.toLocaleTimeString('pt-BR');
    const statusClass = test.status === 'Sucessas' ? 'test-status-success' : 'test-status-error';
    
    return `
      <tr>
        <td>${formattedDate} ${formattedTime}</td>
        <td>${test.url}</td>
        <td>${test.engine}</td>
        <td>${test.test_type}</td>
        <td>${test.users}</td>
        <td><span class="test-status-badge ${statusClass}">${test.status}</span></td>
        <td>${test.diagnostic}</td>
        <td>${test.error_rate.toFixed(1)}%</td>
        <td>${test.avg_response}ms</td>
      </tr>
    `;
  }).join('');
}

function updateSidebarStats() {
  const totalTests = testState.history.length;
  const successTests = testState.history.filter(t => t.status === 'Sucessas').length;
  const successRate = totalTests > 0 ? ((successTests / totalTests) * 100).toFixed(1) : 0;
  
  document.getElementById('totalTests').textContent = totalTests;
  document.getElementById('successRate').textContent = `${successRate}%`;
}

function loadHistoryFromMemory() {
  // History is already loaded from mockTests in initializeApp
  // This function exists for future enhancement
}

// ============================================
// SETTINGS FUNCTIONALITY
// ============================================

function initializeSettings() {
  // Load settings into form
  loadSettingsForm();
  
  // Bind settings form events
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('resetSettingsBtn').addEventListener('click', resetSettings);
  
  // Theme options
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', () => {
      const theme = option.dataset.theme;
      selectThemeOption(theme);
      currentTheme = theme;
      applyTheme(theme);
    });
  });
  
  // Set active theme option
  selectThemeOption(currentTheme);
}

function loadSettingsForm() {
  document.getElementById('defaultEngine').value = appSettings.defaultEngine;
  document.getElementById('defaultVUS').value = appSettings.defaultVUS;
  document.getElementById('defaultDuration').value = appSettings.defaultDuration;
  document.getElementById('defaultRampup').value = appSettings.defaultRampup;
  document.getElementById('notifyComplete').checked = appSettings.notifyComplete;
  document.getElementById('notifyErrors').checked = appSettings.notifyErrors;
  document.getElementById('soundAlerts').checked = appSettings.soundAlerts;
  document.getElementById('timeoutDuration').value = appSettings.timeout;
  document.getElementById('retryAttempts').value = appSettings.retries;
  document.getElementById('maxConcurrent').value = appSettings.maxConcurrent;
}

function saveSettings() {
  appSettings = {
    defaultEngine: document.getElementById('defaultEngine').value,
    defaultVUS: parseInt(document.getElementById('defaultVUS').value),
    defaultDuration: parseInt(document.getElementById('defaultDuration').value),
    defaultRampup: parseInt(document.getElementById('defaultRampup').value),
    theme: currentTheme,
    notifyComplete: document.getElementById('notifyComplete').checked,
    notifyErrors: document.getElementById('notifyErrors').checked,
    soundAlerts: document.getElementById('soundAlerts').checked,
    timeout: parseInt(document.getElementById('timeoutDuration').value),
    retries: parseInt(document.getElementById('retryAttempts').value),
    maxConcurrent: parseInt(document.getElementById('maxConcurrent').value)
  };
  
  // Apply defaults to config form
  document.getElementById('engineSelect').value = appSettings.defaultEngine;
  document.getElementById('usersInput').value = appSettings.defaultVUS;
  document.getElementById('durationInput').value = appSettings.defaultDuration;
  document.getElementById('rampUpInput').value = appSettings.defaultRampup;
  
  updateScriptDisplay();
  
  // Show notification
  showNotification('success', 'Configurações salvas com sucesso!');
}

function resetSettings() {
  if (!confirm('Tem certeza que deseja restaurar as configurações padrão?')) return;
  
  appSettings = {
    defaultEngine: 'k6',
    defaultVUS: 5,
    defaultDuration: 60,
    defaultRampup: 5,
    theme: 'dark',
    notifyComplete: true,
    notifyErrors: true,
    soundAlerts: true,
    timeout: 30000,
    retries: 3,
    maxConcurrent: 5
  };
  
  loadSettingsForm();
  selectThemeOption('dark');
  currentTheme = 'dark';
  applyTheme('dark');
  
  showNotification('info', 'Configurações restauradas para os valores padrão');
}

function selectThemeOption(theme) {
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
}

function showNotification(type, message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' : 
        type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'}
    </svg>
    <span>${message}</span>
  `;
  
  // Add CSS for notification
  const style = document.createElement('style');
  if (!document.getElementById('notification-styles')) {
    style.id = 'notification-styles';
    style.textContent = `
      .notification {
        position: fixed;
        top: 90px;
        right: 32px;
        background: var(--secondary-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        z-index: 9999;
        animation: slideInRight 0.3s ease;
        min-width: 300px;
      }
      .notification-success { border-left: 4px solid var(--success); }
      .notification-error { border-left: 4px solid var(--danger); }
      .notification-info { border-left: 4px solid var(--accent); }
      @keyframes slideInRight {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ============================================
// TOOLS FUNCTIONALITY
// ============================================

function initializeTools() {
  // Bind tool card clicks
  document.querySelectorAll('.tool-card').forEach(card => {
    const btn = card.querySelector('.btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tool = card.dataset.tool;
      openToolModal(tool);
    });
  });
  
  // Close modal
  document.getElementById('closeModal').addEventListener('click', closeToolModal);
  document.getElementById('toolModal').addEventListener('click', (e) => {
    if (e.target.id === 'toolModal') closeToolModal();
  });
}

function openToolModal(tool) {
  const modal = document.getElementById('toolModal');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  
  const toolContent = {
    'ai-wizard': {
      title: '✨ Jerfrey AI',
      content: `
        <h3>Assistente Inteligente de Configuração</h3>
        <p>O Jerfrey AI ajuda você a configurar testes de performance otimizados usando inteligência artificial.</p>
        <div class="form-group">
          <label>Descreva seu objetivo de teste</label>
          <textarea id="aiWizardInput" class="input" rows="4" placeholder="Ex: Quero testar minha API REST com 1000 usuários simultâneos..."></textarea>
        </div>
        <div class="form-group">
          <label>Tipo de aplicação</label>
          <select id="aiAppType" class="input">
            <option>API REST</option>
            <option>Website</option>
            <option>WebSocket</option>
            <option>GraphQL</option>
          </select>
        </div>
        <div id="aiSuggestions" style="display:none; margin-top: 24px; padding: 20px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border);">
          <h4 style="margin-top: 0; color: var(--accent);">💡 Sugestões da IA</h4>
          <div id="aiSuggestionsContent"></div>
          <button class="btn btn-primary" onclick="applyAISuggestions()" style="margin-top: 16px; width: 100%;">Aplicar Configuração</button>
        </div>
        <button class="btn btn-launch" onclick="generateAISuggestions()">Gerar Configuração com IA</button>
      `
    },
    'report-generator': {
      title: '📊 Report Generator',
      content: `
        <h3>Gerador de Relatórios</h3>
        <p>Crie relatórios detalhados e profissionais dos seus testes de performance.</p>
        <div class="form-group">
          <label>Selecione os testes</label>
          <select id="reportTestsSelect" class="input" multiple size="5">
            ${testState.history.length > 0 ? testState.history.map((test, i) => `
              <option value="${i}">${new Date(test.date).toLocaleDateString('pt-BR')} ${new Date(test.date).toLocaleTimeString('pt-BR')} - ${test.url}</option>
            `).join('') : '<option disabled>Nenhum teste disponível</option>'}
          </select>
        </div>
        <div class="form-group">
          <label>Formato do relatório</label>
          <select id="reportFormat" class="input">
            <option>HTML</option>
            <option>PDF</option>
            <option>Excel</option>
            <option>JSON</option>
          </select>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="reportCharts" checked>
            <span>Incluir gráficos</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="reportComparisons" checked>
            <span>Incluir comparações</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="reportRecommendations">
            <span>Incluir recomendações</span>
          </label>
        </div>
        <button class="btn btn-launch" onclick="generateReport()">Gerar Relatório</button>
        <div id="reportPreview" style="display:none; margin-top: 24px;"></div>
      `
    },
    'performance-analyzer': {
      title: '🔍 Performance Analyzer',
      content: `
        <h3>Analisador de Performance</h3>
        <p>Análise profunda e insights sobre seus resultados de teste.</p>
        <div class="form-group">
          <label>Selecione um teste para analisar</label>
          <select id="analyzerTestSelect" class="input">
            ${testState.history.length > 0 ? testState.history.map((test, i) => `
              <option value="${i}">${new Date(test.date).toLocaleDateString('pt-BR')} - ${test.url} (${test.avg_response}ms)</option>
            `).join('') : '<option disabled>Nenhum teste disponível</option>'}
          </select>
        </div>
        <div class="form-group">
          <label>Métricas para analisar</label>
          <label class="checkbox-label">
            <input type="checkbox" id="analyzeResponseTime" checked>
            <span>Tempo de resposta</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="analyzeThroughput" checked>
            <span>Throughput</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="analyzeErrorRate" checked>
            <span>Taxa de erro</span>
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="analyzeResources">
            <span>Uso de recursos</span>
          </label>
        </div>
        <button class="btn btn-launch" onclick="analyzePerformance()">Iniciar Análise</button>
        <div id="analysisResults" style="display:none; margin-top: 24px;"></div>
      `
    },
    'data-converter': {
      title: '🔄 Data Converter',
      content: `
        <h3>Conversor de Formatos</h3>
        <p>Converta scripts e dados entre diferentes formatos de teste.</p>
        <div class="form-group">
          <label>Formato de origem</label>
          <select id="converterSource" class="input">
            <option value="k6">K6 JavaScript</option>
            <option value="jmeter">JMeter JMX</option>
            <option value="postman">Postman Collection</option>
            <option value="har">HTTP Archive (HAR)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Formato de destino</label>
          <select id="converterTarget" class="input">
            <option value="k6">K6 JavaScript</option>
            <option value="jmeter">JMeter JMX</option>
            <option value="postman">Postman Collection</option>
          </select>
        </div>
        <div class="form-group">
          <label>Cole seu script aqui</label>
          <textarea id="converterInput" class="input json-input" rows="10" placeholder="Cole o conteúdo do arquivo aqui..."></textarea>
        </div>
        <button class="btn btn-launch" onclick="convertData()">Converter</button>
        <div id="converterOutput" style="display:none; margin-top: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <h4 style="margin: 0;">Resultado da Conversão</h4>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary" onclick="copyConverterOutput()" style="padding: 6px 12px; font-size: 12px;">Copiar</button>
              <button class="btn btn-secondary" onclick="downloadConverterOutput()" style="padding: 6px 12px; font-size: 12px;">Baixar</button>
            </div>
          </div>
          <textarea id="converterOutputText" class="input json-input" rows="10" readonly></textarea>
        </div>
      `
    },
    'load-profile': {
      title: '📈 Load Profile Builder',
      content: `
        <h3>Construtor de Perfil de Carga</h3>
        <p>Crie perfis de carga personalizados visualmente.</p>
        <div class="form-group">
          <label>Padrão de carga</label>
          <select id="loadPattern" class="input" onchange="updateLoadProfilePreview()">
            <option value="constant">Constante</option>
            <option value="ramp-up">Rampa crescente</option>
            <option value="ramp-down">Rampa decrescente</option>
            <option value="spike">Picos (Spike)</option>
            <option value="wave">Ondas</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Usuários mínimos</label>
            <input type="number" id="loadMinUsers" class="input" value="10" min="1" onchange="updateLoadProfilePreview()">
          </div>
          <div class="form-group">
            <label>Usuários máximos</label>
            <input type="number" id="loadMaxUsers" class="input" value="100" min="1" onchange="updateLoadProfilePreview()">
          </div>
        </div>
        <div class="form-group">
          <label>Duração total (segundos)</label>
          <input type="number" id="loadDuration" class="input" value="60" min="10" onchange="updateLoadProfilePreview()">
        </div>
        <div class="form-group">
          <label>Preview do Perfil de Carga</label>
          <canvas id="loadProfileCanvas" style="width: 100%; height: 200px; background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;"></canvas>
        </div>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-secondary" onclick="saveLoadProfile()" style="flex: 1;">Salvar Perfil</button>
          <button class="btn btn-launch" onclick="applyLoadProfile()" style="flex: 1;">Aplicar Perfil ao Teste</button>
        </div>
      `
    }
  };
  
  const content = toolContent[tool];
  title.textContent = content.title;
  body.innerHTML = content.content;
  
  modal.classList.add('active');
  
  // Initialize tool-specific features
  if (tool === 'load-profile') {
    setTimeout(() => updateLoadProfilePreview(), 100);
  }
}

// AI Wizard Functions
function generateAISuggestions() {
  const input = document.getElementById('aiWizardInput').value;
  const appType = document.getElementById('aiAppType').value;
  
  if (!input.trim()) {
    showNotification('error', '⚠️ Por favor, descreva seu teste primeiro');
    return;
  }
  
  showNotification('info', 'ℹ️ Analisando sua descrição...');
  
  // Simulate AI processing
  const suggestionsDiv = document.getElementById('aiSuggestions');
  const contentDiv = document.getElementById('aiSuggestionsContent');
  
  contentDiv.innerHTML = '<p style="color: var(--text-secondary); font-style: italic;">🤖 Analisando seu objetivo...</p>';
  suggestionsDiv.style.display = 'block';
  
  setTimeout(() => {
    // Generate smart suggestions based on input
    const words = input.toLowerCase();
    let vus = 50, duration = 60, engine = 'k6';
    let url = 'https://api.example.com';
    
    if (words.includes('1000') || words.includes('mil')) vus = 1000;
    else if (words.includes('500')) vus = 500;
    else if (words.includes('100')) vus = 100;
    
    if (words.includes('stress') || words.includes('estresse')) duration = 300;
    else if (words.includes('spike') || words.includes('pico')) duration = 120;
    
    if (words.includes('jmeter')) engine = 'jmeter';
    
    window.aiSuggestions = { vus, duration, engine, url };
    
    contentDiv.innerHTML = `
      <div style="background: var(--code-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border);">
        <p style="margin: 0 0 12px 0; color: var(--text-primary); font-weight: 600;">✅ Configuração Recomendada:</p>
        <ul style="margin: 0; padding-left: 20px; color: var(--text-secondary);">
          <li><strong>URL:</strong> ${url}</li>
          <li><strong>Tipo:</strong> ${appType}</li>
          <li><strong>Engine:</strong> ${engine.toUpperCase()}</li>
          <li><strong>Usuários Virtuais:</strong> ${vus}</li>
          <li><strong>Duração:</strong> ${duration}s</li>
          <li><strong>Ramp-up:</strong> ${Math.floor(duration * 0.1)}s</li>
        </ul>
        <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid var(--border); color: var(--text-secondary); font-size: 13px;">
          💡 <strong>Dica:</strong> Esta configuração é ideal para ${appType} com carga ${vus > 500 ? 'alta' : 'moderada'}.
        </p>
      </div>
    `;
  }, 1500);
}

function applyAISuggestions() {
  if (!window.aiSuggestions) {
    showNotification('error', '⚠️ Gere sugestões primeiro');
    return;
  }
  
  const { vus, duration, engine, url } = window.aiSuggestions;
  
  document.getElementById('urlInput').value = url;
  document.getElementById('usersInput').value = vus;
  document.getElementById('durationInput').value = duration;
  document.getElementById('engineSelect').value = engine;
  document.getElementById('rampUpInput').value = Math.floor(duration * 0.1);
  
  updateScriptDisplay();
  closeToolModal();
  
  // Switch to config view
  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'config');
  });
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById('configView').classList.add('active');
  
  showNotification('success', '✓ Configuração aplicada com sucesso!');
}

// Report Generator Functions
function generateReport() {
  const selectEl = document.getElementById('reportTestsSelect');
  const selectedOptions = Array.from(selectEl.selectedOptions);
  
  if (selectedOptions.length === 0) {
    showNotification('error', '⚠️ Selecione pelo menos um teste');
    return;
  }
  
  showNotification('info', 'ℹ️ Gerando relatório...');
  
  const format = document.getElementById('reportFormat').value;
  const includeCharts = document.getElementById('reportCharts').checked;
  const includeComparisons = document.getElementById('includeComparisons').checked;
  const includeRecommendations = document.getElementById('reportRecommendations').checked;
  
  const selectedTests = selectedOptions.map(opt => testState.history[parseInt(opt.value)]);
  
  // Store selected tests globally for download
  window.selectedReportTests = selectedTests;
  window.reportOptions = { includeCharts, includeComparisons, includeRecommendations };
  
  // Generate report preview
  const previewDiv = document.getElementById('reportPreview');
  const avgResponseTime = selectedTests.reduce((sum, t) => sum + t.avg_response, 0) / selectedTests.length;
  const avgErrorRate = selectedTests.reduce((sum, t) => sum + t.error_rate, 0) / selectedTests.length;
  const successCount = selectedTests.filter(t => t.status === 'Sucessas').length;
  
  previewDiv.innerHTML = `
    <div style="background: var(--surface); padding: 20px; border-radius: 8px; border: 1px solid var(--border);">
      <h4 style="margin-top: 0; color: var(--accent);">📄 Preview do Relatório (${format})</h4>
      <div style="background: var(--code-bg); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h5 style="margin: 0 0 12px 0; color: var(--text-primary);">Resumo Executivo</h5>
        <p style="margin: 0; color: var(--text-secondary); line-height: 1.6;">
          <strong>Total de Testes:</strong> ${selectedTests.length}<br>
          <strong>Taxa de Sucesso:</strong> ${((successCount / selectedTests.length) * 100).toFixed(1)}%<br>
          <strong>Tempo Médio:</strong> ${Math.round(avgResponseTime)}ms<br>
          <strong>Taxa de Erro Média:</strong> ${avgErrorRate.toFixed(1)}%
        </p>
      </div>
      ${includeCharts ? '<p style="color: var(--success);">✓ Gráficos incluídos</p>' : ''}
      ${includeComparisons ? '<p style="color: var(--success);">✓ Comparações incluídas</p>' : ''}
      ${includeRecommendations ? '<p style="color: var(--success);">✓ Recomendações incluídas</p>' : ''}
      <button class="btn btn-primary" onclick="downloadReport('${format}')" style="width: 100%; margin-top: 12px;">Baixar Relatório (${format})</button>
    </div>
  `;
  previewDiv.style.display = 'block';
}

function downloadReport(format) {
  // Get stored tests from global
  const selectedTests = window.selectedReportTests || [];
  const options = window.reportOptions || {};
  
  if (selectedTests.length === 0) {
    showNotification('error', 'Nenhum teste selecionado');
    return;
  }
  
  // Generate report content based on format
  let content = '';
  let mimeType = '';
  let fileName = '';
  const timestamp = new Date().toISOString().split('T')[0];
  
  try {
    if (format === 'PDF') {
      // Generate text-based PDF content
      content = generatePDFContent(selectedTests, options);
      mimeType = 'text/plain;charset=utf-8';
      fileName = `performance-report-${timestamp}.txt`;
    } else if (format === 'HTML') {
      content = generateHTMLReport(selectedTests, options);
      mimeType = 'text/html;charset=utf-8';
      fileName = `performance-report-${timestamp}.html`;
    } else if (format === 'Excel') {
      content = generateCSVReport(selectedTests, options);
      mimeType = 'text/csv;charset=utf-8';
      fileName = `performance-report-${timestamp}.csv`;
    } else if (format === 'JSON') {
      const reportData = {
        generated: new Date().toISOString(),
        summary: {
          totalTests: selectedTests.length,
          successRate: ((selectedTests.filter(t => t.status === 'Sucessas').length / selectedTests.length) * 100).toFixed(1) + '%',
          avgResponseTime: Math.round(selectedTests.reduce((sum, t) => sum + t.avg_response, 0) / selectedTests.length) + 'ms',
          avgErrorRate: (selectedTests.reduce((sum, t) => sum + t.error_rate, 0) / selectedTests.length).toFixed(1) + '%'
        },
        tests: selectedTests,
        options: options
      };
      content = JSON.stringify(reportData, null, 2);
      mimeType = 'application/json;charset=utf-8';
      fileName = `performance-report-${timestamp}.json`;
    }
    
    // Create blob with proper MIME type
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    // Create download link and trigger
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    link.style.position = 'absolute';
    link.style.left = '-9999px';
    
    document.body.appendChild(link);
    
    // Force click
    link.click();
    
    // Cleanup after delay
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 150);
    
    showNotification('success', `✓ ${fileName} baixado com sucesso!`);
    
    // Close modal after successful download
    setTimeout(() => {
      closeToolModal();
    }, 1500);
    
  } catch (error) {
    console.error('Download error:', error);
    showNotification('error', 'Erro ao baixar relatório: ' + error.message);
  }
}

// Performance Analyzer Functions
function analyzePerformance() {
  const selectEl = document.getElementById('analyzerTestSelect');
  const selectedIndex = parseInt(selectEl.value);
  
  if (isNaN(selectedIndex) || !testState.history[selectedIndex]) {
    showNotification('error', '⚠️ Nenhum teste disponível para análise');
    return;
  }
  
  showNotification('info', 'ℹ️ Analisando performance...');
  
  const test = testState.history[selectedIndex];
  const resultsDiv = document.getElementById('analysisResults');
  
  // Perform analysis
  const responseAnalysis = test.avg_response < 200 ? 'Excelente' : test.avg_response < 500 ? 'Bom' : test.avg_response < 1000 ? 'Regular' : 'Ruim';
  const errorAnalysis = test.error_rate < 1 ? 'Excelente' : test.error_rate < 5 ? 'Aceitável' : 'Crítico';
  
  const bottlenecks = [];
  if (test.avg_response > 500) bottlenecks.push('⚠️ Tempo de resposta elevado');
  if (test.error_rate > 5) bottlenecks.push('❌ Taxa de erro alta');
  if (test.users > 1000) bottlenecks.push('⚡ Alta concorrência');
  
  const recommendations = [];
  if (test.avg_response > 500) recommendations.push('🔧 Otimizar queries de banco de dados');
  if (test.error_rate > 5) recommendations.push('🛠️ Implementar retry logic e circuit breaker');
  if (test.users > 500) recommendations.push('📈 Considerar auto-scaling');
  recommendations.push('💾 Implementar caching');
  recommendations.push('🚀 Usar CDN para assets estáticos');
  
  resultsDiv.innerHTML = `
    <div style="background: var(--surface); padding: 20px; border-radius: 8px; border: 1px solid var(--border);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h4 style="margin: 0; color: var(--accent);">📊 Análise Completa</h4>
        <button class="btn btn-secondary" onclick="exportAnalysis()" style="padding: 6px 12px; font-size: 12px;">Exportar Análise</button>
      </div>
      
      <div style="background: var(--code-bg); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
        <h5 style="margin: 0 0 12px 0; color: var(--text-primary);">Métricas de Performance</h5>
        <p style="margin: 0 0 8px 0; color: var(--text-secondary);"><strong>Tempo de Resposta:</strong> ${test.avg_response}ms - <span style="color: ${test.avg_response < 500 ? 'var(--success)' : 'var(--warning)'}">${responseAnalysis}</span></p>
        <p style="margin: 0 0 8px 0; color: var(--text-secondary);"><strong>Taxa de Erro:</strong> ${test.error_rate.toFixed(1)}% - <span style="color: ${test.error_rate < 5 ? 'var(--success)' : 'var(--danger)'}">${errorAnalysis}</span></p>
        <p style="margin: 0; color: var(--text-secondary);"><strong>Usuários:</strong> ${test.users}</p>
      </div>
      
      ${bottlenecks.length > 0 ? `
      <div style="background: rgba(239, 68, 68, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(239, 68, 68, 0.3);">
        <h5 style="margin: 0 0 12px 0; color: var(--danger);">⚠️ Gargalos Identificados</h5>
        ${bottlenecks.map(b => `<p style="margin: 0 0 4px 0; color: var(--text-secondary);">${b}</p>`).join('')}
      </div>
      ` : ''}
      
      <div style="background: rgba(16, 185, 129, 0.1); padding: 16px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.3);">
        <h5 style="margin: 0 0 12px 0; color: var(--success);">💡 Recomendações</h5>
        ${recommendations.map((r, i) => `<p style="margin: 0 0 4px 0; color: var(--text-secondary);">${i + 1}. ${r}</p>`).join('')}
      </div>
    </div>
  `;
  resultsDiv.style.display = 'block';
  
  showNotification('success', '✓ Análise concluída!');
  
  // Store analysis for export
  window.currentAnalysis = {
    test: test,
    metrics: {
      responseTime: test.avg_response,
      errorRate: test.error_rate,
      users: test.users,
      responseAnalysis: responseAnalysis,
      errorAnalysis: errorAnalysis
    },
    bottlenecks: bottlenecks,
    recommendations: recommendations,
    timestamp: new Date().toISOString()
  };
}

function exportAnalysis() {
  if (!window.currentAnalysis) {
    showNotification('error', '⚠️ Nenhuma análise disponível');
    return;
  }
  
  const content = JSON.stringify(window.currentAnalysis, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];
  const fileName = `analysis-${timestamp}.json`;
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 150);
  
  showNotification('success', `✓ Análise exportada: ${fileName}`);
}

// Data Converter Functions
function convertData() {
  const source = document.getElementById('converterSource').value;
  const target = document.getElementById('converterTarget').value;
  const input = document.getElementById('converterInput').value;
  
  if (!input.trim()) {
    showNotification('error', '⚠️ Cole o script de origem primeiro');
    return;
  }
  
  if (source === target) {
    showNotification('error', '⚠️ Selecione formatos de origem e destino diferentes');
    return;
  }
  
  showNotification('info', 'ℹ️ Convertendo script...');
  
  // Simulate conversion
  let output = '';
  
  if (target === 'k6') {
    output = `import http from 'k6/http';\nimport { check, sleep } from 'k6';\n\nexport const options = {\n  vus: 10,\n  duration: '30s',\n};\n\nexport default function () {\n  const res = http.get('https://api.example.com');\n  check(res, {\n    'status is 200': (r) => r.status === 200,\n  });\n  sleep(1);\n}`;
  } else if (target === 'jmeter') {
    output = `<?xml version="1.0" encoding="UTF-8"?>\n<jmeterTestPlan version="1.2">\n  <hashTree>\n    <TestPlan testname="Converted Test"/>\n    <hashTree>\n      <ThreadGroup testname="Thread Group">\n        <stringProp name="ThreadGroup.num_threads">10</stringProp>\n        <stringProp name="ThreadGroup.ramp_time">5</stringProp>\n        <stringProp name="ThreadGroup.duration">30</stringProp>\n      </ThreadGroup>\n      <hashTree>\n        <HTTPSampler testname="HTTP Request">\n          <stringProp name="HTTPSampler.domain">api.example.com</stringProp>\n          <stringProp name="HTTPSampler.path">/</stringProp>\n          <stringProp name="HTTPSampler.method">GET</stringProp>\n        </HTTPSampler>\n      </hashTree>\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>`;
  } else if (target === 'postman') {
    output = `{\n  "info": {\n    "name": "Converted Collection",\n    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"\n  },\n  "item": [\n    {\n      "name": "API Request",\n      "request": {\n        "method": "GET",\n        "url": "https://api.example.com"\n      }\n    }\n  ]\n}`;
  }
  
  document.getElementById('converterOutputText').value = output;
  document.getElementById('converterOutput').style.display = 'block';
  
  // Store converted output
  window.convertedOutput = { source, target, output };
  
  showNotification('success', `✓ Script convertido de ${source.toUpperCase()} para ${target.toUpperCase()}!`);
}

function copyConverterOutput() {
  const output = document.getElementById('converterOutputText');
  if (!output || !output.value) {
    showNotification('error', '⚠️ Nenhum código para copiar');
    return;
  }
  
  output.select();
  try {
    document.execCommand('copy');
    showNotification('success', '✓ Script convertido e copiado!');
  } catch (err) {
    showNotification('error', '⚠️ Erro ao copiar código');
  }
}

function downloadConverterOutput() {
  if (!window.convertedOutput) {
    showNotification('error', '⚠️ Nenhum código para baixar');
    return;
  }
  
  const { source, target, output } = window.convertedOutput;
  const extensions = {
    k6: 'js',
    jmeter: 'jmx',
    postman: 'json',
    har: 'har'
  };
  
  const ext = extensions[target] || 'txt';
  const fileName = `converted-${target}.${ext}`;
  const mimeTypes = {
    js: 'text/javascript',
    jmx: 'application/xml',
    json: 'application/json',
    har: 'application/json'
  };
  
  const mimeType = mimeTypes[ext] || 'text/plain';
  const blob = new Blob([output], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 150);
  
  showNotification('success', `✓ ${fileName} baixado com sucesso!`);
}

// Load Profile Builder Functions
function updateLoadProfilePreview() {
  const canvas = document.getElementById('loadProfileCanvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const pattern = document.getElementById('loadPattern').value;
  const minUsers = parseInt(document.getElementById('loadMinUsers').value) || 10;
  const maxUsers = parseInt(document.getElementById('loadMaxUsers').value) || 100;
  const duration = parseInt(document.getElementById('loadDuration').value) || 60;
  
  // Set canvas size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Theme colors
  const isLight = currentTheme === 'light';
  const gridColor = isLight ? '#E5E7EB' : '#2D3F5A';
  const textColor = isLight ? '#64748B' : '#94A3B8';
  const lineColor = isLight ? '#0891B2' : '#00D9FF';
  
  // Draw grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    
    const value = Math.round(maxUsers - ((maxUsers - minUsers) / 5) * i);
    ctx.fillStyle = textColor;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value.toString(), padding - 10, y + 4);
  }
  
  // Draw axes
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // Generate profile data
  const points = 50;
  const data = [];
  
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    let users = minUsers;
    
    switch (pattern) {
      case 'constant':
        users = maxUsers;
        break;
      case 'ramp-up':
        users = minUsers + (maxUsers - minUsers) * t;
        break;
      case 'ramp-down':
        users = maxUsers - (maxUsers - minUsers) * t;
        break;
      case 'spike':
        if (t < 0.3) users = minUsers + (maxUsers - minUsers) * (t / 0.3);
        else if (t < 0.5) users = maxUsers;
        else users = maxUsers - (maxUsers - minUsers) * ((t - 0.5) / 0.5);
        break;
      case 'wave':
        users = minUsers + (maxUsers - minUsers) * (0.5 + 0.5 * Math.sin(t * Math.PI * 4));
        break;
      case 'custom':
        users = minUsers + (maxUsers - minUsers) * (t < 0.5 ? t * 2 : 2 - t * 2);
        break;
    }
    
    data.push(users);
  }
  
  // Draw line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  
  for (let i = 0; i < data.length; i++) {
    const x = padding + (chartWidth / (data.length - 1)) * i;
    const normalized = (data[i] - minUsers) / (maxUsers - minUsers || 1);
    const y = padding + chartHeight - (normalized * chartHeight);
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  
  ctx.stroke();
  
  // Draw area fill
  ctx.lineTo(width - padding, height - padding);
  ctx.lineTo(padding, height - padding);
  ctx.closePath();
  
  const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
  gradient.addColorStop(0, lineColor + '40');
  gradient.addColorStop(1, lineColor + '00');
  ctx.fillStyle = gradient;
  ctx.fill();
  
  // Draw points
  ctx.fillStyle = lineColor;
  for (let i = 0; i < data.length; i += 5) {
    const x = padding + (chartWidth / (data.length - 1)) * i;
    const normalized = (data[i] - minUsers) / (maxUsers - minUsers || 1);
    const y = padding + chartHeight - (normalized * chartHeight);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Draw time labels
  ctx.fillStyle = textColor;
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const x = padding + (chartWidth / 4) * i;
    const time = Math.round((duration / 4) * i);
    ctx.fillText(time + 's', x, height - padding + 20);
  }
}

function applyLoadProfile() {
  const pattern = document.getElementById('loadPattern').value;
  const minUsers = parseInt(document.getElementById('loadMinUsers').value) || 10;
  const maxUsers = parseInt(document.getElementById('loadMaxUsers').value) || 100;
  const duration = parseInt(document.getElementById('loadDuration').value) || 60;
  
  if (minUsers <= 0 || maxUsers <= 0 || duration <= 0) {
    showNotification('error', '⚠️ Valores devem ser maiores que zero');
    return;
  }
  
  if (minUsers > maxUsers) {
    showNotification('error', '⚠️ Usuários mínimos não pode ser maior que máximos');
    return;
  }
  
  // Apply to test config
  document.getElementById('usersInput').value = maxUsers;
  document.getElementById('durationInput').value = duration;
  document.getElementById('rampUpInput').value = Math.floor(duration * 0.2);
  
  updateScriptDisplay();
  closeToolModal();
  
  // Switch to config view
  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'config');
  });
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById('configView').classList.add('active');
  
  showNotification('success', `✓ Perfil "${pattern}" aplicado com sucesso!`);
}

function saveLoadProfile() {
  const pattern = document.getElementById('loadPattern').value;
  const minUsers = parseInt(document.getElementById('loadMinUsers').value) || 10;
  const maxUsers = parseInt(document.getElementById('loadMaxUsers').value) || 100;
  const duration = parseInt(document.getElementById('loadDuration').value) || 60;
  
  if (minUsers <= 0 || maxUsers <= 0 || duration <= 0) {
    showNotification('error', '⚠️ Adicione estágios válidos ao perfil');
    return;
  }
  
  const profile = {
    pattern,
    minUsers,
    maxUsers,
    duration,
    created: new Date().toISOString()
  };
  
  const content = JSON.stringify(profile, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];
  const fileName = `load-profile-${pattern}-${timestamp}.json`;
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 150);
  
  showNotification('success', `✓ Perfil salvo: ${fileName}`);
}

// Report generation helper functions
function generatePDFContent(tests, options) {
  // Generate text-based report (PDF simulation as TXT)
  let content = '═'.repeat(80) + '\n';
  content += '          RELATÓRIO DE PERFORMANCE - PERFMASTER PRO\n';
  content += '═'.repeat(80) + '\n';
  content += 'Gerado em: ' + new Date().toLocaleString('pt-BR') + '\n';
  content += '═'.repeat(80) + '\n\n';
  
  // Summary section
  content += '┌─ RESUMO EXECUTIVO\n';
  content += '│\n';
  
  const successTests = tests.filter(t => t.status === 'Sucessas').length;
  const successRate = tests.length > 0 ? ((successTests / tests.length) * 100).toFixed(1) : 0;
  const avgResponseTime = tests.reduce((sum, t) => sum + t.avg_response, 0) / tests.length;
  const avgErrorRate = tests.reduce((sum, t) => sum + t.error_rate, 0) / tests.length;
  
  content += `│  📊 Total de Testes: ${tests.length}\n`;
  content += `│  ✅ Taxa de Sucesso: ${successRate}%\n`;
  content += `│  ⏱️  Tempo Médio de Resposta: ${Math.round(avgResponseTime)}ms\n`;
  content += `│  ⚠️  Taxa de Erro Média: ${avgErrorRate.toFixed(1)}%\n`;
  content += '│\n';
  content += '└─────────────────────────────────────────────────────────────────\n\n';
  
  // Detailed tests section
  content += '┌─ DETALHES DOS TESTES\n';
  content += '│\n';
  
  tests.forEach((test, index) => {
    content += `│  Teste #${index + 1}\n`;
    content += `│  ├─ Data/Hora: ${new Date(test.date).toLocaleString('pt-BR')}\n`;
    content += `│  ├─ URL: ${test.url}\n`;
    content += `│  ├─ Engine: ${test.engine.toUpperCase()}\n`;
    content += `│  ├─ Tipo: ${test.test_type}\n`;
    content += `│  ├─ Usuários: ${test.users}\n`;
    content += `│  ├─ Status: ${test.status}\n`;
    content += `│  ├─ Diagnóstico: ${test.diagnostic}\n`;
    content += `│  ├─ Taxa de Erro: ${test.error_rate.toFixed(1)}%\n`;
    content += `│  └─ Tempo Médio: ${test.avg_response}ms\n`;
    content += '│\n';
  });
  
  content += '└─────────────────────────────────────────────────────────────────\n\n';
  
  // Analysis section
  if (options.includeRecommendations) {
    content += '┌─ ANÁLISE E RECOMENDAÇÕES\n';
    content += '│\n';
    
    if (avgResponseTime > 500) {
      content += '│  ⚠️  ALERTA: Tempo de resposta médio elevado (>500ms)\n';
      content += '│     → Recomendação: Otimizar queries de banco e implementar cache\n';
      content += '│\n';
    }
    
    if (avgErrorRate > 5) {
      content += '│  ❌ ALERTA: Taxa de erro acima do aceitável (>5%)\n';
      content += '│     → Recomendação: Implementar retry logic e circuit breaker\n';
      content += '│\n';
    }
    
    if (successRate < 90) {
      content += '│  ⚠️  ALERTA: Taxa de sucesso abaixo de 90%\n';
      content += '│     → Recomendação: Investigar causas de falhas\n';
      content += '│\n';
    }
    
    content += '│  💡 Recomendações Gerais:\n';
    content += '│     • Implementar CDN para assets estáticos\n';
    content += '│     • Configurar auto-scaling para alta demanda\n';
    content += '│     • Monitorar métricas em tempo real\n';
    content += '│     • Realizar testes regulares de performance\n';
    content += '│\n';
    content += '└─────────────────────────────────────────────────────────────────\n\n';
  }
  
  content += '═'.repeat(80) + '\n';
  content += 'Fim do Relatório - PerfMaster PRO\n';
  content += '═'.repeat(80) + '\n';
  
  return content;
}

function generateHTMLReport(tests, options) {
  const successTests = tests.filter(t => t.status === 'Sucessas').length;
  const successRate = tests.length > 0 ? ((successTests / tests.length) * 100).toFixed(1) : 0;
  const avgResponseTime = tests.reduce((sum, t) => sum + t.avg_response, 0) / tests.length;
  const avgErrorRate = tests.reduce((sum, t) => sum + t.error_rate, 0) / tests.length;
  
  let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatório de Performance - PerfMaster PRO</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #1a2847; border-bottom: 3px solid #00D9FF; padding-bottom: 16px; }
    h2 { color: #1a2847; margin-top: 32px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 24px 0; }
    .metric { background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #00D9FF; }
    .metric-label { font-size: 14px; color: #64748B; text-transform: uppercase; }
    .metric-value { font-size: 32px; font-weight: 700; color: #1a2847; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f8f9fa; font-weight: 600; color: #64748B; text-transform: uppercase; font-size: 12px; }
    .status-success { color: #10B981; font-weight: 600; }
    .status-error { color: #EF4444; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #64748B; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Relatório de Performance</h1>
    <p style="color: #64748B;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
    
    <h2>Resumo Executivo</h2>
    <div class="summary">
      <div class="metric">
        <div class="metric-label">Total de Testes</div>
        <div class="metric-value">${tests.length}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Taxa de Sucesso</div>
        <div class="metric-value">${successRate}%</div>
      </div>
      <div class="metric">
        <div class="metric-label">Tempo Médio</div>
        <div class="metric-value">${Math.round(avgResponseTime)}ms</div>
      </div>
      <div class="metric">
        <div class="metric-label">Taxa de Erro Média</div>
        <div class="metric-value">${avgErrorRate.toFixed(1)}%</div>
      </div>
    </div>
    
    <h2>Detalhes dos Testes</h2>
    <table>
      <thead>
        <tr>
          <th>Data/Hora</th>
          <th>URL</th>
          <th>Engine</th>
          <th>Tipo</th>
          <th>Usuários</th>
          <th>Status</th>
          <th>Tempo Médio</th>
        </tr>
      </thead>
      <tbody>
        ${tests.map(test => `
          <tr>
            <td>${new Date(test.date).toLocaleString('pt-BR')}</td>
            <td>${test.url}</td>
            <td>${test.engine.toUpperCase()}</td>
            <td>${test.test_type}</td>
            <td>${test.users}</td>
            <td class="status-${test.status === 'Sucessas' ? 'success' : 'error'}">${test.status}</td>
            <td>${test.avg_response}ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="footer">
      <p><strong>PerfMaster PRO</strong> - Performance Testing Platform</p>
      <p>Este relatório foi gerado automaticamente. Para mais informações, consulte a documentação.</p>
    </div>
  </div>
</body>
</html>`;
  
  return html;
}

function generateCSVReport(tests, options) {
  // CSV Header
  let csv = 'Data/Hora,URL,Engine,Tipo de Teste,Usuários,Status,Diagnóstico,Taxa de Erro (%),Tempo Médio (ms)\n';
  
  // Data rows
  tests.forEach(test => {
    const date = new Date(test.date).toLocaleString('pt-BR');
    const url = test.url.replace(/"/g, '""'); // Escape quotes
    const diagnostic = test.diagnostic.replace(/"/g, '""');
    csv += `"${date}","${url}","${test.engine}","${test.test_type}",${test.users},"${test.status}","${diagnostic}",${test.error_rate.toFixed(1)},${test.avg_response}\n`;
  });
  
  // Add summary if requested
  if (options.includeComparisons) {
    csv += '\n';
    csv += '=== RESUMO ===\n';
    const successTests = tests.filter(t => t.status === 'Sucessas').length;
    const successRate = ((successTests / tests.length) * 100).toFixed(1);
    const avgResponseTime = Math.round(tests.reduce((sum, t) => sum + t.avg_response, 0) / tests.length);
    csv += `Total de Testes,${tests.length}\n`;
    csv += `Taxa de Sucesso,${successRate}%\n`;
    csv += `Tempo Médio,${avgResponseTime}ms\n`;
  }
  
  return csv;
}

// Make functions global
window.generateAISuggestions = generateAISuggestions;
window.applyAISuggestions = applyAISuggestions;
window.generateReport = generateReport;
window.downloadReport = downloadReport;
window.analyzePerformance = analyzePerformance;
window.exportAnalysis = exportAnalysis;
window.convertData = convertData;
window.copyConverterOutput = copyConverterOutput;
window.downloadConverterOutput = downloadConverterOutput;
window.updateLoadProfilePreview = updateLoadProfilePreview;
window.applyLoadProfile = applyLoadProfile;
window.saveLoadProfile = saveLoadProfile;

function closeToolModal() {
  document.getElementById('toolModal').classList.remove('active');
}

// ============================================
// SCHEDULER FUNCTIONALITY
// ============================================

function initializeScheduler() {
  // Set default date/time
  const now = new Date();
  now.setHours(now.getHours() + 1);
  document.getElementById('scheduleDate').valueAsDate = now;
  document.getElementById('scheduleTime').value = now.toTimeString().slice(0, 5);
  
  // Create schedule button
  document.getElementById('createScheduleBtn').addEventListener('click', createSchedule);
  
  // Load scheduled tests
  updateScheduledTestsList();
}

function createSchedule() {
  const name = document.getElementById('scheduleTestName').value;
  const description = document.getElementById('scheduleDescription').value;
  const date = document.getElementById('scheduleDate').value;
  const time = document.getElementById('scheduleTime').value;
  const frequency = document.getElementById('scheduleFrequency').value;
  const config = document.getElementById('scheduleConfig').value;
  
  if (!name || !date || !time) {
    showNotification('error', 'Por favor, preencha todos os campos obrigatórios');
    return;
  }
  
  const schedule = {
    id: Date.now(),
    name,
    description,
    date,
    time,
    frequency,
    config,
    enabled: true,
    created: new Date().toISOString()
  };
  
  scheduledTests.push(schedule);
  updateScheduledTestsList();
  
  // Clear form
  document.getElementById('scheduleTestName').value = '';
  document.getElementById('scheduleDescription').value = '';
  
  showNotification('success', 'Teste agendado com sucesso!');
}

function updateScheduledTestsList() {
  const container = document.getElementById('scheduledTestsList');
  
  if (scheduledTests.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum teste agendado</div>';
    return;
  }
  
  container.innerHTML = scheduledTests.map(test => `
    <div class="scheduled-test-item">
      <div class="scheduled-test-info">
        <h4>${test.name}</h4>
        <p>${test.description || 'Sem descrição'}</p>
        <div class="scheduled-test-meta">
          <span>📅 ${new Date(test.date).toLocaleDateString('pt-BR')}</span>
          <span>⏰ ${test.time}</span>
          <span>🔁 ${getFrequencyLabel(test.frequency)}</span>
        </div>
      </div>
      <div class="scheduled-test-actions">
        <button class="btn-icon" onclick="toggleSchedule(${test.id})" title="${test.enabled ? 'Desativar' : 'Ativar'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${test.enabled ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="9 18 15 12 9 6"/>'}
          </svg>
        </button>
        <button class="btn-icon danger" onclick="deleteSchedule(${test.id})" title="Excluir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function getFrequencyLabel(frequency) {
  const labels = {
    once: 'Uma vez',
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal'
  };
  return labels[frequency] || frequency;
}

function toggleSchedule(id) {
  const test = scheduledTests.find(t => t.id === id);
  if (test) {
    test.enabled = !test.enabled;
    updateScheduledTestsList();
    showNotification('info', `Teste ${test.enabled ? 'ativado' : 'desativado'}`);
  }
}

function deleteSchedule(id) {
  if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
  
  scheduledTests = scheduledTests.filter(t => t.id !== id);
  updateScheduledTestsList();
  showNotification('success', 'Agendamento excluído');
}

// Make functions global for onclick handlers
window.toggleSchedule = toggleSchedule;
window.deleteSchedule = deleteSchedule;

// ============================================
// CONFIRMATION MODAL
// ============================================

function showConfirmationModal(title, message, onConfirm) {
  const modal = document.getElementById('confirmationModal');
  const titleEl = document.getElementById('confirmationTitle');
  const messageEl = document.getElementById('confirmationMessage');
  const confirmBtn = document.getElementById('confirmationConfirm');
  const cancelBtn = document.getElementById('confirmationCancel');
  const closeBtn = document.getElementById('closeConfirmation');
  
  titleEl.textContent = title;
  messageEl.textContent = message;
  
  // Remove previous listeners
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
  
  const newCancelBtn = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
  
  const newCloseBtn = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
  
  // Add new listeners
  newConfirmBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    if (onConfirm) onConfirm();
  });
  
  newCancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });
  
  newCloseBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target.id === 'confirmationModal') {
      modal.classList.remove('active');
    }
  });
  
  modal.classList.add('active');
}

function showClearHistoryConfirmation() {
  showConfirmationModal(
    'Limpar Histórico?',
    'Tem certeza que deseja limpar o histórico de testes? Esta ação não pode ser desfeita.',
    () => {
      testState.history = [];
      // Clear localStorage
      try {
        localStorage.removeItem('testHistory');
      } catch (e) {
        // localStorage might be disabled
      }
      updateHistoryTable();
      updateSidebarStats();
      showNotification('success', '✓ Histórico limpo com sucesso!');
    }
  );
}

// ============================================
// ADVANCED SETTINGS - HEADERS & BODY JSON
// ============================================

function initializeAdvancedSettings() {
  const headersInput = document.getElementById('headersInput');
  const bodyInput = document.getElementById('bodyInput');
  
  if (headersInput) {
    headersInput.addEventListener('input', () => validateJSON('headers', headersInput.value));
    headersInput.addEventListener('blur', () => validateJSON('headers', headersInput.value));
  }
  
  if (bodyInput) {
    bodyInput.addEventListener('input', () => validateJSON('body', bodyInput.value));
    bodyInput.addEventListener('blur', () => validateJSON('body', bodyInput.value));
  }
  
  // Initial validation (empty is valid)
  validateJSON('headers', '');
  validateJSON('body', '');
}

function validateJSON(type, value) {
  const input = document.getElementById(type + 'Input');
  const indicator = document.getElementById(type + 'Validation');
  const errorMsg = document.getElementById(type + 'Error');
  
  // Empty is valid
  if (!value || value.trim() === '') {
    input.classList.remove('valid', 'invalid');
    indicator.className = 'validation-indicator';
    indicator.textContent = '';
    errorMsg.className = 'validation-message';
    errorMsg.textContent = '';
    testState.advanced[type] = {};
    updateScriptDisplay();
    return true;
  }
  
  try {
    const parsed = JSON.parse(value);
    
    // Valid JSON
    input.classList.remove('invalid');
    input.classList.add('valid');
    indicator.className = 'validation-indicator valid';
    errorMsg.className = 'validation-message success';
    errorMsg.textContent = 'Valid JSON';
    
    // Store in state
    testState.advanced[type] = parsed;
    updateScriptDisplay();
    return true;
  } catch (e) {
    // Invalid JSON
    input.classList.remove('valid');
    input.classList.add('invalid');
    indicator.className = 'validation-indicator invalid';
    errorMsg.className = 'validation-message error';
    errorMsg.textContent = 'Invalid JSON format: ' + e.message;
    
    // Clear state
    testState.advanced[type] = {};
    updateScriptDisplay();
    return false;
  }
}

// Add CSS transition for metrics
document.querySelectorAll('.metric-value').forEach(el => {
  el.style.transition = 'transform 0.2s ease';
});

// Chart Functions
function initializeCharts() {
  try {
  // Initialize canvas contexts
  const responseTimeCanvas = document.getElementById('responseTimeChart');
  const throughputCanvas = document.getElementById('throughputChart');

    if (!responseTimeCanvas || !throughputCanvas) {
      console.warn('Canvas elements não encontrados. Gráficos podem não funcionar.');
      return;
    }

    charts.responseTime = responseTimeCanvas.getContext('2d');
    charts.throughput = throughputCanvas.getContext('2d');
    
    if (!charts.responseTime || !charts.throughput) {
      console.warn('Não foi possível obter contextos dos canvas.');
      return;
    }
    
    // Set canvas size based on container
    resizeCanvas(responseTimeCanvas);
    resizeCanvas(throughputCanvas);
    
    // Draw initial empty charts with theme-aware colors
    const responseColor = currentTheme === 'light' ? '#0891B2' : '#00D9FF';
    const throughputColor = '#10B981';
    drawChart(charts.responseTime, [], [], responseColor, 'ms');
    drawChart(charts.throughput, [], [], throughputColor, 'req/s');
  } catch (error) {
    console.error('Erro ao inicializar gráficos:', error);
    // Não quebra a execução do teste se os gráficos falharem
  }
}

function resizeCanvas(canvas) {
  const container = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
}

function addChartData(timestamp, responseTime, throughput) {
  const maxPoints = 30;
  
  testState.chartData.timestamps.push(timestamp);
  testState.chartData.responseTime.push(responseTime);
  testState.chartData.throughput.push(throughput);
  
  // Keep only last 30 points
  if (testState.chartData.timestamps.length > maxPoints) {
    testState.chartData.timestamps.shift();
    testState.chartData.responseTime.shift();
    testState.chartData.throughput.shift();
  }
  
  // Redraw charts with theme-aware colors
  if (charts.responseTime && charts.throughput) {
    const responseColor = currentTheme === 'light' ? '#0891B2' : '#00D9FF';
    const throughputColor = '#10B981';
    
    drawChart(
      charts.responseTime,
      testState.chartData.timestamps,
      testState.chartData.responseTime,
      responseColor,
      'ms'
    );
    drawChart(
      charts.throughput,
      testState.chartData.timestamps,
      testState.chartData.throughput,
      throughputColor,
      'req/s'
    );
  }
}

function drawChart(ctx, timestamps, data, color, unit) {
  const canvas = ctx.canvas;
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  
  // Get theme colors
  const isLightTheme = currentTheme === 'light';
  const gridColor = isLightTheme ? '#E5E7EB' : '#2D3F5A';
  const textColor = isLightTheme ? '#64748B' : '#94A3B8';
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (data.length === 0) return;
  
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Find min/max for scaling
  const maxValue = Math.max(...data, 1);
  const minValue = Math.min(...data, 0);
  const range = maxValue - minValue || 1;
  
  // Draw grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 5;
  
  for (let i = 0; i <= gridLines; i++) {
    const y = padding + (chartHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    
    // Draw y-axis labels
    const value = Math.round(maxValue - (range / gridLines) * i);
    ctx.fillStyle = textColor;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto';
    ctx.textAlign = 'right';
    ctx.fillText(value.toString(), padding - 10, y + 4);
  }
  
  // Draw x-axis labels
  if (timestamps.length > 0) {
    const labelCount = Math.min(5, timestamps.length);
    const step = Math.max(1, Math.floor(timestamps.length / labelCount));
    
    for (let i = 0; i < timestamps.length; i += step) {
      const x = padding + (chartWidth / (timestamps.length - 1 || 1)) * i;
      ctx.fillStyle = textColor;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto';
      ctx.textAlign = 'center';
      ctx.fillText(timestamps[i] + 's', x, height - padding + 20);
    }
  }
  
  // Draw line
  if (data.length > 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    
    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const normalizedValue = (data[i] - minValue) / range;
      const y = padding + chartHeight - (normalizedValue * chartHeight);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Draw area fill
    ctx.lineTo(width - padding, height - padding);
    ctx.lineTo(padding, height - padding);
    ctx.closePath();
    
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, color + '40');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw points
    ctx.fillStyle = color;
    for (let i = 0; i < data.length; i++) {
      const x = padding + (chartWidth / (data.length - 1)) * i;
      const normalizedValue = (data[i] - minValue) / range;
      const y = padding + chartHeight - (normalizedValue * chartHeight);
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Draw axes
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
}

function hideCharts() {
  document.getElementById('chartsPlaceholder').style.display = 'flex';
  document.getElementById('chartsContainer').style.display = 'none';
}

// ============================================
// NUMBER INPUT KEYBOARD SUPPORT
// ============================================

function initializeNumberSpinners() {
  // Add keyboard support for number inputs
  const numberInputs = document.querySelectorAll('input[type="number"]');
  
  numberInputs.forEach(input => {
    // Get min/max/step values
    const min = parseFloat(input.getAttribute('min')) || -Infinity;
    const max = parseFloat(input.getAttribute('max')) || Infinity;
    const step = parseFloat(input.getAttribute('step')) || 1;
    
    // Keyboard support (up/down arrows)
    input.addEventListener('keydown', (e) => {
      let value = parseFloat(input.value) || 0;
      
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        value = Math.min(value + step, max);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        value = Math.max(value - step, min);
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    
    // Validate on input
    input.addEventListener('input', () => {
      let value = parseFloat(input.value);
      if (isNaN(value)) return;
      
      if (value > max) input.value = max;
      if (value < min) input.value = min;
    });
  });
}

// Handle window resize
window.addEventListener('resize', () => {
  if (testState.isRunning && charts.responseTime && charts.throughput) {
    const responseTimeCanvas = document.getElementById('responseTimeChart');
    const throughputCanvas = document.getElementById('throughputChart');
    
    resizeCanvas(responseTimeCanvas);
    resizeCanvas(throughputCanvas);
    
    // Redraw with current data and theme-aware colors
    const responseColor = currentTheme === 'light' ? '#0891B2' : '#00D9FF';
    const throughputColor = '#10B981';
    
    drawChart(
      charts.responseTime,
      testState.chartData.timestamps,
      testState.chartData.responseTime,
      responseColor,
      'ms'
    );
    drawChart(
      charts.throughput,
      testState.chartData.timestamps,
      testState.chartData.throughput,
      throughputColor,
      'req/s'
    );
  }
});

async function executePerformanceTest() {

  try {
    // Pega configuração do formulário
    const config = {
      method: document.getElementById('method-select')?.value || 'GET',
      endpoint: document.getElementById('endpoint-input')?.value || '',
      vus: parseInt(document.getElementById('vus-input')?.value) || 5,
      duration: parseInt(document.getElementById('duration-input')?.value) || 15,
      rampup: parseInt(document.getElementById('rampup-input')?.value) || 5,
      engine: document.getElementById('engine-select')?.value || 'k6'
    };

    // Valida
    if (!config.endpoint || config.endpoint.trim() === '') {
      showToast('⚠️ Endpoint não pode estar vazio', 'error');
      logTest('❌ Erro: Endpoint vazio');
      return;
    }

    // Desabilita botão
    const runButton = document.getElementById('run-test-btn');
    if (runButton) {
      runButton.disabled = true;
      runButton.textContent = '⏳ Executando...';
    }

    // Logs
    logTest('Sistema pronto para executar testes');
    logTest(`Iniciando teste: ${config.method} ${config.endpoint}`);
    logTest(`Engine: ${config.engine.toUpperCase()}`);
    logTest(`Usuários: ${config.vus} | Duração: ${config.duration}s`);

    // Executa simulação
    for (let step = 0; step < config.duration; step++) {
      // Calcula métricas
      const progress = (step + 1) / config.duration;
      const currentUsers = step < config.rampup 
        ? Math.floor((step / config.rampup) * config.vus)
        : config.vus;

      const baseResponse = 150 + Math.random() * 100;
      const loadFactor = currentUsers / config.vus;

      const metrics = {
        throughput: Math.floor(currentUsers * (8 + Math.random() * 4)),
        avgResponse: Math.floor(baseResponse * (1 + loadFactor * 0.5)),
        activeUsers: currentUsers,
        successRate: Math.max(85, 100 - (loadFactor * 5) - Math.random() * 5)
      };

      // Atualiza UI
      const reqsEl = document.querySelector('[data-metric="requests"]');
      const timeEl = document.querySelector('[data-metric="time"]');
      const usersEl = document.querySelector('[data-metric="users"]');
      const successEl = document.querySelector('[data-metric="success"]');

      if (reqsEl) reqsEl.textContent = metrics.throughput;
      if (timeEl) timeEl.textContent = `${metrics.avgResponse}ms`;
      if (usersEl) usersEl.textContent = metrics.activeUsers;
      if (successEl) successEl.textContent = `${metrics.successRate.toFixed(1)}%`;

      // Log progresso
      if (step % 5 === 0 || step === config.duration - 1) {
        logTest(`[${step + 1}/${config.duration}] Throughput: ${metrics.throughput} req/s | Tempo: ${metrics.avgResponse}ms | Usuários: ${currentUsers}`);
      }

      // Aguarda 1 segundo
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Finaliza
    logTest('✅ Teste finalizado com sucesso!');
    showToast('✅ Teste concluído com sucesso!', 'success');

    // Reabilita botão
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = '▶ Executar Teste';
    }

  } catch (error) {
    console.error('Erro ao executar teste:', error);
    logTest(`❌ Erro: ${error.message}`);
    showToast('❌ Erro ao executar teste', 'error');

    // Reabilita botão
    const runButton = document.getElementById('run-test-btn');
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = '▶ Executar Teste';
    }
  }
}

// Função auxiliar para logs
function logTest(message) {
  const logsElement = document.getElementById('test-logs');
  if (logsElement) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    logsElement.textContent += `${timestamp} - ${message}\n`;
    logsElement.scrollTop = logsElement.scrollHeight;
  }
}

// Função auxiliar para toast
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 6px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Attach event listener quando página carregar
document.addEventListener('DOMContentLoaded', function() {
  const runButton = document.getElementById('run-test-btn');
  if (runButton && !runButton.hasAttribute('data-listener-attached')) {
    runButton.addEventListener('click', executePerformanceTest);
    runButton.setAttribute('data-listener-attached', 'true');
    console.log('✅ Botão "Executar Teste" configurado!');
  }
});

// Export global
window.executePerformanceTest = executePerformanceTest;

console.log('✅ PATCH: Test Execution - Carregado com sucesso!');
