const winston = require('winston');

class ParserStep {
  constructor() {
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
   * Parse wp-config.php content to extract database credentials
   */
  parseWpConfig(wpConfigContent) {
    try {
      this.logger.info('Parsing wp-config.php for database credentials');
      
      const config = {
        DB_NAME: null,
        DB_USER: null,
        DB_PASSWORD: null,
        DB_HOST: null,
        DB_CHARSET: null,
        DB_COLLATE: null,
        table_prefix: null
      };

      // Regular expressions to match WordPress database constants
      const patterns = {
        DB_NAME: /define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i,
        DB_USER: /define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i,
        DB_PASSWORD: /define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i,
        DB_HOST: /define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i,
        DB_CHARSET: /define\s*\(\s*['"]DB_CHARSET['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i,
        DB_COLLATE: /define\s*\(\s*['"]DB_COLLATE['"]\s*,\s*['"]([^'"]*)['"]\s*\)/i,
        table_prefix: /\$table_prefix\s*=\s*['"]([^'"]+)['"]/i
      };

      // Extract each configuration value
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = wpConfigContent.match(pattern);
        if (match) {
          config[key] = match[1];
        }
      }

      // Validate required fields
      const requiredFields = ['DB_NAME', 'DB_USER', 'DB_HOST'];
      const missingFields = requiredFields.filter(field => !config[field]);

      if (missingFields.length > 0) {
        throw new Error(`Missing required database configuration: ${missingFields.join(', ')}`);
      }

      // Parse host and port if specified
      const hostParts = config.DB_HOST.split(':');
      const parsedConfig = {
        database: config.DB_NAME,
        user: config.DB_USER,
        password: config.DB_PASSWORD || '',
        host: hostParts[0],
        port: hostParts[1] ? parseInt(hostParts[1]) : 3306,
        charset: config.DB_CHARSET || 'utf8',
        collate: config.DB_COLLATE || '',
        tablePrefix: config.table_prefix || 'wp_'
      };

      // Log parsed config (with masked password)
      const logConfig = { ...parsedConfig, password: '***MASKED***' };
      this.logger.info(`Parsed database configuration: ${JSON.stringify(logConfig)}`);

      return {
        success: true,
        config: parsedConfig,
        rawConfig: config
      };

    } catch (error) {
      this.logger.error(`Failed to parse wp-config.php: ${error.message}`);
      return {
        success: false,
        error: error.message,
        config: null
      };
    }
  }

  /**
   * Validate database configuration
   */
  validateDatabaseConfig(config) {
    const validation = {
      valid: true,
      issues: [],
      warnings: []
    };

    // Check for empty database name
    if (!config.database || config.database.trim() === '') {
      validation.valid = false;
      validation.issues.push('Database name is empty');
    }

    // Check for empty username
    if (!config.user || config.user.trim() === '') {
      validation.valid = false;
      validation.issues.push('Database username is empty');
    }

    // Check for localhost variations
    const localhostVariations = ['localhost', '127.0.0.1', '::1'];
    if (!localhostVariations.includes(config.host)) {
      validation.warnings.push(`Database host is not localhost: ${config.host}`);
    }

    // Check for non-standard port
    if (config.port !== 3306) {
      validation.warnings.push(`Non-standard MySQL port: ${config.port}`);
    }

    // Check for empty password (security warning)
    if (!config.password || config.password.trim() === '') {
      validation.warnings.push('Database password is empty (security risk)');
    }

    // Check for weak passwords
    if (config.password && config.password.length < 8) {
      validation.warnings.push('Database password is shorter than 8 characters');
    }

    // Check for default table prefix
    if (config.tablePrefix === 'wp_') {
      validation.warnings.push('Using default table prefix "wp_" (security risk)');
    }

    this.logger.info(`Database configuration validation: ${validation.valid ? 'VALID' : 'INVALID'}`);
    if (validation.issues.length > 0) {
      this.logger.warn(`Validation issues: ${validation.issues.join(', ')}`);
    }
    if (validation.warnings.length > 0) {
      this.logger.warn(`Validation warnings: ${validation.warnings.join(', ')}`);
    }

    return validation;
  }

  /**
   * Extract database configuration from wp-config.php via cPanel UAPI
   */
  async extractDatabaseConfig(cpanelClient, dir = 'public_html', file = 'wp-config.php') {
    try {
      this.logger.info(`Extracting database configuration from: ${dir}/${file}`);
      
      // Read wp-config.php content using the new UAPI format
      const wpConfigData = await cpanelClient.readWpConfig(dir, file);
      
      // Parse the configuration
      const parseResult = this.parseWpConfig(wpConfigData.content);
      
      if (!parseResult.success) {
        return parseResult;
      }

      // Validate the configuration
      const validation = this.validateDatabaseConfig(parseResult.config);

      return {
        success: true,
        config: parseResult.config,
        rawConfig: parseResult.rawConfig,
        validation,
        wpConfigPath: wpConfigData.path,
        wpConfigData: {
          filename: wpConfigData.filename,
          dir: wpConfigData.dir,
          charset: wpConfigData.charset,
          contentLength: wpConfigData.content.length,
          content: wpConfigData.content // Store the actual content for reuse
        }
      };

    } catch (error) {
      this.logger.error(`Failed to extract database configuration: ${error.message}`);
      return {
        success: false,
        error: error.message,
        config: null
      };
    }
  }

  /**
   * Generate connection string for logging (with masked password)
   */
  generateConnectionString(config, maskPassword = true) {
    const password = maskPassword ? '***MASKED***' : config.password;
    return `mysql://${config.user}:${password}@${config.host}:${config.port}/${config.database}`;
  }
}

module.exports = ParserStep;