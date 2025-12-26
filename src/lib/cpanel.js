const axios = require('axios');
const winston = require('winston');

class CpanelClient {
  constructor(host, username, whmApiKey, port = 2087) {
    this.host = host;
    this.username = username; // cPanel username
    this.password = whmApiKey; // WHM API key for authentication
    this.port = port;
    this.baseUrl = `https://${host}:${port}`;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });
  }

  /**
   * Make authenticated API call to cPanel JSON API v3 (for user creation and management)
   */
  async makeJsonApiCall(module, function_name, params = {}) {
    try {
      const url = `${this.baseUrl}/json-api/cpanel`;
      
      // Build form data for x-www-form-urlencoded
      const formData = new URLSearchParams();
      formData.append('cpanel_jsonapi_user', this.username);
      formData.append('cpanel_jsonapi_apiversion', '3');
      formData.append('cpanel_jsonapi_module', module);
      formData.append('cpanel_jsonapi_func', function_name);
      
      // Add additional parameters
      Object.entries(params).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const config = {
        method: 'POST',
        url,
        data: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `whm root:${this.password}` // WHM API key format
        },
        timeout: 30000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false // For self-signed certificates
        })
      };

      this.logger.info(`Making cPanel JSON API v3 call: ${module}/${function_name} for user: ${this.username}`);
      this.logger.info(`Request URL: ${url}`);
      this.logger.info(`Request data: ${formData.toString()}`);
      
      const response = await axios(config);
      
      this.logger.info(`Response status: ${response.status}`);
      this.logger.info(`Response data: ${JSON.stringify(response.data, null, 2)}`);
      
      // cPanel JSON API v3 response format analysis
      // The response can have different structures depending on the API call
      let result = null;
      
      if (response.data && response.data.cpanelresult) {
        // Old format or UAPI format
        result = response.data.cpanelresult;
      } else if (response.data && response.data.result) {
        // Standard JSON API v3 format
        result = response.data.result;
      } else if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        // Some API calls return an array
        result = response.data[0];
      } else if (response.data) {
        // Direct response data
        result = response.data;
      } else {
        throw new Error('Empty or invalid response from cPanel API');
      }
      
      this.logger.info(`Parsed result: ${JSON.stringify(result, null, 2)}`);
      
      // Check if the operation was successful
      if (result.status === 1 || result.status === '1') {
        // Success
        this.logger.info(`cPanel API call successful: ${module}/${function_name}`);
        return result;
      } else if (result.status === 0 || result.status === '0') {
        // Failure - extract error information
        let errorMsg = 'Unknown JSON API v3 error';
        
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          errorMsg = result.errors.join(', ');
        } else if (result.error) {
          errorMsg = result.error;
        } else if (result.messages && Array.isArray(result.messages) && result.messages.length > 0) {
          errorMsg = result.messages.join(', ');
        } else if (result.statusmsg) {
          errorMsg = result.statusmsg;
        }
        
        this.logger.error(`cPanel API call failed: ${errorMsg}`);
        throw new Error(`cPanel JSON API v3 error: ${errorMsg}`);
      } else {
        // Unknown status or no status field
        this.logger.warn(`Unexpected response status: ${result.status}`);
        
        // Try to extract any error information
        let errorMsg = 'Unknown JSON API v3 error';
        
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          errorMsg = result.errors.join(', ');
        } else if (result.error) {
          errorMsg = result.error;
        } else if (result.statusmsg) {
          errorMsg = result.statusmsg;
        }
        
        // If we have error information, treat as failure
        if (errorMsg !== 'Unknown JSON API v3 error') {
          this.logger.error(`cPanel API call failed: ${errorMsg}`);
          throw new Error(`cPanel JSON API v3 error: ${errorMsg}`);
        }
        
        // Otherwise, return the result and let the caller handle it
        this.logger.info(`Returning result with unknown status for caller to handle`);
        return result;
      }
    } catch (error) {
      this.logger.error(`cPanel JSON API v3 call failed: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  /**
   * Read file content using cPanel UAPI
   */
  async readFile(filePath) {
    try {
      this.logger.info(`Reading file: ${filePath}`);
      
      // Try to split the path into dir and file components
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const dirPath = pathParts.join('/') || '.';
      
      this.logger.info(`Attempting read with dir: '${dirPath}', file: '${fileName}'`);
      
      let fileData;
      try {
        // First try with dir and file parameters (like readWpConfig)
        fileData = await this.makeApiCall('Fileman', 'get_file_content', {
          dir: dirPath,
          file: fileName
        });
      } catch (firstError) {
        this.logger.warn(`First attempt failed: ${firstError.message}`);
        this.logger.info(`Attempting read with full file path: '${filePath}'`);
        
        // Fallback to full file path
        fileData = await this.makeApiCall('Fileman', 'get_file_content', {
          file: filePath
        });
      }
      
      if (fileData && fileData.content) {
        this.logger.info(`Successfully read file ${filePath} (${fileData.content.length} characters)`);
        return fileData.content;
      } else {
        throw new Error('No content returned from file');
      }
    } catch (error) {
      this.logger.error(`Failed to read file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Write file content using cPanel UAPI
   */
  async writeFile(filePath, content) {
    try {
      this.logger.info(`Writing file: ${filePath}`);
      this.logger.info(`Content length: ${content.length} characters`);
      
      // Try to split the path into dir and file components
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const dirPath = pathParts.join('/') || '.';
      
      this.logger.info(`Attempting write with dir: '${dirPath}', file: '${fileName}'`);
      
      let result;
      try {
        // First try with dir and file parameters (like readWpConfig)
        result = await this.makeApiCall('Fileman', 'save_file_content', {
          dir: dirPath,
          file: fileName,
          content: content,
          encoding: 'utf-8'  // Explicitly specify encoding
        });
      } catch (firstError) {
        this.logger.warn(`First attempt failed: ${firstError.message}`);
        this.logger.info(`Attempting write with full file path: '${filePath}'`);
        
        // Fallback to full file path
        result = await this.makeApiCall('Fileman', 'save_file_content', {
          file: filePath,
          content: content,
          encoding: 'utf-8'  // Explicitly specify encoding
        });
      }
      
      this.logger.info(`Successfully wrote file ${filePath}`);
      this.logger.info(`Write API result: ${JSON.stringify(result, null, 2)}`);
      
      // Immediate verification - try to read the file back to confirm write
      try {
        this.logger.info('Performing immediate write verification...');
        const verifyContent = await this.readFile(filePath);
        if (verifyContent && verifyContent.length > 0) {
          this.logger.info(`✓ Write verification successful - file contains ${verifyContent.length} characters`);
          
          // Check if our content is actually in the file
          if (verifyContent.includes(content.substring(0, Math.min(100, content.length)))) {
            this.logger.info('✓ Content verification successful - written content found in file');
          } else {
            this.logger.warn('⚠ Content verification failed - written content not found in file');
          }
        } else {
          this.logger.warn('⚠ Write verification failed - file appears empty after write');
        }
      } catch (verifyError) {
        this.logger.warn(`Write verification failed: ${verifyError.message}`);
      }
      
      // For save_file_content, a successful call might return null/empty data
      // The fact that makeApiCall didn't throw an error means it was successful
      return result || { success: true, message: 'File written successfully' };
    } catch (error) {
      this.logger.error(`Failed to write file ${filePath}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make authenticated API call to cPanel UAPI using the correct format
   */
  async makeApiCall(module, function_name, params = {}) {
    try {
      const url = `${this.baseUrl}/json-api/uapi_cpanel`;
      
      // Build form data for x-www-form-urlencoded
      const formData = new URLSearchParams();
      formData.append('api.version', '1');
      formData.append('cpanel.user', this.username);
      formData.append('cpanel.module', module);
      formData.append('cpanel.function', function_name);
      
      // Add additional parameters
      Object.entries(params).forEach(([key, value]) => {
        formData.append(key, value);
      });

      const config = {
        method: 'POST',
        url,
        data: formData.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `whm root:${this.password}` // WHM API key format
        },
        timeout: 30000,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: false // For self-signed certificates
        })
      };

      // Silent UAPI logging in production for performance
      // this.logger.info(`Making cPanel UAPI call: ${module}/${function_name} for user: ${this.username}`);
      
      const response = await axios(config);
      
      // Silent UAPI response logging in production for performance
      // this.logger.info(`UAPI Response status: ${response.status}`);
      // this.logger.info(`UAPI Response metadata: ${JSON.stringify(response.data?.metadata, null, 2)}`);
      // this.logger.info(`UAPI Response data: ${JSON.stringify(response.data?.data, null, 2)}`);
      
      // Check the response format as per your example
      if (response.data && response.data.metadata && response.data.metadata.result === 1) {
        const resultData = response.data.data?.uapi?.data;
        this.logger.info(`UAPI call successful, returning data: ${JSON.stringify(resultData, null, 2)}`);
        return resultData;
      } else {
        const errorMsg = response.data?.data?.uapi?.errors?.[0] || 
                        response.data?.metadata?.reason || 
                        'Unknown UAPI error';
        this.logger.error(`UAPI call failed with error: ${errorMsg}`);
        throw new Error(`cPanel UAPI error: ${errorMsg}`);
      }
    } catch (error) {
      this.logger.error(`cPanel UAPI call failed: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      throw error;
    }
  }

  /**
   * Read wp-config.php file content using cPanel UAPI Fileman
   */
  async readWpConfig(dir = 'public_html', file = 'wp-config.php') {
    try {
      this.logger.info(`Reading wp-config.php from ${dir}/${file} for user: ${this.username}`);
      
      const fileData = await this.makeApiCall('Fileman', 'get_file_content', {
        dir: dir,
        file: file
      });
      
      if (fileData && fileData.content) {
        // Silent file read logging in production for performance
        // this.logger.info(`Successfully read wp-config.php (${fileData.content.length} characters)`);
        return {
          content: fileData.content,
          path: fileData.path,
          filename: fileData.filename,
          dir: fileData.dir,
          charset: fileData.to_charset || fileData.from_charset
        };
      } else {
        throw new Error('No content returned from wp-config.php');
      }
    } catch (error) {
      this.logger.error(`Failed to read wp-config.php: ${error.message}`);
      throw new Error(`Cannot read wp-config.php: ${error.message}`);
    }
  }

  /**
   * List MySQL databases
   */
  async listDatabases() {
    try {
      return await this.makeApiCall('Mysql', 'list_databases');
    } catch (error) {
      this.logger.error(`Failed to list databases: ${error.message}`);
      throw error;
    }
  }

  /**
   * List MySQL users
   */
  async listDatabaseUsers() {
    try {
      return await this.makeApiCall('Mysql', 'list_users');
    } catch (error) {
      this.logger.error(`Failed to list database users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Grant privileges to database user
   */
  async grantPrivileges(database, user, privileges = 'ALL PRIVILEGES') {
    try {
      return await this.makeApiCall('Mysql', 'set_privileges_on_database', {
        user,
        database,
        privileges
      });
    } catch (error) {
      this.logger.error(`Failed to grant privileges: ${error.message}`);
      throw error;
    }
  }

  /**
   * Repair database tables
   */
  async repairDatabase(database) {
    try {
      return await this.makeApiCall('Mysql', 'repair_database', {
        name: database
      });
    } catch (error) {
      this.logger.error(`Failed to repair database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get MySQL configuration including socket path from cPanel
   */
  async getMySQLConfig() {
    try {
      return await this.makeApiCall('Mysql', 'get_server_information');
    } catch (error) {
      this.logger.error(`Failed to get MySQL configuration: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get MySQL socket path from server configuration
   */
  async getMySQLSocketPath() {
    try {
      const mysqlConfig = await this.getMySQLConfig();
      
      // Extract socket path from MySQL configuration
      if (mysqlConfig && mysqlConfig.socket) {
        return mysqlConfig.socket;
      }
      
      // Fallback to common paths if not found in config
      return null;
    } catch (error) {
      this.logger.warn(`Could not get MySQL socket path: ${error.message}`);
      return null;
    }
  }
}

module.exports = CpanelClient;