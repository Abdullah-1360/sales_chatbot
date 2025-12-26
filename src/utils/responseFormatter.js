/**
 * Response formatter for WordPress diagnostic endpoint
 * Removes irrelevant items and streamlines the response
 */

class ResponseFormatter {
  /**
   * Format the diagnostic response to include only relevant information
   */
  static formatDiagnosticResponse(result, includeDebugInfo = false) {
    const formatted = {
      success: result.success,
      status: result.summary?.status || 'UNKNOWN',
      message: result.summary?.message || 'Diagnostic completed',
      timestamp: result.timestamp,
      domain: result.domain,
      duration: result.duration
    };

    // Add essential diagnostic results
    if (result.success) {
      formatted.result = {
        connectionStatus: 'success',
        databaseHost: result.summary?.details?.databaseConfig?.host,
        databaseName: result.summary?.details?.databaseConfig?.database,
        databaseUser: result.summary?.details?.databaseConfig?.user
      };

      // Add service status if available
      if (result.summary?.details?.serviceStatus) {
        formatted.result.serviceStatus = result.summary.details.serviceStatus;
      }

      // Add DNS status if available
      if (result.summary?.details?.dnsStatus) {
        formatted.result.dnsStatus = result.summary.details.dnsStatus;
      }

      // Add user management info if credentials were updated
      if (result.summary?.details?.updatedCredentials?.credentialsUpdated) {
        formatted.result.credentialsUpdated = true;
        formatted.result.newUsername = result.summary.details.updatedCredentials.username;
      }
    } else {
      // For failed diagnostics, include essential error information
      formatted.error = {
        type: result.escalation?.type || 'unknown',
        reason: result.escalation?.reason || 'unknown',
        message: result.escalation?.message || result.summary?.message || 'Diagnostic failed'
      };

      // Add recommendations if available
      if (result.summary?.recommendations && result.summary.recommendations.length > 0) {
        formatted.error.recommendations = result.summary.recommendations;
      }

      // Add specific error details based on failure type
      if (result.escalation?.reason === 'CONFIG_READ_FAILED') {
        formatted.error.details = 'Unable to read WordPress configuration file';
      } else if (result.escalation?.reason === 'MYSQL_CONNECTION_FAILED') {
        formatted.error.details = 'Database connection failed';
        if (result.workflow?.stepD_errorMapping?.errorAnalysis) {
          formatted.error.category = result.workflow.stepD_errorMapping.errorAnalysis.category;
          formatted.error.severity = result.workflow.stepD_errorMapping.errorAnalysis.severity;
        }
      } else if (result.escalation?.reason === 'NON_LOCALHOST_HOST') {
        formatted.error.details = 'Database host is not localhost - diagnostic limitation';
      } else if (result.escalation?.reason === 'DATABASE_NOT_FOUND') {
        formatted.error.details = 'Database does not exist';
      }
    }

    // Add performance info (simplified)
    if (result.performance) {
      formatted.performance = {
        totalTime: result.performance.totalTime,
        cached: result.performance.cached || false
      };

      if (result.performance.cacheAge) {
        formatted.performance.cacheAge = result.performance.cacheAge;
      }
    }

    // Add debug information only if requested and in development
    if (includeDebugInfo && process.env.NODE_ENV !== 'production') {
      formatted.debug = {
        workflow: {
          guards: result.workflow?.stepA_quickGuards ? 'completed' : 'skipped',
          configParsing: result.workflow?.stepB_parseConfig?.success ? 'success' : 'failed',
          userManagement: result.workflow?.stepB2_databaseUserManagement?.success ? 'success' : 'failed',
          connectionTest: result.workflow?.stepC_mysqlConnection?.success ? 'success' : 'failed'
        }
      };

      // Include any additional debug information from the result
      if (result.debug) {
        formatted.debug = { ...formatted.debug, ...result.debug };
      }

      if (result.credentialResolution) {
        formatted.debug.credentialResolution = {
          clientFound: !!result.credentialResolution.clientInfo?.id,
          serverFound: !!result.credentialResolution.serverInfo?.name
        };
      }

      if (result.performance?.breakdown) {
        formatted.debug.performanceBreakdown = result.performance.breakdown;
      }
    }

    return formatted;
  }

  /**
   * Format error response for failed credential resolution
   */
  static formatCredentialError(domain, error, details = {}) {
    return {
      success: false,
      status: 'CREDENTIAL_RESOLUTION_FAILED',
      message: 'Unable to resolve hosting credentials',
      timestamp: new Date().toISOString(),
      domain: domain,
      error: {
        type: 'credential_resolution',
        reason: 'CREDENTIALS_NOT_FOUND',
        message: error,
        details: 'Could not find hosting account for the provided domain and client information'
      },
      resolution: {
        clientLookup: details.clientLookup || 'not_found',
        serverLookup: details.serverLookup || 'not_found'
      }
    };
  }

  /**
   * Format validation error response
   */
  static formatValidationError(errors) {
    return {
      success: false,
      status: 'VALIDATION_FAILED',
      message: 'Request validation failed',
      timestamp: new Date().toISOString(),
      error: {
        type: 'validation',
        reason: 'INVALID_REQUEST',
        message: 'One or more required fields are missing or invalid',
        details: errors
      }
    };
  }

  /**
   * Format cached response
   */
  static formatCachedResponse(cachedData, cacheAge) {
    const formatted = this.formatDiagnosticResponse(cachedData, false);
    formatted.performance = {
      totalTime: formatted.performance?.totalTime || 0,
      cached: true,
      cacheAge: cacheAge
    };
    formatted.message += ' (cached)';
    return formatted;
  }

  /**
   * Format cPHulk response to include only relevant information
   */
  static formatCphulkResponse(result, includeDebugInfo = false) {
    const formatted = {
      success: result.success,
      status: result.success ? 'SUCCESS' : 'FAILED',
      message: result.message || (result.success ? 'cPHulk operation completed' : 'cPHulk operation failed'),
      timestamp: new Date().toISOString(),
      ip: result.ip
    };

    // Add server information
    if (result.serverName) {
      formatted.server = result.serverName;
    }

    // Add domain and client info if available
    if (result.domain) {
      formatted.domain = result.domain;
    }

    if (result.clientInfo) {
      formatted.client = {
        id: result.clientInfo.id,
        email: result.clientInfo.email,
        name: result.clientInfo.name
      };
    }

    if (result.success) {
      // For successful operations, include relevant data
      if (result.failedLogins !== undefined) {
        // This is a check failed logins response
        formatted.result = {
          totalAttempts: result.totalAttempts,
          uniqueUsers: result.uniqueUsers,
          services: result.services,
          countries: result.countries,
          timeRange: result.timeRange
        };

        // Include failed login details if debug info is requested or if there are few attempts
        if (includeDebugInfo || result.totalAttempts <= 10) {
          formatted.result.failedLogins = result.failedLogins;
        } else if (result.totalAttempts > 10) {
          // For many attempts, include only the most recent 5
          formatted.result.recentFailedLogins = result.failedLogins.slice(0, 5);
          formatted.result.note = `Showing 5 most recent attempts out of ${result.totalAttempts} total`;
        }
      } else if (result.workflow === 'intelligent_whitelist') {
        // This is an intelligent whitelist workflow response
        formatted.result = {
          workflow: result.workflow,
          authServices: result.authServices,
          whitelisted: result.whitelisted,
          flushed: result.flushed,
          ticketCreated: result.ticketCreated,
          scheduledRemoval: result.scheduledRemoval
        };

        // Include unique users if available (for mail services)
        if (result.uniqueUsers && result.uniqueUsers.length > 0) {
          formatted.result.affectedUsers = result.uniqueUsers;
        }

        // Include workflow steps if debug info is requested
        if (includeDebugInfo) {
          formatted.result.workflowSteps = result.steps;
        } else {
          // Include only key steps for normal response
          formatted.result.summary = result.steps.filter(step => 
            step.includes('workflow') || 
            step.includes('whitelisted') || 
            step.includes('flushed') || 
            step.includes('ticket') ||
            step.includes('scheduled')
          );
        }
      } else if (result.whitelisted !== undefined) {
        // This is a basic whitelist response
        formatted.result = {
          whitelisted: result.whitelisted,
          clearedFailedLogins: result.clearedFailedLogins,
          reason: result.reason
        };

        if (result.alreadyWhitelisted) {
          formatted.result.alreadyWhitelisted = true;
        }
      }
    } else {
      // For failed operations, include error information
      formatted.error = {
        type: 'cphulk_error',
        reason: 'OPERATION_FAILED',
        message: result.error || 'cPHulk operation failed'
      };
    }

    // Add performance information
    if (result.performance) {
      formatted.performance = result.performance;
    }

    // Add debug information if requested
    if (includeDebugInfo && result.serverInfo) {
      formatted.debug = {
        serverInfo: result.serverInfo
      };
    }

    return formatted;
  }

  /**
   * Remove sensitive information from responses
   */
  static sanitizeResponse(response) {
    // Remove any password or sensitive credential information
    if (response.result) {
      delete response.result.databasePassword;
      delete response.result.cpanelPassword;
    }

    if (response.debug) {
      delete response.debug.credentials;
      delete response.debug.passwords;
    }

    return response;
  }
}

module.exports = ResponseFormatter;