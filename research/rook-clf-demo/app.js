import ComponentManager from './component-manager.js';

// Initialize the component manager when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Initializing ROOK-CLF Demo App');
  
  const componentManager = new ComponentManager();
  await componentManager.init();
  
  // Set up mobile navigation (for the main nav, not component nav)
  document.getElementById('navToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    document.getElementById('navLinks').classList.toggle('active');
  });

  // Close mobile menu when clicking a link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      document.getElementById('navToggle').classList.remove('active');
      document.getElementById('navLinks').classList.remove('active');
    });
  });
  
  console.log('ROOK-CLF Demo App initialized');
});