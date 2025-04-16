/**
 * display_settings.js - Settings panel for display mode customization
 * 
 * This module provides a UI for customizing display mode settings and preferences
 */

import { recordError } from './error_handling.js';

/**
 * Create and show the settings panel for display modes
 */
function createDisplayModeSettings() {
  // Remove any existing settings panel
  const existingPanel = document.getElementById('authentic-display-settings');
  if (existingPanel) {
    existingPanel.remove();
  }

  const settingsPanel = document.createElement('div');
  settingsPanel.id = 'authentic-display-settings';
  settingsPanel.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 10000;
    padding: 20px;
    width: 400px;
    font-family: Arial, sans-serif;
    display: none;
  `;
  
  settingsPanel.innerHTML = `
    <h2 style="margin-top: 0;">Display Mode Settings</h2>
    
    <div class="setting-group" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <h3 style="font-size: 16px; margin-bottom: 10px;">Minimal Feed Settings</h3>
      <label style="display: block; margin-bottom: 8px;">
        <input type="checkbox" id="setting-hide-sidebar" checked>
        Hide sidebar elements
      </label>
      <label style="display: block; margin-bottom: 8px;">
        <input type="checkbox" id="setting-reduce-opacity" checked>
        Reduce opacity of filtered posts
      </label>
      <div>
        <label>Opacity level: </label>
        <input type="range" id="setting-opacity-level" min="0" max="1" step="0.1" value="0.4">
        <span id="opacity-value">0.4</span>
      </div>
    </div>
    
    <div class="setting-group" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
      <h3 style="font-size: 16px; margin-bottom: 10px;">Interests Settings</h3>
      <p style="margin-bottom: 5px; font-size: 14px;">Enter interests separated by commas</p>
      <textarea id="setting-interests" rows="3" style="width: 100%; padding: 8px;"></textarea>
    </div>
    
    <div class="setting-group" style="margin-bottom: 15px;">
      <h3 style="font-size: 16px; margin-bottom: 10px;">Default Display Mode</h3>
      <select id="setting-default-mode" style="width: 100%; padding: 8px;">
        <option value="default">Standard</option>
        <option value="friends-only">Friends Only</option>
        <option value="interest-only">Interests</option>
        <option value="minimal-feed">Minimal</option>
        <option value="focus-mode">Focus</option>
        <option value="chronological">Chronological</option>
      </select>
    </div>
    
    <div style="margin-top: 20px; text-align: right;">
      <button id="settings-cancel" style="margin-right: 10px; padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: pointer;">Cancel</button>
      <button id="settings-save" style="padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Save</button>
    </div>
  `;
  
  document.body.appendChild(settingsPanel);
  
  // Load current settings
  chrome.storage.local.get(['displayModeSettings', 'userPreferences'], result => {
    const settings = result.displayModeSettings || {};
    const preferences = result.userPreferences || {};
    
    // Populate form with current settings
    document.getElementById('setting-hide-sidebar').checked = settings.hideSidebar !== false;
    document.getElementById('setting-reduce-opacity').checked = settings.reduceOpacity !== false;
    document.getElementById('setting-opacity-level').value = settings.opacityLevel || 0.4;
    document.getElementById('opacity-value').textContent = settings.opacityLevel || 0.4;
    document.getElementById('setting-interests').value = preferences.interest_filter || '';
    document.getElementById('setting-default-mode').value = settings.defaultMode || 'default';
  });
  
  // Event listeners
  document.getElementById('settings-cancel').addEventListener('click', () => {
    settingsPanel.style.display = 'none';
  });
  
  document.getElementById('settings-save').addEventListener('click', () => {
    try {
      // Save settings
      const settings = {
        hideSidebar: document.getElementById('setting-hide-sidebar').checked,
        reduceOpacity: document.getElementById('setting-reduce-opacity').checked,
        opacityLevel: parseFloat(document.getElementById('setting-opacity-level').value),
        defaultMode: document.getElementById('setting-default-mode').value
      };
      
      const interests = document.getElementById('setting-interests').value;
      
      chrome.storage.local.get(['userPreferences'], result => {
        const preferences = result.userPreferences || {};
        
        chrome.storage.local.set({
          displayModeSettings: settings,
          userPreferences: {
            ...preferences,
            interest_filter: interests
          }
        }, () => {
          settingsPanel.style.display = 'none';
          
          // Show confirmation notification
          if (typeof showInPageNotification === 'function') {
            showInPageNotification('Settings Saved', 'Your display mode settings have been updated.', 'success');
          }
          
          // Reapply current mode with new settings
          const currentMode = document.querySelector('.ad-toggle-btn.active');
          if (currentMode) {
            currentMode.click();
          }
        });
      });
    } catch (error) {
      console.error('Error saving display mode settings:', error);
      recordError('extension', error, { component: 'display_settings_save' });
    }
  });
  
  // Range input live update
  document.getElementById('setting-opacity-level').addEventListener('input', e => {
    document.getElementById('opacity-value').textContent = e.target.value;
  });
  
  // Show the panel
  settingsPanel.style.display = 'block';
}

/**
 * Add settings button to the toggle panel
 * @param {Element} togglePanel - The display mode toggle panel element
 */
function addSettingsButton(togglePanel) {
  if (!togglePanel) return;
  
  // Check if settings button already exists
  if (togglePanel.querySelector('.ad-settings-btn')) return;
  
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙️';
  settingsBtn.className = 'ad-settings-btn';
  settingsBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
  `;
  
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    createDisplayModeSettings();
  });
  
  togglePanel.style.position = 'relative';
  togglePanel.querySelector('.ad-toggle-header').appendChild(settingsBtn);
}

// Export functions
export {
  createDisplayModeSettings,
  addSettingsButton
}; 