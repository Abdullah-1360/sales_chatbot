const CpanelClient = require('../lib/cpanel');

/**
 * WordPress Site Fixes Service
 * Handles common WordPress site issues with minimal response time and maximum accuracy
 */
class WordPressSiteFixes {
  constructor() {
    this.logger = this.createLogger();
  }

  createLogger() {
    const winston = require('winston');
    return winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'error' : 'info',
      format: winston.format.simple(),
      transports: [new winston.transports.Console({ silent: process.env.NODE_ENV === 'test' })]
    });
  }

  /**
   * Branch A: Plugin Deactivation (The "Rename" Trick)
   * Renames plugin directory to deactivate it safely without deletion
   * 
   * @param {CpanelClient} cpanelClient - cPanel client instance
   * @param {string} docRoot - Document root path (e.g., 'public_html')
   * @param {string} pluginName - Plugin directory name to deactivate
   * @returns {Promise<Object>} Result with success status and details
   */
  async deactivatePlugin(cpanelClient, docRoot, pluginName) {
    const startTime = Date.now();
    
    try {
      const sourcePath = `${docRoot}/wp-content/plugins/${pluginName}`;
      const targetPath = `${docRoot}/wp-content/plugins/${pluginName}_bak`;
      
      // Check if plugin exists
      const checkResult = await cpanelClient.fileExists(sourcePath);
      
      if (!checkResult.exists) {
        return {
          success: false,
          action: 'plugin_deactivation',
          error: 'PLUGIN_NOT_FOUND',
          message: `Plugin directory not found: ${pluginName}`,
          duration: Date.now() - startTime
        };
      }

      // Check if backup already exists
      const backupExists = await cpanelClient.fileExists(targetPath);
      
      if (backupExists.exists) {
        return {
          success: false,
          action: 'plugin_deactivation',
          error: 'BACKUP_EXISTS',
          message: `Backup already exists: ${pluginName}_bak. Please remove it first.`,
          duration: Date.now() - startTime
        };
      }

      // Rename the plugin directory
      const renameResult = await cpanelClient.renameFile(sourcePath, targetPath);
      
      if (!renameResult.success) {
        return {
          success: false,
          action: 'plugin_deactivation',
          error: 'RENAME_FAILED',
          message: `Failed to rename plugin: ${renameResult.error}`,
          duration: Date.now() - startTime
        };
      }

      return {
        success: true,
        action: 'plugin_deactivation',
        message: `Plugin deactivated successfully: ${pluginName}`,
        details: {
          pluginName,
          originalPath: sourcePath,
          backupPath: targetPath,
          method: 'rename'
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`Plugin deactivation failed: ${error.message}`);
      return {
        success: false,
        action: 'plugin_deactivation',
        error: 'SYSTEM_ERROR',
        message: `System error during plugin deactivation: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Branch B: Memory Increase
   * Increases PHP memory limit by modifying php.ini or wp-config.php
   * 
   * @param {CpanelClient} cpanelClient - cPanel client instance
   * @param {string} docRoot - Document root path (e.g., 'public_html')
   * @param {string} memoryLimit - Memory limit value (e.g., '256M', '512M')
   * @param {string} method - Method to use: 'php_ini' or 'wp_config'
   * @returns {Promise<Object>} Result with success status and details
   */
  async increaseMemoryLimit(cpanelClient, docRoot, memoryLimit = '256M', method = 'php_ini') {
    const startTime = Date.now();
    
    try {
      if (method === 'php_ini') {
        return await this.increaseMemoryViaPHPIni(cpanelClient, docRoot, memoryLimit, startTime);
      } else if (method === 'wp_config') {
        return await this.increaseMemoryViaWPConfig(cpanelClient, docRoot, memoryLimit, startTime);
      } else {
        return {
          success: false,
          action: 'memory_increase',
          error: 'INVALID_METHOD',
          message: `Invalid method: ${method}. Use 'php_ini' or 'wp_config'`,
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      this.logger.error(`Memory increase failed: ${error.message}`);
      return {
        success: false,
        action: 'memory_increase',
        error: 'SYSTEM_ERROR',
        message: `System error during memory increase: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Increase memory via php.ini file
   */
  async increaseMemoryViaPHPIni(cpanelClient, docRoot, memoryLimit, startTime) {
    const phpIniPath = `${docRoot}/php.ini`;
    
    try {
      // Check if php.ini exists
      const phpIniExists = await cpanelClient.fileExists(phpIniPath);
      
      let content = '';
      if (phpIniExists.exists) {
        // Read existing php.ini
        try {
          const readResult = await cpanelClient.readFile(phpIniPath);
          if (readResult) {
            content = readResult;
          }
        } catch (readError) {
          this.logger.warn(`Could not read existing php.ini: ${readError.message}`);
          // Continue with empty content to create new file
        }
      }

      // Check if memory_limit already exists
      const memoryLimitRegex = /^memory_limit\s*=\s*.+$/m;
      
      if (memoryLimitRegex.test(content)) {
        // Replace existing memory_limit
        content = content.replace(memoryLimitRegex, `memory_limit = ${memoryLimit}`);
      } else {
        // Append memory_limit
        content += `\nmemory_limit = ${memoryLimit}\n`;
      }

      // Write php.ini
      try {
        await cpanelClient.writeFile(phpIniPath, content);
        // If writeFile doesn't throw, it succeeded
      } catch (writeError) {
        return {
          success: false,
          action: 'memory_increase',
          error: 'WRITE_FAILED',
          message: `Failed to write php.ini: ${writeError.message}`,
          duration: Date.now() - startTime
        };
      }

      return {
        success: true,
        action: 'memory_increase',
        message: `Memory limit increased to ${memoryLimit} via php.ini`,
        details: {
          method: 'php_ini',
          filePath: phpIniPath,
          memoryLimit,
          fileCreated: !phpIniExists.exists
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`PHP.ini memory increase failed: ${error.message}`);
      return {
        success: false,
        action: 'memory_increase',
        error: 'SYSTEM_ERROR',
        message: `System error during php.ini modification: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Increase memory via wp-config.php
   */
  async increaseMemoryViaWPConfig(cpanelClient, docRoot, memoryLimit, startTime) {
    const wpConfigPath = `${docRoot}/wp-config.php`;
    
    try {
      // Read wp-config.php
      let content;
      try {
        const readResult = await cpanelClient.readFile(wpConfigPath);
        
        if (!readResult) {
          return {
            success: false,
            action: 'memory_increase',
            error: 'READ_FAILED',
            message: `Failed to read wp-config.php`,
            duration: Date.now() - startTime
          };
        }

        content = readResult;
      } catch (readError) {
        return {
          success: false,
          action: 'memory_increase',
          error: 'READ_FAILED',
          message: `Failed to read wp-config.php: ${readError.message}`,
          duration: Date.now() - startTime
        };
      }

      // Check if WP_MEMORY_LIMIT already exists
      const memoryLimitRegex = /define\s*\(\s*['"]WP_MEMORY_LIMIT['"]\s*,\s*['"]\d+M['"]\s*\)\s*;/;
      
      if (memoryLimitRegex.test(content)) {
        // Replace existing WP_MEMORY_LIMIT
        content = content.replace(memoryLimitRegex, `define('WP_MEMORY_LIMIT', '${memoryLimit}');`);
      } else {
        // Insert before "That's all, stop editing!" comment
        const insertPoint = content.indexOf("/* That's all, stop editing!");
        
        if (insertPoint !== -1) {
          const before = content.substring(0, insertPoint);
          const after = content.substring(insertPoint);
          content = `${before}define('WP_MEMORY_LIMIT', '${memoryLimit}');\n\n${after}`;
        } else {
          // Fallback: append at the end
          content += `\ndefine('WP_MEMORY_LIMIT', '${memoryLimit}');\n`;
        }
      }

      // Write wp-config.php
      try {
        await cpanelClient.writeFile(wpConfigPath, content);
        // If writeFile doesn't throw, it succeeded
      } catch (writeError) {
        return {
          success: false,
          action: 'memory_increase',
          error: 'WRITE_FAILED',
          message: `Failed to write wp-config.php: ${writeError.message}`,
          duration: Date.now() - startTime
        };
      }

      return {
        success: true,
        action: 'memory_increase',
        message: `Memory limit increased to ${memoryLimit} via wp-config.php`,
        details: {
          method: 'wp_config',
          filePath: wpConfigPath,
          memoryLimit,
          constant: 'WP_MEMORY_LIMIT'
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`wp-config.php memory increase failed: ${error.message}`);
      return {
        success: false,
        action: 'memory_increase',
        error: 'SYSTEM_ERROR',
        message: `System error during wp-config.php modification: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Branch C: Fix .htaccess (The "Default" Fix)
   * Writes standard WordPress rewrite rules to .htaccess
   * 
   * @param {CpanelClient} cpanelClient - cPanel client instance
   * @param {string} docRoot - Document root path (e.g., 'public_html')
   * @param {boolean} backup - Whether to backup existing .htaccess
   * @returns {Promise<Object>} Result with success status and details
   */
  async fixHtaccess(cpanelClient, docRoot, backup = true) {
    const startTime = Date.now();
    
    try {
      const htaccessPath = `${docRoot}/.htaccess`;
      const backupPath = `${docRoot}/.htaccess.bak`;

      // Standard WordPress .htaccess content
      const standardHtaccess = `# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteBase /
RewriteRule ^index\\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress`;

      // Check if .htaccess exists
      const htaccessExists = await cpanelClient.fileExists(htaccessPath);

      // Backup existing .htaccess if requested
      if (backup && htaccessExists.exists) {
        try {
          const readResult = await cpanelClient.readFile(htaccessPath);
          
          if (readResult) {
            await cpanelClient.writeFile(backupPath, readResult);
          }
        } catch (backupError) {
          this.logger.warn(`Could not create backup: ${backupError.message}`);
          // Continue with fix even if backup fails
        }
      }

      // Write standard .htaccess
      try {
        await cpanelClient.writeFile(htaccessPath, standardHtaccess);
        // If writeFile doesn't throw, it succeeded
      } catch (writeError) {
        return {
          success: false,
          action: 'htaccess_fix',
          error: 'WRITE_FAILED',
          message: `Failed to write .htaccess: ${writeError.message}`,
          duration: Date.now() - startTime
        };
      }

      return {
        success: true,
        action: 'htaccess_fix',
        message: 'Standard WordPress .htaccess rules applied successfully',
        details: {
          filePath: htaccessPath,
          backupCreated: backup && htaccessExists.exists,
          backupPath: backup && htaccessExists.exists ? backupPath : null,
          fileExisted: htaccessExists.exists
        },
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`.htaccess fix failed: ${error.message}`);
      return {
        success: false,
        action: 'htaccess_fix',
        error: 'SYSTEM_ERROR',
        message: `System error during .htaccess fix: ${error.message}`,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Auto-diagnose and apply appropriate fix
   * Analyzes error logs and site status to determine the best fix
   * 
   * @param {CpanelClient} cpanelClient - cPanel client instance
   * @param {string} docRoot - Document root path
   * @param {Object} options - Options for auto-fix
   * @returns {Promise<Object>} Result with applied fixes
   */
  async autoFix(cpanelClient, docRoot, options = {}) {
    const startTime = Date.now();
    const appliedFixes = [];
    
    try {
      // Read error logs to determine issue
      const errorLogPath = `${docRoot}/error_log`;
      const errorLogExists = await cpanelClient.fileExists(errorLogPath);
      
      let errorContent = '';
      if (errorLogExists.exists) {
        const readResult = await cpanelClient.readFile(errorLogPath);
        if (readResult) {
          errorContent = readResult;
        }
      }

      // Check for memory exhaustion
      if (errorContent.includes('Allowed memory size') || errorContent.includes('memory exhausted')) {
        const memoryFix = await this.increaseMemoryLimit(
          cpanelClient, 
          docRoot, 
          options.memoryLimit || '256M',
          options.memoryMethod || 'php_ini'
        );
        appliedFixes.push(memoryFix);
      }

      // Check for plugin errors
      const pluginErrorRegex = /\/wp-content\/plugins\/([^\/]+)/;
      const pluginMatch = errorContent.match(pluginErrorRegex);
      
      if (pluginMatch && options.deactivatePlugin !== false) {
        const pluginName = pluginMatch[1];
        const pluginFix = await this.deactivatePlugin(cpanelClient, docRoot, pluginName);
        appliedFixes.push(pluginFix);
      }

      // Check for .htaccess issues (404/500 errors with clean logs)
      if (errorContent.includes('404') || errorContent.includes('500') || 
          (errorLogExists.exists && errorContent.trim().length < 100)) {
        const htaccessFix = await this.fixHtaccess(cpanelClient, docRoot, true);
        appliedFixes.push(htaccessFix);
      }

      // If no specific issues found, apply default .htaccess fix
      if (appliedFixes.length === 0 && options.applyDefaultFix !== false) {
        const htaccessFix = await this.fixHtaccess(cpanelClient, docRoot, true);
        appliedFixes.push(htaccessFix);
      }

      const successCount = appliedFixes.filter(f => f.success).length;
      
      return {
        success: successCount > 0,
        action: 'auto_fix',
        message: `Applied ${successCount} of ${appliedFixes.length} fixes`,
        fixes: appliedFixes,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this.logger.error(`Auto-fix failed: ${error.message}`);
      return {
        success: false,
        action: 'auto_fix',
        error: 'SYSTEM_ERROR',
        message: `System error during auto-fix: ${error.message}`,
        fixes: appliedFixes,
        duration: Date.now() - startTime
      };
    }
  }
}

module.exports = WordPressSiteFixes;
