import { setProgressCallback, ensureModelLoaded } from './model-utils.js';

class ComponentManager {
  constructor() {
    this.currentComponent = 'selfplay';
    this.components = new Map();
    this.initialized = false;
    
    // UI elements
    this.tabButtons = null;
    this.componentContainers = null;
    this.loadingOverlay = null;
    
    // Model loading state
    this.modelLoaded = false;
  }
  
  async init() {
    if (this.initialized) return;
    
    console.log('Initializing Component Manager...');
    
    // Get UI elements
    this.tabButtons = document.querySelectorAll('.component-tab');
    this.componentContainers = document.querySelectorAll('.component-container');
    this.loadingOverlay = document.getElementById('loading-overlay');
    
    console.log(`Found ${this.tabButtons.length} tabs and ${this.componentContainers.length} containers`);
    
    // Set up progress callback for model loading
    setProgressCallback((progress, status, details) => {
      this.updateLoadingProgress(progress, status, details);
    });
    
    // Set up tab click handlers
    this.tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const componentName = e.target.closest('.component-tab').dataset.component;
        console.log(`Tab clicked: ${componentName}`);
        this.switchTo(componentName);
      });
    });
    
    // Preload ALL components to prevent loading issues during switching
    console.log('Preloading all components...');
    try {
      await Promise.all([
        this.loadComponent('selfplay'),
        this.loadComponent('benchmark'), 
        this.loadComponent('interpretability')
      ]);
      console.log('All components preloaded successfully');
    } catch (error) {
      console.error('Error preloading components:', error);
    }
    
    // Show initial component
    this.forceShowComponent('selfplay');
    
    // Start loading the model
    this.loadModel();
    
    this.initialized = true;
    console.log('Component manager initialized successfully');
  }
  
  async loadComponent(name) {
    if (this.components.has(name)) {
      const existing = this.components.get(name);
      // Ensure it's fully initialized
      if (!existing._initialized && typeof existing.init === 'function') {
        console.log(`Re-initializing component: ${name}`);
        await existing.init();
        existing._initialized = true;
      }
      return existing;
    }
    
    console.log(`Loading component: ${name}`);
    let component;
    
    try {
      switch (name) {
        case 'selfplay':
          const { SelfplayComponent } = await import('./components/selfplay.js');
          component = new SelfplayComponent();
          break;
        case 'benchmark':
          const { BenchmarkComponent } = await import('./components/benchmark.js');
          component = new BenchmarkComponent();
          break;
        case 'interpretability':
          const { InterpretabilityComponent } = await import('./components/interpretability.js');
          component = new InterpretabilityComponent();
          break;
        default:
          throw new Error(`Unknown component: ${name}`);
      }
      
      this.components.set(name, component);
      
      // Initialize immediately and mark as initialized
      if (typeof component.init === 'function') {
        await component.init();
        component._initialized = true;
      }
      
      console.log(`Component loaded and initialized: ${name}`);
      return component;
      
    } catch (error) {
      console.error(`Failed to load component ${name}:`, error);
      // Remove from cache if it failed
      this.components.delete(name);
      throw error;
    }
  }
  
  async switchTo(componentName) {
    if (this.currentComponent === componentName) return;
    
    console.log(`Switching to component: ${componentName}`);
    
    // Disable all tabs during transition
    this.setTabsEnabled(false);
    
    try {
      // Step 1: Update tab active states immediately
      this.updateTabStates(componentName);
      
      // Step 2: Hide current component and cleanup
      await this.hideCurrentComponent();
      
      // Step 3: Load and prepare new component
      const component = await this.loadComponent(componentName);
      
      // Step 4: Ensure component is fully initialized
      await this.ensureComponentReady(component, componentName);
      
      // Step 5: Show new component
      await this.showComponent(componentName, component);
      
      // Step 6: Update current component reference
      this.currentComponent = componentName;
      
      console.log(`Successfully switched to component: ${componentName}`);
      
    } catch (error) {
      console.error(`Failed to switch to component ${componentName}:`, error);
      // Fallback: try to show the failed component anyway
      this.forceShowComponent(componentName);
    } finally {
      // Always re-enable tabs
      this.setTabsEnabled(true);
    }
  }
  
  updateTabStates(activeComponentName) {
    this.tabButtons.forEach(button => {
      if (button.dataset.component === activeComponentName) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
  }
  
  async hideCurrentComponent() {
    // Hide ALL components immediately
    this.componentContainers.forEach(container => {
      container.classList.remove('active');
      container.style.display = 'none';
    });
    
    // Cleanup current component if needed
    const currentComponentInstance = this.components.get(this.currentComponent);
    if (currentComponentInstance && typeof currentComponentInstance.onDeactivate === 'function') {
      try {
        currentComponentInstance.onDeactivate();
      } catch (error) {
        console.warn('Error during component deactivation:', error);
      }
    }
    
    // Small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  async ensureComponentReady(component, componentName) {
    // Wait for component initialization if needed
    if (component && typeof component.init === 'function' && !component._initialized) {
      console.log(`Initializing component: ${componentName}`);
      await component.init();
      component._initialized = true;
    }
    
    // Verify DOM container exists
    const container = document.getElementById(`${componentName}-component`);
    if (!container) {
      throw new Error(`Container not found for component: ${componentName}`);
    }
    
    return container;
  }
  
  async showComponent(componentName, component) {
    console.log(`Showing component: ${componentName}`);
    const container = document.getElementById(`${componentName}-component`);
    
    if (!container) {
      console.error(`Container not found for component: ${componentName}`);
      console.log('Available containers:', 
        ['selfplay', 'benchmark', 'interpretability'].map(name => 
          `${name}: ${document.getElementById(`${name}-component`) ? 'found' : 'missing'}`
        ).join(', ')
      );
      throw new Error(`Container not found for component: ${componentName}`);
    }
    
    console.log(`Container found for ${componentName}, showing...`);
    
    // Show container first with explicit styles
    container.style.display = 'block';
    container.style.opacity = '0';
    container.style.visibility = 'hidden';
    
    // Force reflow
    container.offsetHeight;
    
    // Add active class and override styles
    container.classList.add('active');
    container.style.opacity = '1';
    container.style.visibility = 'visible';
    
    console.log(`Container ${componentName} is now visible`);
    
    // Activate component after it's visible
    if (component && typeof component.onActivate === 'function') {
      try {
        console.log(`Activating component: ${componentName}`);
        await component.onActivate();
        console.log(`Component ${componentName} activated successfully`);
      } catch (error) {
        console.error('Error during component activation:', error);
      }
    }
    
    // Notify about model if loaded
    if (this.modelLoaded && component && typeof component.onModelLoaded === 'function') {
      try {
        console.log(`Notifying ${componentName} that model is loaded`);
        component.onModelLoaded();
      } catch (error) {
        console.error('Error during model loaded notification:', error);
      }
    }
  }
  
  forceShowComponent(componentName) {
    console.log(`Force showing component: ${componentName}`);
    
    // Hide all first
    this.componentContainers.forEach(container => {
      container.classList.remove('active');
      container.style.display = 'none';
      container.style.opacity = '0';
      container.style.visibility = 'hidden';
    });
    
    // Force show the target
    const container = document.getElementById(`${componentName}-component`);
    if (container) {
      container.style.display = 'block';
      container.style.opacity = '1';
      container.style.visibility = 'visible';
      container.classList.add('active');
      this.currentComponent = componentName;
      
      // Update tab states
      this.updateTabStates(componentName);
      
      console.log(`Force show complete for: ${componentName}`);
    } else {
      console.error(`Force show failed - container not found: ${componentName}`);
    }
  }
  
  setTabsEnabled(enabled) {
    this.tabButtons.forEach(button => {
      button.disabled = !enabled;
      if (enabled) {
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
      } else {
        button.style.opacity = '0.7';
        button.style.pointerEvents = 'none';
      }
    });
  }
  
  async loadModel() {
    if (this.modelLoaded) return;
    
    try {
      console.log('Loading model...');
      await ensureModelLoaded();
      
      this.modelLoaded = true;
      console.log('Model loaded successfully');
      
      // Hide loading overlay
      if (this.loadingOverlay) {
        setTimeout(() => {
          this.loadingOverlay.classList.add('hidden');
        }, 500);
      }
      
      // Notify all loaded components that model is ready
      this.components.forEach(component => {
        if (typeof component.onModelLoaded === 'function') {
          component.onModelLoaded();
        }
      });
      
    } catch (error) {
      console.error('Failed to load model:', error);
      this.updateLoadingProgress(0, 'Error', `Failed to load model: ${error.message}`);
    }
  }
  
  updateLoadingProgress(progress, status, details) {
    const progressFill = document.getElementById('progress-fill');
    const statusEl = document.querySelector('.loading-status');
    const detailsEl = document.getElementById('loading-details');
    
    if (progressFill) progressFill.style.width = `${progress}%`;
    if (statusEl) statusEl.textContent = status;
    if (detailsEl) detailsEl.textContent = details;
    
    // Hide overlay when done
    if (progress >= 100 && this.loadingOverlay) {
      setTimeout(() => {
        this.loadingOverlay.classList.add('hidden');
      }, 500);
    }
  }
  
  getCurrentComponent() {
    return this.components.get(this.currentComponent);
  }
  
  isModelLoaded() {
    return this.modelLoaded;
  }
}

export default ComponentManager;