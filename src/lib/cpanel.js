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

      this.logger.info(`Making cPanel UAPI call: ${module}/${function_name} for user: ${this.username}`);
      
      const response = await axios(config);
      
      // Check the response format as per your example
      if (response.data && response.data.metadata && response.data.metadata.result === 1) {
        return response.data.data.uapi.data;
      } else {
        const errorMsg = response.data?.data?.uapi?.errors?.[0] || 
                        response.data?.metadata?.reason || 
                        'Unknown UAPI error';
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
        this.logger.info(`Successfully read wp-config.php (${fileData.content.length} characters)`);
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