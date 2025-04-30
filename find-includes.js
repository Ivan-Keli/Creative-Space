/*
 * This script searches for Sequelize include statements in your codebase
 * and reports any that might need the 'as' keyword.
 * 
 * Usage: 
 * 1. Save this file as 'find-includes.js' in your project root
 * 2. Run with: node find-includes.js
 */

const fs = require('fs');
const path = require('path');

// Directories to search
const searchDirs = ['./routes', './controllers'];

// Extensions to search
const extensions = ['.js', '.ts'];

// Models that need 'as' in includes
const modelsThatNeedAs = [
  'Artwork',
  'User',
  'Transaction',
  'Message'
];

// Function to recursively search directories
function searchDir(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      searchDir(filePath);
    } else if (extensions.includes(path.extname(file).toLowerCase())) {
      searchFile(filePath);
    }
  }
}

// Function to search a file for potentially problematic includes
function searchFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  let inIncludeBlock = false;
  let lineNumber = 0;
  let includeStartLine = 0;
  
  for (const line of lines) {
    lineNumber++;
    
    // Check for include start
    if (line.includes('include:') || line.includes('include :')) {
      inIncludeBlock = true;
      includeStartLine = lineNumber;
    }
    
    // If we're in an include block, check for model references without 'as'
    if (inIncludeBlock) {
      for (const model of modelsThatNeedAs) {
        // Look for model references that don't have 'as' nearby
        if (line.includes(`model: ${model}`) && !line.includes('as:') && !line.includes('as :')) {
          console.log(`[POTENTIAL ISSUE] ${filePath}:${lineNumber}`);
          console.log(`  Found include of ${model} without 'as' keyword`);
          console.log(`  Line: ${line.trim()}`);
          console.log();
        }
      }
      
      // Check for end of include block (simplified - this is approximate)
      if (line.includes(']') && line.trim().endsWith(']')) {
        inIncludeBlock = false;
      }
    }
  }
}

// Start the search
console.log('Searching for potentially problematic Sequelize include statements...\n');

for (const dir of searchDirs) {
  if (fs.existsSync(dir)) {
    searchDir(dir);
  } else {
    console.log(`Directory ${dir} does not exist, skipping.`);
  }
}

console.log('Search complete. If no issues were found, you\'re good to go!');
